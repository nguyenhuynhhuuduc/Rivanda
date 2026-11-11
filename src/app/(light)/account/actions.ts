"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createCollection, deleteCollection, removeFromCollection, updateCollection } from "@/lib/community";
import { createPhoto, deletePhoto, getPhoto } from "@/lib/discovery";
import { can } from "@/lib/permissions";
import { hashPassword, verifyPassword } from "@/lib/password";
import { deleteImageSet, saveAvatar, saveImageSet, UploadError } from "@/lib/uploads";
import { findUserById, setPasswordHash, updateProfile } from "@/lib/users";
import { setPhotoTags, parseTagList } from "@/lib/tags";

const clip = (fd: FormData, k: string, n: number) => String(fd.get(k) ?? "").trim().slice(0, n);
const to = (path: string, key: "ok" | "error", msg: string) => redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

// ===== Hồ sơ =====
export async function updateProfileAction(fd: FormData): Promise<void> {
  const user = await requireUser("/account");
  const firstName = clip(fd, "firstName", 60);
  const lastName = clip(fd, "lastName", 60);
  if (!firstName) to("/account", "error", "Tên không được để trống.");

  let avatarUrl: string | null | undefined;
  try {
    const file = fd.get("avatar");
    if (file instanceof File && file.size > 0) {
      const name = await saveAvatar(file);
      avatarUrl = `/uploads/${name}`;
    } else if (fd.get("removeAvatar") === "on") {
      avatarUrl = null;
    }
  } catch (err) {
    to("/account", "error", err instanceof UploadError ? err.message : "Không lưu được ảnh đại diện.");
  }

  await updateProfile(user.id, { firstName, lastName, bio: clip(fd, "bio", 500) || null, avatarUrl });
  revalidatePath("/", "layout");
  to("/account", "ok", "Đã lưu hồ sơ.");
}

// ===== Bảo mật =====
export async function changePasswordAction(fd: FormData): Promise<void> {
  const user = await requireUser("/account/security");
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  if (next.length < 8 || next.length > 128) to("/account/security", "error", "Mật khẩu mới cần từ 8 đến 128 ký tự.");
  if (next !== String(fd.get("confirm") ?? "")) to("/account/security", "error", "Hai mật khẩu mới chưa khớp.");

  const db = await findUserById(user.id);
  if (db?.passwordHash && !(await verifyPassword(current, db.passwordHash))) {
    to("/account/security", "error", "Mật khẩu hiện tại chưa đúng.");
  }
  await setPasswordHash(user.id, await hashPassword(next));
  await logActivity({ userId: user.id, action: "password.change" });
  to("/account/security", "ok", "Đã đổi mật khẩu.");
}

// ===== Bộ sưu tập =====
export async function createCollectionAction(fd: FormData): Promise<void> {
  const user = await requireUser("/account/collections");
  const name = clip(fd, "name", 80);
  if (!name) to("/account/collections", "error", "Hãy đặt tên bộ sưu tập.");
  await createCollection(user.id, name);
  revalidatePath("/account/collections");
  to("/account/collections", "ok", "Đã tạo bộ sưu tập.");
}

export async function updateCollectionAction(id: string, fd: FormData): Promise<void> {
  const user = await requireUser(`/account/collections/${id}`);
  const name = clip(fd, "name", 80);
  if (!name) to(`/account/collections/${id}`, "error", "Tên không được để trống.");
  await updateCollection(id, user.id, name, fd.get("isPublic") === "on");
  revalidatePath(`/account/collections/${id}`);
  to(`/account/collections/${id}`, "ok", "Đã lưu.");
}

export async function deleteCollectionAction(id: string): Promise<void> {
  const user = await requireUser("/account/collections");
  await deleteCollection(id, user.id);
  to("/account/collections", "ok", "Đã xóa bộ sưu tập.");
}

export async function removeFromCollectionAction(collectionId: string, photoId: string): Promise<void> {
  const user = await requireUser(`/account/collections/${collectionId}`);
  await removeFromCollection(collectionId, user.id, photoId);
  revalidatePath(`/account/collections/${collectionId}`);
}

// ===== Gửi ảnh (cộng tác viên) =====
export async function submitPhotoAction(fd: FormData): Promise<void> {
  const user = await requireUser("/account/content");
  if (!can(user.role, "content.submit")) to("/account/content", "error", "Tài khoản của bạn chưa được phép gửi nội dung.");

  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) to("/account/content", "error", "Hãy chọn ít nhất một ảnh.");
  if (files.length > 10) to("/account/content", "error", "Mỗi lần gửi tối đa 10 ảnh.");
  if (fd.get("rights") !== "on") to("/account/content", "error", "Hãy xác nhận bạn có quyền sử dụng các ảnh này.");

  let ok = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      const img = await saveImageSet(file, 8 * 1024 * 1024);
      const id = await createPhoto({
        tripId: null, uploaderId: user.id, imageFile: img.file, thumbFile: img.thumb, mediumFile: img.medium,
        width: img.width, height: img.height, title: clip(fd, "title", 160) || null,
        caption: clip(fd, "caption", 500) || null, locationName: clip(fd, "locationName", 160) || null,
        takenAt: null, allowDownload: false, status: "pending", // luôn chờ duyệt, không tự đăng
      });
      await setPhotoTags(id, parseTagList(clip(fd, "tags", 200)));
      ok++;
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof UploadError ? err.message : "không lưu được"}`);
    }
  }
  await logActivity({ userId: user.id, action: "photo.submit", detail: `${ok} ảnh` });
  revalidatePath("/account/content");
  if (errors.length) to("/account/content", "error", `Đã gửi ${ok} ảnh. Lỗi: ${errors.join("; ")}`);
  to("/account/content", "ok", `Đã gửi ${ok} ảnh, đang chờ kiểm duyệt.`);
}

export async function deleteOwnPhotoAction(photoId: string): Promise<void> {
  const user = await requireUser("/account/content");
  const photo = await getPhoto(photoId);
  if (!photo || photo.uploaderId !== user.id) return; // chỉ xóa ảnh của chính mình
  const files = await deletePhoto(photoId);
  await deleteImageSet(...files);
  await logActivity({ userId: user.id, action: "photo.delete.own", targetType: "photo", targetId: photoId });
  revalidatePath("/account/content");
  revalidatePath("/journeystory", "layout");
}

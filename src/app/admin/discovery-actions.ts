"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireAdmin, requirePermission } from "@/lib/auth";
import {
  createAlbum, createPhoto, createStatus, createTrip, deleteAlbum, deleteComment, deletePhoto, deleteStatus, deleteTrip,
  getPhoto, setCommentHidden, setPhotoAlbums, setPhotoStatus, updateAlbum, updatePhoto, updateTrip,
  type PhotoStatus,
} from "@/lib/discovery";
import { setReportStatus, type ReportStatus } from "@/lib/community";
import { notify } from "@/lib/notifications";
import { parseTagList, setPhotoTags } from "@/lib/tags";
import { deleteImageSet, saveImageSet, UploadError } from "@/lib/uploads";
import { dateOrNull, files, flag, qs, str, strOrNull, uuidOrNull } from "./helpers";

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const STATUSES: PhotoStatus[] = ["draft", "pending", "published", "rejected", "archived"];
const statusOf = (v: string): PhotoStatus => (STATUSES.includes(v as PhotoStatus) ? (v as PhotoStatus) : "draft");

function refreshDiscovery() {
  revalidatePath("/journeystory", "layout");
  revalidatePath("/discovery", "layout");
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
}

// ===== Hành trình =====
function tripInput(fd: FormData) {
  return {
    title: str(fd, "title", 160),
    description: strOrNull(fd, "description", 2000),
    locationName: strOrNull(fd, "locationName", 160),
    startDate: dateOrNull(fd, "startDate"),
    endDate: dateOrNull(fd, "endDate"),
    isFeatured: flag(fd, "isFeatured"),
    coverPhotoId: uuidOrNull(fd, "coverPhotoId"),
  };
}

export async function createTripAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const input = tripInput(fd);
  if (!input.title) redirect("/admin/trips" + qs("error", "Hãy nhập tên hành trình."));
  await createTrip(input);
  refreshDiscovery();
  redirect("/admin/trips" + qs("saved", "Đã tạo hành trình."));
}

export async function updateTripAction(id: string, fd: FormData): Promise<void> {
  await requireAdmin();
  const input = tripInput(fd);
  if (!input.title) redirect("/admin/trips" + qs("error", "Tên hành trình không được để trống."));
  await updateTrip(id, input);
  refreshDiscovery();
  redirect("/admin/trips" + qs("saved", "Đã cập nhật hành trình."));
}

export async function deleteTripAction(id: string): Promise<void> {
  const user = await requirePermission("content.manage");
  await deleteTrip(id);
  await logActivity({ userId: user.id, action: "trip.delete", targetType: "trip", targetId: id });
  refreshDiscovery();
}

// ===== Album =====
function albumInput(fd: FormData) {
  return {
    title: str(fd, "title", 160),
    description: strOrNull(fd, "description", 2000),
    tripId: uuidOrNull(fd, "tripId"),
    isPublished: flag(fd, "isPublished"),
  };
}

export async function createAlbumAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const input = albumInput(fd);
  if (!input.title) redirect("/admin/albums" + qs("error", "Hãy nhập tên album."));
  await createAlbum(input);
  refreshDiscovery();
  redirect("/admin/albums" + qs("saved", "Đã tạo album. Gán ảnh vào album ở trang Ảnh Discovery."));
}

export async function updateAlbumAction(id: string, fd: FormData): Promise<void> {
  await requireAdmin();
  const input = albumInput(fd);
  if (!input.title) redirect("/admin/albums" + qs("error", "Tên album không được để trống."));
  await updateAlbum(id, input);
  refreshDiscovery();
  redirect("/admin/albums" + qs("saved", "Đã cập nhật album."));
}

export async function deleteAlbumAction(id: string): Promise<void> {
  const user = await requirePermission("content.manage");
  await deleteAlbum(id);
  await logActivity({ userId: user.id, action: "album.delete", targetType: "album", targetId: id });
  refreshDiscovery();
}

// ===== Ảnh =====
export async function uploadPhotosAction(fd: FormData): Promise<void> {
  const user = await requirePermission("content.manage");
  const list = files(fd, "images");
  if (list.length === 0) redirect("/admin/photos" + qs("error", "Hãy chọn ít nhất một ảnh."));
  if (list.length > 20) redirect("/admin/photos" + qs("error", "Mỗi lần tải tối đa 20 ảnh."));

  const albumId = uuidOrNull(fd, "albumId");
  const tags = parseTagList(str(fd, "tags", 200));
  const status = flag(fd, "isPublished") ? "published" : "draft";
  let ok = 0;
  const errors: string[] = [];
  for (const file of list) {
    try {
      const img = await saveImageSet(file, PHOTO_MAX_BYTES);
      const id = await createPhoto({
        tripId: uuidOrNull(fd, "tripId"), uploaderId: user.id, imageFile: img.file, thumbFile: img.thumb,
        mediumFile: img.medium, width: img.width, height: img.height, title: strOrNull(fd, "title", 160),
        caption: strOrNull(fd, "caption", 500), locationName: strOrNull(fd, "locationName", 160),
        takenAt: dateOrNull(fd, "takenAt"), allowDownload: flag(fd, "allowDownload"), status,
      });
      if (tags.length) await setPhotoTags(id, tags);
      if (albumId) await setPhotoAlbums(id, [albumId]);
      ok++;
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof UploadError ? err.message : "không lưu được"}`);
    }
  }
  await logActivity({ userId: user.id, action: "photo.upload", detail: `${ok} ảnh` });
  refreshDiscovery();
  if (errors.length) redirect("/admin/photos" + qs("error", `Đã tải ${ok} ảnh. Lỗi: ${errors.join("; ")}`));
  redirect("/admin/photos" + qs("saved", `Đã tải lên ${ok} ảnh.`));
}

export async function updatePhotoAction(id: string, fd: FormData): Promise<void> {
  const user = await requirePermission("content.manage");
  await updatePhoto(id, {
    tripId: uuidOrNull(fd, "tripId"), title: strOrNull(fd, "title", 160), caption: strOrNull(fd, "caption", 500),
    locationName: strOrNull(fd, "locationName", 160), takenAt: dateOrNull(fd, "takenAt"),
    allowDownload: flag(fd, "allowDownload"), status: statusOf(str(fd, "status", 12)),
  });
  await setPhotoTags(id, parseTagList(str(fd, "tags", 200)));
  await setPhotoAlbums(id, fd.getAll("albumIds").map(String).filter((a) => /^[a-f0-9-]{36}$/.test(a)));
  await logActivity({ userId: user.id, action: "photo.update", targetType: "photo", targetId: id });
  refreshDiscovery();
  revalidatePath(`/journeystory/photos/${id}`);
}

export async function deletePhotoAction(id: string): Promise<void> {
  const user = await requirePermission("content.manage");
  const names = await deletePhoto(id);
  await deleteImageSet(...names);
  await logActivity({ userId: user.id, action: "photo.delete", targetType: "photo", targetId: id });
  refreshDiscovery();
}

// ===== Kiểm duyệt ảnh (admin và kiểm duyệt viên) =====
export async function reviewPhotoAction(id: string, decision: "approve" | "reject", fd: FormData): Promise<void> {
  const user = await requirePermission("moderation.review");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) || (decision !== "approve" && decision !== "reject")) {
    redirect("/admin/moderation" + qs("error", "Yêu cầu duyệt không hợp lệ."));
  }
  const photo = await getPhoto(id);
  if (!photo || photo.status !== "pending") redirect("/admin/moderation" + qs("error", "Ảnh không còn chờ duyệt. Hãy tải lại danh sách."));
  const note = strOrNull(fd, "note", 500);
  if (decision === "reject" && !note) redirect("/admin/moderation" + qs("error", "Hãy ghi lý do khi từ chối để người gửi biết."));

  const changed = await setPhotoStatus(id, decision === "approve" ? "published" : "rejected", decision === "reject" ? note : null);
  if (!changed) redirect("/admin/moderation" + qs("error", "Ảnh vừa được xử lý bởi thao tác khác. Hãy tải lại danh sách."));
  await notify(
    photo.uploaderId, "moderation",
    decision === "approve" ? "Ảnh của bạn đã được duyệt và hiển thị công khai." : `Ảnh của bạn chưa được duyệt. Lý do: ${note}`,
    decision === "approve" ? `/journeystory/photos/${id}` : "/account/content"
  );
  await logActivity({ userId: user.id, action: `photo.${decision}`, targetType: "photo", targetId: id, detail: note ?? undefined });
  refreshDiscovery();
  redirect("/admin/moderation" + qs("saved", decision === "approve" ? "Đã duyệt ảnh." : "Đã từ chối ảnh."));
}

// ===== Nhật ký (status) =====
export async function createStatusAction(fd: FormData): Promise<void> {
  const user = await requirePermission("content.manage");
  const content = str(fd, "content", 1000);
  if (!content) redirect("/admin/status" + qs("error", "Hãy nhập nội dung."));
  await createStatus(user.id, uuidOrNull(fd, "tripId"), content);
  refreshDiscovery();
  redirect("/admin/status" + qs("saved", "Đã đăng status."));
}

export async function deleteStatusAction(id: string): Promise<void> {
  await requireAdmin();
  await deleteStatus(id);
  refreshDiscovery();
}

// ===== Bình luận (admin và kiểm duyệt viên) =====
export async function setCommentHiddenAction(id: string, hidden: boolean): Promise<void> {
  const user = await requirePermission("comment.moderate");
  await setCommentHidden(id, hidden);
  await logActivity({ userId: user.id, action: hidden ? "comment.hide" : "comment.show", targetType: "comment", targetId: id });
  refreshDiscovery();
}

export async function deleteCommentAdminAction(id: string): Promise<void> {
  const user = await requirePermission("comment.moderate");
  await deleteComment(id);
  await logActivity({ userId: user.id, action: "comment.delete", targetType: "comment", targetId: id });
  refreshDiscovery();
}

// ===== Báo cáo vi phạm =====
export async function handleReportAction(id: string, status: ReportStatus): Promise<void> {
  const user = await requirePermission("report.handle");
  await setReportStatus(id, status, user.id);
  await logActivity({ userId: user.id, action: `report.${status}`, targetType: "report", targetId: id });
  revalidatePath("/admin/reports");
  revalidatePath("/admin", "layout");
}

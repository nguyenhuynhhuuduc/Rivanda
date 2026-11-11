"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addToCollection, createCollection, createReport } from "@/lib/community";
import {
  addComment, deleteComment, getComment, getPhoto, PUBLIC, recentCommentCount, toggleLike, toggleSave,
} from "@/lib/discovery";
import { notify } from "@/lib/notifications";

async function requireMember(photoId: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/journeystory/photos/${photoId}`)}`);
  const photo = await getPhoto(photoId, PUBLIC);
  if (!photo) redirect("/journeystory");
  return { user, photo };
}

function refresh(photoId: string) {
  revalidatePath(`/journeystory/photos/${photoId}`);
  revalidatePath("/journeystory", "layout");
  revalidatePath("/account", "layout");
}

const back = (id: string, key: "error" | "ok", msg: string, hash = "") =>
  redirect(`/journeystory/photos/${id}?${key}=${encodeURIComponent(msg)}${hash}`);

export async function toggleLikeAction(photoId: string): Promise<void> {
  const { user } = await requireMember(photoId);
  await toggleLike(user.id, photoId);
  refresh(photoId);
}

export async function toggleSaveAction(photoId: string): Promise<void> {
  const { user } = await requireMember(photoId);
  await toggleSave(user.id, photoId);
  refresh(photoId);
}

export async function addCommentAction(photoId: string, fd: FormData): Promise<void> {
  const { user, photo } = await requireMember(photoId);
  const content = String(fd.get("content") ?? "").trim();
  if (!content) back(photoId, "error", "Hãy nhập nội dung bình luận.", "#comments");
  if (content.length > 2000) back(photoId, "error", "Bình luận tối đa 2000 ký tự.", "#comments");
  if ((await recentCommentCount(user.id)) >= 5) {
    back(photoId, "error", "Bạn bình luận hơi nhanh, hãy đợi một chút rồi thử lại.", "#comments");
  }
  await addComment(photoId, user.id, content);
  if (photo.uploaderId !== user.id) {
    await notify(photo.uploaderId, "comment", `${user.displayName} đã bình luận về ảnh của bạn.`, `/journeystory/photos/${photoId}#comments`);
  }
  refresh(photoId);
  redirect(`/journeystory/photos/${photoId}#comments`);
}

export async function deleteCommentAction(commentId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const c = await getComment(commentId);
  if (!c) return;
  // Chỉ chủ bình luận hoặc quản trị/kiểm duyệt mới được xóa
  const staff = user.role === "admin" || user.role === "moderator";
  if (c.userId !== user.id && !staff) return;
  await deleteComment(commentId);
  refresh(c.photoId);
}

export async function reportAction(photoId: string, targetType: "photo" | "comment", targetId: string, fd: FormData): Promise<void> {
  const { user } = await requireMember(photoId);
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  if (reason.length < 5) back(photoId, "error", "Hãy mô tả ngắn lý do báo cáo (ít nhất 5 ký tự).");
  if (targetType === "comment") {
    const c = await getComment(targetId);
    if (!c || c.photoId !== photoId) back(photoId, "error", "Không tìm thấy bình luận.");
  } else if (targetId !== photoId) {
    back(photoId, "error", "Báo cáo không hợp lệ.");
  }
  const created = await createReport(user.id, targetType, targetId, reason);
  back(photoId, "ok", created ? "Cảm ơn bạn, báo cáo đã được gửi tới người kiểm duyệt." : "Bạn đã báo cáo mục này rồi.");
}

export async function addToCollectionAction(photoId: string, fd: FormData): Promise<void> {
  const { user } = await requireMember(photoId);
  const newName = String(fd.get("newName") ?? "").trim().slice(0, 80);
  let collectionId = String(fd.get("collectionId") ?? "");
  if (newName) collectionId = await createCollection(user.id, newName);
  if (!/^[a-f0-9-]{36}$/.test(collectionId)) back(photoId, "error", "Hãy chọn hoặc đặt tên một bộ sưu tập.");
  const ok = await addToCollection(collectionId, user.id, photoId);
  refresh(photoId);
  back(photoId, ok ? "ok" : "error", ok ? "Đã thêm vào bộ sưu tập." : "Không thêm được vào bộ sưu tập.");
}

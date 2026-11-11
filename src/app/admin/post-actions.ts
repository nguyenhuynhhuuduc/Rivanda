"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { CATEGORIES, SECTIONS, type PostSection } from "@/lib/cyber-lab";
import { logActivity } from "@/lib/activity";
import { readMinutes } from "@/lib/format";
import {
  createPost, deletePost, getPostById, updatePost,
  type Difficulty, type PostInput, type PostStatus, type PostType,
} from "@/lib/posts";
import { deleteImage, saveImage, UploadError } from "@/lib/uploads";
import { flag, qs, str, strOrNull } from "./helpers";
import { blogFoundationReady } from "@/lib/blog-read";
import { saveBlogAction } from "@/app/(light)/account/blog/actions";

const TYPES: PostType[] = ["hacking", "blog"];
const DIFFS: Difficulty[] = ["beginner", "intermediate", "advanced"];
const STATUSES: PostStatus[] = ["draft", "published"];
const SECTION_VALUES = [...Object.values(SECTIONS).map((s) => s.section), "article"] as PostSection[];
const sectionOf = (v: string): PostSection => (SECTION_VALUES.includes(v as PostSection) ? (v as PostSection) : "article");

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const t of raw.split(",")) {
    const name = t.trim().slice(0, 30);
    if (name) seen.add(name);
  }
  return [...seen].slice(0, 8);
}

function refreshPosts() {
  revalidatePath("/hacking", "layout");
  revalidatePath("/document", "layout");
  revalidatePath("/admin/posts");
}

export async function savePostAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = str(fd, "id", 36);
  const back = (key: "saved" | "error", msg: string) =>
    redirect((id ? `/admin/posts/${id}` : "/admin/posts/new") + qs(key, msg));

  const type = str(fd, "type", 10) as PostType;
  const title = str(fd, "title", 200);
  const content = String(fd.get("content") ?? "").trim();
  if (!TYPES.includes(type)) back("error", "Loại bài không hợp lệ.");
  if (!title) back("error", "Hãy nhập tiêu đề.");
  if (!content) back("error", "Hãy nhập nội dung bài viết.");

  const status = str(fd, "status", 10) as PostStatus;
  const diffRaw = str(fd, "difficulty", 12) as Difficulty;
  const existing = id ? await getPostById(id) : null;
  if (id && !existing) redirect("/admin/posts");
  // Blog-only adapter. Keep every Cyber Lab writer below unchanged.
  if ((type === "blog" || existing?.type === "blog") && await blogFoundationReady()) {
    if (type !== "blog" || existing?.type === "hacking") back("error", "Không chuyển loại bài giữa Blog và Cyber Lab trong luồng này.");
    if (existing && !fd.get("revision")) redirect(`/admin/blog/${existing.id}?error=${encodeURIComponent("Hãy dùng trình Blog mới để tải đúng phiên bản trước khi lưu.")}`);
    fd.set("intent", status === "published" ? "publish" : "draft");
    await saveBlogAction(fd);
    return;
  }

  // Ảnh bìa
  let coverFile = existing?.coverFile ?? null;
  try {
    const cover = fd.get("cover");
    if (cover instanceof File && cover.size > 0) {
      const saved = await saveImage(cover);
      coverFile = saved;
    } else if (flag(fd, "removeCover")) {
      coverFile = null;
    }
  } catch (err) {
    back("error", err instanceof UploadError ? err.message : "Không lưu được ảnh bìa.");
  }

  // Không xóa cover cũ khi thay/gỡ: SQL có thể thất bại hoặc có cập nhật đồng thời.
  const input: PostInput = {
    type,
    title,
    summary: strOrNull(fd, "summary", 500),
    content,
    coverFile,
    difficulty: type === "hacking" && DIFFS.includes(diffRaw) ? diffRaw : null,
    category: type === "hacking" && CATEGORIES[str(fd, "category", 30)] ? str(fd, "category", 30) : null,
    section: type === "hacking" ? sectionOf(str(fd, "section", 12)) : "article",
    readMinutes: readMinutes(content),
    status: STATUSES.includes(status) ? status : "draft",
    tags: parseTags(str(fd, "tags", 300)),
  };

  let postId = id;
  if (existing) await updatePost(existing.id, input);
  else postId = await createPost(user.id, input);

  refreshPosts();
  redirect(`/admin/posts/${postId}` + qs("saved", input.status === "published" ? "Đã lưu và đăng bài." : "Đã lưu bản nháp."));
}

export async function deletePostAction(id: string): Promise<void> {
  await requireAdmin();
  const existing = await getPostById(id);
  if (existing?.type === "blog") {
    if (await blogFoundationReady()) redirect(`/admin/blog/${existing.id}?error=${encodeURIComponent("Xác nhận xóa mềm tại trình Blog để giữ nội dung và kiểm tra phiên bản.")}`);
    redirect(`/admin/posts?error=${encodeURIComponent("Xóa Blog đang khóa đến khi migration 006 sẵn sàng, để bảo toàn nội dung cũ.")}`);
  }
  const user = await getCurrentUser();
  const cover = await deletePost(id);
  await logActivity({ userId: user?.id, action: "post.delete", targetType: "post", targetId: id });
  await deleteImage(cover);
  refreshPosts();
}

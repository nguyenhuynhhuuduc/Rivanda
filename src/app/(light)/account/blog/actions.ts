"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { BlogError, blogId, blogRevision, blogText, validateBlogInput, type BlogInput } from "@/lib/blog-policy";
import { editableBlog, requireBlogFoundation } from "@/lib/blog-read";
import { deleteBlog, reserveBlogUpload, saveBlog } from "@/lib/blog-store";
import { saveBlogCover } from "@/lib/blog-cover";
import { refreshBlog } from "@/lib/blog-revalidate";
function message(error: unknown): string {
  return error instanceof BlogError ? error.message : (error as { code?: string })?.code === "ER_DUP_ENTRY" ? "Slug đã tồn tại. Hãy thử lại hoặc chọn slug khác." : "Không lưu được thay đổi. Dữ liệu chưa được xác nhận; hãy tải lại trước khi thử lại.";
}
export async function saveBlogAction(fd: FormData): Promise<void> {
  const actor = await requireUser("/account/blog");
  const base = actor.role === "admin" ? "/admin/blog" : "/account/blog";
  let postId = "";
  try {
    await requireBlogFoundation();
    const rawId = fd.get("id"); postId = rawId ? blogId(rawId) : "";
    if (postId && !await editableBlog(postId, actor)) throw new BlogError("Không có quyền sửa bài viết này.");
    const tagsText = blogText(fd.get("tags") ?? "", 320);
    const input: BlogInput = { title: blogText(fd.get("title"), 200, true), summary: blogText(fd.get("summary") ?? "", 500), content: blogText(fd.get("content") ?? "", 200_000),
      topicId: fd.get("topicId") ? blogId(fd.get("topicId")) : null, tags: tagsText.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean), intent: fd.get("intent") as BlogInput["intent"] };
    validateBlogInput(input);
    if (input.intent === "publish" && actor.role !== "admin") throw new BlogError("Chỉ Admin được xuất bản trực tiếp.");
    if (input.intent === "submit" && actor.role !== "admin" && !input.topicId) throw new BlogError("Hãy chọn chủ đề trước khi gửi duyệt.");
    const revision = postId ? blogRevision(fd.get("revision")) : undefined;
    const cover = fd.get("cover");
    if (cover instanceof File && cover.size > 0) { await reserveBlogUpload(actor); input.coverFile = await saveBlogCover(cover); }
    else if (fd.get("removeCover") === "on") input.coverFile = null;
    postId = await saveBlog(actor, input, postId || undefined, revision);
  } catch (error) { redirect(`${base}${postId ? `/${postId}` : "/new"}?error=${encodeURIComponent(message(error))}`); }
  await refreshBlog();
  redirect(`${base}/${postId}?saved=1`);
}
export async function deleteBlogAction(fd: FormData): Promise<void> {
  const actor = await requireUser("/account/blog"), base = actor.role === "admin" ? "/admin/blog" : "/account/blog";
  try { await deleteBlog(actor, blogId(fd.get("id")), blogRevision(fd.get("revision"))); }
  catch (error) { redirect(`${base}?error=${encodeURIComponent(message(error))}`); }
  await refreshBlog(); redirect(`${base}?saved=${encodeURIComponent("Đã xóa mềm bài viết; giữ dữ liệu và ảnh bìa.")}`);
}

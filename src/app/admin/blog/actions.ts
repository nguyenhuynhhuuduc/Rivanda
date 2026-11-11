"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { blogId, blogRevision, BlogError } from "@/lib/blog-policy";
import { deleteBlogTopic, reviewBlog, saveBlogTopic } from "@/lib/blog-store";
import { refreshBlog } from "@/lib/blog-revalidate";

const errorText = (e: unknown) => e instanceof BlogError ? e.message : (e as { code?: string })?.code === "ER_DUP_ENTRY" ? "Slug đã tồn tại, hãy chọn slug khác." : "Không hoàn tất thao tác. Hãy tải lại và thử lại.";
export async function reviewBlogAction(fd: FormData): Promise<void> {
  await requireAdmin(); const actor = await requireUser("/admin/blog");
  try { await reviewBlog(actor, blogId(fd.get("id")), blogRevision(fd.get("revision")), fd.get("decision"), fd.get("note") ?? ""); }
  catch (error) { redirect(`/admin/blog?error=${encodeURIComponent(errorText(error))}`); }
  await refreshBlog(); redirect("/admin/blog?saved=1");
}
export async function saveTopicAction(fd: FormData): Promise<void> {
  await requireAdmin(); const actor = await requireUser("/admin/blog/topics");
  try { await saveBlogTopic(actor, { name: String(fd.get("name") ?? ""), slug: fd.get("id") ? undefined : String(fd.get("slug") ?? ""), sortOrder: Number(fd.get("sortOrder")), isVisible: fd.get("isVisible") === "on" }, fd.get("id") ? blogId(fd.get("id")) : undefined); }
  catch (error) { redirect(`/admin/blog/topics?error=${encodeURIComponent(errorText(error))}`); }
  await refreshBlog(); revalidatePath("/admin/blog/topics"); redirect("/admin/blog/topics?saved=1");
}
export async function deleteTopicAction(fd: FormData): Promise<void> {
  await requireAdmin(); const actor = await requireUser("/admin/blog/topics");
  try { await deleteBlogTopic(actor, blogId(fd.get("id"))); }
  catch (error) { redirect(`/admin/blog/topics?error=${encodeURIComponent(errorText(error))}`); }
  await refreshBlog(); revalidatePath("/admin/blog/topics"); redirect("/admin/blog/topics?saved=1");
}

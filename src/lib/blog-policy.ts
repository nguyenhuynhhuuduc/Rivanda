import type { Role } from "./permissions";

export type BlogActor = { id: string; role: Role };
export type BlogState = "draft" | "pending" | "published" | "rejected" | "hidden" | "deleted";
export type BlogTopic = { id: string; name: string; slug: string; isVisible: boolean; sortOrder: number; deletedAt: Date | null };
export const BLOG_STATE_LABEL: Record<BlogState, string> = { draft: "Nháp", pending: "Chờ duyệt", published: "Đã xuất bản", rejected: "Từ chối", hidden: "Đã ẩn", deleted: "Đã xóa" };
export class BlogError extends Error {}
export const BLOG_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function blogId(value: unknown): string {
  if (typeof value !== "string" || !BLOG_UUID.test(value)) throw new BlogError("ID không hợp lệ.");
  return value;
}
export function blogText(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new BlogError(`Nội dung không hợp lệ hoặc vượt ${max} ký tự.`);
  return value.trim();
}
export function blogRevision(value: unknown): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) throw new BlogError("Phiên bản không hợp lệ. Hãy tải lại bài viết.");
  return n;
}
export type BlogInput = {
  title: string; summary: string; content: string; topicId: string | null; tags: string[];
  intent: "draft" | "submit" | "publish"; coverFile?: string | null;
};
export function validateBlogInput(input: BlogInput): BlogInput {
  if (!input || !["draft", "submit", "publish"].includes(input.intent)) throw new BlogError("Thao tác không hợp lệ.");
  const title = blogText(input.title, 200, true), summary = blogText(input.summary, 500);
  const content = blogText(input.content, 200_000, input.intent !== "draft");
  if (!Array.isArray(input.tags) || input.tags.length > 8) throw new BlogError("Tối đa 8 tag.");
  const tags = [...new Set(input.tags.map((t) => blogText(t, 30, true)))];
  const topicId = input.topicId === null ? null : blogId(input.topicId);
  if (input.coverFile !== undefined && input.coverFile !== null && !/^[a-f0-9-]{36}\.webp$/.test(input.coverFile)) throw new BlogError("Ảnh bìa không hợp lệ.");
  return { ...input, title, summary, content, tags, topicId };
}

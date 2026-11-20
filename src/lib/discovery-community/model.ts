import type { Role } from "../permissions";
export type Actor = { id: string; role: Role };
export type Kind = "status" | "article" | "photos";
export type PostState = "draft" | "pending" | "published" | "rejected" | "hidden" | "deleted";
export type Topic = { id: string; name: string; slug: string };
export type Media = { id: string; width: number; height: number };
export type Post = {
  id: string; authorId: string; authorName: string; avatar: string | null; topic: Topic | null;
  kind: Kind; title: string | null; body: string; visibility: "public" | "private"; status: PostState;
  revision: number; createdAt: Date; publishedAt: Date | null; timeKey: string;
  likes: number; comments: number; saves: number; liked: boolean; saved: boolean;
  media: Media[]; tags: string[]; reviewNote: string | null; following?: boolean; followsViewer?: boolean;
};
export class CommunityError extends Error {}
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function idOf(x: unknown): string { if (typeof x !== "string" || !UUID.test(x)) throw new CommunityError("ID không hợp lệ."); return x; }
export function textOf(x: unknown, max: number, required = false): string {
  if (typeof x !== "string" || x.length > max || (required && !x.trim())) throw new CommunityError(`Nội dung không hợp lệ hoặc vượt ${max} ký tự.`);
  return x.trim();
}
export function revisionOf(x: unknown): number {
  const n = typeof x === "string" && /^\d+$/.test(x) ? Number(x) : x;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) throw new CommunityError("Phiên bản không hợp lệ. Hãy tải lại bài."); return n;
}
export type PostInput = { kind: Kind; title: string; body: string; topicId: string | null; visibility: "public" | "private"; intent: "draft" | "publish"; tags: string[] };
export type PreparedMedia = { imageFile: string; thumbFile: string; byteSize: number; width: number; height: number; batchId: string };
export function validateInput(i: PostInput): PostInput {
  if (!i || !["status", "article", "photos"].includes(i.kind) || !["public", "private"].includes(i.visibility) || !["draft", "publish"].includes(i.intent)) throw new CommunityError("Loại bài hoặc trạng thái không hợp lệ.");
  const title = textOf(i.title, 200, i.kind === "article" && i.intent === "publish");
  const body = textOf(i.body, i.kind === "status" ? 1000 : 100000, i.kind !== "photos" && i.intent === "publish");
  if (!Array.isArray(i.tags) || i.tags.length > 8) throw new CommunityError("Tối đa 8 hashtag.");
  const tags = [...new Set(i.tags.map(t => textOf(textOf(t, 31, true).replace(/^#/, ""), 30, true)))];
  return { ...i, title, body, tags, topicId: i.topicId === null ? null : idOf(i.topicId) };
}
export const STATE_LABEL: Record<PostState, string> = { draft: "Nháp", pending: "Chờ kiểm duyệt", published: "Đã đăng", rejected: "Từ chối", hidden: "Đã ẩn", deleted: "Đã xóa" };

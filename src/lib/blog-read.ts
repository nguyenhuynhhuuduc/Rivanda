import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { getPostBySlug, type Post, type Tag } from "./posts";
import { blogId, BlogError, type BlogActor, type BlogState, type BlogTopic } from "./blog-policy";

const REQUIRED: Record<string, string[]> = {
  blog_foundation_state: ["singleton_id", "migration_version", "completed_at"],
  blog_topics: ["id", "name", "slug", "is_visible", "sort_order", "deleted_at"],
  blog_post_details: ["post_id", "topic_id", "workflow_state", "revision", "reviewed_revision", "reviewed_by", "reviewed_at", "review_note", "deleted_at"],
  blog_review_events: ["id", "post_id", "actor_id", "revision", "decision", "note", "created_at"],
  content_rate_buckets: ["user_id", "action_kind", "window_start", "hits"],
};
export const blogFoundationReady = cache(async (): Promise<boolean> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)", [Object.keys(REQUIRED)]);
  const columns = new Set(rows.map((r) => `${r.t}.${r.c}`));
  if (!Object.entries(REQUIRED).every(([t, names]) => names.every((c) => columns.has(`${t}.${c}`)))) return false;
  const [state] = await pool.query<RowDataPacket[]>("SELECT migration_version FROM blog_foundation_state WHERE singleton_id=1");
  return state[0]?.migration_version === 6;
});
export async function requireBlogFoundation(): Promise<void> {
  if (!await blogFoundationReady()) throw new BlogError("Blog Foundation chưa sẵn sàng: cần áp dụng migration 006 theo quy trình được duyệt.");
}
const topicOf = (r: RowDataPacket): BlogTopic => ({ id: r.id, name: r.name, slug: r.slug, isVisible: r.is_visible === 1, sortOrder: r.sort_order, deletedAt: r.deleted_at });
export async function listBlogTopics(admin = false): Promise<BlogTopic[]> {
  if (!await blogFoundationReady()) return [];
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM blog_topics WHERE deleted_at IS NULL ${admin ? "" : "AND is_visible = 1"} ORDER BY sort_order, name, id`);
  return rows.map(topicOf);
}
export type BlogRecord = { post: Post; authorId: string; authorName: string | null; topic: BlogTopic | null; revision: number; state: BlogState; reviewNote: string | null };
const SELECT_BLOG = `SELECT p.*, b.revision, b.workflow_state, b.review_note,
  u.first_name, u.last_name, t.id AS topic_id, t.name AS topic_name, t.slug AS topic_slug,
  t.is_visible AS topic_visible, t.sort_order AS topic_order, t.deleted_at AS topic_deleted
  FROM posts p LEFT JOIN blog_post_details b ON b.post_id = p.id
  LEFT JOIN users u ON u.id = p.author_id AND u.is_active = 1
  LEFT JOIN blog_topics t ON t.id = b.topic_id`;
const PUBLIC_WHERE = "p.type = 'blog' AND p.status = 'published' AND (b.post_id IS NULL OR (b.workflow_state = 'published' AND b.deleted_at IS NULL))";
async function records(rows: RowDataPacket[]): Promise<BlogRecord[]> {
  if (!rows.length) return [];
  const [tagRows] = await pool.query<RowDataPacket[]>("SELECT pt.post_id, t.id, t.name, t.slug FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id IN (?) ORDER BY t.name", [rows.map((r) => r.id)]);
  return rows.map((r) => {
    const tags: Tag[] = tagRows.filter((t) => t.post_id === r.id).map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
    const post: Post = { id: r.id, type: "blog", title: r.title, slug: r.slug, summary: r.summary, content: r.content,
      coverFile: r.cover_file, difficulty: r.difficulty, category: r.category, section: r.section, readMinutes: r.read_minutes,
      status: r.status, viewCount: r.view_count, publishedAt: r.published_at, createdAt: r.created_at, updatedAt: r.updated_at, tags };
    const topic = r.topic_id ? { id: r.topic_id, name: r.topic_name, slug: r.topic_slug, isVisible: r.topic_visible === 1, sortOrder: r.topic_order, deletedAt: r.topic_deleted } : null;
    return { post, authorId: r.author_id, authorName: [r.last_name, r.first_name].filter(Boolean).join(" ") || null, topic,
      revision: Number(r.revision ?? 1), state: r.workflow_state ?? r.status, reviewNote: r.review_note ?? null };
  });
}
export async function publicBlogEntries(filter: { q?: string; topic?: string; limit: number; offset: number }): Promise<{ entries: BlogRecord[]; total: number }> {
  const conditions = [PUBLIC_WHERE], args: unknown[] = [];
  if (filter.q) { conditions.push("(p.title LIKE ? OR p.summary LIKE ?)"); const q = `%${filter.q.replace(/[%_\\]/g, (c) => "\\" + c)}%`; args.push(q, q); }
  if (filter.topic) { conditions.push("t.slug = ? AND t.is_visible = 1 AND t.deleted_at IS NULL"); args.push(filter.topic); }
  const where = conditions.join(" AND ");
  const [rows] = await pool.query<RowDataPacket[]>(`${SELECT_BLOG} WHERE ${where} ORDER BY COALESCE(p.published_at,p.created_at) DESC, p.id DESC LIMIT ? OFFSET ?`, [...args, filter.limit, filter.offset]);
  const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM posts p LEFT JOIN blog_post_details b ON b.post_id=p.id LEFT JOIN blog_topics t ON t.id=b.topic_id WHERE ${where}`, args);
  return { entries: await records(rows), total: Number(count[0]?.n ?? 0) };
}
export async function getPublicBlog(slug: string): Promise<BlogRecord | null> {
  if (!await blogFoundationReady()) {
    const post = await getPostBySlug("blog", slug);
    return post ? { post, authorId: "", authorName: null, topic: null, revision: 1, state: "published", reviewNote: null } : null;
  }
  const [rows] = await pool.query<RowDataPacket[]>(`${SELECT_BLOG} WHERE ${PUBLIC_WHERE} AND p.slug = ? LIMIT 1`, [slug]);
  return (await records(rows))[0] ?? null;
}
export async function editableBlog(id: string, actor: BlogActor): Promise<BlogRecord | null> {
  blogId(id); await requireBlogFoundation();
  const [rows] = await pool.query<RowDataPacket[]>(`${SELECT_BLOG} WHERE p.type='blog' AND p.id=? AND (b.post_id IS NULL OR b.workflow_state <> 'deleted') ${actor.role === "admin" ? "" : "AND p.author_id = ?"} LIMIT 1`, actor.role === "admin" ? [id] : [id, actor.id]);
  return (await records(rows))[0] ?? null;
}
export async function managedBlogs(actor: BlogActor, page = 1, state?: string): Promise<{ entries: BlogRecord[]; total: number }> {
  await requireBlogFoundation();
  const args: unknown[] = [], where = ["p.type='blog'", "(b.post_id IS NULL OR b.workflow_state <> 'deleted')"];
  if (actor.role !== "admin") { where.push("p.author_id=?"); args.push(actor.id); }
  if (state && ["draft", "pending", "published", "rejected", "hidden"].includes(state)) { where.push("COALESCE(b.workflow_state,p.status)=?"); args.push(state); }
  const clause = where.join(" AND ");
  const [rows] = await pool.query<RowDataPacket[]>(`${SELECT_BLOG} WHERE ${clause} ORDER BY p.updated_at DESC, p.id DESC LIMIT 20 OFFSET ?`, [...args, (page - 1) * 20]);
  const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM posts p LEFT JOIN blog_post_details b ON b.post_id=p.id WHERE ${clause}`, args);
  return { entries: await records(rows), total: Number(count[0]?.n ?? 0) };
}

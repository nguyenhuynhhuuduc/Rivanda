import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { listPosts, type Post } from "./posts";
import { blogFoundationReady, publicBlogEntries } from "./blog-read";

export type BlogListEntry = {
  post: Post;
  authorName: string | null;
  topic?: { name: string; slug: string } | null;
};

/** Chỉ SELECT trên schema hiện có; không đổi model posts dùng chung với Cyber Lab. */
export async function listBlogEntries(filter: { q?: string; topic?: string; limit: number; offset: number }): Promise<{ entries: BlogListEntry[]; total: number }> {
  if (await blogFoundationReady()) {
    const result = await publicBlogEntries(filter);
    return { total: result.total, entries: result.entries.map((r) => ({ post: r.post, authorName: r.authorName, topic: r.topic?.isVisible && !r.topic.deletedAt ? r.topic : null })) };
  }
  if (filter.topic) return { entries: [], total: 0 };
  const { posts, total } = await listPosts({ ...filter, type: "blog", onlyPublished: true });
  if (!posts.length) return { entries: [], total };
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, u.first_name, u.last_name FROM posts p
       LEFT JOIN users u ON u.id = p.author_id AND u.is_active = 1
      WHERE p.type = 'blog' AND p.status = 'published' AND p.id IN (?)`,
    [posts.map((p) => p.id)]
  );
  const authors = new Map(rows.map((r) => [r.id as string,
    [r.last_name, r.first_name].filter((v): v is string => typeof v === "string" && !!v.trim()).join(" ") || null]));
  return { entries: posts.map((post) => ({ post, authorName: authors.get(post.id) ?? null })), total };
}

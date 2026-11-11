import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { randomSuffix, slugify } from "./slug";
import type { PostSection } from "./cyber-lab";

export type PostType = "hacking" | "blog";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type PostStatus = "draft" | "published";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung bình",
  advanced: "Nâng cao",
};

export type Tag = { id: number; name: string; slug: string };

export type Post = {
  id: string;
  type: PostType;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  coverFile: string | null;
  difficulty: Difficulty | null;
  category: string | null;
  section: PostSection;
  readMinutes: number;
  status: PostStatus;
  viewCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Tag[];
};

type PostRow = RowDataPacket & {
  id: string;
  type: PostType;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  cover_file: string | null;
  difficulty: Difficulty | null;
  category: string | null;
  section: PostSection;
  read_minutes: number;
  status: PostStatus;
  view_count: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const mapPost = (r: PostRow, tags: Tag[]): Post => ({
  id: r.id,
  type: r.type,
  title: r.title,
  slug: r.slug,
  summary: r.summary,
  content: r.content,
  coverFile: r.cover_file,
  difficulty: r.difficulty,
  category: r.category,
  section: r.section,
  readMinutes: r.read_minutes,
  status: r.status,
  viewCount: r.view_count,
  publishedAt: r.published_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  tags,
});

async function attachTags(rows: PostRow[]): Promise<Post[]> {
  if (rows.length === 0) return [];
  const [tagRows] = await pool.query<RowDataPacket[]>(
    `SELECT pt.post_id, t.id, t.name, t.slug
       FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
      WHERE pt.post_id IN (?) ORDER BY t.name`,
    [rows.map((r) => r.id)]
  );
  const byPost = new Map<string, Tag[]>();
  for (const t of tagRows) {
    const list = byPost.get(t.post_id as string) ?? [];
    list.push({ id: t.id as number, name: t.name as string, slug: t.slug as string });
    byPost.set(t.post_id as string, list);
  }
  return rows.map((r) => mapPost(r, byPost.get(r.id) ?? []));
}

export type PostFilter = {
  type?: PostType;
  onlyPublished: boolean;
  q?: string;
  tag?: string; // slug
  section?: PostSection;
  category?: string;
  excludeId?: string;
  limit?: number;
  offset?: number;
};

export async function listPosts(f: PostFilter): Promise<{ posts: Post[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.type) {
    where.push("p.type = ?");
    params.push(f.type);
  }
  if (f.onlyPublished) where.push("p.status = 'published'");
  if (f.q) {
    where.push("(p.title LIKE ? OR p.summary LIKE ?)");
    const like = `%${f.q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    params.push(like, like);
  }
  if (f.section) { where.push("p.section = ?"); params.push(f.section); }
  if (f.category) { where.push("p.category = ?"); params.push(f.category); }
  if (f.excludeId) { where.push("p.id <> ?"); params.push(f.excludeId); }
  if (f.tag) {
    where.push("EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.slug = ?)");
    params.push(f.tag);
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";

  const [rows] = await pool.query<PostRow[]>(
    `SELECT p.* FROM posts p ${w}
      ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT ? OFFSET ?`,
    [...params, f.limit ?? 12, f.offset ?? 0]
  );
  const [c] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM posts p ${w}`, params);
  return { posts: await attachTags(rows), total: Number(c[0]?.n ?? 0) };
}

export async function getPostBySlug(type: PostType, slug: string): Promise<Post | null> {
  const [rows] = await pool.query<PostRow[]>(
    "SELECT * FROM posts WHERE type = ? AND slug = ? AND status = 'published' LIMIT 1",
    [type, slug]
  );
  return (await attachTags(rows))[0] ?? null;
}

export async function getPostById(id: string): Promise<Post | null> {
  const [rows] = await pool.query<PostRow[]>("SELECT * FROM posts WHERE id = ? LIMIT 1", [id]);
  return (await attachTags(rows))[0] ?? null;
}

export async function incrementViews(id: string): Promise<void> {
  await pool.query("UPDATE posts SET view_count = view_count + 1 WHERE id = ?", [id]);
}

export async function listTags(type: PostType): Promise<(Tag & { count: number })[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.name, t.slug, COUNT(*) AS n
       FROM tags t
       JOIN post_tags pt ON pt.tag_id = t.id
       JOIN posts p ON p.id = pt.post_id AND p.type = ? AND p.status = 'published'
      GROUP BY t.id, t.name, t.slug ORDER BY t.name`,
    [type]
  );
  return rows.map((r) => ({ id: r.id as number, name: r.name as string, slug: r.slug as string, count: Number(r.n) }));
}

async function setTags(postId: string, names: string[]): Promise<void> {
  await pool.query("DELETE FROM post_tags WHERE post_id = ?", [postId]);
  for (const name of names) {
    const slug = slugify(name, "tag");
    await pool.query("INSERT INTO tags (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = name", [name, slug]);
    const [t] = await pool.query<RowDataPacket[]>("SELECT id FROM tags WHERE slug = ?", [slug]);
    if (t[0]) await pool.query("INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)", [postId, t[0].id]);
  }
}

export type PostInput = {
  type: PostType;
  title: string;
  summary: string | null;
  content: string;
  coverFile: string | null;
  difficulty: Difficulty | null;
  category: string | null;
  section: PostSection;
  readMinutes: number;
  status: PostStatus;
  tags: string[];
};

export async function createPost(authorId: string, input: PostInput): Promise<string> {
  const id = randomUUID();
  const base = slugify(input.title, "bai-viet");
  const [exists] = await pool.query<RowDataPacket[]>("SELECT 1 FROM posts WHERE type = ? AND slug = ?", [input.type, base]);
  const slug = exists.length ? `${base}-${randomSuffix()}` : base;
  await pool.query(
    `INSERT INTO posts (id, type, title, slug, summary, content, cover_file, difficulty, category, section, read_minutes, status, author_id, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.type, input.title, slug, input.summary, input.content, input.coverFile,
      input.difficulty, input.category, input.section, input.readMinutes, input.status, authorId,
      input.status === "published" ? new Date() : null,
    ]
  );
  await setTags(id, input.tags);
  return id;
}

export async function updatePost(id: string, input: PostInput): Promise<void> {
  // Giữ nguyên ngày đăng cũ nếu bài đã từng đăng.
  await pool.query(
    `UPDATE posts SET type = ?, title = ?, summary = ?, content = ?, cover_file = ?, difficulty = ?,
            category = ?, section = ?, read_minutes = ?, status = ?,
            published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END
      WHERE id = ?`,
    [
      input.type, input.title, input.summary, input.content, input.coverFile, input.difficulty,
      input.category, input.section, input.readMinutes, input.status, input.status, id,
    ]
  );
  await setTags(id, input.tags);
}

/** Xóa bài và trả về tên file ảnh bìa (nếu có) để xóa khỏi ổ đĩa. */
export async function deletePost(id: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT cover_file FROM posts WHERE id = ?", [id]);
  await pool.query("DELETE FROM posts WHERE id = ?", [id]);
  return (rows[0]?.cover_file as string | null | undefined) ?? null;
}

import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { slugify } from "./slug";

export type Tag = { id: number; name: string; slug: string };

export function parseTagList(raw: string, max = 8): string[] {
  const seen = new Map<string, string>();
  for (const t of raw.split(",")) {
    const name = t.trim().replace(/^#/, "").slice(0, 30);
    if (name) seen.set(slugify(name, "tag"), name);
  }
  return [...seen.values()].slice(0, max);
}

/** Tạo thẻ nếu chưa có và trả về id của các thẻ. */
export async function ensureTags(names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const slug = slugify(name, "tag");
    await pool.query("INSERT INTO tags (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = name", [name, slug]);
    const [r] = await pool.query<RowDataPacket[]>("SELECT id FROM tags WHERE slug = ?", [slug]);
    if (r[0]) ids.push(r[0].id as number);
  }
  return ids;
}

export async function setPhotoTags(photoId: string, names: string[]): Promise<void> {
  const ids = await ensureTags(names);
  await pool.query("DELETE FROM photo_tags WHERE photo_id = ?", [photoId]);
  for (const id of ids) {
    await pool.query("INSERT IGNORE INTO photo_tags (photo_id, tag_id) VALUES (?, ?)", [photoId, id]);
  }
}

export async function getPhotoTags(photoId: string): Promise<Tag[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.name, t.slug FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
      WHERE pt.photo_id = ? ORDER BY t.name`,
    [photoId]
  );
  return rows.map((r) => ({ id: r.id as number, name: r.name as string, slug: r.slug as string }));
}

export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, name, slug FROM tags WHERE slug = ? LIMIT 1", [slug]);
  const r = rows[0];
  return r ? { id: r.id as number, name: r.name as string, slug: r.slug as string } : null;
}

export async function listPhotoTags(limit = 40): Promise<(Tag & { count: number })[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.id, t.name, t.slug, COUNT(*) AS n
       FROM tags t JOIN photo_tags pt ON pt.tag_id = t.id
       JOIN photos p ON p.id = pt.photo_id AND p.status = 'published'
      GROUP BY t.id, t.name, t.slug ORDER BY n DESC, t.name LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({ id: r.id as number, name: r.name as string, slug: r.slug as string, count: Number(r.n) }));
}

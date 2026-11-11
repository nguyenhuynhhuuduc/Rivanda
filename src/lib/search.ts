import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { listPhotos, PUBLIC, type Photo } from "./discovery";
import { getCurrentUser } from "./auth";

export type SearchResults = {
  photos: Photo[];
  posts: { id: string; type: "hacking" | "blog"; slug: string; title: string; summary: string | null }[];
  docs: { id: string; title: string; description: string | null; kind: string }[];
};

export async function searchAll(q: string): Promise<SearchResults> {
  const user = await getCurrentUser();
  const l = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const [{ photos }, [postRows], [docRows]] = await Promise.all([
    listPhotos({ statuses: PUBLIC, q, limit: 12 }),
    pool.query<RowDataPacket[]>(
      `SELECT id, type, slug, title, summary FROM posts
        WHERE status = 'published' AND (type = 'blog' OR ? = 1) AND (title LIKE ? OR summary LIKE ?) ORDER BY published_at DESC LIMIT 12`, [user ? 1 : 0, l, l]),
    pool.query<RowDataPacket[]>(
      `SELECT id, title, description, kind FROM documents
        WHERE is_published = 1 AND access <> 'private' AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT 12`, [l, l]),
  ]);
  return {
    photos,
    posts: postRows.map((r) => ({
      id: r.id as string, type: r.type as "hacking" | "blog", slug: r.slug as string,
      title: r.title as string, summary: (r.summary as string | null) ?? null,
    })),
    docs: docRows.map((r) => ({
      id: r.id as string, title: r.title as string, description: (r.description as string | null) ?? null, kind: r.kind as string,
    })),
  };
}

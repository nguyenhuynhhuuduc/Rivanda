import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { can, type Role } from "./permissions";

export type DocKind = "document" | "project" | "resource";
export type DocAccess = "public" | "members" | "private";

export const KIND_LABEL: Record<DocKind, string> = { document: "Tài liệu", project: "Dự án", resource: "Tài nguyên" };
export const ACCESS_LABEL: Record<DocAccess, string> = {
  public: "Công khai", members: "Chỉ thành viên", private: "Riêng tư",
};

export type DocumentItem = {
  id: string; kind: DocKind; title: string; description: string | null; storedFile: string;
  originalName: string; fileExt: string; fileSize: number; downloadCount: number; isPublished: boolean;
  access: DocAccess; canDownload: boolean; isFeatured: boolean; category: string | null;
  uploaderId: string; createdAt: Date;
};

type Row = RowDataPacket & {
  id: string; kind: DocKind; title: string; description: string | null; stored_file: string;
  original_name: string; file_ext: string; file_size: number; download_count: number; is_published: number;
  access: DocAccess; can_download: number; is_featured: number; category: string | null;
  uploader_id: string; created_at: Date;
};

const map = (r: Row): DocumentItem => ({
  id: r.id, kind: r.kind, title: r.title, description: r.description, storedFile: r.stored_file,
  originalName: r.original_name, fileExt: r.file_ext, fileSize: Number(r.file_size),
  downloadCount: r.download_count, isPublished: r.is_published === 1, access: r.access,
  canDownload: r.can_download === 1, isFeatured: r.is_featured === 1, category: r.category,
  uploaderId: r.uploader_id, createdAt: r.created_at,
});

/** Ai được xem thông tin và tải/xem tài liệu này? Kiểm tra ở server mỗi lần truy cập. */
export function canAccessDocument(doc: DocumentItem, user: { id: string; role: Role } | null): boolean {
  if (user && (can(user.role, "content.manage") || user.id === doc.uploaderId)) return true;
  if (!doc.isPublished) return false;
  if (doc.access === "public") return true;
  if (doc.access === "members") return !!user;
  return false; // private: chỉ chủ sở hữu và admin
}

export type DocFilter = {
  onlyPublished: boolean;
  kinds?: DocKind[];
  featuredOnly?: boolean;
  q?: string;
  ext?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

export async function listDocuments(f: DocFilter): Promise<{ docs: DocumentItem[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.onlyPublished) where.push("is_published = 1 AND access <> 'private'");
  if (f.kinds?.length) { where.push("kind IN (?)"); params.push(f.kinds); }
  if (f.featuredOnly) where.push("is_featured = 1");
  if (f.ext) { where.push("file_ext = ?"); params.push(f.ext); }
  if (f.category) { where.push("category = ?"); params.push(f.category); }
  if (f.q) {
    const l = `%${f.q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    where.push("(title LIKE ? OR description LIKE ?)");
    params.push(l, l);
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const [rows] = await pool.query<Row[]>(
    `SELECT * FROM documents ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, f.limit ?? 100, f.offset ?? 0]
  );
  const [c] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM documents ${w}`, params);
  return { docs: rows.map(map), total: Number(c[0]?.n ?? 0) };
}

export async function listDocumentCategories(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT DISTINCT category FROM documents WHERE category IS NOT NULL AND category <> '' AND is_published = 1 AND access <> 'private' ORDER BY category"
  );
  return rows.map((r) => r.category as string);
}

export async function getDocument(id: string): Promise<DocumentItem | null> {
  const [rows] = await pool.query<Row[]>("SELECT * FROM documents WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? map(rows[0]) : null;
}

export type DocInput = {
  kind: DocKind; title: string; description: string | null; isPublished: boolean;
  access: DocAccess; canDownload: boolean; isFeatured: boolean; category: string | null;
};

export async function createDocument(
  input: DocInput & { storedFile: string; originalName: string; fileExt: string; fileSize: number; uploaderId: string }
): Promise<void> {
  await pool.query(
    `INSERT INTO documents (id, kind, title, description, stored_file, original_name, file_ext, file_size,
                            is_published, access, can_download, is_featured, category, uploader_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), input.kind, input.title, input.description, input.storedFile, input.originalName, input.fileExt,
     input.fileSize, input.isPublished ? 1 : 0, input.access, input.canDownload ? 1 : 0, input.isFeatured ? 1 : 0,
     input.category, input.uploaderId]
  );
}

export async function updateDocument(id: string, i: DocInput): Promise<void> {
  await pool.query(
    `UPDATE documents SET kind = ?, title = ?, description = ?, is_published = ?, access = ?, can_download = ?,
            is_featured = ?, category = ? WHERE id = ?`,
    [i.kind, i.title, i.description, i.isPublished ? 1 : 0, i.access, i.canDownload ? 1 : 0, i.isFeatured ? 1 : 0, i.category, id]
  );
}

export async function deleteDocument(id: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT stored_file FROM documents WHERE id = ?", [id]);
  await pool.query("DELETE FROM documents WHERE id = ?", [id]);
  return (rows[0]?.stored_file as string | undefined) ?? null;
}

export async function countDownload(id: string): Promise<void> {
  await pool.query("UPDATE documents SET download_count = download_count + 1 WHERE id = ?", [id]);
}

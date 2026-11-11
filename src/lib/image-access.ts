import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { can, type Role } from "./permissions";

type Viewer = { id: string; role: Role } | null;
export type ImageAccess = { allowed: boolean; previewOriginal: boolean };

/** File UUID không phải bằng chứng quyền truy cập. Kiểm tra tham chiếu mỗi lần. */
export async function imageAccess(file: string, user: Viewer): Promise<ImageAccess> {
  const [photos] = await pool.query<RowDataPacket[]>(
    "SELECT image_file, uploader_id, status FROM photos WHERE image_file = ? OR thumb_file = ? OR medium_file = ? LIMIT 1", [file, file, file]
  );
  if (photos[0]) {
    const p = photos[0];
    const allowed = p.status === "published" || !!user && (p.uploader_id === user.id || can(user.role, "moderation.review"));
    // Route /uploads chỉ cung cấp bản xem; ảnh gốc chỉ qua API download có guard.
    return { allowed, previewOriginal: file === p.image_file };
  }
  const [assets] = await pool.query<RowDataPacket[]>(`
    SELECT 1 FROM home_settings WHERE hero_image = ?
    UNION ALL SELECT 1 FROM users WHERE avatar_url = ? AND is_active = 1
    UNION ALL SELECT 1 FROM posts WHERE cover_file = ? AND
      ((status = 'published' AND (type = 'blog' OR ? = 1)) OR ? = 1 OR (type = 'blog' AND author_id = ?))
    LIMIT 1`, [file, `/uploads/${file}`, file, user ? 1 : 0, user && can(user.role, "content.manage") ? 1 : 0, user?.id ?? null]);
  return { allowed: assets.length > 0, previewOriginal: false };
}

import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";

export type Notification = {
  id: string; type: string; message: string; link: string | null; isRead: boolean; createdAt: Date;
};

export async function notify(userId: string, type: string, message: string, link?: string): Promise<void> {
  try {
    await pool.query(
      "INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), userId, type, message.slice(0, 300), link ?? null]
    );
  } catch (err) {
    console.error("Không tạo được thông báo:", err);
  }
}

export async function listNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id as string, type: r.type as string, message: r.message as string,
    link: (r.link as string | null) ?? null, isRead: r.is_read === 1, createdAt: r.created_at as Date,
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0",
      [userId]
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await pool.query("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", [userId]);
}

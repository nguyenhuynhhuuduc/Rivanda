import { headers } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";

// Nhật ký thao tác quan trọng. Lỗi ghi nhật ký không được làm hỏng thao tác chính.
export async function logActivity(input: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
}): Promise<void> {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  } catch {
    // ngoài phạm vi một yêu cầu thì bỏ qua IP
  }
  try {
    await pool.query(
      "INSERT INTO activity_logs (user_id, action, target_type, target_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)",
      [input.userId ?? null, input.action, input.targetType ?? null, input.targetId ?? null, input.detail?.slice(0, 500) ?? null, ip]
    );
  } catch (err) {
    console.error("Không ghi được nhật ký:", err);
  }
}

export type ActivityRow = {
  id: number; userName: string; action: string; targetType: string | null;
  targetId: string | null; detail: string | null; ip: string | null; createdAt: Date;
};

export async function listActivity(limit = 200): Promise<ActivityRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, u.first_name, u.last_name
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    userName: r.user_id ? [r.last_name, r.first_name].filter(Boolean).join(" ") : "Hệ thống",
    action: r.action as string,
    targetType: (r.target_type as string | null) ?? null,
    targetId: (r.target_id as string | null) ?? null,
    detail: (r.detail as string | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    createdAt: r.created_at as Date,
  }));
}

import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import type { Role } from "./permissions";

export type Stats = Record<
  | "members" | "photos" | "trips" | "blogPosts" | "hackingPosts" | "documents"
  | "likes" | "saves" | "comments" | "waitlist",
  number
>;

export async function getStats(): Promise<Stats> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'member')                       AS members,
       (SELECT COUNT(*) FROM photos)                                            AS photos,
       (SELECT COUNT(*) FROM trips)                                             AS trips,
       (SELECT COUNT(*) FROM posts WHERE type = 'blog'    AND status = 'published') AS blogPosts,
       (SELECT COUNT(*) FROM posts WHERE type = 'hacking' AND status = 'published') AS hackingPosts,
       (SELECT COUNT(*) FROM documents)                                         AS documents,
       (SELECT COUNT(*) FROM photo_likes)                                       AS likes,
       (SELECT COUNT(*) FROM saved_photos)                                      AS saves,
       (SELECT COUNT(*) FROM comments WHERE is_hidden = 0)                      AS comments,
       (SELECT COUNT(*) FROM waitlist)                                          AS waitlist`
  );
  const r = rows[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    members: n("members"), photos: n("photos"), trips: n("trips"),
    blogPosts: n("blogPosts"), hackingPosts: n("hackingPosts"), documents: n("documents"),
    likes: n("likes"), saves: n("saves"), comments: n("comments"), waitlist: n("waitlist"),
  };
}

export type MonthlyActivity = { month: string; label: string; users: number; photos: number; posts: number; documents: number };
export type DashboardData = {
  stats: Stats;
  users: number;
  openReports: number;
  photoStates: { status: string; count: number }[];
  monthly: MonthlyActivity[];
};

/** Chỉ tổng hợp SELECT; không seed hay suy diễn số liệu khi database không sẵn sàng. */
export async function getDashboardData(): Promise<DashboardData> {
  const [stats, [totals], [states], [activity]] = await Promise.all([
    getStats(),
    pool.query<RowDataPacket[]>(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM reports WHERE status = 'open') AS reports,
      DATE_FORMAT(CURDATE(), '%Y-%m') AS current_month`),
    pool.query<RowDataPacket[]>("SELECT status, COUNT(*) AS n FROM photos GROUP BY status"),
    pool.query<RowDataPacket[]>(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, 'users' AS kind, COUNT(*) AS n FROM users
       WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01') GROUP BY month
      UNION ALL
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, 'photos' AS kind, COUNT(*) AS n FROM photos
       WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01') GROUP BY month
      UNION ALL
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, 'posts' AS kind, COUNT(*) AS n FROM posts
       WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01') GROUP BY month
      UNION ALL
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, 'documents' AS kind, COUNT(*) AS n FROM documents
       WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 MONTH), '%Y-%m-01') GROUP BY month`),
  ]);
  const current = String(totals[0]?.current_month ?? "");
  if (!/^\d{4}-\d{2}$/.test(current)) throw new Error("Không lấy được kỳ thống kê.");
  const [year, month] = current.split("-").map(Number);
  const monthly: MonthlyActivity[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 6 + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry: MonthlyActivity = { month: key, label: `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`, users: 0, photos: 0, posts: 0, documents: 0 };
    for (const row of activity) {
      if (row.month !== key) continue;
      const kind = String(row.kind);
      if (kind === "users" || kind === "photos" || kind === "posts" || kind === "documents") entry[kind] = Number(row.n);
    }
    return entry;
  });
  return {
    stats, users: Number(totals[0]?.users ?? 0), openReports: Number(totals[0]?.reports ?? 0),
    photoStates: states.map((r) => ({ status: String(r.status), count: Number(r.n) })), monthly,
  };
}

export type AdminUserRow = {
  id: string; email: string; name: string; role: Role;
  isActive: boolean; createdAt: Date; lastLoginAt: Date | null;
};

export async function listUsers(): Promise<AdminUserRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, email, first_name, last_name, role, is_active, created_at, last_login_at FROM users ORDER BY created_at DESC"
  );
  return rows.map((r) => ({
    id: r.id as string,
    email: r.email as string,
    name: [r.last_name, r.first_name].filter(Boolean).join(" "),
    role: r.role as Role,
    isActive: r.is_active === 1,
    createdAt: r.created_at as Date,
    lastLoginAt: (r.last_login_at as Date | null) ?? null,
  }));
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]);
}

export async function updateUserName(id: string, firstName: string, lastName: string): Promise<void> {
  await pool.query("UPDATE users SET first_name = ?, last_name = ? WHERE id = ?", [firstName, lastName, id]);
}

export async function listWaitlist(): Promise<{ email: string; createdAt: Date }[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT email, created_at FROM waitlist ORDER BY created_at DESC");
  return rows.map((r) => ({ email: r.email as string, createdAt: r.created_at as Date }));
}

export async function addToWaitlist(email: string): Promise<void> {
  await pool.query("INSERT IGNORE INTO waitlist (email) VALUES (?)", [email]);
}

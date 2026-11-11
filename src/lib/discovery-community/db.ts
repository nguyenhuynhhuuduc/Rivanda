import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "../db";
import { CommunityError, idOf, revisionOf, type Actor } from "./model";
import { requireCommunity } from "./schema";
export async function transaction<T>(work: (tx: PoolConnection) => Promise<T>): Promise<T> {
  await requireCommunity(); const tx = await pool.getConnection();
  try { await tx.beginTransaction(); const result = await work(tx); await tx.commit(); return result; }
  catch (error) { await tx.rollback(); throw error; } finally { tx.release(); }
}
export async function lockActor(tx: PoolConnection, actor: Actor, admin = false): Promise<Actor> {
  const [rows] = await tx.query<RowDataPacket[]>("SELECT id,role,is_active FROM users WHERE id=? FOR UPDATE", [idOf(actor.id)]);
  const r = rows[0]; if (!r?.is_active || (admin && r.role !== "admin")) throw new CommunityError("Bạn không có quyền thực hiện thao tác này.");
  return { id: r.id, role: r.role };
}
export async function quota(tx: PoolConnection, actor: Actor, kind: "post" | "upload" | "interaction" | "comment" | "report", count = 1): Promise<void> {
  if (actor.role === "admin") return;
  const limit = { post: 10, upload: 12, interaction: 120, comment: 20, report: 5 }[kind];
  const window = new Date(Math.floor(Date.now() / 900000) * 900000);
  await tx.query("INSERT INTO community_rate_buckets(user_id,action_kind,window_start,hits) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE hits=hits+VALUES(hits)", [actor.id, kind, window, count]);
  const [rows] = await tx.query<RowDataPacket[]>("SELECT hits FROM community_rate_buckets WHERE user_id=? AND action_kind=? AND window_start=? FOR UPDATE", [actor.id, kind, window]);
  if (Number(rows[0].hits) > limit) throw new CommunityError("Bạn thao tác quá nhanh. Hãy thử lại sau tối đa 15 phút.");
}
type LockedPost = RowDataPacket & { author_id: string; revision: number };
export async function lockPost(tx: PoolConnection, id: string, includeDeleted=false): Promise<LockedPost> {
  const [rows] = await tx.query<LockedPost[]>("SELECT * FROM community_posts WHERE id=? FOR UPDATE", [idOf(id)]);
  if (!rows[0] || (!includeDeleted && rows[0].status === "deleted")) throw new CommunityError("Bài viết không khả dụng."); return rows[0];
}
export function checkOwner(row: { author_id: string; revision: unknown }, actor: Actor, revision: number): void {
  if (row.author_id !== actor.id) throw new CommunityError("Bạn chỉ có thể sửa/xóa bài của mình.");
  if (Number(row.revision) !== revisionOf(revision)) throw new CommunityError("Bài đã thay đổi. Hãy tải lại, không ghi đè phiên bản mới.");
}
export function checkPublic(row: RowDataPacket): void {
  if (row.status !== "published" || row.visibility !== "public") throw new CommunityError("Bài viết không còn cho phép tương tác.");
}

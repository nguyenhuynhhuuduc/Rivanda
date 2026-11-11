import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./db";
import { CommunityError, idOf } from "./discovery-community/model";
import { decodeCursor, encodeCursor, feedScope, type Cursor } from "./discovery-community/cursor";

// ===== Bộ sưu tập =====
export type Collection = { id: string; userId: string; name: string; isPublic: boolean; photoCount: number; coverFile: string | null };

const mapCol = (r: RowDataPacket): Collection => ({
  id: r.id as string, userId: r.user_id as string, name: r.name as string, isPublic: r.is_public === 1,
  photoCount: Number(r.photo_count ?? 0), coverFile: (r.cover as string | null) ?? null,
});

const COL_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM collection_photos cp JOIN photos p ON p.id = cp.photo_id AND p.status = 'published' WHERE cp.collection_id = c.id) AS photo_count,
    (SELECT COALESCE(p2.thumb_file, p2.image_file) FROM collection_photos cp2 JOIN photos p2 ON p2.id = cp2.photo_id AND p2.status = 'published'
      WHERE cp2.collection_id = c.id ORDER BY cp2.added_at DESC LIMIT 1) AS cover
  FROM collections c`;

export async function listCollections(userId: string): Promise<Collection[]> {
  const [rows] = await pool.query<RowDataPacket[]>(`${COL_SELECT} WHERE c.user_id = ? ORDER BY c.created_at DESC`, [userId]);
  return rows.map(mapCol);
}

export async function getCollection(id: string): Promise<Collection | null> {
  const [rows] = await pool.query<RowDataPacket[]>(`${COL_SELECT} WHERE c.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapCol(rows[0]) : null;
}

export async function createCollection(userId: string, name: string): Promise<string> {
  const id = randomUUID();
  await pool.query("INSERT INTO collections (id, user_id, name) VALUES (?, ?, ?)", [id, userId, name]);
  return id;
}

export async function updateCollection(id: string, userId: string, name: string, isPublic: boolean): Promise<void> {
  await pool.query("UPDATE collections SET name = ?, is_public = ? WHERE id = ? AND user_id = ?", [name, isPublic ? 1 : 0, id, userId]);
}

export async function deleteCollection(id: string, userId: string): Promise<void> {
  await pool.query("DELETE FROM collections WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function addToCollection(collectionId: string, userId: string, photoId: string): Promise<boolean> {
  const col = await getCollection(collectionId);
  if (!col || col.userId !== userId) return false; // chỉ thêm vào bộ sưu tập của chính mình
  await pool.query("INSERT IGNORE INTO collection_photos (collection_id, photo_id) VALUES (?, ?)", [collectionId, photoId]);
  return true;
}

export async function removeFromCollection(collectionId: string, userId: string, photoId: string): Promise<void> {
  await pool.query(
    `DELETE cp FROM collection_photos cp JOIN collections c ON c.id = cp.collection_id
      WHERE cp.collection_id = ? AND cp.photo_id = ? AND c.user_id = ?`, [collectionId, photoId, userId]);
}

export async function collectionIdsWithPhoto(userId: string, photoId: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cp.collection_id FROM collection_photos cp JOIN collections c ON c.id = cp.collection_id
      WHERE c.user_id = ? AND cp.photo_id = ?`, [userId, photoId]);
  return rows.map((r) => r.collection_id as string);
}

// ===== Theo dõi thành viên =====
export async function setFollow(followerId: string, followedId: string, desired: boolean): Promise<{following:boolean;changed:boolean}> {
  followerId=idOf(followerId).toLowerCase(); followedId=idOf(followedId).toLowerCase();
  if (typeof desired !== "boolean" || followerId.toLowerCase() === followedId.toLowerCase()) throw new CommunityError("Không thể theo dõi chính mình hoặc yêu cầu không hợp lệ.");
  const tx = await pool.getConnection();
  try {
    await tx.beginTransaction();
    // A stable lock order also serializes opposite-direction follows and retries.
    for (const id of [followerId, followedId].sort()) {
      const [rows] = await tx.query<RowDataPacket[]>("SELECT id,is_active FROM users WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]?.is_active) throw new CommunityError("Tài khoản không khả dụng hoặc không có quyền theo dõi.");
    }
    const [rows] = await tx.query<RowDataPacket[]>("SELECT 1 FROM follows WHERE follower_id=? AND followed_id=? FOR UPDATE", [followerId, followedId]);
    const changed = !!rows.length !== desired;
    if (changed) await tx.query(desired ? "INSERT INTO follows (follower_id,followed_id) VALUES (?,?)" : "DELETE FROM follows WHERE follower_id=? AND followed_id=?", [followerId, followedId]);
    await tx.commit();
    return {following:desired,changed};
  } catch (error) { await tx.rollback(); throw error; } finally { tx.release(); }
}

export async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
  idOf(followerId); idOf(followedId);
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?", [followerId, followedId]);
  return rows.length > 0;
}

export async function followCounts(userId: string): Promise<{ followers: number; following: number }> {
  idOf(userId);
  const [a] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM follows f JOIN users u ON u.id=f.follower_id AND u.is_active=1 WHERE f.followed_id = ?", [userId]);
  const [b] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM follows f JOIN users u ON u.id=f.followed_id AND u.is_active=1 WHERE f.follower_id = ?", [userId]);
  return { followers: Number(a[0]?.n ?? 0), following: Number(b[0]?.n ?? 0) };
}

export async function followedMembers(viewerId: string, ids: string[]): Promise<Set<string>> {
  idOf(viewerId); if (!ids.length) return new Set();
  const [rows] = await pool.query<RowDataPacket[]>("SELECT followed_id FROM follows WHERE follower_id=? AND followed_id IN (?)", [viewerId, ids.map(idOf)]);
  return new Set(rows.map(r=>r.followed_id as string));
}

export async function followPage(userId:string, direction:"followers"|"following", viewerId:string|null, token?:string) {
  idOf(userId); if(viewerId) idOf(viewerId);
  if(!["followers","following"].includes(direction)) throw new CommunityError("Danh sách không hợp lệ.");
  const scope=feedScope("newest","members",userId,direction), cursor=token?decodeCursor(token,scope,"newest"):null;
  const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS t");
  const base:Cursor=cursor??{v:1,order:"newest",scope,at:now.t,expires:Date.now()+30*60000};
  const member=direction==="followers"?"f.follower_id":"f.followed_id", owner=direction==="followers"?"f.followed_id":"f.follower_id";
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT u.id,u.first_name,u.last_name,u.avatar_url,DATE_FORMAT(f.created_at,'%Y-%m-%d %H:%i:%s.%f') AS time_key FROM follows f JOIN users u ON u.id=${member} AND u.is_active=1 JOIN users owner ON owner.id=${owner} AND owner.is_active=1 WHERE ${owner}=? AND f.created_at<=? ${cursor?"AND (f.created_at<? OR (f.created_at=? AND u.id<?))":""} ORDER BY f.created_at DESC,u.id DESC LIMIT 21`,[userId,base.at,...(cursor?[cursor.lastTime,cursor.lastTime,cursor.lastId]:[])]);
  const page=rows.slice(0,20), followed=viewerId?await followedMembers(viewerId,page.map(r=>r.id)):new Set<string>(), last=page.at(-1);
  return {members:page.map(r=>({id:r.id as string,name:[r.last_name,r.first_name].filter(Boolean).join(" ")||"Thành viên",avatar:r.avatar_url as string|null,following:followed.has(r.id)})),next:rows.length>20&&last?encodeCursor({...base,lastTime:last.time_key,lastId:last.id}):null};
}

// ===== Báo cáo vi phạm =====
export type ReportStatus = "open" | "resolved" | "dismissed";
export type Report = {
  id: string; reporterName: string; targetType: "photo" | "comment"; targetId: string;
  reason: string; status: ReportStatus; createdAt: Date; photoId: string | null; preview: string | null;
};

export async function createReport(reporterId: string, type: "photo" | "comment", targetId: string, reason: string): Promise<boolean> {
  const [dup] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'open'", [reporterId, type, targetId]);
  if (dup.length) return false;
  await pool.query("INSERT INTO reports (id, reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), reporterId, type, targetId, reason.slice(0, 500)]);
  return true;
}

export async function listReports(status: ReportStatus | "all" = "open", limit = 100): Promise<Report[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.*, u.first_name, u.last_name,
            CASE WHEN r.target_type = 'comment' THEN (SELECT c.photo_id FROM comments c WHERE c.id = r.target_id) ELSE r.target_id END AS photo_id,
            CASE WHEN r.target_type = 'comment' THEN (SELECT c.content FROM comments c WHERE c.id = r.target_id)
                 ELSE (SELECT COALESCE(p.title, p.caption) FROM photos p WHERE p.id = r.target_id) END AS preview
       FROM reports r JOIN users u ON u.id = r.reporter_id
      ${status === "all" ? "" : "WHERE r.status = ?"}
      ORDER BY r.created_at DESC LIMIT ?`,
    status === "all" ? [limit] : [status, limit]
  );
  return rows.map((r) => ({
    id: r.id as string, reporterName: [r.last_name, r.first_name].filter(Boolean).join(" "),
    targetType: r.target_type as "photo" | "comment", targetId: r.target_id as string, reason: r.reason as string,
    status: r.status as ReportStatus, createdAt: r.created_at as Date,
    photoId: (r.photo_id as string | null) ?? null, preview: (r.preview as string | null) ?? null,
  }));
}

export async function setReportStatus(id: string, status: ReportStatus, handlerId: string): Promise<void> {
  await pool.query("UPDATE reports SET status = ?, handled_by = ? WHERE id = ?", [status, handlerId, id]);
}

export async function countOpenReports(): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'");
  return Number(rows[0]?.n ?? 0);
}

// ===== Yêu thích tài liệu =====
export async function toggleBookmark(userId: string, type: "document" | "post", targetId: string): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>("INSERT IGNORE INTO bookmarks (user_id, target_type, target_id) VALUES (?, ?, ?)", [userId, type, targetId]);
  if (res.affectedRows === 0) {
    await pool.query("DELETE FROM bookmarks WHERE user_id = ? AND target_type = ? AND target_id = ?", [userId, type, targetId]);
    return false;
  }
  return true;
}

export async function isBookmarked(userId: string, type: "document" | "post", targetId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM bookmarks WHERE user_id = ? AND target_type = ? AND target_id = ?", [userId, type, targetId]);
  return rows.length > 0;
}

export async function listBookmarkedIds(userId: string, type: "document" | "post"): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT target_id FROM bookmarks WHERE user_id = ? AND target_type = ? ORDER BY created_at DESC", [userId, type]);
  return rows.map((r) => r.target_id as string);
}

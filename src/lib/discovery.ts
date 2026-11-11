import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./db";
import { randomSuffix, slugify } from "./slug";

// ====== Kiểu dữ liệu ======
export type PhotoStatus = "draft" | "pending" | "published" | "rejected" | "archived";

export const PHOTO_STATUS_LABEL: Record<PhotoStatus, string> = {
  draft: "Bản nháp",
  pending: "Chờ duyệt",
  published: "Đã đăng",
  rejected: "Bị từ chối",
  archived: "Lưu trữ",
};

export const PUBLIC: PhotoStatus[] = ["published"];

export type Photo = {
  id: string;
  tripId: string | null;
  tripTitle: string | null;
  tripSlug: string | null;
  uploaderId: string;
  uploaderName: string;
  title: string | null;
  imageFile: string;
  thumbFile: string | null;
  mediumFile: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  locationName: string | null;
  takenAt: Date | null;
  allowDownload: boolean;
  status: PhotoStatus;
  reviewNote: string | null;
  createdAt: Date;
  likes: number;
  saves: number;
  comments: number;
};

export const thumbOf = (p: Pick<Photo, "imageFile" | "thumbFile">) => `/uploads/${p.thumbFile ?? p.imageFile}`;
export const mediumOf = (p: Pick<Photo, "imageFile" | "mediumFile">) => `/uploads/${p.mediumFile ?? p.imageFile}`;

export type Trip = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  locationName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isFeatured: boolean;
  coverPhotoId: string | null;
  coverFile: string | null;
  photoCount: number;
};

export type Album = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  tripId: string | null;
  tripTitle: string | null;
  isPublished: boolean;
  coverFile: string | null;
  photoCount: number;
  createdAt: Date;
};

export type Status = { id: string; content: string; tripTitle: string | null; createdAt: Date };

export type Comment = {
  id: string; photoId: string; userId: string; authorName: string; authorAvatar: string | null;
  content: string; isHidden: boolean; createdAt: Date;
};

// ====== Ảnh ======
type PhotoRow = RowDataPacket & {
  id: string; trip_id: string | null; trip_title: string | null; trip_slug: string | null;
  uploader_id: string; first_name: string; last_name: string; title: string | null;
  image_file: string; thumb_file: string | null; medium_file: string | null;
  width: number | null; height: number | null; caption: string | null; location_name: string | null;
  taken_at: Date | null; allow_download: number; status: PhotoStatus; review_note: string | null;
  created_at: Date; likes: number; saves: number; comments: number;
};

const mapPhoto = (r: PhotoRow): Photo => ({
  id: r.id, tripId: r.trip_id, tripTitle: r.trip_title, tripSlug: r.trip_slug,
  uploaderId: r.uploader_id, uploaderName: [r.last_name, r.first_name].filter(Boolean).join(" "),
  title: r.title, imageFile: r.image_file, thumbFile: r.thumb_file, mediumFile: r.medium_file,
  width: r.width, height: r.height, caption: r.caption, locationName: r.location_name,
  takenAt: r.taken_at, allowDownload: r.allow_download === 1, status: r.status, reviewNote: r.review_note,
  createdAt: r.created_at, likes: Number(r.likes), saves: Number(r.saves), comments: Number(r.comments),
});

export type PhotoFilter = {
  statuses?: PhotoStatus[]; // không truyền = mọi trạng thái (chỉ dùng trong khu quản trị)
  id?: string;
  tripId?: string;
  albumId?: string;
  tag?: string; // slug
  location?: string;
  q?: string;
  year?: number;
  savedBy?: string;
  collectionId?: string;
  uploaderId?: string;
  excludeId?: string;
  sort?: "recent" | "trending";
  limit?: number;
  offset?: number;
};

function likeOf(q: string): string {
  return `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
}

function build(f: PhotoFilter): { joins: string; where: string; params: unknown[] } {
  const params: unknown[] = [];
  const joins: string[] = [];
  const where: string[] = [];

  if (f.savedBy) { joins.push("JOIN saved_photos sv ON sv.photo_id = p.id AND sv.user_id = ?"); params.push(f.savedBy); }
  if (f.collectionId) { joins.push("JOIN collection_photos cp ON cp.photo_id = p.id AND cp.collection_id = ?"); params.push(f.collectionId); }
  if (f.albumId) { joins.push("JOIN album_photos ap ON ap.photo_id = p.id AND ap.album_id = ?"); params.push(f.albumId); }
  if (f.tag) { joins.push("JOIN photo_tags pht ON pht.photo_id = p.id JOIN tags tg ON tg.id = pht.tag_id AND tg.slug = ?"); params.push(f.tag); }

  if (f.statuses?.length) { where.push("p.status IN (?)"); params.push(f.statuses); }
  if (f.id) { where.push("p.id = ?"); params.push(f.id); }
  if (f.excludeId) { where.push("p.id <> ?"); params.push(f.excludeId); }
  if (f.tripId) { where.push("p.trip_id = ?"); params.push(f.tripId); }
  if (f.uploaderId) { where.push("p.uploader_id = ?"); params.push(f.uploaderId); }
  if (f.location) { where.push("p.location_name = ?"); params.push(f.location); }
  if (f.year) { where.push("YEAR(COALESCE(p.taken_at, p.created_at)) = ?"); params.push(f.year); }
  if (f.q) {
    where.push("(p.title LIKE ? OR p.caption LIKE ? OR p.location_name LIKE ?)");
    const l = likeOf(f.q);
    params.push(l, l, l);
  }
  return { joins: joins.join(" "), where: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export async function listPhotos(f: PhotoFilter): Promise<{ photos: Photo[]; total: number }> {
  const b = build(f);
  const order =
    f.sort === "trending"
      ? "ORDER BY (x.likes * 2 + x.saves * 3 + x.comments) DESC, x.created_at DESC"
      : "ORDER BY COALESCE(x.taken_at, DATE(x.created_at)) DESC, x.created_at DESC";

  const [rows] = await pool.query<PhotoRow[]>(
    `SELECT x.* FROM (
       SELECT p.*, t.title AS trip_title, t.slug AS trip_slug, u.first_name, u.last_name,
              (SELECT COUNT(*) FROM photo_likes l WHERE l.photo_id = p.id) AS likes,
              (SELECT COUNT(*) FROM saved_photos s WHERE s.photo_id = p.id) AS saves,
              (SELECT COUNT(*) FROM comments c WHERE c.photo_id = p.id AND c.is_hidden = 0) AS comments
         FROM photos p
         LEFT JOIN trips t ON t.id = p.trip_id
         JOIN users u ON u.id = p.uploader_id
         ${b.joins} ${b.where}
     ) x ${order} LIMIT ? OFFSET ?`,
    [...b.params, f.limit ?? 24, f.offset ?? 0]
  );
  const [c] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT p.id) AS n FROM photos p ${b.joins} ${b.where}`,
    b.params
  );
  return { photos: rows.map(mapPhoto), total: Number(c[0]?.n ?? 0) };
}

export async function getPhoto(id: string, statuses?: PhotoStatus[]): Promise<Photo | null> {
  const { photos } = await listPhotos({ id, statuses, limit: 1 });
  return photos[0] ?? null;
}

export async function relatedPhotos(p: Photo, limit = 6): Promise<Photo[]> {
  const { photos } = await listPhotos({ statuses: PUBLIC, excludeId: p.id, tripId: p.tripId ?? undefined, limit });
  if (photos.length >= limit) return photos;
  const more = p.locationName
    ? (await listPhotos({ statuses: PUBLIC, excludeId: p.id, location: p.locationName, limit })).photos
    : [];
  const seen = new Set(photos.map((x) => x.id));
  for (const m of more) if (!seen.has(m.id) && photos.length < limit) photos.push(m);
  if (photos.length === 0) return (await listPhotos({ statuses: PUBLIC, excludeId: p.id, limit })).photos;
  return photos;
}

export async function createPhoto(input: {
  tripId: string | null; uploaderId: string; imageFile: string; thumbFile: string | null;
  mediumFile: string | null; width: number | null; height: number | null;
  title: string | null; caption: string | null; locationName: string | null; takenAt: string | null;
  allowDownload: boolean; status: PhotoStatus;
}): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO photos (id, trip_id, uploader_id, image_file, thumb_file, medium_file, width, height,
                         title, caption, location_name, taken_at, allow_download, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.tripId, input.uploaderId, input.imageFile, input.thumbFile, input.mediumFile, input.width,
     input.height, input.title, input.caption, input.locationName, input.takenAt, input.allowDownload ? 1 : 0, input.status]
  );
  return id;
}

export async function updatePhoto(
  id: string,
  i: { tripId: string | null; title: string | null; caption: string | null; locationName: string | null;
       takenAt: string | null; allowDownload: boolean; status: PhotoStatus }
): Promise<void> {
  await pool.query(
    `UPDATE photos SET trip_id = ?, title = ?, caption = ?, location_name = ?, taken_at = ?, allow_download = ?, status = ? WHERE id = ?`,
    [i.tripId, i.title, i.caption, i.locationName, i.takenAt, i.allowDownload ? 1 : 0, i.status, id]
  );
}

/** Chỉ một người duyệt có thể chuyển ảnh đang chờ sang trạng thái cuối. */
export async function setPhotoStatus(id: string, status: "published" | "rejected", note: string | null): Promise<boolean> {
  if (status !== "published" && status !== "rejected") throw new Error("Trạng thái duyệt không hợp lệ.");
  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE photos SET status = ?, review_note = ? WHERE id = ? AND status = 'pending'",
    [status, note, id]
  );
  return result.affectedRows === 1;
}

/** Xóa khỏi database và trả về các tên file cần xóa khỏi ổ đĩa. */
export async function deletePhoto(id: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT image_file, thumb_file, medium_file FROM photos WHERE id = ?", [id]);
  await pool.query("DELETE FROM photos WHERE id = ?", [id]);
  const r = rows[0];
  return r ? [r.image_file as string, r.thumb_file as string, r.medium_file as string].filter(Boolean) : [];
}

export async function countPhotosByStatus(status: PhotoStatus): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM photos WHERE status = ?", [status]);
  return Number(rows[0]?.n ?? 0);
}

// ====== Địa điểm và năm (tổng hợp từ ảnh đã đăng) ======
export type LocationItem = { name: string; count: number; coverFile: string | null };

export async function listLocations(): Promise<LocationItem[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.location_name AS name, COUNT(*) AS n,
            (SELECT COALESCE(q.medium_file, q.image_file) FROM photos q
              WHERE q.location_name = p.location_name AND q.status = 'published'
              ORDER BY q.created_at DESC LIMIT 1) AS cover
       FROM photos p
      WHERE p.status = 'published' AND p.location_name IS NOT NULL AND p.location_name <> ''
      GROUP BY p.location_name ORDER BY n DESC, name`
  );
  return rows.map((r) => ({ name: r.name as string, count: Number(r.n), coverFile: (r.cover as string | null) ?? null }));
}

export async function listYears(): Promise<number[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT DISTINCT YEAR(COALESCE(taken_at, created_at)) AS y FROM photos WHERE status = 'published' ORDER BY y DESC"
  );
  return rows.map((r) => Number(r.y));
}

export async function listAllLocationNames(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT DISTINCT location_name AS n FROM photos WHERE location_name IS NOT NULL AND location_name <> '' ORDER BY n"
  );
  return rows.map((r) => r.n as string);
}

// ====== Hành trình (bảng trips) ======
type TripRow = RowDataPacket & {
  id: string; title: string; slug: string; description: string | null; location_name: string | null;
  start_date: Date | null; end_date: Date | null; is_featured: number; cover_photo_id: string | null;
  cover_file: string | null; photo_count: number;
};

const mapTrip = (r: TripRow): Trip => ({
  id: r.id, title: r.title, slug: r.slug, description: r.description, locationName: r.location_name,
  startDate: r.start_date, endDate: r.end_date, isFeatured: r.is_featured === 1,
  coverPhotoId: r.cover_photo_id, coverFile: r.cover_file, photoCount: Number(r.photo_count),
});

const TRIP_SELECT = `
  SELECT t.*,
    (SELECT COUNT(*) FROM photos p WHERE p.trip_id = t.id AND p.status = 'published') AS photo_count,
    COALESCE(
      (SELECT COALESCE(c.medium_file, c.image_file) FROM photos c WHERE c.id = t.cover_photo_id AND c.status = 'published'),
      (SELECT COALESCE(p2.medium_file, p2.image_file) FROM photos p2
        WHERE p2.trip_id = t.id AND p2.status = 'published'
        ORDER BY COALESCE(p2.taken_at, DATE(p2.created_at)) DESC LIMIT 1)
    ) AS cover_file
  FROM trips t`;

export async function listTrips(opts: { onlyWithPhotos?: boolean; featuredOnly?: boolean; limit?: number } = {}): Promise<Trip[]> {
  const [rows] = await pool.query<TripRow[]>(
    `${TRIP_SELECT} ${opts.featuredOnly ? "WHERE t.is_featured = 1" : ""}
     ORDER BY COALESCE(t.start_date, DATE(t.created_at)) DESC`
  );
  let list = rows.map(mapTrip);
  if (opts.onlyWithPhotos) list = list.filter((t) => t.photoCount > 0);
  return opts.limit ? list.slice(0, opts.limit) : list;
}

export async function getTripBySlug(slug: string): Promise<Trip | null> {
  const [rows] = await pool.query<TripRow[]>(`${TRIP_SELECT} WHERE t.slug = ? LIMIT 1`, [slug]);
  return rows[0] ? mapTrip(rows[0]) : null;
}

export type TripInput = {
  title: string; description: string | null; locationName: string | null;
  startDate: string | null; endDate: string | null; isFeatured: boolean; coverPhotoId: string | null;
};

export async function createTrip(i: TripInput): Promise<void> {
  const base = slugify(i.title, "hanh-trinh");
  const [e] = await pool.query<RowDataPacket[]>("SELECT 1 FROM trips WHERE slug = ?", [base]);
  const slug = e.length ? `${base}-${randomSuffix()}` : base;
  await pool.query(
    `INSERT INTO trips (id, title, slug, description, location_name, start_date, end_date, is_featured, cover_photo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), i.title, slug, i.description, i.locationName, i.startDate, i.endDate, i.isFeatured ? 1 : 0, i.coverPhotoId]
  );
}

export async function updateTrip(id: string, i: TripInput): Promise<void> {
  await pool.query(
    `UPDATE trips SET title = ?, description = ?, location_name = ?, start_date = ?, end_date = ?, is_featured = ?, cover_photo_id = ? WHERE id = ?`,
    [i.title, i.description, i.locationName, i.startDate, i.endDate, i.isFeatured ? 1 : 0, i.coverPhotoId, id]
  );
}

export async function deleteTrip(id: string): Promise<void> {
  await pool.query("DELETE FROM trips WHERE id = ?", [id]);
}

// ====== Album ======
type AlbumRow = RowDataPacket & {
  id: string; title: string; slug: string; description: string | null; trip_id: string | null;
  trip_title: string | null; is_published: number; cover_file: string | null; photo_count: number; created_at: Date;
};

const mapAlbum = (r: AlbumRow): Album => ({
  id: r.id, title: r.title, slug: r.slug, description: r.description, tripId: r.trip_id, tripTitle: r.trip_title,
  isPublished: r.is_published === 1, coverFile: r.cover_file, photoCount: Number(r.photo_count), createdAt: r.created_at,
});

const ALBUM_SELECT = `
  SELECT a.*, t.title AS trip_title,
    (SELECT COUNT(*) FROM album_photos ap JOIN photos p ON p.id = ap.photo_id AND p.status = 'published' WHERE ap.album_id = a.id) AS photo_count,
    COALESCE(
      (SELECT COALESCE(c.medium_file, c.image_file) FROM photos c WHERE c.id = a.cover_photo_id AND c.status = 'published'),
      (SELECT COALESCE(p2.medium_file, p2.image_file) FROM album_photos ap2 JOIN photos p2 ON p2.id = ap2.photo_id AND p2.status = 'published'
        WHERE ap2.album_id = a.id ORDER BY ap2.sort_order, p2.created_at DESC LIMIT 1)
    ) AS cover_file
  FROM albums a LEFT JOIN trips t ON t.id = a.trip_id`;

export async function listAlbums(onlyPublished: boolean, tripId?: string): Promise<Album[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (onlyPublished) where.push("a.is_published = 1");
  if (tripId) { where.push("a.trip_id = ?"); params.push(tripId); }
  const [rows] = await pool.query<AlbumRow[]>(
    `${ALBUM_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.created_at DESC`, params
  );
  const list = rows.map(mapAlbum);
  return onlyPublished ? list.filter((a) => a.photoCount > 0) : list;
}

export async function getAlbumBySlug(slug: string): Promise<Album | null> {
  const [rows] = await pool.query<AlbumRow[]>(`${ALBUM_SELECT} WHERE a.slug = ? AND a.is_published = 1 LIMIT 1`, [slug]);
  return rows[0] ? mapAlbum(rows[0]) : null;
}

export type AlbumInput = { title: string; description: string | null; tripId: string | null; isPublished: boolean };

export async function createAlbum(i: AlbumInput): Promise<void> {
  const base = slugify(i.title, "album");
  const [e] = await pool.query<RowDataPacket[]>("SELECT 1 FROM albums WHERE slug = ?", [base]);
  const slug = e.length ? `${base}-${randomSuffix()}` : base;
  await pool.query(
    "INSERT INTO albums (id, title, slug, description, trip_id, is_published) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), i.title, slug, i.description, i.tripId, i.isPublished ? 1 : 0]
  );
}

export async function updateAlbum(id: string, i: AlbumInput): Promise<void> {
  await pool.query("UPDATE albums SET title = ?, description = ?, trip_id = ?, is_published = ? WHERE id = ?",
    [i.title, i.description, i.tripId, i.isPublished ? 1 : 0, id]);
}

export async function deleteAlbum(id: string): Promise<void> {
  await pool.query("DELETE FROM albums WHERE id = ?", [id]);
}

export async function getPhotoAlbumIds(photoId: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT album_id FROM album_photos WHERE photo_id = ?", [photoId]);
  return rows.map((r) => r.album_id as string);
}

export async function setPhotoAlbums(photoId: string, albumIds: string[]): Promise<void> {
  await pool.query("DELETE FROM album_photos WHERE photo_id = ?", [photoId]);
  for (const a of albumIds) {
    await pool.query("INSERT IGNORE INTO album_photos (album_id, photo_id) VALUES (?, ?)", [a, photoId]);
  }
}

export async function listPhotoAlbums(photoId: string): Promise<{ id: string; title: string; slug: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.id, a.title, a.slug FROM album_photos ap JOIN albums a ON a.id = ap.album_id
      WHERE ap.photo_id = ? AND a.is_published = 1`, [photoId]);
  return rows.map((r) => ({ id: r.id as string, title: r.title as string, slug: r.slug as string }));
}

// ====== Nhật ký (status) ======
export async function listStatuses(limit = 5, tripId?: string): Promise<Status[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id, s.content, s.created_at, t.title AS trip_title
       FROM status_updates s LEFT JOIN trips t ON t.id = s.trip_id
      ${tripId ? "WHERE s.trip_id = ?" : ""}
      ORDER BY s.created_at DESC LIMIT ?`,
    tripId ? [tripId, limit] : [limit]
  );
  return rows.map((r) => ({
    id: r.id as string, content: r.content as string,
    tripTitle: (r.trip_title as string | null) ?? null, createdAt: r.created_at as Date,
  }));
}

export async function createStatus(authorId: string, tripId: string | null, content: string): Promise<void> {
  await pool.query("INSERT INTO status_updates (id, trip_id, author_id, content) VALUES (?, ?, ?, ?)",
    [randomUUID(), tripId, authorId, content]);
}

export async function deleteStatus(id: string): Promise<void> {
  await pool.query("DELETE FROM status_updates WHERE id = ?", [id]);
}

// ====== Thích / Lưu ======
async function toggle(table: "photo_likes" | "saved_photos", userId: string, photoId: string): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>(`INSERT IGNORE INTO ${table} (user_id, photo_id) VALUES (?, ?)`, [userId, photoId]);
  if (res.affectedRows === 0) {
    await pool.query(`DELETE FROM ${table} WHERE user_id = ? AND photo_id = ?`, [userId, photoId]);
    return false;
  }
  return true;
}

/** Trả về true nếu vừa bật (thích/lưu), false nếu vừa bỏ. */
export const toggleLike = (userId: string, photoId: string) => toggle("photo_likes", userId, photoId);
export const toggleSave = (userId: string, photoId: string) => toggle("saved_photos", userId, photoId);

export async function viewerFlags(userId: string, photoId: string): Promise<{ liked: boolean; saved: boolean }> {
  const [l] = await pool.query<RowDataPacket[]>("SELECT 1 FROM photo_likes WHERE user_id = ? AND photo_id = ?", [userId, photoId]);
  const [s] = await pool.query<RowDataPacket[]>("SELECT 1 FROM saved_photos WHERE user_id = ? AND photo_id = ?", [userId, photoId]);
  return { liked: l.length > 0, saved: s.length > 0 };
}

// ====== Bình luận ======
type CommentRow = RowDataPacket & {
  id: string; photo_id: string; user_id: string; first_name: string; last_name: string;
  avatar_url: string | null; content: string; is_hidden: number; created_at: Date;
};

const mapComment = (r: CommentRow): Comment => ({
  id: r.id, photoId: r.photo_id, userId: r.user_id,
  authorName: [r.last_name, r.first_name].filter(Boolean).join(" "), authorAvatar: r.avatar_url,
  content: r.content, isHidden: r.is_hidden === 1, createdAt: r.created_at,
});

export async function listComments(photoId: string, includeHidden: boolean): Promise<Comment[]> {
  const [rows] = await pool.query<CommentRow[]>(
    `SELECT c.*, u.first_name, u.last_name, u.avatar_url FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.photo_id = ? ${includeHidden ? "" : "AND c.is_hidden = 0"} ORDER BY c.created_at ASC`, [photoId]);
  return rows.map(mapComment);
}

export async function listRecentComments(limit = 100): Promise<(Comment & { photoCaption: string | null })[]> {
  const [rows] = await pool.query<(CommentRow & { photo_caption: string | null })[]>(
    `SELECT c.*, u.first_name, u.last_name, u.avatar_url, COALESCE(p.title, p.caption) AS photo_caption
       FROM comments c JOIN users u ON u.id = c.user_id JOIN photos p ON p.id = c.photo_id
      ORDER BY c.created_at DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({ ...mapComment(r), photoCaption: r.photo_caption }));
}

export async function listCommentsByUser(userId: string): Promise<(Comment & { photoCaption: string | null })[]> {
  const [rows] = await pool.query<(CommentRow & { photo_caption: string | null })[]>(
    `SELECT c.*, u.first_name, u.last_name, u.avatar_url, COALESCE(p.title, p.caption) AS photo_caption
       FROM comments c JOIN users u ON u.id = c.user_id JOIN photos p ON p.id = c.photo_id
      WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 200`, [userId]);
  return rows.map((r) => ({ ...mapComment(r), photoCaption: r.photo_caption }));
}

export async function addComment(photoId: string, userId: string, content: string): Promise<void> {
  await pool.query("INSERT INTO comments (id, photo_id, user_id, content) VALUES (?, ?, ?, ?)",
    [randomUUID(), photoId, userId, content]);
}

export async function recentCommentCount(userId: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM comments WHERE user_id = ? AND created_at > (NOW() - INTERVAL 1 MINUTE)", [userId]);
  return Number(rows[0]?.n ?? 0);
}

export async function getComment(id: string): Promise<{ id: string; userId: string; photoId: string } | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, user_id, photo_id FROM comments WHERE id = ?", [id]);
  const r = rows[0];
  return r ? { id: r.id as string, userId: r.user_id as string, photoId: r.photo_id as string } : null;
}

export async function deleteComment(id: string): Promise<void> {
  await pool.query("DELETE FROM comments WHERE id = ?", [id]);
}

export async function setCommentHidden(id: string, hidden: boolean): Promise<void> {
  await pool.query("UPDATE comments SET is_hidden = ? WHERE id = ?", [hidden ? 1 : 0, id]);
}

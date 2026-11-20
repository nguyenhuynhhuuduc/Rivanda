import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { CommunityError, idOf, textOf, type Actor, type Post, type Topic } from "./model";
import { followedMembers, followingMeMembers } from "../community";
import { communityReady, requireCommunity } from "./schema";
import { decodeCursor, encodeCursor, feedScope, type FeedOrder, type Cursor } from "./cursor";
import { VISIBLE_COMMENTS } from "./interactions";
export { communityReady } from "./schema";
const PUBLIC = "p.status='published' AND p.visibility='public' AND p.deleted_at IS NULL";
const COUNTS = `(SELECT COUNT(*) FROM community_likes l WHERE l.post_id=p.id) AS likes,
 (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id AND ${VISIBLE_COMMENTS}) AS comments,
 (SELECT COUNT(*) FROM community_saves s WHERE s.post_id=p.id) AS saves`;
function select(full = false): string { return `SELECT p.id,p.author_id,p.kind,p.title,${full ? "p.body" : "LEFT(p.body,800) AS body"},p.visibility,p.status,p.revision,p.review_note,p.created_at,p.published_at,
 DATE_FORMAT(p.published_at,'%Y-%m-%d %H:%i:%s.%f') AS time_key,DATE_FORMAT(p.updated_at,'%Y-%m-%d %H:%i:%s.%f') AS own_key,u.first_name,u.last_name,u.avatar_url,
 t.id AS topic_id,t.name AS topic_name,t.slug AS topic_slug,${COUNTS},
 EXISTS(SELECT 1 FROM community_likes vl WHERE vl.post_id=p.id AND vl.user_id=?) AS liked,
 EXISTS(SELECT 1 FROM community_saves vs WHERE vs.post_id=p.id AND vs.user_id=?) AS saved
 FROM community_posts p JOIN users u ON u.id=p.author_id
 LEFT JOIN community_topics t ON t.id=p.topic_id AND t.is_visible=1 AND t.deleted_at IS NULL`; }
async function hydrate(rows: RowDataPacket[], viewer?:string|null): Promise<Post[]> {
  if (!rows.length) return [];
  const ids = rows.map(r=>r.id);
  const [[media],[tags]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT id,post_id,width,height FROM community_media WHERE removed_at IS NULL AND post_id IN (?) ORDER BY sort_order,id",[ids]),
    pool.query<RowDataPacket[]>("SELECT pt.post_id,t.name FROM community_post_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.post_id IN (?) ORDER BY t.name",[ids]),
  ]);
  const authorIds = [...new Set(rows.map(r=>r.author_id as string))];
  const [followed, followedBy] = viewer ? await Promise.all([followedMembers(viewer, authorIds), followingMeMembers(viewer, authorIds)]) : [new Set<string>(), new Set<string>()];
  return rows.map(r=>({ id:r.id,authorId:r.author_id,authorName:[r.last_name,r.first_name].filter(Boolean).join(" ") || "Thành viên",avatar:r.avatar_url,following:followed.has(r.author_id),followsViewer:followedBy.has(r.author_id),
    topic:r.topic_id?{id:r.topic_id,name:r.topic_name,slug:r.topic_slug}:null,kind:r.kind,title:r.title,body:r.body,visibility:r.visibility,status:r.status,revision:Number(r.revision),createdAt:r.created_at,publishedAt:r.published_at,timeKey:r.time_key,
    likes:Number(r.likes),comments:Number(r.comments),saves:Number(r.saves),liked:!!r.liked,saved:!!r.saved,reviewNote:r.review_note,
    media:media.filter(m=>m.post_id===r.id).map(m=>({id:m.id,width:m.width,height:m.height})),tags:tags.filter(t=>t.post_id===r.id).map(t=>t.name) }));
}
export async function communityTopics(): Promise<Topic[]> {
  if (!await communityReady()) return [];
  const [rows]=await pool.query<RowDataPacket[]>("SELECT id,name,slug FROM community_topics WHERE is_visible=1 AND deleted_at IS NULL ORDER BY sort_order,name,id");
  return rows.map(r=>({id:r.id,name:r.name,slug:r.slug}));
}
export async function publicCommunityPostCount(authorId:string):Promise<number|null>{
  idOf(authorId);if(!await communityReady())return null;
  const [[r]]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) n FROM community_posts p WHERE ${PUBLIC} AND p.author_id=? AND p.published_at<=NOW(6)`,[authorId]);return Number(r.n);
}
export async function getCommunityPost(id: string, viewer: Actor | null = null): Promise<Post | null> {
  idOf(id); if (!await communityReady()) return null;
  const [rows]=await pool.query<RowDataPacket[]>(`${select(true)} WHERE p.id=? AND p.status<>'deleted' AND (${PUBLIC} OR p.author_id=? OR ?=1) LIMIT 1`,[viewer?.id??null,viewer?.id??null,id,viewer?.id??null,viewer?.role==="admin"?1:0]);
  return (await hydrate(rows,viewer?.id))[0]??null;
}
export async function getMedia(id: string, viewer: Actor | null, thumb: boolean): Promise<string | null> {
  idOf(id); if (!await communityReady()) return null;
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT m.image_file,m.thumb_file FROM community_media m JOIN community_posts p ON p.id=m.post_id JOIN community_storage_files f ON f.file_name=COALESCE(IF(?=1,m.thumb_file,m.image_file),m.image_file) AND f.state='stored' WHERE m.id=? AND m.removed_at IS NULL AND p.status<>'deleted' AND p.purge_started_at IS NULL AND (${PUBLIC} OR p.author_id=? OR ?=1) LIMIT 1`,[thumb?1:0,id,viewer?.id??null,viewer?.role==="admin"?1:0]);
  return rows[0] ? (thumb ? rows[0].thumb_file || rows[0].image_file : rows[0].image_file) : null;
}
export type FeedFilter = { order?: FeedOrder; q?: string; topic?: string; authorId?: string; cursor?: string; viewer?: Actor | null };
export async function communityFeed(f: FeedFilter): Promise<{ posts: Post[]; next: string | null }> {
  await requireCommunity();
  const order=f.order==="popular"?"popular":f.order==="following"?"following":"newest",q=textOf(f.q??"",80),topic=textOf(f.topic??"",120),author=f.authorId?idOf(f.authorId):"";
  if(order==="following") {
    if(!f.viewer) throw new CommunityError("Đăng nhập để xem bảng tin Đang theo dõi.");
    const [users]=await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND is_active=1",[idOf(f.viewer.id)]);
    if(!users.length) throw new CommunityError("Tài khoản không khả dụng.");
  }
  const scope=feedScope(order,q,topic,author,f.viewer?.id),cursor=f.cursor?decodeCursor(f.cursor,scope,order):null;
  const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS t");
  const base: Cursor = cursor??{v:1,order,scope,at:now.t,expires:Date.now()+30*60000};
  const conditions=[PUBLIC,"p.published_at<=?"],args:unknown[]=[base.at];
  if(q){conditions.push("(p.title LIKE ? OR p.body LIKE ? OR EXISTS(SELECT 1 FROM community_post_tags pt JOIN tags g ON g.id=pt.tag_id WHERE pt.post_id=p.id AND g.name LIKE ?))");const l=`%${q.replace(/[%_\\]/g,c=>"\\"+c)}%`;args.push(l,l,l);}
  if(topic){conditions.push("t.slug=?");args.push(topic);} if(author){conditions.push("p.author_id=?");args.push(author);}
  const viewer=f.viewer?.id??null;
  if(order==="following") { conditions.push("EXISTS(SELECT 1 FROM follows f JOIN users fu ON fu.id=f.followed_id AND fu.is_active=1 WHERE f.follower_id=? AND f.followed_id=p.author_id)");args.push(viewer); }
  if(order==="popular") {
    let ids=cursor?.remaining;
    if(!ids){const [ranked]=await pool.query<RowDataPacket[]>(`SELECT p.id,${COUNTS} FROM community_posts p LEFT JOIN community_topics t ON t.id=p.topic_id AND t.is_visible=1 AND t.deleted_at IS NULL WHERE ${conditions.join(" AND ")} AND p.published_at>=DATE_SUB(?,INTERVAL 7 DAY) ORDER BY (likes*2+comments+saves*3) DESC,p.published_at DESC,p.id DESC LIMIT 60`,[...args,base.at]);ids=ranked.map(r=>r.id as string);}
    if(!ids.length)return{posts:[],next:null};
    const [eligible]=await pool.query<RowDataPacket[]>(`SELECT p.id FROM community_posts p LEFT JOIN community_topics t ON t.id=p.topic_id AND t.is_visible=1 AND t.deleted_at IS NULL WHERE ${conditions.join(" AND ")} AND p.id IN (?)`,[...args,ids]);
    const allowed=new Set(eligible.map(r=>r.id));ids=ids.filter(id=>allowed.has(id));const page=ids.slice(0,12),rest=ids.slice(12);
    if(!page.length)return{posts:[],next:null};
    const [rows]=await pool.query<RowDataPacket[]>(`${select()} WHERE ${PUBLIC} AND p.id IN (?)`,[viewer,viewer,page]);
    const posts=await hydrate(rows,viewer),byId=new Map(posts.map(p=>[p.id,p]));
    return{posts:page.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]),next:rest.length?encodeCursor({...base,remaining:rest}):null};
  }
  if(cursor){conditions.push("(p.published_at<? OR (p.published_at=? AND p.id<?))");args.push(cursor.lastTime,cursor.lastTime,cursor.lastId);}
  const [rows]=await pool.query<RowDataPacket[]>(`${select()} WHERE ${conditions.join(" AND ")} ORDER BY p.published_at DESC,p.id DESC LIMIT 13`,[viewer,viewer,...args]);
  const more=rows.length>12,page=rows.slice(0,12),last=page.at(-1);
  return{posts:await hydrate(page,viewer),next:more&&last?encodeCursor({...base,lastTime:last.time_key,lastId:last.id}):null};
}
export async function ownCommunityPage(actor: Actor, admin=false, token?:string): Promise<{posts:Post[];next:string|null}> {
  await requireCommunity();if(admin&&actor.role!=="admin")throw new Error("FORBIDDEN");
  const scope=feedScope("newest",admin?"admin":"owner",actor.id,""),cursor=token?decodeCursor(token,scope,"newest"):null;
  const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS t");
  const base:Cursor=cursor??{v:1,order:"newest",scope,at:now.t,expires:Date.now()+30*60000};
  const args:unknown[]=[actor.id,actor.id,base.at];if(!admin)args.push(actor.id);
  if(cursor)args.push(cursor.lastTime,cursor.lastTime,cursor.lastId);
  const [pageRows]=await pool.query<RowDataPacket[]>(`${select()} WHERE p.status<>'deleted' AND p.updated_at<=? ${admin?"":"AND p.author_id=?"} ${cursor?"AND (p.updated_at<? OR (p.updated_at=? AND p.id<?))":""} ORDER BY p.updated_at DESC,p.id DESC LIMIT 13`,args);
  const page=pageRows.slice(0,12),last=page.at(-1);
  return{posts:await hydrate(page,actor.id),next:pageRows.length>12&&last?encodeCursor({...base,lastTime:last.own_key,lastId:last.id}):null};
}
export async function savedCommunityPage(actor:Actor,token?:string):Promise<{posts:Post[];next:string|null}> {
  await requireCommunity();const scope=feedScope("newest","saved",actor.id,""),cursor=token?decodeCursor(token,scope,"newest"):null;
  const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS t");
  const base:Cursor=cursor??{v:1,order:"newest",scope,at:now.t,expires:Date.now()+30*60000};
  const [rows]=await pool.query<RowDataPacket[]>(`${select().replace("SELECT p.id,","SELECT DATE_FORMAT(book.created_at,'%Y-%m-%d %H:%i:%s.%f') AS saved_key,p.id,")} JOIN community_saves book ON book.post_id=p.id AND book.user_id=? WHERE ${PUBLIC} AND book.created_at<=? ${cursor?"AND (book.created_at<? OR (book.created_at=? AND p.id<?))":""} ORDER BY book.created_at DESC,p.id DESC LIMIT 13`,[actor.id,actor.id,actor.id,base.at,...(cursor?[cursor.lastTime,cursor.lastTime,cursor.lastId]:[])]);
  const page=rows.slice(0,12),last=page.at(-1);return{posts:await hydrate(page,actor.id),next:rows.length>12&&last?encodeCursor({...base,lastTime:last.saved_key,lastId:last.id}):null};
}

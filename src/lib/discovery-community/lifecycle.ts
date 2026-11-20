import {randomUUID} from "crypto";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {pool} from "../db";
import {CommunityError,idOf,revisionOf,type Actor} from "./model";
import {checkOwner,lockActor,lockPost,transaction} from "./db";
import {requireCommunity} from "./schema";
import {verifyStoredFiles} from "./storage";
import policy from "./retention.json";
import {decodeCursor,encodeCursor,feedScope,type Cursor} from "./cursor";
const reviewHold="(moderation_hold=1 OR restore_status IN ('pending','hidden','rejected') OR EXISTS(SELECT 1 FROM community_reports r LEFT JOIN community_comments c ON c.id=r.comment_id WHERE r.status='open' AND (r.post_id=community_posts.id OR c.post_id=community_posts.id)))";
export async function retireMedia(tx:PoolConnection,postId:string,keep:string[]) {
  const [rows]=await tx.query<RowDataPacket[]>(`SELECT image_file,thumb_file,medium_file FROM community_media WHERE post_id=? AND removed_at IS NULL ${keep.length?'AND id NOT IN (?)':''} FOR UPDATE`,[postId,...(keep.length?[keep]:[])]);
  const names=rows.flatMap(r=>[r.image_file,r.thumb_file,r.medium_file].filter(Boolean));
  if(names.length)await tx.query("UPDATE community_storage_files SET delete_after=DATE_ADD(NOW(6),INTERVAL ? DAY) WHERE file_name IN (?) AND state='stored'",[policy.softDeleteDays,names]);
  await tx.query(`UPDATE community_media SET removed_at=NOW(6),purge_after=DATE_ADD(NOW(6),INTERVAL ? DAY) WHERE post_id=? AND removed_at IS NULL ${keep.length?'AND id NOT IN (?)':''}`,[policy.softDeleteDays,postId,...(keep.length?[keep]:[])]);
}
export async function restorePost(actor:Actor,id:string,expected:unknown) {
  return transaction(async tx=>{
    const user=await lockActor(tx,actor),p=await lockPost(tx,id,true),revision=revisionOf(expected);
    if(p.author_id!==user.id&&user.role!=="admin")throw new CommunityError("Bạn không có quyền khôi phục bài này.");
    if(p.status!=="deleted"||p.purge_started_at||p.purged_at||Number(p.revision)!==revision)throw new CommunityError("Bài đã thay đổi hoặc ảnh đang/đã bị xóa vĩnh viễn.");
    const [fresh]=await tx.query<RowDataPacket[]>(`SELECT id,${reviewHold} AS review_hold FROM community_posts WHERE id=? AND (deleted_at>DATE_SUB(NOW(6),INTERVAL ? DAY) OR (?=1 AND ${reviewHold}))`,[id,policy.softDeleteDays,user.role==="admin"?1:0]);
    if(!fresh.length)throw new CommunityError("Đã hết thời hạn khôi phục 30 ngày.");
    const [missing]=await tx.query<RowDataPacket[]>("SELECT m.id FROM community_media m LEFT JOIN community_storage_files f ON f.file_name=m.image_file LEFT JOIN community_storage_files t ON t.file_name=m.thumb_file WHERE m.post_id=? AND m.removed_at IS NULL AND (COALESCE(f.state,'missing')<>'stored' OR (m.thumb_file IS NOT NULL AND COALESCE(t.state,'missing')<>'stored')) LIMIT 1",[id]);
    if(missing.length)throw new CommunityError("Ảnh chưa sẵn sàng để khôi phục; cần kiểm tra storage.");
    const [assets]=await tx.query<RowDataPacket[]>("SELECT image_file,thumb_file,medium_file FROM community_media WHERE post_id=? AND removed_at IS NULL",[id]);
    await verifyStoredFiles(tx,p.author_id,assets.flatMap(m=>[m.image_file,m.thumb_file,m.medium_file].filter(Boolean)));
    await tx.query("UPDATE community_posts SET status='draft',deleted_at=NULL,restore_status=NULL,moderation_hold=CASE WHEN ?=1 THEN 1 ELSE moderation_hold END,revision=revision+1 WHERE id=? AND revision=?",[fresh[0].review_hold?1:0,id,revision]);
    await tx.query("INSERT INTO community_review_events(id,post_id,actor_id,revision,decision,note) VALUES(?,?,?,?, 'restored',?)",[randomUUID(),id,user.id,revision+1,"Khôi phục về nháp, không tự xuất bản; giữ cờ kiểm duyệt."]);
    return{postId:id,authorId:p.author_id as string};
  });
}
export async function restoreMedia(actor:Actor,id:string,expected:unknown) {
  idOf(id);return transaction(async tx=>{
    const user=await lockActor(tx,actor);
    const [[lookup]]=await tx.query<RowDataPacket[]>("SELECT post_id FROM community_media WHERE id=?",[id]);if(!lookup)throw new CommunityError("Ảnh không còn trong thời hạn khôi phục.");
    const p=await lockPost(tx,lookup.post_id);checkOwner(p,user,revisionOf(expected));
    if(p.purge_started_at||p.purged_at)throw new CommunityError("Ảnh đang được xóa vĩnh viễn.");
    const [rows]=await tx.query<RowDataPacket[]>("SELECT * FROM community_media WHERE id=? AND removed_at IS NOT NULL AND purge_after>NOW(6) FOR UPDATE",[id]);if(!rows[0])throw new CommunityError("Ảnh đã hết thời hạn khôi phục 30 ngày.");
    const [[count]]=await tx.query<RowDataPacket[]>("SELECT COUNT(*) n,COALESCE(MAX(sort_order),-1)+1 AS next_order FROM community_media WHERE post_id=? AND removed_at IS NULL",[p.id]);if(Number(count.n)>=8)throw new CommunityError("Bài đã đủ 8 ảnh. Hãy gỡ một ảnh trước khi khôi phục.");
    const names=[rows[0].image_file,rows[0].thumb_file,rows[0].medium_file].filter(Boolean);
    const [files]=await tx.query<RowDataPacket[]>("SELECT file_name,state FROM community_storage_files WHERE owner_id=? AND file_name IN (?) FOR UPDATE",[user.id,names]);
    if(files.length!==names.length||files.some(f=>f.state!=="stored"))throw new CommunityError("Ảnh đang/đã được xóa vĩnh viễn.");
    await verifyStoredFiles(tx,user.id,names);
    await tx.query("UPDATE community_storage_files SET delete_after=NULL WHERE file_name IN (?)",[names]);
    await tx.query("UPDATE community_media SET removed_at=NULL,purge_after=NULL,sort_order=? WHERE id=?",[count.next_order,id]);
    await tx.query("UPDATE community_posts SET revision=revision+1 WHERE id=? AND revision=?",[p.id,expected]);
    await tx.query("INSERT INTO community_review_events(id,post_id,actor_id,revision,decision,note) VALUES(?,?,?,?, 'restored',?)",[randomUUID(),p.id,user.id,Number(p.revision)+1,"Khôi phục ảnh đã gỡ; giữ trạng thái bài và kiểm duyệt."]);
    return{postId:p.id as string,authorId:p.author_id as string};
  });
}
async function pageCursor(scope:string,token?:string){const c=token?decodeCursor(token,scope,"newest"):null;const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS t");return{c,base:c??{v:1,order:"newest",scope,at:now.t,expires:Date.now()+1800000} as Cursor};}
export async function removedMedia(actor:Actor,postId:string,token?:string) {
  await requireCommunity();idOf(postId);const {c,base}=await pageCursor(feedScope("newest","removed-media",actor.id,postId),token);
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT m.id,m.removed_at,m.purge_after,DATE_FORMAT(m.removed_at,'%Y-%m-%d %H:%i:%s.%f') AS k,(m.purge_after>NOW(6)) AS restorable FROM community_media m JOIN community_posts p ON p.id=m.post_id WHERE p.id=? AND p.author_id=? AND m.removed_at IS NOT NULL AND m.removed_at<=? ${c?"AND (m.removed_at<? OR (m.removed_at=? AND m.id<?))":""} ORDER BY m.removed_at DESC,m.id DESC LIMIT 13`,[postId,actor.id,base.at,...(c?[c.lastTime,c.lastTime,c.lastId]:[])]);
  const page=rows.slice(0,12),last=page.at(-1);return{items:page.map(r=>({id:r.id as string,removedAt:r.removed_at as Date,purgeAfter:r.purge_after as Date,restorable:!!r.restorable})),next:rows.length>12&&last?encodeCursor({...base,lastTime:last.k,lastId:last.id}):null};
}
export async function trashPage(actor:Actor,admin=false,token?:string){
  await requireCommunity();const [[user]]=await pool.query<RowDataPacket[]>("SELECT role,is_active FROM users WHERE id=?",[idOf(actor.id)]);if(!user?.is_active||(admin&&user.role!=="admin"))throw new CommunityError("Bạn không có quyền xem thùng rác này.");
  const {c,base}=await pageCursor(feedScope("newest",admin?"admin-trash":"trash",actor.id,""),token);
  const held="(p.moderation_hold=1 OR p.restore_status IN ('pending','hidden','rejected') OR EXISTS(SELECT 1 FROM community_reports r LEFT JOIN community_comments c ON c.id=r.comment_id WHERE r.status='open' AND (r.post_id=p.id OR c.post_id=p.id)))";
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT p.id,p.title,LEFT(p.body,120) AS excerpt,p.author_id,p.revision,p.deleted_at,p.purged_at,p.purge_started_at,${held} AS review_hold,DATE_FORMAT(p.updated_at,'%Y-%m-%d %H:%i:%s.%f') AS k,(p.purge_started_at IS NULL AND p.purged_at IS NULL AND (p.deleted_at>DATE_SUB(NOW(6),INTERVAL ? DAY) OR (?=1 AND ${held}))) AS restorable FROM community_posts p WHERE p.status='deleted' ${admin?'':'AND p.author_id=?'} AND p.updated_at<=? ${c?"AND (p.updated_at<? OR (p.updated_at=? AND p.id<?))":""} ORDER BY p.updated_at DESC,p.id DESC LIMIT 13`,[policy.softDeleteDays,user.role==="admin"?1:0,...(admin?[]:[actor.id]),base.at,...(c?[c.lastTime,c.lastTime,c.lastId]:[])]);
  const page=rows.slice(0,12),last=page.at(-1);return{items:page.map(r=>({id:r.id as string,title:r.title as string|null,excerpt:r.excerpt as string,revision:Number(r.revision),deletedAt:r.deleted_at as Date,purgedAt:r.purged_at as Date|null,purgeStartedAt:r.purge_started_at as Date|null,held:!!r.review_hold,restorable:!!r.restorable})),next:rows.length>12&&last?encodeCursor({...base,lastTime:last.k,lastId:last.id}):null};
}

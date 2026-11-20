import { createHash, randomUUID } from "crypto";
import { cache } from "react";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "./db";
import { CommunityError, idOf } from "./discovery-community/model";
import { decodeCursor, encodeCursor, feedScope, type Cursor } from "./discovery-community/cursor";
import { safeNext } from "./url";

type Queryable=Pick<PoolConnection,"query">;
export type Notification = { id:string; type:string; message:string; link:string|null; isRead:boolean; createdAt:Date; actorName?:string|null; actorAvatar?:string|null };
export type DiscoveryNotice={kind:"follow"|"like"|"comment"|"reply";actorId:string;recipientId:string;postId?:string;commentId?:string};
const LEGACY="LEFT(n.type,10)<>'discovery_'";
const PUBLIC="p.status='published' AND p.visibility='public' AND p.deleted_at IS NULL AND p.moderation_hold=0 AND p.purge_started_at IS NULL AND p.published_at<=NOW(6)";
const JOINS=`LEFT JOIN users a ON a.id=n.actor_id
 LEFT JOIN community_posts p ON p.id=n.community_post_id
 LEFT JOIN community_comments c ON c.id=n.community_comment_id AND c.post_id=p.id
 LEFT JOIN community_comments parent ON parent.id=c.parent_id AND parent.post_id=p.id`;
const ELIGIBLE=`(${LEGACY} OR (a.is_active=1 AND n.actor_id<>n.user_id AND n.dedupe_key IS NOT NULL AND (
 (n.type='discovery_follow' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=n.actor_id AND f.followed_id=n.user_id))
 OR (${PUBLIC} AND (
   (n.type='discovery_like' AND p.author_id=n.user_id AND EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id=p.id AND l.user_id=n.actor_id))
   OR (n.type IN ('discovery_comment','discovery_reply') AND c.user_id=n.actor_id AND c.status='visible' AND c.moderation_hold=0
     AND (c.parent_id IS NULL OR (parent.status<>'hidden' AND parent.moderation_hold=0))
     AND ((n.type='discovery_comment' AND p.author_id=n.user_id) OR (n.type='discovery_reply' AND parent.user_id=n.user_id)))
 )))))`;

async function checkNotificationSchema(db:Queryable):Promise<boolean>{
  const [cols]=await db.query<RowDataPacket[]>("SELECT TABLE_NAME t,COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('notifications','discovery_notification_schema_state')");
  const found=new Set(cols.map(r=>`${r.t}.${r.c}`));
  if(!['actor_id','community_post_id','community_comment_id','dedupe_key'].every(c=>found.has('notifications.'+c))||!['singleton_id','migration_version','application_revision'].every(c=>found.has('discovery_notification_schema_state.'+c)))return false;
  const [indexes]=await db.query<RowDataPacket[]>("SELECT INDEX_NAME,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND NON_UNIQUE=0 GROUP BY INDEX_NAME");
  if(!indexes.some(i=>i.cols==='dedupe_key'))return false;
  const [state]=await db.query<RowDataPacket[]>("SELECT migration_version,application_revision FROM discovery_notification_schema_state WHERE singleton_id=1");
  return state[0]?.migration_version===9&&state[0]?.application_revision===1;
}
const requestReady=cache(()=>checkNotificationSchema(pool));
export function discoveryNotificationsReady(db?:Queryable):Promise<boolean>{return db?checkNotificationSchema(db):requestReady();}

// Caller holds the actor lock; enqueue is part of the interaction transaction.
// Returning false only means 009 is unavailable, preserving pre-009 functionality.
export async function enqueueDiscoveryNotice(tx:Queryable,event:DiscoveryNotice):Promise<boolean>{
  const actor=idOf(event.actorId),recipient=idOf(event.recipientId);
  if(actor.toLowerCase()===recipient.toLowerCase())return true;
  if(!['follow','like','comment','reply'].includes(event.kind))throw new CommunityError('Thông báo không hợp lệ.');
  if(event.postId)idOf(event.postId);if(event.commentId)idOf(event.commentId);
  if(event.kind==='follow'?(!!event.postId||!!event.commentId):event.kind==='like'?(!event.postId||!!event.commentId):(!event.postId||!event.commentId))throw new CommunityError('Đối tượng thông báo không hợp lệ.');
  if(!await discoveryNotificationsReady(tx))return false;
  const type='discovery_'+event.kind,subject=event.commentId??event.postId??actor;
  const key=createHash('sha256').update(JSON.stringify([type,actor.toLowerCase(),recipient.toLowerCase(),subject.toLowerCase()])).digest('hex');
  const [old]=await tx.query<RowDataPacket[]>('SELECT id FROM notifications WHERE dedupe_key=?',[key]);if(old.length)return true;
  const [users]=await tx.query<RowDataPacket[]>('SELECT id FROM users WHERE id=? AND is_active=1',[recipient]);if(!users.length)return true;
  const [[count]]=await tx.query<RowDataPacket[]>("SELECT COUNT(*) total,COALESCE(SUM(user_id=?),0) recipient FROM notifications WHERE actor_id=? AND created_at>=DATE_SUB(NOW(),INTERVAL 15 MINUTE)",[recipient,actor]);
  if(Number(count.total)>=60||Number(count.recipient)>=20)return true;
  await tx.query(`INSERT INTO notifications(id,user_id,type,message,actor_id,community_post_id,community_comment_id,dedupe_key) VALUES(?,?,?,'Có tương tác mới trên Discovery.',?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,[randomUUID(),recipient,type,actor,event.postId??null,event.commentId??null,key]);
  return true;
}

// Existing JourneyStory/moderation notifications keep their original contract.
export async function notify(userId:string,type:string,message:string,link?:string):Promise<void>{
  try{await pool.query('INSERT INTO notifications(id,user_id,type,message,link) VALUES(?,?,?,?,?)',[randomUUID(),userId,type,message.slice(0,300),link??null]);}
  catch{console.error('Không tạo được thông báo.');}
}
// Tái sử dụng bảng notifications hiện có cho tin nhắn mới; gộp theo hội thoại chưa đọc để tránh spam thông báo.
export async function notifyChatMessage(recipientId:string,senderName:string,preview:string,conversationId:string):Promise<void>{
  const link=`/messages?c=${conversationId}`;
  const snippet=preview.trim()?preview.trim().slice(0,110):'đã gửi một hình ảnh.';
  const message=`${senderName}: ${snippet}`.slice(0,300);
  try{
    const [existing]=await pool.query<RowDataPacket[]>("SELECT id FROM notifications WHERE user_id=? AND type='message' AND link=? AND is_read=0 ORDER BY created_at DESC LIMIT 1",[recipientId,link]);
    if(existing[0]?.id){
      await pool.query('UPDATE notifications SET message=?,created_at=NOW() WHERE id=?',[message,existing[0].id]);
    }else{
      await pool.query('INSERT INTO notifications(id,user_id,type,message,link) VALUES(?,?,?,?,?)',[randomUUID(),recipientId,'message',message,link]);
    }
  }catch{console.error('Không tạo được thông báo tin nhắn.');}
}
export async function markChatNotificationRead(userId:string,conversationId:string):Promise<void>{
  try{
    await pool.query("UPDATE notifications SET is_read=1 WHERE user_id=? AND type='message' AND link=? AND is_read=0",[userId,`/messages?c=${conversationId}`]);
  }catch{/* bỏ qua nếu không cập nhật được */}
}
async function active(userId:string){idOf(userId);const[users]=await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE id=? AND is_active=1',[userId]);if(!users.length)throw new CommunityError('Tài khoản không khả dụng.');}
function mapNotification(r:RowDataPacket):Notification{
  const kind=String(r.type).replace('discovery_',''),name=[r.last_name,r.first_name].filter(Boolean).join(' ')||'Thành viên';
  const discovery=String(r.type).startsWith('discovery_');
  const message=discovery?`${name} ${{follow:'đã theo dõi bạn.',like:'đã thích bài viết của bạn.',comment:'đã bình luận về bài viết của bạn.',reply:'đã trả lời bình luận của bạn.'}[kind]??'đã tương tác với bạn.'}`:r.message;
  let link:string|null=r.link??null;
  if(discovery)link=kind==='follow'?`/profile/${r.actor_id}`:`/discovery/posts/${r.community_post_id}${r.community_comment_id?`?thread=${r.parent_id??r.community_comment_id}#comments`:''}`;
  if(link){const safe=safeNext(link);link=safe==='/'&&link!=='/'?null:safe;}
  const actorName=discovery?name:null;
  const actorAvatar=discovery&&typeof r.avatar_url==='string'&&r.avatar_url?r.avatar_url:null;
  return{id:r.id,type:r.type,message,link,isRead:!!r.is_read,createdAt:r.created_at,actorName,actorAvatar};
}
export async function notificationPage(userId:string,token?:string,pageSize=20):Promise<{items:Notification[];next:string|null;ready:boolean;unread:number}>{
  await active(userId);const ready=await discoveryNotificationsReady(),scope=feedScope('newest','notifications',userId,''),cursor=token?decodeCursor(token,scope,'newest'):null;
  const limit=Math.max(1,Math.min(20,Math.trunc(Number(pageSize)||20)));
  const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') t");
  const base:Cursor=cursor??{v:1,order:'newest',scope,at:now.t,expires:Date.now()+30*60000};
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT n.*,DATE_FORMAT(n.created_at,'%Y-%m-%d %H:%i:%s.%f') time_key ${ready?',a.first_name,a.last_name,a.avatar_url,c.parent_id':''} FROM notifications n ${ready?JOINS:''} WHERE n.user_id=? AND ${ready?ELIGIBLE:LEGACY} AND n.created_at<=? ${cursor?'AND (n.created_at<? OR (n.created_at=? AND n.id<?))':''} ORDER BY n.created_at DESC,n.id DESC LIMIT ?`,[userId,base.at,...(cursor?[cursor.lastTime,cursor.lastTime,cursor.lastId]:[]),limit+1]);
  const page=rows.slice(0,limit),last=page.at(-1);
  return{items:page.map(mapNotification),next:rows.length>limit&&last?encodeCursor({...base,lastTime:last.time_key,lastId:last.id}):null,ready,unread:await notificationUnreadCount(userId)};
}
export async function listNotifications(userId:string):Promise<Notification[]>{return(await notificationPage(userId)).items;}
export async function unreadCount(userId:string):Promise<number>{
  try{return await notificationUnreadCount(userId);}catch{return 0;}
}
export async function notificationUnreadCount(userId:string):Promise<number>{
  idOf(userId);const ready=await discoveryNotificationsReady();const [[r]]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) n FROM notifications n JOIN users recipient ON recipient.id=n.user_id AND recipient.is_active=1 ${ready?JOINS:''} WHERE n.user_id=? AND n.is_read=0 AND ${ready?ELIGIBLE:LEGACY}`,[userId]);return Number(r.n);
}
export async function markNotificationsRead(userId:string,id:string|null):Promise<void>{
  await active(userId);if(id!==null)idOf(id);const ready=await discoveryNotificationsReady();
  await pool.query(`UPDATE notifications n ${ready?JOINS:''} SET n.is_read=1 WHERE n.user_id=? AND n.is_read=0 AND ${ready?ELIGIBLE:LEGACY} ${id?'AND n.id=?':''}`,[userId,...(id?[id]:[])]);
}
export async function markAllRead(userId:string):Promise<void>{return markNotificationsRead(userId,null);}

import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { requireCommunity } from "./schema";
import { CommunityError, idOf, type Actor } from "./model";
import { decodeCursor, encodeCursor, feedScope, type Cursor } from "./cursor";
const PUBLIC="p.status='published' AND p.visibility='public' AND p.deleted_at IS NULL";
export type DiscussionComment={id:string;parentId:string|null;authorId:string;name:string;avatar:string|null;body:string;status:string;revision:number;createdAt:Date;canEdit:boolean;canDelete:boolean;canHide:boolean;canReply:boolean;canReport:boolean};
export type Thread={root:DiscussionComment;replies:DiscussionComment[];replyCount:number};
function comment(r:RowDataPacket,viewer:Actor|null):DiscussionComment{
  const visible=r.status==="visible"&&!r.moderation_hold,own=viewer?.id===r.user_id;
  return{id:r.id,parentId:r.parent_id,authorId:r.user_id,name:visible?[r.last_name,r.first_name].filter(Boolean).join(" ")||"Thành viên":"Thành viên",avatar:visible?r.avatar_url:null,body:visible?r.body:r.status==="hidden"?"Bình luận đã được ẩn.":"Bình luận đã được xóa.",status:r.status,revision:Number(r.revision),createdAt:r.created_at,canEdit:!!own&&visible,canDelete:!!own&&r.status!=="deleted",canHide:viewer?.role==="admin"&&visible,canReply:!!viewer&&visible&&!r.parent_id,canReport:!!viewer&&visible};
}
const SELECT="SELECT c.*,DATE_FORMAT(c.created_at,'%Y-%m-%d %H:%i:%s.%f') AS time_key,u.first_name,u.last_name,u.avatar_url FROM community_comments c JOIN users u ON u.id=c.user_id JOIN community_posts p ON p.id=c.post_id";
export async function listDiscussion(postId:string,viewer:Actor|null,token?:string,threadId?:string):Promise<{threads:Thread[];next:string|null;threadMode:boolean}>{
  await requireCommunity();idOf(postId);if(threadId)idOf(threadId);
  const scope=feedScope("newest",threadId?"replies":"roots",postId,threadId??""),cursor=token?decodeCursor(token,scope,"newest"):null;
  const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS t");
  const base:Cursor=cursor??{v:1,order:"newest",scope,at:now.t,expires:Date.now()+30*60000};
  if(threadId){
    const [roots]=await pool.query<RowDataPacket[]>(`${SELECT} WHERE ${PUBLIC} AND c.post_id=? AND c.id=? AND c.parent_id IS NULL`,[postId,threadId]);
    if(!roots.length)throw new CommunityError("Nhánh bình luận không khả dụng.");
    const root=comment(roots[0],viewer);if(root.status==="hidden"||roots[0].moderation_hold)return{threads:[{root,replies:[],replyCount:0}],next:null,threadMode:true};
    const [rows]=await pool.query<RowDataPacket[]>(`${SELECT} JOIN community_comments parent ON parent.id=c.parent_id AND parent.status<>'hidden' AND parent.moderation_hold=0 WHERE ${PUBLIC} AND c.post_id=? AND c.parent_id=? AND c.status='visible' AND c.moderation_hold=0 AND c.created_at<=? ${cursor?"AND (c.created_at>? OR (c.created_at=? AND c.id>?))":""} ORDER BY c.created_at,c.id LIMIT 21`,[postId,threadId,base.at,...(cursor?[cursor.lastTime,cursor.lastTime,cursor.lastId]:[])]);
    const page=rows.slice(0,20),last=page.at(-1);return{threads:[{root,replies:page.map(r=>comment(r,viewer)),replyCount:page.length}],next:rows.length>20&&last?encodeCursor({...base,lastTime:last.time_key,lastId:last.id}):null,threadMode:true};
  }
  const [rows]=await pool.query<RowDataPacket[]>(`${SELECT} WHERE ${PUBLIC} AND c.post_id=? AND c.parent_id IS NULL AND c.created_at<=? ${cursor?"AND (c.created_at<? OR (c.created_at=? AND c.id<?))":""} ORDER BY c.created_at DESC,c.id DESC LIMIT 11`,[postId,base.at,...(cursor?[cursor.lastTime,cursor.lastTime,cursor.lastId]:[])]);
  const page=rows.slice(0,10),last=page.at(-1);if(!page.length)return{threads:[],next:null,threadMode:false};
  const ids=page.filter(r=>r.status!=="hidden"&&!r.moderation_hold).map(r=>r.id);
  const [replies]=ids.length?await pool.query<RowDataPacket[]>(`SELECT ranked.* FROM (SELECT c.*,u.first_name,u.last_name,u.avatar_url,ROW_NUMBER() OVER(PARTITION BY c.parent_id ORDER BY c.created_at,c.id) AS rn,COUNT(*) OVER(PARTITION BY c.parent_id) AS total FROM community_comments c JOIN users u ON u.id=c.user_id JOIN community_posts p ON p.id=c.post_id JOIN community_comments parent ON parent.id=c.parent_id AND parent.status<>'hidden' AND parent.moderation_hold=0 WHERE ${PUBLIC} AND c.post_id=? AND c.parent_id IN (?) AND c.status='visible' AND c.moderation_hold=0) ranked WHERE rn<=3`,[postId,ids]):[[]];
  return{threads:page.map(r=>{const children=replies.filter(c=>c.parent_id===r.id);return{root:comment(r,viewer),replies:children.map(c=>comment(c,viewer)),replyCount:Number(children[0]?.total??0)};}),next:rows.length>10&&last?encodeCursor({...base,lastTime:last.time_key,lastId:last.id}):null,threadMode:false};
}
export async function reportQueue(actor:Actor,history=false,token?:string){
  await requireCommunity();const [[user]]=await pool.query<RowDataPacket[]>("SELECT role,is_active FROM users WHERE id=?",[idOf(actor.id)]);
  if(user?.role!=="admin"||user.is_active!==1)throw new CommunityError("Chỉ Admin được xem báo cáo.");
  const scope=feedScope("newest",history?"report-history":"report-open",actor.id,""),cursor=token?decodeCursor(token,scope,"newest"):null;
  const [[now]]=await pool.query<RowDataPacket[]>("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS t");const base:Cursor=cursor??{v:1,scope,order:"newest",at:now.t,expires:Date.now()+30*60000};
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT r.*,DATE_FORMAT(r.created_at,'%Y-%m-%d %H:%i:%s.%f') AS time_key,COALESCE(r.post_id,c.post_id) AS target_post_id,COALESCE(c.revision,p.revision) AS target_revision,LEFT(COALESCE(c.body,p.body),300) AS preview,p.title,p.status AS post_status,c.status AS comment_status,u.first_name,u.last_name,h.first_name AS handler_name FROM community_reports r LEFT JOIN community_comments c ON c.id=r.comment_id JOIN community_posts p ON p.id=COALESCE(r.post_id,c.post_id) JOIN users u ON u.id=r.reporter_id LEFT JOIN users h ON h.id=r.handled_by WHERE r.status${history?"<>":"="}'open' AND r.created_at<=? ${cursor?"AND (r.created_at<? OR (r.created_at=? AND r.id<?))":""} ORDER BY r.created_at DESC,r.id DESC LIMIT 21`,[base.at,...(cursor?[cursor.lastTime,cursor.lastTime,cursor.lastId]:[])]);
  const page=rows.slice(0,20),last=page.at(-1);
  return{reports:page.map(r=>({id:r.id as string,postId:r.target_post_id as string,isComment:!!r.comment_id,revision:Number(r.target_revision),reason:r.reason as string,preview:r.preview as string,title:r.title as string|null,status:r.status as string,decision:r.decision as string|null,note:r.resolution_note as string|null,reporter:[r.last_name,r.first_name].filter(Boolean).join(" "),handler:r.handler_name as string|null,handledAt:r.handled_at as Date|null,createdAt:r.created_at as Date})),next:rows.length>20&&last?encodeCursor({...base,lastTime:last.time_key,lastId:last.id}):null};
}

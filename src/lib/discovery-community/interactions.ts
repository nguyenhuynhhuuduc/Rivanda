import { randomUUID } from "crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { enqueueDiscoveryNotice } from "../notifications";
import { CommunityError, idOf, revisionOf, textOf, type Actor } from "./model";
import { checkPublic, lockActor, lockPost, quota, transaction } from "./db";

export const VISIBLE_COMMENTS = "c.status='visible' AND c.moderation_hold=0 AND (c.parent_id IS NULL OR EXISTS(SELECT 1 FROM community_comments parent WHERE parent.id=c.parent_id AND parent.status<>'hidden' AND parent.moderation_hold=0))";
export async function setPostFlag(actor:Actor, postId:string, kind:unknown, enabled:unknown) {
  if(!["like","save"].includes(kind as string)||typeof enabled!=="boolean")throw new CommunityError("Tương tác không hợp lệ.");
  return transaction(async tx=>{
    const user=await lockActor(tx,actor);await quota(tx,user,"interaction");
    const post=await lockPost(tx,postId);checkPublic(post);
    const table=kind==="like"?"community_likes":"community_saves";
    if(enabled){const [result]=await tx.query<ResultSetHeader>(`INSERT IGNORE INTO ${table}(user_id,post_id) VALUES(?,?)`,[user.id,post.id]);if(kind==="like"&&result.affectedRows===1)await enqueueDiscoveryNotice(tx,{kind:"like",actorId:user.id,recipientId:post.author_id,postId:post.id});}
    else await tx.query(`DELETE FROM ${table} WHERE user_id=? AND post_id=?`,[user.id,post.id]);
    const [[counts]]=await tx.query<RowDataPacket[]>(`SELECT (SELECT COUNT(*) FROM community_likes WHERE post_id=?) AS likes,(SELECT COUNT(*) FROM community_saves WHERE post_id=?) AS saves`,[post.id,post.id]);
    return {postId:post.id as string,authorId:post.author_id,likes:Number(counts.likes),saves:Number(counts.saves)};
  });
}
async function lockComment(tx:PoolConnection,id:string,postId:string) {
  const [rows]=await tx.query<RowDataPacket[]>("SELECT * FROM community_comments WHERE id=? AND post_id=? FOR UPDATE",[idOf(id),postId]);
  if(!rows[0])throw new CommunityError("Bình luận không khả dụng.");return rows[0];
}
async function commentPost(tx:PoolConnection,id:string) {
  const [rows]=await tx.query<RowDataPacket[]>("SELECT post_id FROM community_comments WHERE id=?",[idOf(id)]);
  if(!rows[0])throw new CommunityError("Bình luận không khả dụng.");return rows[0].post_id as string;
}
async function logComment(tx:PoolConnection,id:string,user:Actor,revision:number,decision:string,note:string|null=null) {
  await tx.query("INSERT INTO community_comment_events(id,comment_id,actor_id,revision,decision,note) VALUES(?,?,?,?,?,?)",[randomUUID(),id,user.id,revision,decision,note]);
}
export async function addComment(actor:Actor,postId:string,rawBody:unknown,parentId:string|null,requestId:string) {
  const body=textOf(rawBody,2000,true);idOf(requestId);if(parentId)idOf(parentId);
  return transaction(async tx=>{
    const user=await lockActor(tx,actor),post=await lockPost(tx,postId);checkPublic(post);
    const [existing]=await tx.query<RowDataPacket[]>("SELECT id,post_id,parent_id,body FROM community_comments WHERE user_id=? AND request_id=?",[user.id,requestId]);
    if(existing[0]){const e=existing[0];if(e.post_id!==post.id||e.parent_id!==parentId||e.body!==body)throw new CommunityError("Yêu cầu đã được sử dụng. Hãy tải lại form.");return{postId,authorId:post.author_id,commentId:e.id as string};}
    await quota(tx,user,"comment");
    const parent=parentId?await lockComment(tx,parentId,postId):null;
    if(parent&&(parent.parent_id!==null||parent.depth!==1||parent.status!=="visible"||parent.moderation_hold))throw new CommunityError("Chỉ trả lời bình luận cấp một đang hiển thị; tối đa hai cấp.");
    const id=randomUUID();await tx.query("INSERT INTO community_comments(id,post_id,parent_id,depth,user_id,body,request_id) VALUES(?,?,?,?,?,?,?)",[id,postId,parentId,parentId?2:1,user.id,body,requestId]);
    if(parent)await enqueueDiscoveryNotice(tx,{kind:"reply",actorId:user.id,recipientId:parent.user_id,postId,commentId:id});
    if(!parent||parent.user_id!==post.author_id)await enqueueDiscoveryNotice(tx,{kind:"comment",actorId:user.id,recipientId:post.author_id,postId,commentId:id});
    return{postId,authorId:post.author_id,commentId:id};
  });
}
export async function changeComment(actor:Actor,id:string,expected:unknown,operation:unknown,rawBody:unknown="",rawNote:unknown="") {
  const revision=revisionOf(expected);if(!["edit","delete","hide"].includes(operation as string))throw new CommunityError("Thao tác bình luận không hợp lệ.");
  const body=operation==="edit"?textOf(rawBody,2000,true):"",note=operation==="hide"?textOf(rawNote,500,true):null;
  return transaction(async tx=>{
    const user=await lockActor(tx,actor,operation==="hide"),post=await lockPost(tx,await commentPost(tx,id));
    if(operation!=="hide")checkPublic(post);
    const c=await lockComment(tx,id,post.id);
    if(c.status==="deleted"||Number(c.revision)!==revision)throw new CommunityError("Bình luận đã thay đổi. Hãy tải lại.");
    if(operation!=="hide"&&c.user_id!==user.id)throw new CommunityError("Bạn chỉ được sửa/xóa bình luận của mình.");
    if(operation==="edit"&&(c.status!=="visible"||c.moderation_hold))throw new CommunityError("Không thể sửa bình luận đã bị ẩn.");
    if(operation==="edit"&&c.parent_id){const parent=await lockComment(tx,c.parent_id,post.id);if(parent.status==="hidden"||parent.moderation_hold)throw new CommunityError("Nhánh bình luận đã được ẩn.");}
    if(operation==="hide"&&c.status!=="visible")throw new CommunityError("Bình luận không còn hiển thị.");
    await quota(tx,user,"comment");
    await tx.query("UPDATE community_comments SET body=CASE WHEN ?='edit' THEN ? ELSE body END,status=?,moderation_hold=CASE WHEN ?='hide' THEN 1 ELSE moderation_hold END,revision=revision+1 WHERE id=? AND revision=?",[operation,body,operation==="edit"?"visible":operation==="hide"?"hidden":"deleted",operation,id,revision]);
    await logComment(tx,id,user,revision+1,operation==="edit"?"edited":operation==="hide"?"hidden":"deleted",note);
    return{postId:post.id as string,authorId:post.author_id};
  });
}
export async function reportContent(actor:Actor,kind:unknown,targetId:string,rawReason:unknown) {
  if(kind!=="post"&&kind!=="comment")throw new CommunityError("Đối tượng báo cáo không hợp lệ.");idOf(targetId);const reason=textOf(rawReason,500,true);
  return transaction(async tx=>{
    const user=await lockActor(tx,actor),post=await lockPost(tx,kind==="post"?targetId:await commentPost(tx,targetId));checkPublic(post);
    if(kind==="comment"){const c=await lockComment(tx,targetId,post.id);if(c.status!=="visible"||c.moderation_hold)throw new CommunityError("Bình luận không còn hiển thị.");if(c.parent_id){const parent=await lockComment(tx,c.parent_id,post.id);if(parent.status==="hidden"||parent.moderation_hold)throw new CommunityError("Bình luận không còn hiển thị.");}}
    const column=kind==="post"?"post_id":"comment_id";
    const [previous]=await tx.query<RowDataPacket[]>(`SELECT id FROM community_reports WHERE reporter_id=? AND ${column}=? AND (status='open' OR created_at>DATE_SUB(NOW(6),INTERVAL 1 DAY)) LIMIT 1`,[user.id,targetId]);
    if(previous.length)return{postId:post.id as string,authorId:post.author_id,duplicate:true};
    await quota(tx,user,"report");
    await tx.query(`INSERT INTO community_reports(id,reporter_id,${column},reason) VALUES(?,?,?,?)`,[randomUUID(),user.id,targetId,reason]);
    return{postId:post.id as string,authorId:post.author_id,duplicate:false};
  });
}
export async function handleReport(actor:Actor,id:string,decision:unknown,rawNote:unknown,expected:unknown) {
  if(!["dismiss","hide_post","remove_post","hide_comment"].includes(decision as string))throw new CommunityError("Quyết định không hợp lệ.");
  const note=textOf(rawNote,500,true),revision=revisionOf(expected);
  return transaction(async tx=>{
    const admin=await lockActor(tx,actor,true);
    const [lookup]=await tx.query<RowDataPacket[]>("SELECT post_id,comment_id FROM community_reports WHERE id=?",[idOf(id)]);
    if(!lookup[0])throw new CommunityError("Báo cáo không khả dụng.");const target=lookup[0];
    const post=await lockPost(tx,target.post_id??await commentPost(tx,target.comment_id),true);
    const comment=target.comment_id?await lockComment(tx,target.comment_id,post.id):null;
    const [reports]=await tx.query<RowDataPacket[]>("SELECT status FROM community_reports WHERE id=? FOR UPDATE",[id]);
    if(reports[0]?.status!=="open")throw new CommunityError("Báo cáo đã được xử lý. Hãy tải lại.");
    if(decision!=="dismiss"){
      if(Number((comment??post).revision)!==revision)throw new CommunityError("Nội dung đã thay đổi. Hãy xem lại trước khi xử lý.");
      if(decision==="hide_comment"){
        if(!comment||comment.status!=="visible")throw new CommunityError("Bình luận không còn hiển thị.");
        await tx.query("UPDATE community_comments SET status='hidden',moderation_hold=1,revision=revision+1 WHERE id=? AND revision=?",[comment.id,revision]);await logComment(tx,comment.id,admin,revision+1,"hidden",note);
      }else{
        if(comment||post.status==="deleted")throw new CommunityError("Quyết định không phù hợp với đối tượng báo cáo.");
        const status=decision==="hide_post"?"hidden":"deleted";
        await tx.query("UPDATE community_posts SET restore_status=CASE WHEN ?='deleted' THEN status ELSE NULL END,status=?,moderation_hold=1,review_note=?,reviewed_by=?,reviewed_revision=?,revision=revision+1,deleted_at=CASE WHEN ?='deleted' THEN NOW(6) ELSE NULL END WHERE id=? AND revision=?",[status,status,note,admin.id,revision+1,status,post.id,revision]);
        await tx.query("INSERT INTO community_review_events(id,post_id,actor_id,revision,decision,note) VALUES(?,?,?,?,?,?)",[randomUUID(),post.id,admin.id,revision+1,status,note]);
      }
    }
    await tx.query("UPDATE community_reports SET status=?,decision=?,resolution_note=?,handled_by=?,handled_at=NOW(6) WHERE id=? AND status='open'",[decision==="dismiss"?"dismissed":"resolved",decision,note,admin.id,id]);
    return{postId:post.id as string,authorId:post.author_id};
  });
}

import { randomUUID } from "crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { slugify } from "../slug";
import { CommunityError, idOf, revisionOf, textOf, validateInput, type Actor, type PostInput, type PreparedMedia } from "./model";
import { checkOwner, lockActor, lockPost, quota, transaction } from "./db";
import { attachUpload } from "./storage";
import {retireMedia} from "./lifecycle";
async function log(tx:PoolConnection,id:string,actor:Actor,revision:number,decision:string,note:string|null=null){await tx.query("INSERT INTO community_review_events(id,post_id,actor_id,revision,decision,note) VALUES(?,?,?,?,?,?)",[randomUUID(),id,actor.id,revision,decision,note]);}
export async function saveCommunityPost(actor:Actor,raw:PostInput,media:PreparedMedia[],keepIds:string[],id?:string,expected?:number):Promise<string>{
  const input=validateInput(raw);
  if(!Array.isArray(media)||media.length>8||!Array.isArray(keepIds)||new Set(keepIds).size!==keepIds.length||keepIds.length+media.length>8)throw new CommunityError("Tối đa 8 ảnh cho một bài.");
  keepIds.forEach(idOf);
  for(const m of media)if(!/^[a-f0-9-]{36}\.webp$/.test(m.imageFile)||!/^[a-f0-9-]{36}\.webp$/.test(m.thumbFile)||!Number.isSafeInteger(m.byteSize)||m.byteSize<1||m.byteSize>5*1024*1024||m.width<1||m.height<1)throw new CommunityError("Ảnh chưa được xử lý hợp lệ.");
  return transaction(async tx=>{
    const user=await lockActor(tx,actor);await quota(tx,user,"post");
    const old=id?await lockPost(tx,id):null;if(old)checkOwner(old,user,revisionOf(expected));
    if(!id&&keepIds.length)throw new CommunityError("Không thể gắn ảnh của bài khác.");
    if(input.topicId){const [topics]=await tx.query<RowDataPacket[]>("SELECT id FROM community_topics WHERE id=? AND is_visible=1 AND deleted_at IS NULL FOR UPDATE",[input.topicId]);if(!topics.length)throw new CommunityError("Chủ đề không khả dụng.");}
    const [owned]=id?await tx.query<RowDataPacket[]>("SELECT id FROM community_media WHERE post_id=? AND owner_id=? AND removed_at IS NULL FOR UPDATE",[id,user.id]):[[]];
    if(keepIds.some(x=>!owned.some(m=>m.id===x)))throw new CommunityError("Ảnh không thuộc bài viết này.");
    if(input.kind==="photos"&&input.intent==="publish"&&!keepIds.length&&!media.length)throw new CommunityError("Bài ảnh cần ít nhất một ảnh.");
    const state=input.intent==="draft"?"draft":old?.moderation_hold?"pending":"published",postId=id??randomUUID();
    if(!id)await tx.query("INSERT INTO community_posts(id,author_id,topic_id,kind,title,body,visibility,status,published_at) VALUES(?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN NOW(6) ELSE NULL END)",[postId,user.id,input.topicId,input.kind,input.title||null,input.body,input.visibility,state,state]);
    else await tx.query("UPDATE community_posts SET topic_id=?,kind=?,title=?,body=?,visibility=?,status=?,revision=revision+1,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,NOW(6)) ELSE published_at END WHERE id=? AND author_id=? AND revision=?",[input.topicId,input.kind,input.title||null,input.body,input.visibility,state,state,id,user.id,expected]);
    await attachUpload(tx,user,media,postId);
    // Retain removed media for recovery; the opt-in worker later retires references.
    if(id)await retireMedia(tx,id,keepIds);
    // Temporary disjoint order avoids UNIQUE collisions while reordering kept media.
    if(id)await tx.query("UPDATE community_media SET sort_order=sort_order+100 WHERE post_id=? AND removed_at IS NULL",[id]);
    for(const [i,mediaId]of keepIds.entries())await tx.query("UPDATE community_media SET sort_order=? WHERE id=? AND post_id=?",[i,mediaId,postId]);
    for(const [i,m]of media.entries())await tx.query("INSERT INTO community_media(id,post_id,owner_id,image_file,thumb_file,mime_type,byte_size,width,height,sort_order) VALUES(?,?,?,?,?,'image/webp',?,?,?,?)",[randomUUID(),postId,user.id,m.imageFile,m.thumbFile,m.byteSize,m.width,m.height,keepIds.length+i]);
    await tx.query("DELETE FROM community_post_tags WHERE post_id=?",[postId]);
    for(const name of [...input.tags].sort((a,b)=>slugify(a).localeCompare(slugify(b)))){const slug=slugify(name,"tag");await tx.query("INSERT INTO tags(name,slug) VALUES(?,?) ON DUPLICATE KEY UPDATE name=name",[name,slug]);const [tags]=await tx.query<RowDataPacket[]>("SELECT id FROM tags WHERE slug=?",[slug]);await tx.query("INSERT IGNORE INTO community_post_tags(post_id,tag_id) VALUES(?,?)",[postId,tags[0].id]);}
    await log(tx,postId,user,old?Number(expected)+1:1,state==="pending"?"submitted":state==="published"?"published":"edited");
    return postId;
  });
}
export async function deleteCommunityPost(actor:Actor,id:string,expected:number):Promise<void>{
  await transaction(async tx=>{const user=await lockActor(tx,actor),post=await lockPost(tx,id);checkOwner(post,user,expected);await tx.query("UPDATE community_posts SET restore_status=status,status='deleted',deleted_at=NOW(6),revision=revision+1 WHERE id=? AND author_id=? AND revision=?",[id,user.id,expected]);await log(tx,id,user,expected+1,"deleted");});
}
export async function moderateCommunityPost(actor:Actor,id:string,expected:number,decision:unknown,rawNote:unknown):Promise<void>{
  if(typeof decision!=="string"||!["hide","remove","approve","reject"].includes(decision))throw new CommunityError("Quyết định không hợp lệ.");
  const note=textOf(rawNote,500,decision!=="approve");
  await transaction(async tx=>{const admin=await lockActor(tx,actor,true),post=await lockPost(tx,id);
    if(Number(post.revision)!==revisionOf(expected))throw new CommunityError("Bài đã thay đổi. Hãy tải lại trước khi xử lý.");
    if(["approve","reject"].includes(decision)&&post.status!=="pending")throw new CommunityError("Bài không còn chờ kiểm duyệt.");
    const state=decision==="hide"?"hidden":decision==="remove"?"deleted":decision==="approve"?"published":"rejected";
    await tx.query("UPDATE community_posts SET restore_status=CASE WHEN ?='deleted' THEN status ELSE NULL END,status=?,moderation_hold=?,review_note=?,reviewed_by=?,reviewed_revision=?,revision=revision+1,deleted_at=CASE WHEN ?='deleted' THEN NOW(6) ELSE NULL END,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,NOW(6)) ELSE published_at END WHERE id=? AND revision=?",[state,state,decision==="approve"?0:1,note||null,admin.id,expected+1,state,state,id,expected]);
    await log(tx,id,admin,expected+1,decision==="hide"?"hidden":decision==="remove"?"deleted":decision==="approve"?"approved":"rejected",note||null);
  });
}

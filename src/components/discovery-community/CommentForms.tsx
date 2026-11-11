"use client";
import { useActionState,useEffect,useState } from "react";
import { addCommentAction,changeCommentAction } from "@/app/(light)/discovery/interaction-actions";
import { btnOutline,btnPrimary,inputCls } from "@/components/ui/kit";
import type { DiscussionComment } from "@/lib/discovery-community/discussion-read";
import { ActionFeedback,ReportForm } from "./Interactions";
export function CommentForm({postId,parentId}:{postId:string;parentId?:string}){
  const[state,action,pending]=useActionState(addCommentAction,{}),[body,setBody]=useState(""),[nonce,setNonce]=useState("");
  useEffect(()=>{setNonce(crypto.randomUUID());},[]);
  useEffect(()=>{if(state.commentId){setBody("");setNonce(crypto.randomUUID());}},[state.commentId]);
  return <form action={action} className="space-y-3"><input name="postId" type="hidden" value={postId}/><input name="parentId" type="hidden" value={parentId??""}/><input name="requestId" type="hidden" value={nonce}/><label className="block space-y-2 text-sm"><span>{parentId?"Nội dung trả lời":"Viết bình luận"}</span><textarea name="body" value={body} onChange={e=>setBody(e.target.value)} required maxLength={2000} rows={3} disabled={pending} className={`${inputCls} min-w-0 resize-y`} placeholder="Chia sẻ ý kiến một cách tôn trọng…"/></label><button disabled={pending||!nonce} className={parentId?btnOutline:btnPrimary}>{pending?"Đang gửi…":parentId?"Gửi trả lời":"Gửi bình luận"}</button><ActionFeedback state={state}/></form>;
}
function CommentEdit({c}:{c:DiscussionComment}){
  const[state,action,pending]=useActionState(changeCommentAction,{}),[body,setBody]=useState(c.body);
  return <details className="text-xs"><summary className="cursor-pointer py-2 text-link">Sửa</summary><form action={action} className="mt-2 space-y-3"><input name="commentId" type="hidden" value={c.id}/><input name="revision" type="hidden" value={c.revision}/><input name="operation" type="hidden" value="edit"/><label className="block space-y-2"><span>Nội dung chỉnh sửa</span><textarea name="body" required maxLength={2000} rows={3} value={body} onChange={e=>setBody(e.target.value)} disabled={pending} className={inputCls}/></label><button className={btnOutline} disabled={pending}>{pending?"Đang lưu…":"Lưu bình luận"}</button><ActionFeedback state={state}/></form></details>;
}
function CommentRemove({c,hide}:{c:DiscussionComment;hide?:boolean}){
  const[state,action,pending]=useActionState(changeCommentAction,{});
  return <details className="text-xs"><summary className="cursor-pointer py-2 text-muted">{hide?"Ẩn bình luận (Admin)":"Xóa"}</summary><form action={action} className="mt-2 space-y-3"><input name="commentId" type="hidden" value={c.id}/><input name="revision" type="hidden" value={c.revision}/><input name="operation" type="hidden" value={hide?"hide":"delete"}/>{hide?<label className="block space-y-2"><span>Lý do ẩn bình luận</span><input name="note" required maxLength={500} className={inputCls} disabled={pending}/></label>:<label className="flex items-center gap-2"><input name="confirm" value="yes" type="checkbox" required disabled={pending}/>Xác nhận xóa bình luận</label>}<button className={btnOutline} disabled={pending}>{pending?"Đang xử lý…":hide?"Xác nhận ẩn":"Xác nhận xóa"}</button><ActionFeedback state={state}/></form></details>;
}
export function CommentControls({c,postId}:{c:DiscussionComment;postId:string}){
  return <div className="mt-2 min-w-0 space-y-2">{c.canReply&&<details className="text-xs"><summary className="cursor-pointer py-2 text-link">Trả lời</summary><div className="mt-2"><CommentForm postId={postId} parentId={c.id}/></div></details>}{c.canEdit&&<CommentEdit key={`edit-${c.revision}`} c={c}/>}<div className="space-y-2">{c.canDelete&&<CommentRemove c={c}/>} {c.canHide&&<CommentRemove c={c} hide/>}{c.canReport&&<ReportForm kind="comment" targetId={c.id}/>}</div></div>;
}

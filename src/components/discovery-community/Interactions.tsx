"use client";
import Link from "next/link";
import { useActionState } from "react";
import { flagAction,reportAction,type InteractionState } from "@/app/(light)/discovery/interaction-actions";
import { btnOutline,inputCls } from "@/components/ui/kit";
import { HeartIcon, BookmarkIcon, CommentIcon } from "@/components/icons";
import { discoveryLoginHref } from "./DiscoveryUI";
import { SharePost } from "./SharePost";
import styles from "./Discovery.module.css";
export function ActionFeedback({state}:{state:InteractionState}){return <>{state.error&&<p role="alert" className="mt-2 break-words text-xs text-fg">{state.error}</p>}{state.message&&<p role="status" className="mt-2 break-words text-xs text-muted">{state.message}</p>}</>;}
export function ReportForm({kind,targetId}:{kind:"post"|"comment";targetId:string}){
  const[state,action,pending]=useActionState(reportAction,{});
  return <details className="min-w-0 text-xs"><summary className="cursor-pointer rounded-lg px-2 py-2 text-muted hover:text-fg">Báo cáo {kind==="post"?"bài viết":"bình luận"}</summary><form action={action} className="mt-2 space-y-3 rounded-xl border border-line bg-bg p-4"><input name="kind" type="hidden" value={kind}/><input name="targetId" type="hidden" value={targetId}/><label className="block space-y-2"><span>Lý do báo cáo</span><textarea name="reason" required maxLength={500} rows={3} disabled={pending} className={inputCls}/></label><button disabled={pending} className={btnOutline}>{pending?"Đang gửi…":"Gửi báo cáo"}</button><ActionFeedback state={state}/></form></details>;
}
export function SocialBar({postId,likes,saves,comments,liked,saved,loggedIn,active,returnTo}:{postId:string;likes:number;saves:number;comments:number;liked:boolean;saved:boolean;loggedIn:boolean;active:boolean;returnTo?:string}){
  const[state,action,pending]=useActionState(flagAction,{});
  const login=discoveryLoginHref(returnTo??`/discovery/posts/${postId}`);
  return <div className="w-full min-w-0"><p className={styles.counts}>{likes} lượt thích · {comments} bình luận · {saves} lượt lưu</p>{active?<><div className={styles.actions}>{loggedIn?<form action={action} className={styles.flagForm}><input name="postId" type="hidden" value={postId}/><button aria-pressed={liked} disabled={pending} name="operation" value={`like:${liked?"off":"on"}`} className={styles.action}><HeartIcon filled={liked}/>{liked?"Đã thích":"Thích"}</button><button aria-pressed={saved} disabled={pending} name="operation" value={`save:${saved?"off":"on"}`} className={styles.action}><BookmarkIcon filled={saved}/>{saved?"Đã lưu":"Lưu bài"}</button></form>:<><Link className={styles.action} href={login} aria-label="Đăng nhập để thích bài"><HeartIcon/>Thích</Link><Link className={styles.action} href={login} aria-label="Đăng nhập để lưu bài"><BookmarkIcon/>Lưu bài</Link></>}<Link href={loggedIn?`/discovery/posts/${postId}#comments`:discoveryLoginHref(`/discovery/posts/${postId}#comments`)} className={styles.action}><CommentIcon/>Bình luận</Link><SharePost id={postId}/></div>{pending&&<p role="status" className={styles.feedback}>Đang cập nhật…</p>}<ActionFeedback state={state}/>{loggedIn&&<div className={styles.utility}><ReportForm kind="post" targetId={postId}/></div>}</>:<><p className="text-xs leading-6 text-muted">Tương tác chỉ dành cho bài công khai đã đăng.</p><SharePost id={postId}/></>}</div>;
}

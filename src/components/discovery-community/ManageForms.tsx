"use client";
import { useActionState } from "react";
import { deletePostAction, moderatePostAction } from "@/app/(light)/discovery/community-actions";
import { btnOutline,inputCls } from "@/components/ui/kit";
export function DeletePost({id,revision}:{id:string;revision:number}){
  const [state,action,pending]=useActionState(deletePostAction,{});
  return <form action={action} className="mt-6 space-y-3 rounded-xl border border-line p-4"><input name="id" type="hidden" value={id}/><input name="revision" type="hidden" value={revision}/><label className="flex items-center gap-2 text-sm"><input name="confirm" value="yes" type="checkbox" required disabled={pending}/>Tôi muốn xóa bài này khỏi trang hiển thị.</label><button disabled={pending} className={btnOutline}>{pending?"Đang xóa…":"Xóa bài"}</button>{state.error&&<p role="alert" className="text-sm">{state.error}</p>}</form>;
}
export function ModeratePost({id,revision,pending:reviewPending}:{id:string;revision:number;pending:boolean}){
  const [state,action,pending]=useActionState(moderatePostAction,{});
  return <form action={action} className="space-y-3 rounded-xl border border-line p-4"><input name="id" type="hidden" value={id}/><input name="revision" type="hidden" value={revision}/><fieldset disabled={pending} className="space-y-3"><label className="block space-y-2 text-sm"><span>Quyết định kiểm duyệt</span><select className={inputCls} name="decision"><option value="hide">Ẩn bài</option><option value="remove">Gỡ bài</option>{reviewPending&&<><option value="approve">Duyệt xuất bản</option><option value="reject">Từ chối</option></>}</select></label><label className="block space-y-2 text-sm"><span>Lý do (bắt buộc khi ẩn/gỡ/từ chối)</span><input name="note" maxLength={500} className={inputCls}/></label><button className={btnOutline}>{pending?"Đang xử lý…":"Áp dụng"}</button></fieldset>{state.error&&<p role="alert" className="text-sm">{state.error}</p>}{state.message&&<p role="status" className="text-sm">{state.message}</p>}</form>;
}

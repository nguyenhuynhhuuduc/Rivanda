"use client";
import { useActionState } from "react";
import { handleReportAction } from "@/app/(light)/discovery/interaction-actions";
import { btnOutline,inputCls } from "@/components/ui/kit";
import { ActionFeedback } from "./Interactions";
export function ReportReview({id,revision,isComment}:{id:string;revision:number;isComment:boolean}){
  const[state,action,pending]=useActionState(handleReportAction,{});
  return <form action={action} className="mt-4 space-y-3"><input name="reportId" type="hidden" value={id}/><input name="revision" type="hidden" value={revision}/><fieldset disabled={pending} className="space-y-3"><label className="block space-y-2 text-sm"><span>Quyết định xử lý</span><select name="decision" className={inputCls}><option value="dismiss">Không vi phạm / đóng báo cáo</option>{isComment?<option value="hide_comment">Ẩn bình luận</option>:<><option value="hide_post">Ẩn bài viết</option><option value="remove_post">Gỡ bài viết</option></>}</select></label><label className="block space-y-2 text-sm"><span>Ghi nhận quyết định / lý do</span><textarea name="note" required maxLength={500} rows={3} className={inputCls}/></label><button className={btnOutline}>{pending?"Đang xử lý…":"Xử lý báo cáo"}</button></fieldset><ActionFeedback state={state}/></form>;
}

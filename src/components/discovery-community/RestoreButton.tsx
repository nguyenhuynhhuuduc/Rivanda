"use client";
import {useActionState} from "react";
import {restoreAction} from "@/app/(light)/discovery/lifecycle-actions";
import {btnOutline} from "@/components/ui/kit";
export function RestoreButton({id,revision,kind}:{id:string;revision:number;kind:"post"|"image"}){
  const[state,action,pending]=useActionState(restoreAction,{});
  return <form action={action} className="mt-3"><input name="id" type="hidden" value={id}/><input name="revision" type="hidden" value={revision}/><input name="kind" type="hidden" value={kind}/><button disabled={pending} className={btnOutline}>{pending?"Đang khôi phục…":kind==="post"?"Khôi phục về nháp":"Khôi phục ảnh"}</button>{state.error&&<p role="alert" className="mt-2 break-words text-sm">{state.error}</p>}</form>;
}

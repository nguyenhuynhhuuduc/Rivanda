"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { setFollow } from "@/lib/community";
import { CommunityError, idOf } from "@/lib/discovery-community/model";
import { notify } from "@/lib/notifications";
import { safeNext } from "@/lib/url";

export async function followAction(form: FormData): Promise<{following?:boolean;error?:string}> {
  let targetId:string;
  try { targetId=idOf(form.get("targetId")); }
  catch { return {error:"Thành viên không hợp lệ."}; }
  const operation=form.get("operation");
  if(operation!=="follow"&&operation!=="unfollow") return {error:"Thao tác không hợp lệ."};
  const user=await getCurrentUser();
  if(!user) redirect(`/login?next=${encodeURIComponent(safeNext(typeof form.get("returnTo")==="string" ? form.get("returnTo") as string : `/profile/${targetId}`))}`);
  try {
    const result=await setFollow(user.id,targetId,operation==="follow");
    if(result.following&&result.changed) await notify(targetId,"follow",`${user.displayName} đã bắt đầu theo dõi bạn.`,`/profile/${user.id}`);
    revalidatePath("/profile","layout");
    revalidatePath("/discovery","layout");
    revalidatePath("/account/discovery");
    return {following:result.following};
  } catch(error) { return {error:error instanceof CommunityError?error.message:"Chưa cập nhật được theo dõi. Vui lòng thử lại."}; }
}

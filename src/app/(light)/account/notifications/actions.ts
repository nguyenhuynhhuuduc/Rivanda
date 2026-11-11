"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { CommunityError, idOf } from "@/lib/discovery-community/model";
import { markNotificationsRead } from "@/lib/notifications";
export type NotificationState={error?:string;message?:string};
export async function readNotificationAction(_:NotificationState,form:FormData):Promise<NotificationState>{
  try{
    const user=await getCurrentUser();if(!user)throw new CommunityError("Hãy đăng nhập để quản lý thông báo.");
    const operation=form.get("operation");if(operation!=="one"&&operation!=="all")throw new CommunityError("Thao tác không hợp lệ.");
    await markNotificationsRead(user.id,operation==="one"?idOf(form.get("id")):null);
    revalidatePath("/","layout");
    return{message:operation==="all"?"Đã đánh dấu các thông báo hiện có là đã đọc.":"Đã đánh dấu thông báo là đã đọc."};
  }catch(e){return{error:e instanceof CommunityError?e.message:"Chưa cập nhật được thông báo. Vui lòng thử lại."};}
}

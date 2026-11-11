"use server";
import {getCurrentUser} from "@/lib/auth";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {CommunityError,idOf} from "@/lib/discovery-community/model";
import {restorePost,restoreMedia} from "@/lib/discovery-community/lifecycle";
export type LifecycleState={error?:string};
export async function restoreAction(_:LifecycleState,fd:FormData):Promise<LifecycleState>{
  let result:{postId:string;authorId:string},kind:string;
  try{const user=await getCurrentUser();if(!user)throw new CommunityError("Hãy đăng nhập để khôi phục.");const op=fd.get("kind");if(op!=="post"&&op!=="image")throw new CommunityError("Thao tác khôi phục không hợp lệ.");kind=op;result=op==="post"?await restorePost(user,idOf(fd.get("id")),fd.get("revision")):await restoreMedia(user,idOf(fd.get("id")),fd.get("revision"));}
  catch(e){return{error:e instanceof CommunityError?e.message:"Chưa khôi phục được; vui lòng thử lại sau."};}
  for(const p of ["/discovery","/account/discovery","/admin/discovery/trash",`/profile/${result.authorId}`,`/discovery/posts/${result.postId}`])revalidatePath(p);
  redirect(`/discovery/posts/${result.postId}?restored=${kind}`);
}

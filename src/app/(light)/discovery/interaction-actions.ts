"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { CommunityError, idOf } from "@/lib/discovery-community/model";
import { addComment, changeComment, handleReport, reportContent, setPostFlag } from "@/lib/discovery-community/interactions";
export type InteractionState={error?:string;message?:string;commentId?:string};
type Result={postId:string;authorId:string;commentId?:string;duplicate?:boolean};
async function mutate(work:(user:NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>)=>Promise<Result>,message:string):Promise<InteractionState>{
  try{
    const user=await getCurrentUser();if(!user)throw new CommunityError("Hãy đăng nhập bằng tài khoản đang hoạt động để tương tác.");
    const result=await work(user);
    for(const p of ["/discovery",`/discovery/posts/${result.postId}`,`/profile/${result.authorId}`,"/account/discovery","/admin/discovery","/admin/discovery/reports"])revalidatePath(p);
    return{message:result.duplicate?"Bạn đã báo cáo nội dung này. Không cần gửi lại trong 24 giờ.":message,commentId:result.commentId};
  }catch(e){return{error:e instanceof CommunityError?e.message:"Không thể xử lý lúc này. Vui lòng thử lại sau."};}
}
export async function flagAction(_:InteractionState,fd:FormData):Promise<InteractionState>{
  return mutate(async user=>{const op=fd.get("operation");if(typeof op!=="string"||!['like:on','like:off','save:on','save:off'].includes(op))throw new CommunityError("Tương tác không hợp lệ.");const[kind,value]=op.split(":");return setPostFlag(user,idOf(fd.get("postId")),kind,value==="on");},"Đã cập nhật tương tác.");
}
export async function addCommentAction(_:InteractionState,fd:FormData):Promise<InteractionState>{
  return mutate(user=>addComment(user,idOf(fd.get("postId")),fd.get("body"),fd.get("parentId")?idOf(fd.get("parentId")):null,idOf(fd.get("requestId"))),"Đã gửi bình luận.");
}
export async function changeCommentAction(_:InteractionState,fd:FormData):Promise<InteractionState>{
  return mutate(user=>{if(fd.get("operation")==="delete"&&fd.get("confirm")!=="yes")throw new CommunityError("Hãy xác nhận xóa bình luận.");return changeComment(user,idOf(fd.get("commentId")),fd.get("revision"),fd.get("operation"),fd.get("body"),fd.get("note"));},"Đã cập nhật bình luận.");
}
export async function reportAction(_:InteractionState,fd:FormData):Promise<InteractionState>{
  return mutate(user=>reportContent(user,fd.get("kind"),idOf(fd.get("targetId")),fd.get("reason")),"Đã gửi báo cáo tới Admin.");
}
export async function handleReportAction(_:InteractionState,fd:FormData):Promise<InteractionState>{
  const result=await mutate(user=>handleReport(user,idOf(fd.get("reportId")),fd.get("decision"),fd.get("note"),fd.get("revision")),"Đã ghi nhận quyết định xử lý báo cáo.");
  if(result.error)return result;redirect("/admin/discovery/reports?handled=1");
}

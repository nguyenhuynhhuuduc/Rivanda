"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCommunityPost } from "@/lib/discovery-community/read";
import { checkOwner } from "@/lib/discovery-community/db";
import { CommunityError, idOf, revisionOf, validateInput, type Kind, type PostInput } from "@/lib/discovery-community/model";
import { prepareMedia, validateFiles } from "@/lib/discovery-community/media";
import { deleteCommunityPost, moderateCommunityPost, saveCommunityPost } from "@/lib/discovery-community/store";
export type ActionState = { error?:string; message?:string };
function failure(e:unknown):ActionState{return{error:e instanceof CommunityError?e.message:"Không thể xử lý lúc này. Vui lòng thử lại sau."};}
function refresh(id:string,author:string){for(const path of ["/discovery",`/discovery/posts/${id}`,"/account/discovery","/admin/discovery",`/profile/${author}`])revalidatePath(path);}
export async function savePostAction(_:ActionState,fd:FormData):Promise<ActionState>{
  let id="",author="";
  try{
    const user=await getCurrentUser();if(!user)throw new CommunityError("Hãy đăng nhập trước khi đăng bài.");author=user.id;
    const rawId=fd.get("id"),postId=rawId?idOf(rawId):undefined,revision=postId?revisionOf(fd.get("revision")):undefined;
    if(postId){const old=await getCommunityPost(postId,user);if(!old)throw new CommunityError("Bài viết không khả dụng.");checkOwner({author_id:old.authorId,revision:old.revision},user,revision!);}
    const tags=fd.get("tags");if(typeof tags!=="string")throw new CommunityError("Hashtag không hợp lệ.");
    const input=validateInput({kind:fd.get("kind") as Kind,title:fd.get("title") as string,body:fd.get("body") as string,topicId:fd.get("topicId")||null,visibility:fd.get("visibility"),intent:fd.get("intent"),tags:tags.split(/[\s,]+/).filter(Boolean)} as PostInput);
    const keep=fd.getAll("keep").map(idOf),entries=fd.getAll("images");
    if(entries.some(f=>!(f instanceof File)))throw new CommunityError("Ảnh không hợp lệ.");
    const files=(entries as File[]).filter(f=>f.size>0);validateFiles(files);
    if(keep.length+files.length>4)throw new CommunityError("Tối đa 4 ảnh cho một bài.");
    // Ownership and all cheap validation precede image decoding/storage. Rechecked in the write transaction.
    const prepared=await prepareMedia(user,files);id=await saveCommunityPost(user,input,prepared,keep,postId,revision);
  }catch(e){return failure(e);}
  refresh(id,author);redirect(`/discovery/posts/${id}?saved=1`);
}
export async function deletePostAction(_:ActionState,fd:FormData):Promise<ActionState>{
  try{const user=await getCurrentUser();if(!user)throw new CommunityError("Hãy đăng nhập.");if(fd.get("confirm")!=="yes")throw new CommunityError("Hãy xác nhận xóa bài.");const id=idOf(fd.get("id"));await deleteCommunityPost(user,id,revisionOf(fd.get("revision")));refresh(id,user.id);}catch(e){return failure(e);}redirect("/account/discovery?deleted=1");
}
export async function moderatePostAction(_:ActionState,fd:FormData):Promise<ActionState>{
  try{const user=await getCurrentUser();if(!user||user.role!=="admin")throw new CommunityError("Chỉ Admin được kiểm duyệt.");const id=idOf(fd.get("id"));await moderateCommunityPost(user,id,revisionOf(fd.get("revision")),fd.get("decision"),fd.get("note"));revalidatePath("/discovery");revalidatePath(`/discovery/posts/${id}`);revalidatePath("/profile","layout");revalidatePath("/admin/discovery");return{message:"Đã cập nhật kiểm duyệt."};}catch(e){return failure(e);}
}

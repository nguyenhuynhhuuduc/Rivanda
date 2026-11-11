import { getCurrentUser } from "@/lib/auth";
import { notificationUnreadCount } from "@/lib/notifications";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
export async function GET(){
  try{const user=await getCurrentUser();if(!user)return Response.json({error:"Hãy đăng nhập."},{status:401,headers});return Response.json({unread:await notificationUnreadCount(user.id)},{headers});}
  catch{return Response.json({error:"Chưa tải được số thông báo."},{status:503,headers});}
}

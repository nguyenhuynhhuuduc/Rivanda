import { readFile } from "node:fs/promises";
import path from "node:path";
import { COVER_FILE,getProfileCoverFile } from "@/lib/profile";
import { UUID } from "@/lib/discovery-community/model";
import { PROFILE_COVER_DIR } from "@/lib/uploads";
export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const{id}=await params;if(!UUID.test(id))return new Response("Not found",{status:404});
  try{const file=await getProfileCoverFile(id);if(!file||!COVER_FILE.test(file))return new Response("Not found",{status:404});const bytes=await readFile(path.join(/*turbopackIgnore: true*/ PROFILE_COVER_DIR,file));return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}catch{return new Response("Not found",{status:404});}
}

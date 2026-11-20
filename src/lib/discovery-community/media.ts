import sharp from "sharp";
import { createHash,randomUUID } from "crypto";
import { UPLOAD_DIR } from "../uploads";
import { pool } from "../db";
import type { RowDataPacket } from "mysql2";
import { namespace,writeExclusive } from "./files.cjs";
import policy from "./retention.json";
import { CommunityError, type Actor, type PreparedMedia } from "./model";
import { lockActor, quota, transaction } from "./db";
import { reserveStorage, completeStorage } from "./storage";
export function validateFiles(files: File[]): void {
  if(files.length>8 || files.reduce((s,f)=>s+f.size,0)>40*1024*1024)throw new CommunityError("Tối đa 8 ảnh, tổng 40MB mỗi lần.");
  for(const f of files)if(!["image/jpeg","image/png","image/webp"].includes(f.type)||f.size<1||f.size>5*1024*1024)throw new CommunityError("Mỗi ảnh JPG/PNG/WebP tối đa 5MB.");
}
export async function prepareMedia(actor: Actor, files: File[]): Promise<PreparedMedia[]> {
  validateFiles(files); if(!files.length)return[];
  await transaction(async tx=>{const user=await lockActor(tx,actor);await quota(tx,user,"upload",files.length);});
  const encoded: {main:Buffer;thumb:Buffer;width:number;height:number}[]=[];
  for(const file of files){
    try{
      const buffer=Buffer.from(await file.arrayBuffer()),image=sharp(buffer,{limitInputPixels:16_000_000,animated:false}),meta=await image.metadata();
      if(!["jpeg","png","webp"].includes(meta.format??"")||!meta.width||!meta.height||meta.width>10000||meta.height>10000||(meta.pages??1)>1)throw Error("INVALID_IMAGE");
      const main=await image.rotate().resize({width:1800,withoutEnlargement:true}).webp({quality:82}).toBuffer();
      const thumb=await sharp(main).resize({width:720,withoutEnlargement:true}).webp({quality:78}).toBuffer(),dimensions=await sharp(main).metadata();
      if(main.length>5*1024*1024||thumb.length>5*1024*1024)throw Error("ENCODED_SIZE");
      encoded.push({main,thumb,width:dimensions.width!,height:dimensions.height!});
    }catch{throw new CommunityError("Không xử lý được ảnh. Chọn ảnh tĩnh hợp lệ, tối đa 16 triệu pixel.");}
  }
  const root=await namespace(pool,UPLOAD_DIR,true);
  const plans=encoded.flatMap(e=>[e.main,e.thumb].map(data=>({name:randomUUID()+'.webp',bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),data})));
  const batchId=await reserveStorage(actor,plans.reduce((sum,x)=>sum+x.bytes,0),plans);
  const output:PreparedMedia[]=[];
  try{
    for(const p of plans){
      try{await transaction(async tx=>{
        await lockActor(tx,actor);
        const [batches]=await tx.query<RowDataPacket[]>("SELECT lease_until>NOW(6) AS fresh,released_bytes,attached_post_id FROM community_upload_batches WHERE id=? AND owner_id=? FOR UPDATE",[batchId,actor.id]);
        const [files]=await tx.query<RowDataPacket[]>("SELECT state FROM community_storage_files WHERE file_name=? AND batch_id=? FOR UPDATE",[p.name,batchId]);
        if(!batches[0]?.fresh||Number(batches[0]?.released_bytes)||batches[0]?.attached_post_id||files[0]?.state!=="reserved")throw new CommunityError("Phiên upload đã hết hạn.");
        await tx.query("UPDATE community_upload_batches SET lease_until=DATE_ADD(NOW(6),INTERVAL ? MINUTE) WHERE id=?",[policy.leaseMinutes,batchId]);
        await writeExclusive(root,p.name,p.data);
        await tx.query("UPDATE community_storage_files SET state='stored',stored_at=NOW(6) WHERE file_name=?",[p.name]);
      });}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')await pool.query("UPDATE community_storage_files SET last_error='COLLISION' WHERE file_name=? AND owner_id=?",[p.name,actor.id]);throw e;}
    }
    for(const [i,e] of encoded.entries()){
      const imageFile=plans[i*2].name,thumbFile=plans[i*2+1].name;
      output.push({imageFile,thumbFile,byteSize:e.main.length,width:e.width,height:e.height,batchId});
    }
    await completeStorage(actor,batchId,output);return output;
  }catch{throw new CommunityError("Không lưu được ảnh. Dung lượng đã giữ chỗ để tránh vượt quota; không có tệp cũ nào bị xóa.");}
}

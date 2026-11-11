import { randomUUID,createHash } from "crypto";
import {lstat,readFile} from "fs/promises";
import {UPLOAD_DIR} from "../uploads";
import {namespace,filePath} from "./files.cjs";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "../db";
import { CommunityError, type Actor, type PreparedMedia, idOf } from "./model";
import { lockActor, transaction } from "./db";
import policy from "./retention.json";
export const STORAGE_LIMIT = policy.storageLimit;
export type StoragePlan={name:string;bytes:number;sha256:string};
export async function storageUsage(actor:Actor) {
  return transaction(async tx=>{await lockActor(tx,actor);const [[r]]=await tx.query<RowDataPacket[]>("SELECT COALESCE(SUM(byte_size-released_bytes),0) AS used FROM community_upload_batches WHERE owner_id=?",[actor.id]);return{used:Number(r.used),limit:STORAGE_LIMIT};});
}
export async function reserveStorage(actor:Actor,bytes:number,files?:StoragePlan[]) {
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>STORAGE_LIMIT)throw new CommunityError("Dung lượng ảnh không hợp lệ.");
  if(files&&(!files.length||files.length>8||new Set(files.map(f=>f.name)).size!==files.length||files.reduce((n,f)=>n+f.bytes,0)!==bytes||files.some(f=>!/^[-a-f0-9]{36}\.webp$/.test(f.name)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>5*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256))))throw new CommunityError("Sổ tệp ảnh không hợp lệ.");
  return transaction(async tx=>{
    const user=await lockActor(tx,actor);
    const [[r]]=await tx.query<RowDataPacket[]>("SELECT COALESCE(SUM(byte_size-released_bytes),0) AS used FROM community_upload_batches WHERE owner_id=?",[user.id]);
    if(Number(r.used)+bytes>STORAGE_LIMIT)throw new CommunityError("Đã vượt quota 100 MiB ảnh Discovery của tài khoản (gồm ảnh thu nhỏ và dung lượng đã giữ chỗ).");
    const id=randomUUID();await tx.query("INSERT INTO community_upload_batches(id,owner_id,byte_size,inventory_complete,lease_until,purge_after) VALUES(?,?,?,?,DATE_ADD(NOW(6),INTERVAL ? MINUTE),DATE_ADD(NOW(6),INTERVAL ? HOUR))",[id,user.id,bytes,files?1:0,policy.leaseMinutes,policy.orphanHours]);
    for(const f of files??[])await tx.query("INSERT INTO community_storage_files(file_name,batch_id,owner_id,byte_size,sha256,delete_after) VALUES(?,?,?,?,?,DATE_ADD(NOW(6),INTERVAL ? HOUR))",[f.name,id,user.id,f.bytes,f.sha256,policy.orphanHours]);
    return id;
  });
}
export async function completeStorage(actor:Actor,id:string,manifest:PreparedMedia[]) {
  // Uninventoried reservations remain conservative; the cleanup worker never guesses their paths.
  const [result]=await pool.query("UPDATE community_upload_batches SET manifest=? WHERE id=? AND owner_id=? AND manifest IS NULL",[JSON.stringify(manifest),idOf(id),actor.id]);
  if((result as {affectedRows:number}).affectedRows!==1)throw new CommunityError("Không hoàn tất được ghi nhận dung lượng ảnh.");
}
const signature=(m:PreparedMedia)=>[m.imageFile,m.thumbFile,m.byteSize,m.width,m.height,m.batchId];
export async function verifyStoredFiles(tx:PoolConnection,owner:string,names:string[]){
  if(!names.length)return;
  const [files]=await tx.query<RowDataPacket[]>("SELECT file_name,state,byte_size,sha256 FROM community_storage_files WHERE owner_id=? AND file_name IN (?) FOR UPDATE",[owner,names]);
  if(files.length!==new Set(names).size||files.some(f=>f.state!=="stored"))throw new CommunityError("Ảnh đang/đã bị xóa hoặc chưa sẵn sàng để khôi phục.");
  try{const root=await namespace(tx,UPLOAD_DIR,false);for(const f of files){const file=filePath(root,f.file_name),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==Number(f.byte_size)||createHash('sha256').update(await readFile(file)).digest('hex')!==f.sha256)throw Error('INTEGRITY');}}
  catch{throw new CommunityError("Tệp ảnh bị thiếu hoặc không toàn vẹn; cần kiểm tra storage trước khi khôi phục.");}
}
export async function attachUpload(tx:PoolConnection,actor:Actor,media:PreparedMedia[],postId:string) {
  if(!media.length)return;
  const batchId=idOf(media[0].batchId);
  if(media.some(m=>m.batchId!==batchId))throw new CommunityError("Bộ ảnh không hợp lệ.");
  const [rows]=await tx.query<RowDataPacket[]>("SELECT manifest,attached_post_id,inventory_complete,released_bytes,purge_after>NOW(6) AS fresh FROM community_upload_batches WHERE id=? AND owner_id=? FOR UPDATE",[batchId,actor.id]);
  const batch=rows[0];if(!batch||batch.attached_post_id||!batch.manifest||!batch.fresh||Number(batch.released_bytes))throw new CommunityError("Ảnh không thuộc tài khoản, đã được sử dụng hoặc đã hết hạn.");
  const manifest=typeof batch.manifest==="string"?JSON.parse(batch.manifest):batch.manifest;
  if(!Array.isArray(manifest)||JSON.stringify(manifest.map(signature))!==JSON.stringify(media.map(signature)))throw new CommunityError("Thông tin bộ ảnh không khớp.");
  if(!batch.inventory_complete)throw new CommunityError("Bộ ảnh chưa được kiểm kê đầy đủ.");
  const names=media.flatMap(m=>[m.imageFile,m.thumbFile]);
  const [files]=await tx.query<RowDataPacket[]>("SELECT file_name,state,last_error FROM community_storage_files WHERE batch_id=? AND owner_id=? FOR UPDATE",[batchId,actor.id]);
  if(files.length!==names.length||names.some(name=>!files.some(f=>f.file_name===name&&f.state==='stored'&&!f.last_error)))throw new CommunityError("Tệp ảnh chưa sẵn sàng hoặc đang chờ xóa.");
  await tx.query("UPDATE community_storage_files SET delete_after=NULL WHERE batch_id=?",[batchId]);
  await tx.query("UPDATE community_upload_batches SET attached_post_id=? WHERE id=? AND owner_id=? AND attached_post_id IS NULL",[postId,batchId,actor.id]);
}

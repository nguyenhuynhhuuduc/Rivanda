import { createHash } from "node:crypto";
import { cache } from "react";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "./db";
import { updateProfile } from "./users";
import { CommunityError, idOf, textOf } from "./discovery-community/model";
type Queryable=Pick<PoolConnection,"query">;
export const COVER_FILE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/;
async function ready(db:Queryable){
  const[cols]=await db.query<RowDataPacket[]>("SELECT TABLE_NAME t,COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME='users' AND COLUMN_NAME='profile_cover_file' OR TABLE_NAME='profile_schema_state')");
  const set=new Set(cols.map(r=>`${r.t}.${r.c}`));if(!set.has('users.profile_cover_file')||!['singleton_id','migration_version','application_revision'].every(c=>set.has('profile_schema_state.'+c)))return false;
  const[state]=await db.query<RowDataPacket[]>('SELECT migration_version,application_revision FROM profile_schema_state WHERE singleton_id=1');return state[0]?.migration_version===10&&state[0]?.application_revision===1;
}
const requestReady=cache(()=>ready(pool));
export function profileCoverReady(db?:Queryable){return db?ready(db):requestReady();}
const fields=(cover:boolean)=>`id,first_name,last_name,avatar_url,bio,is_active${cover?',profile_cover_file':''}`;
const version=(row:RowDataPacket)=>createHash('sha256').update(JSON.stringify([row.first_name,row.last_name,row.bio??null,row.avatar_url??null,row.profile_cover_file??null])).digest('hex');
export async function getProfileSettings(userId:string){
  idOf(userId);const coverSupported=await profileCoverReady(),[rows]=await pool.query<RowDataPacket[]>(`SELECT ${fields(coverSupported)} FROM users WHERE id=? AND is_active=1`,[userId]);const r=rows[0];if(!r)return null;
  return{firstName:r.first_name as string,lastName:r.last_name as string,avatarUrl:r.avatar_url as string|null,bio:r.bio as string|null,coverSupported,coverUrl:coverSupported&&r.profile_cover_file&&COVER_FILE.test(r.profile_cover_file)?`/api/profile/${userId}/cover`:null,version:version(r)};
}
export async function getProfileCoverFile(userId:string):Promise<string|null>{
  idOf(userId);if(!await profileCoverReady())return null;const[rows]=await pool.query<RowDataPacket[]>('SELECT profile_cover_file FROM users WHERE id=? AND is_active=1',[userId]);const file=rows[0]?.profile_cover_file;return typeof file==='string'&&COVER_FILE.test(file)?file:null;
}
export type ProfileInput={firstName:string;lastName:string;bio:string;version:string;coverChange:boolean};
export async function saveProfileDetails(userId:string,input:ProfileInput,prepare:()=>Promise<{avatarUrl?:string|null;coverFile?:string|null}>){
  idOf(userId);const firstName=textOf(input.firstName,60,true),lastName=textOf(input.lastName,60),bio=textOf(input.bio,500);if(!/^[a-f0-9]{64}$/.test(input.version)||typeof input.coverChange!=='boolean')throw new CommunityError('Hồ sơ đã thay đổi. Hãy tải lại trước khi lưu.');
  const tx=await pool.getConnection();try{await tx.beginTransaction();const supported=await profileCoverReady(tx);if(input.coverChange&&!supported)throw new CommunityError('Ảnh bìa chưa được kích hoạt trên môi trường này.');
    const[rows]=await tx.query<RowDataPacket[]>(`SELECT ${fields(supported)} FROM users WHERE id=? FOR UPDATE`,[userId]);const row=rows[0];if(!row?.is_active)throw new CommunityError('Tài khoản không khả dụng.');if(version(row)!==input.version)throw new CommunityError('Hồ sơ đã thay đổi. Hãy tải lại, không ghi đè phiên bản mới.');
    const media=await prepare();if(media.coverFile!==undefined&&!input.coverChange)throw new CommunityError('Yêu cầu ảnh bìa không hợp lệ.');if(media.coverFile!==undefined&&media.coverFile!==null&&!COVER_FILE.test(media.coverFile))throw new CommunityError('Ảnh bìa không hợp lệ.');
    if(media.avatarUrl!==undefined&&media.avatarUrl!==null&&!/^\/uploads\/[a-f0-9-]{36}\.webp$/.test(media.avatarUrl))throw new CommunityError('Ảnh đại diện không hợp lệ.');
    await updateProfile(userId,{firstName,lastName,bio:bio||null,avatarUrl:media.avatarUrl},tx);
    if(media.coverFile!==undefined)await tx.query('UPDATE users SET profile_cover_file=? WHERE id=?',[media.coverFile,userId]);await tx.commit();
  }catch(e){await tx.rollback();throw e;}finally{tx.release();}
}

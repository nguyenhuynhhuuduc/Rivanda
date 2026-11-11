// Opt-in worker, never imported by a page or scheduled automatically.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {namespace,filePath,policy}=require('../src/lib/discovery-community/files.cjs');
const protectedPost=(p='p')=>`(${p}.moderation_hold=1 OR ${p}.status IN ('pending','hidden','rejected') OR (${p}.status='deleted' AND (${p}.restore_status IN ('pending','hidden','rejected') OR (${p}.purge_started_at IS NULL AND ${p}.deleted_at>DATE_SUB(NOW(6),INTERVAL ${policy.softDeleteDays} DAY)))) OR EXISTS(SELECT 1 FROM community_reports r LEFT JOIN community_comments c ON c.id=r.comment_id WHERE r.status='open' AND (r.post_id=${p}.id OR c.post_id=${p}.id)))`;
const oldPost=`p.status='deleted' AND p.purge_started_at IS NULL AND p.purged_at IS NULL AND p.deleted_at<=DATE_SUB(NOW(6),INTERVAL ${policy.softDeleteDays} DAY) AND NOT ${protectedPost()}`;
const oldMedia=`m.removed_at IS NOT NULL AND m.purge_after<=NOW(6) AND NOT ${protectedPost()}`;
const noRefs="NOT EXISTS(SELECT 1 FROM community_media m WHERE m.image_file=f.file_name OR m.thumb_file=f.file_name OR m.medium_file=f.file_name)";
const fileEligible=`f.state<>'deleted' AND f.delete_after<=NOW(6) AND (f.last_error IS NULL OR f.last_error<>'COLLISION') AND b.inventory_complete=1 AND b.lease_until<=NOW(6) AND (f.gc_lease_until IS NULL OR f.gc_lease_until<=NOW(6)) AND (b.attached_post_id IS NULL OR NOT ${protectedPost()}) AND ${noRefs}`;
async function tx(pool,fn){const c=await pool.getConnection();try{await c.beginTransaction();const r=await fn(c);await c.commit();return r;}catch(e){await c.rollback();throw e;}finally{c.release();}}
async function lockOwner(c,id){const [r]=await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[id]);if(!r[0])throw Error('STORAGE_OWNER_MISSING');}
async function event(c,p,decision){await c.query('INSERT INTO community_review_events(id,post_id,actor_id,revision,decision,note) VALUES(?,?,NULL,?,?,?)',[randomUUID(),p.id,Number(p.revision)+1,decision,'Vòng đời ảnh Discovery theo chính sách lưu giữ.']);}
async function guard(pool,uploadDir,target){
  if(policy.orphanHours<48||policy.softDeleteDays<30||policy.leaseMinutes<1)throw Error('UNSAFE_RETENTION_POLICY');
  const [[db]]=await pool.query('SELECT DATABASE() AS db');if(!target||db.db!==target)throw Error('CLEANUP_TARGET_MISMATCH');
  const [[state]]=await pool.query('SELECT migration_version,application_revision FROM community_schema_state WHERE singleton_id=1');
  if(state?.migration_version!==7||state.application_revision!==3)throw Error('CLEANUP_SCHEMA_NOT_READY');
  return namespace(pool,uploadDir,false);
}
async function runCleanup({pool,uploadDir,target,apply=false,limit=50,hooks={}}){
  if(typeof apply!=='boolean')throw Error('EXPLICIT_BOOLEAN_MODE_REQUIRED');
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_CLEANUP_LIMIT');
  const root=await guard(pool,uploadDir,target);
  const report={dryRun:!apply,postsReady:0,mediaReady:0,filesReady:0,postsFenced:0,mediaRetired:0,filesDeleted:0,bytesReleased:0,postsPurged:0,blocked:0,errors:0};
  const [posts]=await pool.query(`SELECT p.id,p.author_id FROM community_posts p WHERE ${oldPost} ORDER BY p.deleted_at,p.id LIMIT ?`,[limit]);
  const [media]=await pool.query(`SELECT m.id,m.post_id,m.owner_id FROM community_media m JOIN community_posts p ON p.id=m.post_id WHERE ${oldMedia} ORDER BY m.purge_after,m.id LIMIT ?`,[limit]);
  const filesQuery=`SELECT f.file_name,f.owner_id,b.attached_post_id FROM community_storage_files f JOIN community_upload_batches b ON b.id=f.batch_id LEFT JOIN community_posts p ON p.id=b.attached_post_id WHERE ${fileEligible} ORDER BY f.delete_after,f.file_name LIMIT ?`;
  report.postsReady=posts.length;report.mediaReady=media.length;
  if(!apply){report.filesReady=(await pool.query(filesQuery,[limit]))[0].length;return report;}
  // Retire references before unlink. A purging post cannot be restored.
  for(const item of posts)await tx(pool,async c=>{
    await lockOwner(c,item.author_id);const [locked]=await c.query('SELECT * FROM community_posts WHERE id=? FOR UPDATE',[item.id]);
    const [eligible]=await c.query(`SELECT p.id FROM community_posts p WHERE p.id=? AND ${oldPost}`,[item.id]);if(!eligible.length)return;
    await c.query('UPDATE community_posts SET purge_started_at=NOW(6),revision=revision+1 WHERE id=?',[item.id]);await event(c,locked[0],'purge_started');
    await c.query('UPDATE community_storage_files f JOIN community_media m ON m.image_file=f.file_name OR m.thumb_file=f.file_name OR m.medium_file=f.file_name SET f.delete_after=NOW(6) WHERE m.post_id=? AND f.state<>\'deleted\'',[item.id]);
    await c.query('DELETE FROM community_media WHERE post_id=?',[item.id]);report.postsFenced++;
  });
  for(const item of media)await tx(pool,async c=>{
    await lockOwner(c,item.owner_id);await c.query('SELECT id FROM community_posts WHERE id=? FOR UPDATE',[item.post_id]);
    const [locked]=await c.query('SELECT id FROM community_media WHERE id=? FOR UPDATE',[item.id]);if(!locked.length)return;
    const [eligible]=await c.query(`SELECT m.id FROM community_media m JOIN community_posts p ON p.id=m.post_id WHERE m.id=? AND ${oldMedia}`,[item.id]);if(!eligible.length)return;
    await c.query('DELETE FROM community_media WHERE id=?',[item.id]);report.mediaRetired++;
  });
  const [files]=await pool.query(filesQuery,[limit]);report.filesReady=files.length;
  for(const item of files){
    const claim=await tx(pool,async c=>{
      await lockOwner(c,item.owner_id);if(item.attached_post_id)await c.query('SELECT id FROM community_posts WHERE id=? FOR UPDATE',[item.attached_post_id]);
      const [batches]=await c.query('SELECT b.* FROM community_upload_batches b JOIN community_storage_files f ON f.batch_id=b.id WHERE f.file_name=? FOR UPDATE',[item.file_name]);
      if(!batches[0]||batches[0].attached_post_id!==item.attached_post_id)return null;
      const [locked]=await c.query('SELECT * FROM community_storage_files WHERE file_name=? FOR UPDATE',[item.file_name]);
      const [eligible]=await c.query(`SELECT f.file_name FROM community_storage_files f JOIN community_upload_batches b ON b.id=f.batch_id LEFT JOIN community_posts p ON p.id=b.attached_post_id WHERE f.file_name=? AND ${fileEligible}`,[item.file_name]);if(!eligible.length)return null;
      const token=randomUUID();await c.query("UPDATE community_storage_files SET state='deleting',gc_token=?,gc_lease_until=DATE_ADD(NOW(6),INTERVAL ? MINUTE),last_error=NULL WHERE file_name=?",[token,policy.leaseMinutes,item.file_name]);return{...locked[0],token};
    });
    if(!claim){report.blocked++;continue;}
    try{
      // Repeat namespace guard before any filesystem deletion, never follow symlinks.
      if(await guard(pool,uploadDir,target)!==root)throw Error('STORAGE_ROOT_CHANGED');
      const file=filePath(root,claim.file_name);
      try{
        const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('UNSAFE_FILE_TYPE');
        if(stat.size>Number(claim.byte_size))throw Error('FILE_INTEGRITY');
        if(claim.stored_at&&(stat.size!==Number(claim.byte_size)||createHash('sha256').update(await fs.readFile(file)).digest('hex')!==claim.sha256))throw Error('FILE_INTEGRITY');
        if(hooks.unlink)await hooks.unlink(file);else await fs.unlink(file);
      }catch(e){if(e.code!=='ENOENT')throw e;}
      if(hooks.beforeFinalize)await hooks.beforeFinalize(claim);
      const released=await tx(pool,async c=>{
        await lockOwner(c,claim.owner_id);await c.query('SELECT id FROM community_upload_batches WHERE id=? FOR UPDATE',[claim.batch_id]);
        const [rows]=await c.query('SELECT state,gc_token FROM community_storage_files WHERE file_name=? FOR UPDATE',[claim.file_name]);
        if(rows[0]?.state!=='deleting'||rows[0].gc_token!==claim.token)return false;
        await c.query("UPDATE community_storage_files SET state='deleted',deleted_at=NOW(6),gc_lease_until=NULL,last_error=NULL WHERE file_name=?",[claim.file_name]);
        await c.query('UPDATE community_upload_batches SET released_bytes=released_bytes+? WHERE id=?',[claim.byte_size,claim.batch_id]);return true;
      });
      if(released){report.filesDeleted++;report.bytesReleased+=Number(claim.byte_size);}
    }catch(e){report.errors++;const code=['UNSAFE_FILE_TYPE','FILE_INTEGRITY','STORAGE_ROOT_CHANGED'].includes(e.message)?e.message:e.code==='EACCES'?'EACCES':'IO_OR_COMMIT_FAILED';await pool.query('UPDATE community_storage_files SET last_error=? WHERE file_name=? AND gc_token=? AND state=\'deleting\'',[code,claim.file_name,claim.token]);}
  }
  const [pending]=await pool.query("SELECT id,author_id FROM community_posts WHERE purge_started_at IS NOT NULL AND purged_at IS NULL LIMIT ?",[limit]);
  for(const p of pending)await tx(pool,async c=>{
    await lockOwner(c,p.author_id);const [rows]=await c.query('SELECT * FROM community_posts WHERE id=? FOR UPDATE',[p.id]);if(rows[0].purged_at)return;
    const [[left]]=await c.query('SELECT COALESCE(SUM(byte_size-released_bytes),0) AS bytes FROM community_upload_batches WHERE attached_post_id=?',[p.id]);
    const [[refs]]=await c.query('SELECT COUNT(*) AS n FROM community_media WHERE post_id=?',[p.id]);if(Number(left.bytes)||refs.n)return;
    await c.query('UPDATE community_posts SET purged_at=NOW(6),revision=revision+1 WHERE id=?',[p.id]);await event(c,rows[0],'purged');report.postsPurged++;
  });
  return report;
}
module.exports={runCleanup,protectedPost};
if(require.main===module){
  (async()=>{let pool;try{
    const args=process.argv.slice(2),value=name=>args.find(x=>x.startsWith(name+'='))?.slice(name.length+1),target=value('--target'),uploadDir=value('--storage-root');
    if(args.some(x=>!['--apply','--dry-run'].includes(x)&&!/^--(target|storage-root|limit)=/.test(x))||!target||target!==process.env.DB_NAME||!uploadDir||!process.env.UPLOAD_DIR||path.resolve(uploadDir)!==path.resolve(process.env.UPLOAD_DIR))throw Error('EXPLICIT_TARGET_AND_STORAGE_ROOT_REQUIRED');
    if(args.includes('--apply')&&args.includes('--dry-run'))throw Error('AMBIGUOUS_MODE');
    const mysql=require('mysql2/promise');pool=mysql.createPool({host:process.env.DB_HOST??'127.0.0.1',port:Number(process.env.DB_PORT??3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:target,connectionLimit:3});
    const result=await runCleanup({pool,uploadDir,target,apply:args.includes('--apply'),limit:Number(value('--limit')??50)});console.log(JSON.stringify(result));if(result.errors)process.exitCode=1;
  }catch{console.error('DISCOVERY_CLEANUP_FAILED: kiểm tra target, schema revision 3, namespace/marker và quyền filesystem. Không in cấu hình bí mật.');process.exitCode=1;}finally{await pool?.end();}})();
}

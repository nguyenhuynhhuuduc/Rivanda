// Opt-in isolated MySQL only. Never reads .env or connects to the application DB.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { randomUUID } = require('node:crypto');
const {createHash}=require('node:crypto');
const { discoveryLoader, root } = require('./helpers/discovery-loader.cjs');
const {runCleanup}=require('../scripts/discovery-media-cleanup.cjs');
const adapter=require('../src/lib/discovery-community/files.cjs');
const enabled = process.env.DISCOVERY_QA_ROOT;
let pool, store, read, db, model, media, cursor, social, discussion, storage,lifecycle,qaDatabase;
const actors = Array.from({length:5}, (_,i)=>({id:`71000000-0000-4000-8000-00000000000${i+1}`,role:i===0?'admin':'member'}));
const [admin,alice,bob,inactive] = actors;
const input = (extra={})=>({kind:'status',title:'',body:'Một chia sẻ tổng hợp QA',topicId:null,visibility:'public',intent:'publish',tags:[],...extra});
const qa = (name, fn)=>test(name,{skip:!enabled},fn);
before(async()=>{
  if(!enabled)return;
  const expected=path.resolve(enabled,'mysql-data').replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
  const conn=await mysql.createConnection({host:'127.0.0.1',port:3321,user:'root'});
  const [[server]]=await conn.query('SELECT @@port AS port,@@datadir AS dir');
  assert.equal(Number(server.port),3321);assert.equal(server.dir.replaceAll('\\','/').replace(/\/$/,'').toLowerCase(),expected);
  const name=`discovery007_test_${Date.now()}`;qaDatabase=name;process.env.DISCOVERY_QA_UPLOAD_DIR=path.join(enabled,'storage-'+name);await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await conn.changeUser({database:name});
  for(const sql of JSON.parse(fs.readFileSync(path.join(enabled,'base-schema.json'),'utf8')))await conn.query(sql);
  for(const [i,a]of actors.entries())await conn.query('INSERT INTO users(id,email,first_name,role,is_active) VALUES(?,?,?,?,?)',[a.id,`qa-${i}@example.invalid`,`QA ${i}`,a.role,i===3?0:1]);
  await conn.query("INSERT INTO tags(name,slug) VALUES('Existing sentinel','existing-sentinel')");
  const sql=fs.readFileSync(path.join(root,'sql/planned/007_discovery_community.sql'),'utf8').replace(/^--.*$/gm,'');
  try{for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await conn.query(statement);}catch(e){await conn.rollback();await conn.end();throw e;}
  await conn.end();pool=mysql.createPool({host:'127.0.0.1',port:3321,user:'root',database:name,connectionLimit:10});
  fs.writeFileSync(path.join(enabled,'qa-database.txt'),name);
  const load=discoveryLoader(pool);store=load('src/lib/discovery-community/store.ts');read=load('src/lib/discovery-community/read.ts');db=load('src/lib/discovery-community/db.ts');model=load('src/lib/discovery-community/model.ts');media=load('src/lib/discovery-community/media.ts');cursor=load('src/lib/discovery-community/cursor.ts');social=load('src/lib/discovery-community/interactions.ts');discussion=load('src/lib/discovery-community/discussion-read.ts');storage=load('src/lib/discovery-community/storage.ts');lifecycle=load('src/lib/discovery-community/lifecycle.ts');
});
after(async()=>{if(pool)await pool.end();});
async function registeredFile(actor,bytes=10,thumbBytes=bytes){const file={imageFile:randomUUID()+'.webp',thumbFile:randomUUID()+'.webp',byteSize:bytes,width:10,height:10};const plans=[[file.imageFile,bytes],[file.thumbFile,thumbBytes]].map(([name,n])=>({name,bytes:n,sha256:createHash('sha256').update(Buffer.alloc(n)).digest('hex')}));file.batchId=await storage.reserveStorage(actor,bytes+thumbBytes,plans);await pool.query("UPDATE community_storage_files SET state='stored',stored_at=NOW(6) WHERE batch_id=?",[file.batchId]);await storage.completeStorage(actor,file.batchId,[file]);return file;}
async function freshOwner(){const a={id:randomUUID(),role:'admin'};await pool.query('INSERT INTO users(id,email,first_name,role) VALUES(?,?,?,?)',[a.id,`storage-${a.id}@example.invalid`,'Storage QA','admin']);return a;}
async function realMedia(a,count=1){const bytes=await require('sharp')({create:{width:96,height:64,channels:3,background:'#234567'}}).png().toBuffer();return media.prepareMedia(a,Array.from({length:count},()=>new File([bytes],'qa.png',{type:'image/png'})));}
async function expireBatch(id){await pool.query('UPDATE community_upload_batches SET lease_until=DATE_SUB(NOW(6),INTERVAL 3 DAY),purge_after=DATE_SUB(NOW(6),INTERVAL 1 DAY) WHERE id=?',[id]);await pool.query('UPDATE community_storage_files SET delete_after=DATE_SUB(NOW(6),INTERVAL 1 DAY),gc_lease_until=NULL WHERE batch_id=?',[id]);}
const cleanup=opts=>runCleanup({pool,target:qaDatabase,uploadDir:process.env.DISCOVERY_QA_UPLOAD_DIR,...opts});
qa('007 standalone: complete marker, no Blog/006, preserves existing data',async()=>{
  assert.equal(await read.communityReady(),true);assert.equal((await read.communityTopics()).length,3);
  const [[r]]=await pool.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME LIKE 'blog_%' OR TABLE_NAME='content_rate_buckets')");assert.equal(r.n,0);
  const [[tag]]=await pool.query("SELECT name FROM tags WHERE slug='existing-sentinel'");assert.equal(tag.name,'Existing sentinel');
});
qa('incomplete migration fails closed for reads and writes',async()=>{
  await pool.query('DELETE FROM community_schema_state');try{assert.equal(await read.communityReady(),false);await assert.rejects(()=>store.saveCommunityPost(alice,input(),[],[]),/007/);}finally{await pool.query('INSERT INTO community_schema_state(singleton_id,migration_version) VALUES(1,7)');}
});
qa('create publishes, draft/private excluded; ownership and active account enforced',async()=>{
  const id=await store.saveCommunityPost(alice,input({tags:['hello']}),[],[]);assert.equal((await read.getCommunityPost(id)).authorId,alice.id);
  await assert.rejects(()=>store.saveCommunityPost(bob,input(),[],[],id,1),/của mình/);await assert.rejects(()=>store.deleteCommunityPost(bob,id,1),/của mình/);
  await assert.rejects(()=>store.saveCommunityPost(inactive,input(),[],[]),/không có quyền/);
  for(const extra of [{intent:'draft',kind:'article',title:'',body:''},{visibility:'private'}]){const hidden=await store.saveCommunityPost(alice,input(extra),[],[]);assert.equal(await read.getCommunityPost(hidden),null);assert.ok(await read.getCommunityPost(hidden,alice));assert.equal(await read.getCommunityPost(hidden,bob),null);}
});
qa('concurrent edits: exactly one wins, stale edit never overwrites',async()=>{
  const id=await store.saveCommunityPost(bob,input(),[],[]);const results=await Promise.allSettled(['one','two'].map(body=>store.saveCommunityPost(bob,input({body}),[],[],id,1)));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await read.getCommunityPost(id)).revision,2);
});
qa('untitled article draft remains deletable and can be hidden by Admin',async()=>{
  const draft=()=>store.saveCommunityPost(admin,input({kind:'article',title:'',body:'',intent:'draft'}),[],[]);
  const deleted=await draft();await store.deleteCommunityPost(admin,deleted,1);assert.equal(await read.getCommunityPost(deleted,admin),null);
  const hidden=await draft();await store.moderateCommunityPost(admin,hidden,1,'hide','QA draft');assert.equal((await read.getCommunityPost(hidden,admin)).status,'hidden');
  await assert.rejects(()=>pool.query("UPDATE community_posts SET status='published' WHERE id=?",[hidden]));
});
qa('Admin hide cannot be bypassed by draft/publish; role rechecked from DB',async()=>{
  const id=await store.saveCommunityPost(bob,input(),[],[]);await assert.rejects(()=>store.moderateCommunityPost({...alice,role:'admin'},id,1,'hide','vi phạm'),/không có quyền/);
  await store.moderateCommunityPost(admin,id,1,'hide','QA lý do');assert.equal(await read.getCommunityPost(id),null);
  await store.saveCommunityPost(bob,input({intent:'draft'}),[],[],id,2);await store.saveCommunityPost(bob,input(),[],[],id,3);assert.equal((await read.getCommunityPost(id,bob)).status,'pending');
  await store.moderateCommunityPost(admin,id,4,'approve','');assert.equal((await read.getCommunityPost(id)).status,'published');
});
qa('transaction rollback preserves post/media/tags/revision on failed tag write',async()=>{
  const id=await store.saveCommunityPost(admin,input({tags:['before']}),[],[]);
  const faulty={query:pool.query.bind(pool),getConnection:async()=>{const tx=await pool.getConnection();return new Proxy(tx,{get(target,key){if(key==='query')return async(sql,...args)=>{if(sql.startsWith('INSERT INTO tags'))throw Error('QA_INJECTED_FAILURE');return target.query(sql,...args);};const x=target[key];return typeof x==='function'?x.bind(target):x;}});}};
  const broken=discoveryLoader(faulty)('src/lib/discovery-community/store.ts');await assert.rejects(()=>broken.saveCommunityPost(admin,input({body:'changed',tags:['after']}),[],[],id,1),/QA_INJECTED/);
  const p=await read.getCommunityPost(id);assert.equal(p.body,input().body);assert.equal(p.revision,1);assert.deepEqual([...p.tags],['before']);
});
qa('SQL CHECK/FK/UNIQUE enforce content, media ownership and interactions',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]),other=await store.saveCommunityPost(admin,input(),[],[]);
  await assert.rejects(()=>pool.query('UPDATE community_posts SET revision=0 WHERE id=?',[id]));
  await assert.rejects(()=>pool.query("UPDATE community_posts SET kind='status',body=? WHERE id=?",['x'.repeat(1001),id]));
  const m=randomUUID();await assert.rejects(()=>pool.query("INSERT INTO community_media(id,post_id,owner_id,image_file,mime_type,byte_size,width,height,sort_order) VALUES(?,?,?,'x.webp','image/webp',1,1,1,0)",[m,id,bob.id]));
  for(const table of ['community_likes','community_saves']){await pool.query(`INSERT INTO ${table}(user_id,post_id) VALUES(?,?)`,[alice.id,id]);await assert.rejects(()=>pool.query(`INSERT INTO ${table}(user_id,post_id) VALUES(?,?)`,[alice.id,id]));}
  const comment=randomUUID();await pool.query('INSERT INTO community_comments(id,post_id,user_id,body) VALUES(?,?,?,?)',[comment,id,alice.id,'QA']);await assert.rejects(()=>pool.query('INSERT INTO community_comments(id,post_id,parent_id,user_id,body) VALUES(?,?,?,?,?)',[randomUUID(),other,comment,bob.id,'cross-post']));
  await pool.query('INSERT INTO community_reports(id,reporter_id,post_id,reason) VALUES(?,?,?,?)',[randomUUID(),alice.id,id,'QA']);await assert.rejects(()=>pool.query('INSERT INTO community_reports(id,reporter_id,post_id,reason) VALUES(?,?,?,?)',[randomUUID(),alice.id,id,'duplicate']));
});
qa('media ACL, keeping/removing photos and soft delete preserve file data',async()=>{
  const file=await registeredFile(admin);const id=await store.saveCommunityPost(admin,input({kind:'photos',visibility:'private'}),[file],[]);const p=await read.getCommunityPost(id,admin),m=p.media[0].id;
  assert.equal(await read.getMedia(m,null,false),null);assert.equal(await read.getMedia(m,bob,false),null);assert.equal(await read.getMedia(m,admin,false),file.imageFile);
  await assert.rejects(()=>store.saveCommunityPost(bob,input(),[],[m]),/bài khác/);await store.saveCommunityPost(admin,input({kind:'photos',visibility:'public'}),[],[m],id,1);assert.equal(await read.getMedia(m,null,false),file.imageFile);
  await store.deleteCommunityPost(admin,id,2);assert.equal(await read.getMedia(m,null,false),null);assert.equal(await read.getCommunityPost(id,admin),null);const [[r]]=await pool.query('SELECT COUNT(*) n FROM community_media WHERE post_id=?',[id]);assert.equal(r.n,1);
});
qa('flags are idempotent under concurrency, counts authoritative and saved feed respects visibility',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]);
  await Promise.all(Array.from({length:8},()=>social.setPostFlag(bob,id,'like',true)));assert.equal((await read.getCommunityPost(id,bob)).likes,1);
  await Promise.all(Array.from({length:5},()=>social.setPostFlag(bob,id,'save',true)));assert.ok((await read.savedCommunityPage(bob)).posts.some(p=>p.id===id));
  await Promise.all(Array.from({length:5},()=>social.setPostFlag(bob,id,'like',false)));assert.equal((await read.getCommunityPost(id)).likes,0);
  await social.setPostFlag(bob,id,'save',false);assert.equal((await read.getCommunityPost(id)).saves,0);
  await social.setPostFlag(bob,id,'save',true);await store.saveCommunityPost(admin,input({visibility:'private'}),[],[],id,1);
  assert.ok(!(await read.savedCommunityPage(bob)).posts.some(p=>p.id===id));await assert.rejects(()=>social.setPostFlag(bob,id,'like',true));assert.equal((await discussion.listDiscussion(id,bob)).threads.length,0);
});
qa('comment nonce prevents duplicate retries; 2-level rule enforced by service AND FK/CHECK',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]),nonce=randomUUID();const r=await Promise.all(Array.from({length:5},()=>social.addComment(bob,id,'Root QA',null,nonce)));assert.equal(new Set(r.map(x=>x.commentId)).size,1);
  const rootId=r[0].commentId,reply=await social.addComment(admin,id,'Reply QA',rootId,randomUUID());
  await assert.rejects(()=>social.addComment(admin,id,'Third level',reply.commentId,randomUUID()),/hai cấp/);
  await assert.rejects(()=>pool.query('INSERT INTO community_comments(id,post_id,parent_id,depth,user_id,body) VALUES(?,?,?,?,?,?)',[randomUUID(),id,reply.commentId,2,admin.id,'Third level SQL']));
  const other=await store.saveCommunityPost(admin,input(),[],[]);await assert.rejects(()=>social.addComment(admin,other,'Cross post',rootId,randomUUID()));
  await assert.rejects(()=>social.addComment(bob,id,'Changed nonce body',null,nonce));
  assert.equal((await read.getCommunityPost(id)).comments,2);assert.equal((await discussion.listDiscussion(id,bob)).threads[0].replies.length,1);
});
qa('comment ownership/CAS, hidden parent removes descendants/counts; deleted parent remains a tombstone',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]),root=(await social.addComment(bob,id,'Root',null,randomUUID())).commentId;
  const reply=(await social.addComment(admin,id,'Reply',root,randomUUID())).commentId;
  await assert.rejects(()=>social.changeComment(admin,root,1,'edit','Unauthorized'));await assert.rejects(()=>social.changeComment(bob,root,1,'hide','','spoof'));
  const edits=await Promise.allSettled(['A','B'].map(body=>social.changeComment(bob,root,1,'edit',body)));assert.equal(edits.filter(x=>x.status==='fulfilled').length,1);
  await social.changeComment(admin,root,2,'hide','','Violation QA');assert.equal((await read.getCommunityPost(id)).comments,0);
  const hidden=await discussion.listDiscussion(id,bob);assert.equal(hidden.threads[0].root.body,'Bình luận đã được ẩn.');assert.equal(hidden.threads[0].replies.length,0);
  await assert.rejects(()=>social.changeComment(bob,root,3,'edit','Unhide by editing'));
  await social.changeComment(bob,root,3,'delete');assert.equal((await read.getCommunityPost(id)).comments,0);assert.equal((await discussion.listDiscussion(id,bob)).threads[0].replies.length,0);
  const [[event]]=await pool.query("SELECT COUNT(*) n FROM community_comment_events WHERE comment_id=?",[root]);assert.equal(event.n,3);
  const normal=(await social.addComment(admin,id,'Normal root',null,randomUUID())).commentId;await social.addComment(admin,id,'Normal reply',normal,randomUUID());await social.changeComment(admin,normal,1,'delete');assert.equal((await read.getCommunityPost(id)).comments,1);
});
qa('thread pagination and deleted/hidden body never leaks through public discussion reads',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]),root=(await social.addComment(admin,id,'Root secret',null,randomUUID())).commentId;
  for(let i=0;i<24;i++)await social.addComment(admin,id,`Reply ${i}`,root,randomUUID());
  const previews=await discussion.listDiscussion(id,null);assert.equal(previews.threads[0].replies.length,3);assert.equal(previews.threads[0].replyCount,24);
  const first=await discussion.listDiscussion(id,null,undefined,root),second=await discussion.listDiscussion(id,null,first.next,root);assert.equal(first.threads[0].replies.length,20);assert.equal(second.threads[0].replies.length,4);
  assert.equal(new Set([...first.threads[0].replies,...second.threads[0].replies].map(c=>c.id)).size,24);
  await social.changeComment(admin,root,1,'hide','','QA');const masked=await discussion.listDiscussion(id,null,undefined,root);assert.equal(masked.threads[0].root.body.includes('secret'),false);assert.equal(masked.threads[0].replies.length,0);
});
qa('reports deduplicate concurrently, are Admin-only, CAS-protected and decisions recorded atomically',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]);
  const sent=await Promise.all(Array.from({length:4},()=>social.reportContent(bob,'post',id,'QA reason')));assert.equal(sent.filter(r=>!r.duplicate).length,1);
  await assert.rejects(()=>discussion.reportQueue({...bob,role:'admin'}));const queue=await discussion.reportQueue(admin);const report=queue.reports.find(r=>r.postId===id);assert.ok(report);
  await assert.rejects(()=>social.handleReport(bob,report.id,'hide_post','Spoof',1));
  await store.saveCommunityPost(admin,input({body:'Changed'}),[],[],id,1);await assert.rejects(()=>social.handleReport(admin,report.id,'hide_post','Stale',1));
  const decisions=await Promise.allSettled(Array.from({length:2},()=>social.handleReport(admin,report.id,'hide_post','Violation QA',2)));assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);assert.equal(await read.getCommunityPost(id),null);
  const history=(await discussion.reportQueue(admin,true)).reports.find(r=>r.id===report.id);assert.equal(history.decision,'hide_post');assert.equal(history.note,'Violation QA');assert.ok(history.handler);
  await assert.rejects(()=>social.reportContent(admin,'post',id,'hidden'));
});
qa('comment report hide/dismiss and transaction rollback when report final write fails',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]),comment=(await social.addComment(admin,id,'Comment QA',null,randomUUID())).commentId;
  await social.reportContent(bob,'comment',comment,'Comment reason');let report=(await discussion.reportQueue(admin)).reports.find(r=>r.postId===id);
  const faulty={query:pool.query.bind(pool),getConnection:async()=>{const tx=await pool.getConnection();return new Proxy(tx,{get(target,key){if(key==='query')return async(sql,...args)=>{if(sql.startsWith('UPDATE community_reports SET'))throw Error('QA_REPORT_FAILURE');return target.query(sql,...args);};const x=target[key];return typeof x==='function'?x.bind(target):x;}});}};
  await assert.rejects(()=>discoveryLoader(faulty)('src/lib/discovery-community/interactions.ts').handleReport(admin,report.id,'hide_comment','QA',1),/QA_REPORT_FAILURE/);
  assert.equal((await discussion.listDiscussion(id,null)).threads[0].root.status,'visible');await social.handleReport(admin,report.id,'hide_comment','QA',1);assert.equal((await read.getCommunityPost(id)).comments,0);
  const post=await store.saveCommunityPost(admin,input(),[],[]);await social.reportContent(bob,'post',post,'Dismiss QA');report=(await discussion.reportQueue(admin)).reports.find(r=>r.postId===post);await social.handleReport(admin,report.id,'dismiss','Not a violation',1);assert.equal((await read.getCommunityPost(post)).status,'published');assert.equal((await social.reportContent(bob,'post',post,'Duplicate within 24h')).duplicate,true);
});
qa('inactive accounts cannot write flags/comments/reports or reserve storage even with a forged role',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]);
  for(const fn of [()=>social.setPostFlag(inactive,id,'like',true),()=>social.addComment(inactive,id,'QA',null,randomUUID()),()=>social.reportContent(inactive,'post',id,'QA'),()=>storage.reserveStorage({...inactive,role:'admin'},1)])await assert.rejects(fn,/không có quyền/);
});
qa('storage quota is atomic, includes thumbnails/retained files, prevents foreign/replayed attachments',async()=>{
  const who=actors[4],MB=1024*1024;await storage.reserveStorage(who,99*MB);const reserves=await Promise.allSettled([storage.reserveStorage(who,MB),storage.reserveStorage(who,MB)]);assert.equal(reserves.filter(x=>x.status==='fulfilled').length,1);assert.equal((await storage.storageUsage(who)).used,100*MB);
  await assert.rejects(()=>storage.reserveStorage(who,1));await assert.rejects(()=>storage.reserveStorage(admin,101*MB));
  const file=await registeredFile(admin,100,40);
  await assert.rejects(()=>store.saveCommunityPost(bob,input(),[file],[]),/không thuộc/);const id=await store.saveCommunityPost(admin,input(),[file],[]);await assert.rejects(()=>store.saveCommunityPost(admin,input(),[file],[]),/đã được sử dụng/);
  const before=(await storage.storageUsage(admin)).used;await store.deleteCommunityPost(admin,id,1);assert.equal((await storage.storageUsage(admin)).used,before);
});
qa('actual Sharp/storage writes charge exact main + thumbnail bytes; failed writes retain reservation',async()=>{
  const sharp=require('sharp'),bytes=await sharp({create:{width:80,height:60,channels:3,background:'#123456'}}).png().toBuffer();const before=(await storage.storageUsage(admin)).used;
  const prepared=await media.prepareMedia(admin,[new File([bytes],'qa.png',{type:'image/png'})]);const dir=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery');const main=fs.statSync(path.join(dir,prepared[0].imageFile)).size,thumb=fs.statSync(path.join(dir,prepared[0].thumbFile)).size;assert.equal((await storage.storageUsage(admin)).used-before,main+thumb);
  const adapter=require('../src/lib/discovery-community/files.cjs');const failing=discoveryLoader(pool,{'./files.cjs':{...adapter,writeExclusive:async()=>{throw Error('QA_DISK_FAILURE');}}})('src/lib/discovery-community/media.ts');const used=(await storage.storageUsage(admin)).used;await assert.rejects(()=>failing.prepareMedia(admin,[new File([bytes],'qa.png',{type:'image/png'})]),/giữ chỗ/);assert.ok((await storage.storageUsage(admin)).used>used);
});
qa('failed post/tag transaction rolls back upload attachment while preserving reserved bytes',async()=>{
  const file=await registeredFile(admin,50,30);const used=(await storage.storageUsage(admin)).used;
  const faulty={query:pool.query.bind(pool),getConnection:async()=>{const tx=await pool.getConnection();return new Proxy(tx,{get(target,key){if(key==='query')return async(sql,...args)=>{if(sql.startsWith('INSERT INTO tags'))throw Error('QA_TAG_FAILURE_AFTER_ATTACHMENT');return target.query(sql,...args);};const x=target[key];return typeof x==='function'?x.bind(target):x;}});}};
  await assert.rejects(()=>discoveryLoader(faulty)('src/lib/discovery-community/store.ts').saveCommunityPost(admin,input({tags:['rollback-upload']}),[file],[]),/QA_TAG_FAILURE/);
  const [[batch]]=await pool.query('SELECT attached_post_id FROM community_upload_batches WHERE id=?',[file.batchId]);assert.equal(batch.attached_post_id,null);assert.equal((await storage.storageUsage(admin)).used,used);
  await store.saveCommunityPost(admin,input(),[file],[]);
});
qa('interaction/comment/report spam limits are atomic and malformed requests never write',async()=>{
  const id=await store.saveCommunityPost(admin,input(),[],[]),fresh={id:randomUUID(),role:'member'};
  await pool.query('INSERT INTO users(id,email,first_name) VALUES(?,?,?)',[fresh.id,`spam-${fresh.id}@example.invalid`,'QA spam']);
  const flags=await Promise.allSettled(Array.from({length:124},()=>social.setPostFlag(fresh,id,'like',true)));assert.equal(flags.filter(x=>x.status==='fulfilled').length,120);
  const comments=await Promise.allSettled(Array.from({length:23},()=>social.addComment(fresh,id,'QA',null,randomUUID())));assert.equal(comments.filter(x=>x.status==='fulfilled').length,20);
  const ids=[];for(let i=0;i<6;i++)ids.push(await store.saveCommunityPost(admin,input(),[],[]));const reports=await Promise.allSettled(ids.map(x=>social.reportContent(fresh,'post',x,'QA')));assert.equal(reports.filter(x=>x.status==='fulfilled').length,5);
  await assert.rejects(()=>social.setPostFlag(fresh,id,'DROP',true));await assert.rejects(()=>social.addComment(fresh,id,'x'.repeat(2001),null,randomUUID()));await assert.rejects(()=>social.reportContent(fresh,'file',id,'QA'));
});
qa('newest cursor stable for timestamp ties, filters bound and tampering rejected',async()=>{
  for(let i=0;i<28;i++){const id=await store.saveCommunityPost(admin,input({body:`cursor unique ${i}`,tags:['cursor-qa']}),[],[]);await pool.query("UPDATE community_posts SET published_at='2026-01-01 10:00:00.123456' WHERE id=?",[id]);}
  let next,ids=[];do{const p=await read.communityFeed({q:'cursor unique',cursor:next});ids.push(...p.posts.map(x=>x.id));next=p.next;}while(next);assert.equal(ids.length,28);assert.equal(new Set(ids).size,28);
  const first=await read.communityFeed({q:'cursor unique'});await assert.rejects(()=>read.communityFeed({q:'different',cursor:first.next}),/cursor|trang|liên kết/i);await assert.rejects(()=>read.communityFeed({q:'cursor unique',cursor:first.next+'x'}));
  const scoped=cursor.feedScope('newest','','','');await assert.rejects(()=>read.communityFeed({cursor:cursor.encodeCursor({v:1,scope:scoped,order:'newest',at:'2026-01-01 00:00:00.000000',lastTime:'2026-01-01 00:00:00.000000',lastId:ids[0],expires:1})}));
});
qa('popular snapshot keeps order when engagement changes, no duplicates/private',async()=>{
  const ids=[];for(let i=0;i<25;i++)ids.push(await store.saveCommunityPost(admin,input({body:`popular QA ${i}`}),[],[]));
  const first=await read.communityFeed({order:'popular',q:'popular QA'});assert.equal(first.posts.length,12);const remaining=cursor.decodeCursor(first.next,cursor.feedScope('popular','popular QA','',''),'popular').remaining;
  await pool.query('INSERT INTO community_saves(user_id,post_id) VALUES(?,?)',[alice.id,remaining.at(-1)]);const second=await read.communityFeed({order:'popular',q:'popular QA',cursor:first.next});assert.deepEqual(second.posts.map(p=>p.id),remaining.slice(0,12));assert.equal(new Set([...first.posts,...second.posts].map(x=>x.id)).size,24);
});
qa('validation and upload limits reject malformed runtime input',async()=>{
  assert.throws(()=>model.validateInput(input({tags:[123]})));assert.throws(()=>model.validateInput(input({body:'x'.repeat(1001)})));assert.throws(()=>model.validateInput(input({topicId:"' OR 1=1"})));assert.throws(()=>media.validateFiles([new File(['x'],'evil.svg',{type:'image/svg+xml'})]));
  await assert.rejects(()=>media.prepareMedia(alice,[new File(['not-image'],'bad.png',{type:'image/png'})]),/Không xử lý/);
});
qa('rate limit concurrent reservations never exceeds bound',async()=>{
  const user=actors[4];const r=await Promise.allSettled(Array.from({length:14},()=>db.transaction(async tx=>{const a=await db.lockActor(tx,user);await db.quota(tx,a,'post');})));assert.equal(r.filter(x=>x.status==='fulfilled').length,10);
  const [[bucket]]=await pool.query("SELECT hits FROM community_rate_buckets WHERE user_id=? AND action_kind='post'",[user.id]);assert.equal(bucket.hits,10);
});
qa('owner/Admin cursor pagination is scoped, complete and excludes other owners',async()=>{
  const first=await read.ownCommunityPage(admin);assert.equal(first.posts.length,12);assert.ok(first.posts.every(p=>p.authorId===admin.id));
  const second=await read.ownCommunityPage(admin,false,first.next);assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,24);
  await assert.rejects(()=>read.ownCommunityPage(alice,false,first.next));await assert.rejects(()=>read.ownCommunityPage(alice,true));
  const own=await read.ownCommunityPage(alice);assert.ok(own.posts.every(p=>p.authorId===alice.id));
});
qa('feed search escapes wildcard and filters actual topic/hashtag without SQL injection',async()=>{
  const topic=(await read.communityTopics())[2];const id=await store.saveCommunityPost(admin,input({body:'literal%marker',topicId:topic.id,tags:['uniquetopic']}),[],[]);
  assert.deepEqual((await read.communityFeed({q:'literal%marker',topic:topic.slug})).posts.map(p=>p.id),[id]);
  assert.deepEqual((await read.communityFeed({q:'uniquetopic',topic:topic.slug})).posts.map(p=>p.id),[id]);
  assert.equal((await read.communityFeed({q:"' OR 1=1 --"})).posts.length,0);
});
qa('cleanup dry-run is read-only, leases protect uploads and parallel workers refund exactly once',async()=>{
  const a=await freshOwner(),files=await realMedia(a),size=(await storage.storageUsage(a)).used,batch=files[0].batchId;
  await pool.query('UPDATE community_storage_files SET delete_after=DATE_SUB(NOW(6),INTERVAL 1 DAY) WHERE batch_id=?',[batch]);assert.equal((await cleanup()).filesReady,0);
  await expireBatch(batch);const planned=await cleanup();assert.equal(planned.filesReady,2);assert.equal(planned.filesDeleted,0);assert.equal((await storage.storageUsage(a)).used,size);
  const reports=await Promise.all([cleanup({apply:true}),cleanup({apply:true})]);assert.equal(reports.reduce((n,r)=>n+r.bytesReleased,0),size);assert.equal((await storage.storageUsage(a)).used,0);
  const dir=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery');assert.equal(fs.existsSync(path.join(dir,files[0].imageFile)),false);assert.equal(fs.existsSync(path.join(dir,files[0].thumbFile)),false);assert.equal((await cleanup({apply:true})).bytesReleased,0);
});
qa('soft deletion retains media/quota, restore is owner/CAS checked and remains draft with private thumbnails',async()=>{
  const a=await freshOwner(),files=await realMedia(a),id=await store.saveCommunityPost(a,input({visibility:'private'}),files,[]),post=await read.getCommunityPost(id,a),mid=post.media[0].id,size=(await storage.storageUsage(a)).used;
  assert.equal(await read.getMedia(mid,null,false),null);assert.equal(await read.getMedia(mid,bob,true),null);assert.ok(await read.getMedia(mid,a,true));
  await store.deleteCommunityPost(a,id,1);await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,size);assert.equal(await read.getMedia(mid,a,false),null);
  await assert.rejects(()=>lifecycle.restorePost(bob,id,2));const restore=await Promise.allSettled([lifecycle.restorePost(a,id,2),lifecycle.restorePost(a,id,2)]);assert.equal(restore.filter(r=>r.status==='fulfilled').length,1);
  const restored=await read.getCommunityPost(id,a);assert.equal(restored.status,'draft');assert.equal((await storage.storageUsage(a)).used,size);assert.equal(await read.getMedia(mid,null,true),null);assert.ok(await read.getMedia(mid,a,false));assert.ok(await read.getMedia(mid,a,true));
});
qa('expired deleted post is permanently fenced, unlinked and quota released; restore cannot resurrect it',async()=>{
  const a=await freshOwner(),files=await realMedia(a),id=await store.saveCommunityPost(a,input(),files,[]);await store.deleteCommunityPost(a,id,1);await pool.query('UPDATE community_posts SET deleted_at=DATE_SUB(NOW(6),INTERVAL 31 DAY) WHERE id=?',[id]);await expireBatch(files[0].batchId);
  await assert.rejects(()=>lifecycle.restorePost(a,id,2),/30 ngày/);const r=await cleanup({apply:true});assert.equal(r.postsFenced,1);assert.equal(r.filesDeleted,2);assert.equal((await storage.storageUsage(a)).used,0);
  const [[p]]=await pool.query('SELECT purge_started_at,purged_at,revision FROM community_posts WHERE id=?',[id]);assert.ok(p.purge_started_at);assert.ok(p.purged_at);await assert.rejects(()=>lifecycle.restorePost(a,id,p.revision),/vĩnh viễn/);assert.equal((await cleanup({apply:true})).bytesReleased,0);
});
qa('editing retires only removed photos, permits restore, and later frees only unreferenced variants',async()=>{
  const a=await freshOwner(),files=await realMedia(a,2),id=await store.saveCommunityPost(a,input(),files,[]);let p=await read.getCommunityPost(id,a);const keep=p.media[0].id,removed=p.media[1].id,removedFile=(await pool.query('SELECT image_file,thumb_file FROM community_media WHERE id=?',[removed]))[0][0],size=(await storage.storageUsage(a)).used;
  await store.saveCommunityPost(a,input(),[],[keep],id,1);assert.equal((await read.getCommunityPost(id,a)).media.length,1);assert.equal(await read.getMedia(removed,a,true),null);assert.equal((await storage.storageUsage(a)).used,size);await cleanup({apply:true});
  await lifecycle.restoreMedia(a,removed,2);assert.equal((await read.getCommunityPost(id,a)).media.length,2);await store.saveCommunityPost(a,input(),[],[keep],id,3);
  await pool.query('UPDATE community_media SET purge_after=DATE_SUB(NOW(6),INTERVAL 1 DAY) WHERE id=?',[removed]);await expireBatch(files[0].batchId);const r=await cleanup({apply:true});assert.equal(r.filesDeleted,2);assert.ok(await read.getMedia(keep,a,false));assert.equal(await read.getMedia(removed,a,false),null);await assert.rejects(()=>lifecycle.restoreMedia(a,removed,4));
  const [[freed]]=await pool.query('SELECT SUM(byte_size) n FROM community_storage_files WHERE file_name IN (?,?)',[removedFile.image_file,removedFile.thumb_file]);assert.equal((await storage.storageUsage(a)).used,size-Number(freed.n));
});
qa('moderation-held deleted posts are retained beyond 30 days and only Admin may restore them',async()=>{
  const a=await freshOwner(),files=await realMedia(a),id=await store.saveCommunityPost(a,input(),files,[]);await store.moderateCommunityPost(admin,id,1,'hide','Hold QA');await store.deleteCommunityPost(a,id,2);await pool.query('UPDATE community_posts SET deleted_at=DATE_SUB(NOW(6),INTERVAL 45 DAY) WHERE id=?',[id]);await expireBatch(files[0].batchId);const size=(await storage.storageUsage(a)).used;
  await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,size);await pool.query("UPDATE users SET role='member' WHERE id=?",[a.id]);await assert.rejects(()=>lifecycle.restorePost({...a,role:'admin'},id,3),/30 ngày/);
  await lifecycle.restorePost(admin,id,3);const restored=await read.getCommunityPost(id,a);assert.equal(restored.status,'draft');await store.saveCommunityPost(a,input(),[],restored.media.map(m=>m.id),id,4);assert.equal((await read.getCommunityPost(id,a)).status,'pending');assert.equal(await read.getCommunityPost(id),null);
});
qa('open reports block cleanup of retired images until a recorded Admin decision',async()=>{
  const a=await freshOwner(),files=await realMedia(a),id=await store.saveCommunityPost(a,input(),files,[]);await store.saveCommunityPost(a,input(),[],[],id,1);await pool.query('UPDATE community_media SET purge_after=DATE_SUB(NOW(6),INTERVAL 1 DAY) WHERE post_id=?',[id]);await expireBatch(files[0].batchId);await social.reportContent(bob,'post',id,'Keep evidence');const size=(await storage.storageUsage(a)).used;
  await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,size);const report=(await discussion.reportQueue(admin)).reports.find(r=>r.postId===id);await social.handleReport(admin,report.id,'dismiss','Reviewed QA',2);await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,0);
});
qa('partial write/crash orphans are tracked before disk writes; unknown/shared files are never swept',async()=>{
  const a=await freshOwner(),image=await require('sharp')({create:{width:32,height:32,channels:3,background:'#123456'}}).png().toBuffer();
  const broken=discoveryLoader(pool,{'./files.cjs':{...adapter,writeExclusive:async(root,name,bytes)=>{await require('node:fs/promises').writeFile(path.join(root,name),bytes.subarray(0,Math.max(1,Math.floor(bytes.length/2))),{flag:'wx'});throw Error('QA_PARTIAL_WRITE');}}})('src/lib/discovery-community/media.ts');
  await assert.rejects(()=>broken.prepareMedia(a,[new File([image],'qa.png',{type:'image/png'})]),/giữ chỗ/);const [[batch]]=await pool.query('SELECT id FROM community_upload_batches WHERE owner_id=?',[a.id]);await expireBatch(batch.id);
  const dir=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery'),unknown=path.join(dir,randomUUID()+'.webp'),shared=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,randomUUID()+'.webp');fs.writeFileSync(unknown,'unknown sentinel');fs.writeFileSync(shared,'shared sentinel');await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,0);assert.equal(fs.readFileSync(unknown,'utf8'),'unknown sentinel');assert.equal(fs.readFileSync(shared,'utf8'),'shared sentinel');
});
qa('unlink failure keeps quota, retry after lease and missing files refund once after commit',async()=>{
  const a=await freshOwner(),files=await realMedia(a),size=(await storage.storageUsage(a)).used;await expireBatch(files[0].batchId);
  const failed=await cleanup({apply:true,hooks:{unlink:async()=>{throw Object.assign(Error('QA_ACCESS'),{code:'EACCES'});}}});assert.ok(failed.errors>=2);assert.equal((await storage.storageUsage(a)).used,size);
  await pool.query('UPDATE community_storage_files SET gc_lease_until=DATE_SUB(NOW(6),INTERVAL 1 MINUTE) WHERE batch_id=?',[files[0].batchId]);
  const crashed=await cleanup({apply:true,hooks:{beforeFinalize:async()=>{throw Error('QA_COMMIT_FAILURE');}}});assert.ok(crashed.errors>=2);assert.equal((await storage.storageUsage(a)).used,size);
  await pool.query('UPDATE community_storage_files SET gc_lease_until=DATE_SUB(NOW(6),INTERVAL 1 MINUTE) WHERE batch_id=?',[files[0].batchId]);await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,0);await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,0);
});
qa('wrong DB/root marker fails closed without mutating quota or file rows',async()=>{
  const a=await freshOwner(),files=await realMedia(a);await expireBatch(files[0].batchId);const size=(await storage.storageUsage(a)).used,marker=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery','.discovery-storage.json'),original=fs.readFileSync(marker);
  await assert.rejects(()=>cleanup({target:'not-the-qa-db',apply:true}),/TARGET_MISMATCH/);try{fs.writeFileSync(marker,JSON.stringify({version:3,binding:'wrong'}));await assert.rejects(()=>cleanup({apply:true}),/BINDING_MISMATCH/);}finally{fs.writeFileSync(marker,original);}assert.equal((await storage.storageUsage(a)).used,size);await cleanup({apply:true});
});
qa('quota freed by cleanup is reusable under concurrent reservation without exceeding 100 MiB',async()=>{
  const a=await freshOwner(),files=await realMedia(a),bytes=(await storage.storageUsage(a)).used;await storage.reserveStorage(a,storage.STORAGE_LIMIT-bytes);await expireBatch(files[0].batchId);await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,storage.STORAGE_LIMIT-bytes);
  const r=await Promise.allSettled([storage.reserveStorage(a,bytes),storage.reserveStorage(a,bytes)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await storage.storageUsage(a)).used,storage.STORAGE_LIMIT);
});
qa('restoring missing/corrupted media fails without releasing quota or publishing the post',async()=>{
  const a=await freshOwner(),files=await realMedia(a),id=await store.saveCommunityPost(a,input(),files,[]),size=(await storage.storageUsage(a)).used;await store.deleteCommunityPost(a,id,1);
  const file=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery',files[0].imageFile);fs.writeFileSync(file,'corrupt');await assert.rejects(()=>lifecycle.restorePost(a,id,2),/toàn vẹn/);assert.equal(await read.getCommunityPost(id,a),null);assert.equal((await storage.storageUsage(a)).used,size);
});
qa('file type/integrity guards retain quota; cleanup cannot follow a file-shaped directory or symlink',async()=>{
  const a=await freshOwner(),files=await realMedia(a),size=(await storage.storageUsage(a)).used;await expireBatch(files[0].batchId);const file=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery',files[0].imageFile);
  // Own QA fixture only: replace one registered file by a non-file object.
  fs.unlinkSync(file);fs.mkdirSync(file);fs.writeFileSync(path.join(file,'sentinel'),'keep me');const r=await cleanup({apply:true});assert.ok(r.errors>=1);assert.equal(fs.readFileSync(path.join(file,'sentinel'),'utf8'),'keep me');assert.ok((await storage.storageUsage(a)).used>0);assert.ok((await storage.storageUsage(a)).used<size);
  await pool.query("UPDATE community_storage_files SET last_error='COLLISION' WHERE file_name=?",[files[0].imageFile]);
});
qa('cleanup rejects ambiguous modes, missing namespace, and foreign-owner file inventory',async()=>{
  await assert.rejects(()=>cleanup({apply:'false'}),/BOOLEAN_MODE/);await assert.rejects(()=>cleanup({apply:true,uploadDir:path.join(enabled,'never-created-root-'+randomUUID())}));
  const a=await freshOwner(),batch=await storage.reserveStorage(a,20);await assert.rejects(()=>pool.query('INSERT INTO community_storage_files(file_name,batch_id,owner_id,byte_size,sha256) VALUES(?,?,?,?,?)',[randomUUID()+'.webp',batch,bob.id,20,'0'.repeat(64)]));
});
qa('parallel namespace initialization cannot claim an unrelated directory or mismatched DB marker',async()=>{
  const dir=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'parallel-init-'+randomUUID());const r=await Promise.all([adapter.namespace(pool,dir,true),adapter.namespace(pool,dir,true)]);assert.equal(r[0],r[1]);
  const unknown=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'unknown-root-'+randomUUID());fs.mkdirSync(path.join(unknown,'discovery'),{recursive:true});await assert.rejects(()=>adapter.namespace(pool,unknown,true));assert.equal(fs.existsSync(path.join(unknown,'discovery','.discovery-storage.json')),false);
});
qa('junction/symlink targets outside the namespace are never followed by cleanup',async t=>{
  const a=await freshOwner(),files=await realMedia(a),file=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery',files[0].imageFile),outside=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'junction-target-'+randomUUID());await expireBatch(files[0].batchId);fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'sentinel'),'untouched');fs.unlinkSync(file);
  try{fs.symlinkSync(outside,file,process.platform==='win32'?'junction':'dir');}catch(e){if(['EPERM','EACCES'].includes(e.code)){t.skip('Host does not permit symlink creation');return;}throw e;}
  const r=await cleanup({apply:true});assert.ok(r.errors>=1);assert.equal(fs.readFileSync(path.join(outside,'sentinel'),'utf8'),'untouched');assert.ok((await storage.storageUsage(a)).used>0);await pool.query("UPDATE community_storage_files SET last_error='COLLISION' WHERE file_name=?",[files[0].imageFile]);
});
qa('actual CLI defaults to dry-run and does not mutate ledger or filesystem',async()=>{
  const {spawnSync}=require('node:child_process');const before=(await pool.query("SELECT COALESCE(SUM(released_bytes),0) n FROM community_upload_batches"))[0][0].n;
  const r=spawnSync(process.execPath,['scripts/discovery-media-cleanup.cjs','--target='+qaDatabase,'--storage-root='+process.env.DISCOVERY_QA_UPLOAD_DIR],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,DB_HOST:'127.0.0.1',DB_PORT:'3321',DB_NAME:qaDatabase,DB_USER:'root',DB_PASSWORD:'',UPLOAD_DIR:process.env.DISCOVERY_QA_UPLOAD_DIR}});assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout.trim());assert.equal(result.dryRun,true);assert.equal(result.filesDeleted,0);assert.equal((await pool.query("SELECT COALESCE(SUM(released_bytes),0) n FROM community_upload_batches"))[0][0].n,before);
});
qa('copying a valid DB marker to a different storage root cannot refund the original volume quota',async()=>{
  const wrong=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'wrong-volume-'+randomUUID());fs.mkdirSync(path.join(wrong,'discovery'),{recursive:true});fs.copyFileSync(path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery','.discovery-storage.json'),path.join(wrong,'discovery','.discovery-storage.json'));await assert.rejects(()=>cleanup({uploadDir:wrong,apply:true}),/BINDING_MISMATCH/);
});
qa('a thumbnail referenced by another live post is retained and its quota is not released',async()=>{
  const a=await freshOwner(),first=await realMedia(a),p1=await store.saveCommunityPost(a,input(),first,[]),second=await realMedia(a),p2=await store.saveCommunityPost(a,input(),second,[]);
  await pool.query('UPDATE community_media SET thumb_file=? WHERE post_id=?',[first[0].thumbFile,p2]);await store.deleteCommunityPost(a,p1,1);await pool.query('UPDATE community_posts SET deleted_at=DATE_SUB(NOW(6),INTERVAL 31 DAY) WHERE id=?',[p1]);await expireBatch(first[0].batchId);const before=(await storage.storageUsage(a)).used;
  await cleanup({apply:true});const dir=path.join(process.env.DISCOVERY_QA_UPLOAD_DIR,'discovery');assert.equal(fs.existsSync(path.join(dir,first[0].imageFile)),false);assert.equal(fs.existsSync(path.join(dir,first[0].thumbFile)),true);assert.equal((await storage.storageUsage(a)).used,before-first[0].byteSize);const live=await read.getCommunityPost(p2,a);assert.equal(await read.getMedia(live.media[0].id,null,true),first[0].thumbFile);
});
qa('post/tag rollback retains active references and abandoned real upload files are reclaimed after grace',async()=>{
  const a=await freshOwner(),files=await realMedia(a),bytes=(await storage.storageUsage(a)).used;
  const faulty={query:pool.query.bind(pool),getConnection:async()=>{const tx=await pool.getConnection();return new Proxy(tx,{get(target,key){if(key==='query')return async(sql,...args)=>{if(sql.startsWith('INSERT INTO tags'))throw Error('QA_TAG_ROLLBACK');return target.query(sql,...args);};const x=target[key];return typeof x==='function'?x.bind(target):x;}});}};
  const broken=discoveryLoader(faulty)('src/lib/discovery-community/store.ts');await assert.rejects(()=>broken.saveCommunityPost(a,input({tags:['rollback-real']}),files,[]),/QA_TAG_ROLLBACK/);await expireBatch(files[0].batchId);await cleanup({apply:true});assert.equal((await storage.storageUsage(a)).used,0);
  const healthy=await realMedia(a),id=await store.saveCommunityPost(a,input(),healthy,[]);await assert.rejects(()=>broken.saveCommunityPost(a,input({tags:['rollback-remove']}),[],[],id,1),/QA_TAG_ROLLBACK/);assert.equal((await read.getCommunityPost(id,a)).media.length,1);const [[f]]=await pool.query('SELECT delete_after FROM community_storage_files WHERE file_name=?',[healthy[0].imageFile]);assert.equal(f.delete_after,null);assert.ok(bytes>0);
});
qa('Admin can recover an expired deleted post preserved for an open report without bypassing review',async()=>{
  const a=await freshOwner(),files=await realMedia(a),id=await store.saveCommunityPost(a,input(),files,[]);await social.reportContent(admin,'post',id,'Evidence QA');await store.deleteCommunityPost(a,id,1);await pool.query('UPDATE community_posts SET deleted_at=DATE_SUB(NOW(6),INTERVAL 45 DAY) WHERE id=?',[id]);await expireBatch(files[0].batchId);await cleanup({apply:true});assert.ok((await storage.storageUsage(a)).used>0);await lifecycle.restorePost(admin,id,2);const p=await read.getCommunityPost(id,a);assert.equal(p.status,'draft');const [[row]]=await pool.query('SELECT moderation_hold FROM community_posts WHERE id=?',[id]);assert.equal(row.moderation_hold,1);
});
qa('trash ownership/Admin checks, cursor binding and retention labels come from server data',async()=>{
  const a=await freshOwner(),ids=[];for(let i=0;i<14;i++){const id=await store.saveCommunityPost(a,input({title:'Private trash QA'}),[],[]);await store.deleteCommunityPost(a,id,1);ids.push(id);}
  const first=await lifecycle.trashPage(a),second=await lifecycle.trashPage(a,false,first.next);assert.equal(first.items.length,12);assert.equal(second.items.length,2);assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,14);await assert.rejects(()=>lifecycle.trashPage(bob,false,first.next));await assert.rejects(()=>lifecycle.trashPage({...bob,role:'admin'},true));assert.ok(!(await lifecycle.trashPage(bob)).items.some(p=>ids.includes(p.id)));
  const id=ids[0];await pool.query('UPDATE community_posts SET deleted_at=DATE_SUB(NOW(6),INTERVAL 45 DAY) WHERE id=?',[id]);await pool.query('INSERT INTO community_reports(id,reporter_id,post_id,reason) VALUES(?,?,?,?)',[randomUUID(),admin.id,id,'Review retained trash']);await pool.query("UPDATE users SET role='member' WHERE id=?",[a.id]);const owner=(await lifecycle.trashPage(a)).items.find(p=>p.id===id);assert.equal(owner.held,true);assert.equal(owner.restorable,false);const staff=(await lifecycle.trashPage(admin,true)).items.find(p=>p.id===id);assert.equal(staff.restorable,true);
});

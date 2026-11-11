const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),mysql=require('mysql2/promise'),{randomUUID}=require('node:crypto');
const {discoveryLoader,root}=require('./helpers/discovery-loader.cjs');
const enabled=process.env.DISCOVERY_QA_ROOT;let pool,load,notice,social,store,follow,dbName;const users=Array.from({length:4},(_,i)=>({id:randomUUID(),role:i===0?'admin':'member'}));const[admin,alice,bob,inactive]=users;
const qa=(name,fn)=>test(name,{skip:!enabled},fn);
const input=extra=>({kind:'status',title:'',body:'Notification QA public content',topicId:null,visibility:'public',intent:'publish',tags:[],...extra});
async function fresh(role='admin'){const a={id:randomUUID(),role};await pool.query('INSERT INTO users(id,email,first_name,role) VALUES(?,?,?,?)',[a.id,`notification-${a.id}@example.invalid`,'Notification QA',role]);return a;}
async function post(owner){return store.saveCommunityPost(owner,input(),[],[]);}
async function rows(recipient){const[r]=await pool.query("SELECT * FROM notifications WHERE user_id=? AND LEFT(type,10)='discovery_'",[recipient.id]);return r;}
before(async()=>{if(!enabled)return;const c=await mysql.createConnection({host:'127.0.0.1',port:3321,user:'root'});try{const[[s]]=await c.query('SELECT @@port p,@@datadir d');assert.equal(Number(s.p),3321);assert.equal(path.resolve(s.d).toLowerCase(),path.resolve(enabled,'mysql-data').toLowerCase());dbName=`discovery009_test_${Date.now()}`;await c.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await c.changeUser({database:dbName});for(const sql of JSON.parse(fs.readFileSync(path.join(enabled,'base-schema.json'),'utf8')))await c.query(sql);
 const old=fs.readFileSync(path.join(root,'sql/004_blueprint.sql'),'utf8');for(const name of ['follows','notifications'])await c.query(old.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+'[\\s\\S]*?;'))[0]);
 for(const[u,i]of users.map((u,i)=>[u,i]))await c.query('INSERT INTO users(id,email,first_name,role,is_active) VALUES(?,?,?,?,?)',[u.id,`notice-${i}@example.invalid`,`QA ${i}`,u.role,i===3?0:1]);
 await c.query('INSERT INTO notifications(id,user_id,type,message,link) VALUES(?,?,?,?,?)',[randomUUID(),admin.id,'moderation','Legacy sentinel','/journeystory']);
 for(const file of ['007_discovery_community.sql','009_discovery_notifications.sql']){const sql=fs.readFileSync(path.join(root,'sql/planned',file),'utf8').replace(/^--.*$/gm,'');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await c.query(statement);}
 }finally{await c.end();}
 pool=mysql.createPool({host:'127.0.0.1',port:3321,user:'root',database:dbName,connectionLimit:12});load=discoveryLoader(pool);notice=load('src/lib/notifications.ts');social=load('src/lib/discovery-community/interactions.ts');store=load('src/lib/discovery-community/store.ts');follow=load('src/lib/community.ts');fs.writeFileSync(path.join(enabled,'notification-qa-database.txt'),dbName);});
after(async()=>{if(pool)await pool.end();});
qa('009: preserves legacy notifications, standalone without 006; marker/FK/UNIQUE/CHECK',async()=>{
 assert.equal(await notice.discoveryNotificationsReady(),true);assert.equal((await notice.notificationPage(admin.id)).items[0].message,'Legacy sentinel');
 const[[count]]=await pool.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'blog_%'");assert.equal(count.n,0);
 await assert.rejects(()=>pool.query("INSERT INTO notifications(id,user_id,type,message,actor_id,dedupe_key) VALUES(?,?,'discovery_follow','QA',?,?)",[randomUUID(),alice.id,alice.id,'a'.repeat(64)]));
 await assert.rejects(()=>pool.query("INSERT INTO notifications(id,user_id,type,message,actor_id,dedupe_key) VALUES(?,?,'discovery_follow','QA',?,?)",[randomUUID(),alice.id,randomUUID(),'b'.repeat(64)]));
});
qa('Follow notification: atomic concurrent dedup, no self; unfollow hides, refollow cannot spam',async()=>{
 const actor=await fresh('member'),owner=await fresh();await Promise.all(Array.from({length:8},()=>follow.setFollow(actor.id,owner.id,true)));assert.equal((await rows(owner)).length,1);assert.equal(await notice.unreadCount(owner.id),1);const existing=(await rows(owner))[0];await assert.rejects(()=>pool.query('INSERT INTO notifications(id,user_id,type,message,actor_id,community_post_id,community_comment_id,dedupe_key) SELECT ?,user_id,type,message,actor_id,community_post_id,community_comment_id,dedupe_key FROM notifications WHERE id=?',[randomUUID(),existing.id]));
 await follow.setFollow(actor.id,owner.id,false);assert.equal((await notice.notificationPage(owner.id)).items.length,0);await follow.setFollow(actor.id,owner.id,true);assert.equal((await rows(owner)).length,1);assert.match((await notice.notificationPage(owner.id)).items[0].link,new RegExp(actor.id));
});
qa('Likes: one notification under concurrent retries; no save/self notification; unlike suppresses stale rows',async()=>{
 const owner=await fresh(),actor=await fresh('member'),id=await post(owner);await Promise.all(Array.from({length:8},()=>social.setPostFlag(actor,id,'like',true)));assert.equal((await rows(owner)).length,1);
 await social.setPostFlag(owner,id,'like',true);await social.setPostFlag(actor,id,'save',true);assert.equal((await rows(owner)).length,1);
 await social.setPostFlag(actor,id,'like',false);assert.equal(await notice.unreadCount(owner.id),0);await social.setPostFlag(actor,id,'like',true);assert.equal((await rows(owner)).length,1);
});
qa('Comments/replies: nonce dedup, correct recipients, no self and no duplicated owner/parent notification',async()=>{
 const owner=await fresh(),actor=await fresh(),third=await fresh(),id=await post(owner),nonce=randomUUID();const result=await Promise.all(Array.from({length:4},()=>social.addComment(actor,id,'Root QA',null,nonce)));assert.equal((await rows(owner)).length,1);
 const rootId=result[0].commentId;await social.addComment(third,id,'Reply QA',rootId,randomUUID());assert.equal((await rows(actor)).filter(r=>r.type==='discovery_reply').length,1);assert.equal((await rows(owner)).length,2);
 const ownRoot=await social.addComment(owner,id,'Own root',null,randomUUID());assert.equal((await rows(owner)).length,2);await social.addComment(actor,id,'Reply to owner',ownRoot.commentId,randomUUID());const ownerRows=await rows(owner);assert.equal(ownerRows.length,3);assert.equal(ownerRows.filter(r=>r.type==='discovery_reply').length,1);
 const item=(await notice.notificationPage(actor.id)).items[0];assert.match(item.link,new RegExp('thread='+rootId));assert.doesNotMatch(item.message,/Reply QA|Root QA/);
});
qa('Privacy: private/draft/hidden/deleted/purging posts and inactive actor never leak through list/count/read',async()=>{
 const owner=await fresh(),actor=await fresh(),id=await post(owner);await social.setPostFlag(actor,id,'like',true);const n=(await rows(owner))[0];
 for(const[status,visibility]of [['published','private'],['draft','public'],['hidden','public'],['deleted','public']]){await pool.query('UPDATE community_posts SET status=?,visibility=? WHERE id=?',[status,visibility,id]);assert.equal((await notice.notificationPage(owner.id)).items.length,0);assert.equal(await notice.unreadCount(owner.id),0);await notice.markNotificationsRead(owner.id,n.id);const[[r]]=await pool.query('SELECT is_read FROM notifications WHERE id=?',[n.id]);assert.equal(r.is_read,0);}
 await pool.query("UPDATE community_posts SET status='published',visibility='public',purge_started_at=NOW(6) WHERE id=?",[id]);assert.equal(await notice.unreadCount(owner.id),0);await pool.query('UPDATE community_posts SET purge_started_at=NULL WHERE id=?',[id]);await pool.query('UPDATE users SET is_active=0 WHERE id=?',[actor.id]);assert.equal(await notice.unreadCount(owner.id),0);
});
qa('Comment privacy: hidden/deleted child and hidden parent suppress notifications, including Admin owner',async()=>{
 const owner=await fresh(),actor=await fresh(),id=await post(owner),rootId=(await social.addComment(actor,id,'Root',null,randomUUID())).commentId;
 await social.changeComment(actor,rootId,1,'delete');assert.equal(await notice.unreadCount(owner.id),0);
 const root2=(await social.addComment(owner,id,'Parent',null,randomUUID())).commentId;const reply=(await social.addComment(actor,id,'Reply',root2,randomUUID())).commentId;assert.equal(await notice.unreadCount(owner.id),1);
 await social.changeComment(admin,root2,1,'hide','','QA hide');assert.equal(await notice.unreadCount(owner.id),0);assert.equal((await notice.notificationPage(owner.id)).items.length,0);
});
qa('Read ownership: foreign ID is harmless; single/all reads only recipient-visible items and require active user',async()=>{
 const owner=await fresh(),actor=await fresh(),other=await fresh(),id=await post(owner);await social.setPostFlag(actor,id,'like',true);await social.addComment(actor,id,'QA',null,randomUUID());const list=await rows(owner);
 await notice.markNotificationsRead(other.id,list[0].id);assert.equal(await notice.unreadCount(owner.id),2);await notice.markNotificationsRead(owner.id,list[0].id);assert.equal(await notice.unreadCount(owner.id),1);await notice.markAllRead(owner.id);assert.equal(await notice.unreadCount(owner.id),0);await assert.rejects(()=>notice.markNotificationsRead(inactive.id,null),/khả dụng/);await assert.rejects(()=>notice.notificationPage(inactive.id),/khả dụng/);
});
qa('Pagination: stable ties, signed cursor bound to recipient; counts match eligible items',async()=>{
 const owner=await fresh(),id=await post(owner);for(let i=0;i<25;i++)await social.setPostFlag(await fresh(),id,'like',true);await pool.query('UPDATE notifications SET created_at=? WHERE user_id=?',['2026-01-01 00:00:00',owner.id]);
 const first=await notice.notificationPage(owner.id),second=await notice.notificationPage(owner.id,first.next);assert.equal(first.items.length,20);assert.equal(second.items.length,5);assert.equal(first.unread,25);assert.equal(new Set([...first.items,...second.items].map(n=>n.id)).size,25);await assert.rejects(()=>notice.notificationPage(alice.id,first.next),/hết hạn/);await assert.rejects(()=>notice.notificationPage(owner.id,first.next+'x'),/hết hạn/);
});
qa('Spam: concurrent distinct comments still write, recipient notification cap is atomic',async()=>{
 const owner=await fresh(),actor=await fresh(),id=await post(owner);await Promise.all(Array.from({length:25},(_,i)=>social.addComment(actor,id,'Comment '+i,null,randomUUID())));assert.equal((await rows(owner)).length,20);const[[r]]=await pool.query('SELECT COUNT(*) n FROM community_comments WHERE post_id=?',[id]);assert.equal(r.n,25);
});
qa('Notification failure rolls back like, comment and follow rather than leaving partial writes',async()=>{
 const owner=await fresh(),actor=await fresh(),id=await post(owner);const faulty={query:pool.query.bind(pool),getConnection:async()=>{const tx=await pool.getConnection();return new Proxy(tx,{get(t,k){if(k==='query')return async(sql,...args)=>{if(sql.startsWith('INSERT INTO notifications'))throw Error('QA_NOTICE_FAILURE');return t.query(sql,...args);};const v=t[k];return typeof v==='function'?v.bind(t):v;}});}};
 const broken=discoveryLoader(faulty),s=broken('src/lib/discovery-community/interactions.ts');await assert.rejects(()=>s.setPostFlag(actor,id,'like',true),/QA_NOTICE_FAILURE/);await assert.rejects(()=>s.addComment(actor,id,'Failed',null,randomUUID()),/QA_NOTICE_FAILURE/);await assert.rejects(()=>broken('src/lib/community.ts').setFollow(actor.id,owner.id,true),/QA_NOTICE_FAILURE/);assert.equal((await rows(owner)).length,0);const[[r]]=await pool.query('SELECT (SELECT COUNT(*) FROM community_likes WHERE post_id=?) likes,(SELECT COUNT(*) FROM community_comments WHERE post_id=?) comments,(SELECT COUNT(*) FROM follows WHERE follower_id=? AND followed_id=?) follows',[id,id,actor.id,owner.id]);assert.equal(r.likes+r.comments+r.follows,0);
});
qa('Missing 009 marker: typed notifications fail closed, legacy stays available and existing interactions work',async()=>{
 await pool.query('DELETE FROM discovery_notification_schema_state');try{assert.equal(await notice.discoveryNotificationsReady(),false);assert.equal((await notice.notificationPage(admin.id)).items[0].message,'Legacy sentinel');const owner=await fresh(),actor=await fresh(),id=await post(owner);await social.setPostFlag(actor,id,'like',true);assert.equal((await rows(owner)).length,0);assert.equal((await follow.setFollow(actor.id,owner.id,true)).notificationHandled,false);}finally{await pool.query('INSERT INTO discovery_notification_schema_state(singleton_id,migration_version,application_revision) VALUES(1,9,1)');}
});

qa('Spam global: 60 notices per actor/window across recipients; comments still commit after the cap',async()=>{
 const actor=await fresh(),owners=await Promise.all(Array.from({length:5},()=>fresh())),ids=[];for(const owner of owners)ids.push(await post(owner));
 for(let i=0;i<60;i++)await social.addComment(actor,ids[i%4],'Global quota '+i,null,randomUUID());await social.addComment(actor,ids[4],'Over global notification cap',null,randomUUID());const[[r]]=await pool.query('SELECT COUNT(*) n FROM notifications WHERE actor_id=?',[actor.id]);assert.equal(r.n,60);assert.equal((await rows(owners[4])).length,0);const[[c]]=await pool.query('SELECT COUNT(*) n FROM community_comments WHERE post_id=?',[ids[4]]);assert.equal(c.n,1);
});

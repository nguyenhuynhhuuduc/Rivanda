// Explicit isolated QA only; no app .env and no connection to port 3306.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {spawn,spawnSync}=require('node:child_process');
const mysql=require('mysql2/promise');
const base=require('../scripts/migrate-discovery-007.cjs');
const recovery=require('../scripts/recover-discovery-007.cjs');
const enabled=process.env.DISCOVERY_007_RECOVERY_QA;
const qa=(name,fn)=>test(name,{skip:!enabled},fn);
let config,credentials,dump,counter=0;
async function guard(c){const id=await base.identity(c);assert.equal(id.port,3331);assert.notEqual(id.uuid,config.source.uuid);assert.equal(path.resolve(id.datadir).toLowerCase(),path.resolve(config.qaDatadir).toLowerCase());assert.notEqual(path.resolve(id.datadir).toLowerCase(),path.resolve(config.source.datadir).toLowerCase());}
before(async()=>{
  if(!enabled)return;config=JSON.parse(await fs.readFile(enabled,'utf8'));assert.equal(config.qaPort,3331);
  const cmd='Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)))';
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(cmd,'utf16le').toString('base64')],{input:(await fs.readFile(config.qaPasswordDpapiFile)).toString('base64'),encoding:'utf8',windowsHide:true});assert.equal(r.status,0);
  credentials={host:'127.0.0.1',port:3331,user:'root',password:Buffer.from(r.stdout.trim(),'base64').toString(),dateStrings:true,supportBigNumbers:true,bigNumberStrings:true};
  const c=await mysql.createConnection(credentials);try{await guard(c);}finally{await c.end();}
  const pack=await base.backupPackage(config.partialBackupDir,{expectedTables:44});
  try{const d=crypto.createDecipheriv('aes-256-gcm',pack.key,Buffer.from(pack.meta.iv,'base64'));d.setAuthTag(Buffer.from(pack.meta.tag,'base64'));dump=zlib.gunzipSync(Buffer.concat([d.update(await fs.readFile(path.join(config.partialBackupDir,'main.sql.gz.aes'))),d.final()]));}finally{pack.key.fill(0);}
});
after(()=>dump?.fill(0));
async function fixture(){
  const name='discovery007_runner_'+Date.now()+String(++counter);let c=await mysql.createConnection(credentials);
  try{await guard(c);await c.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');}finally{await c.end();}
  const child=spawn(config.mysqlBinary,['--no-defaults','--host=127.0.0.1','--port=3331','--user=root','--database='+name,'--binary-mode=1','--default-character-set=utf8mb4'],{env:{...process.env,MYSQL_PWD:credentials.password},windowsHide:true,stdio:['pipe','ignore','pipe']});child.stderr.resume();
  const end=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('QA restore start failed')));child.once('exit',n=>n===0?resolve():reject(Error('QA restore failed')));});child.stdin.end(dump);await end;
  c=await mysql.createConnection({...credentials,database:name});await guard(c);
  const plan={version:1,kind:'qa',purpose:recovery.PURPOSE,target:await base.identity(c),backupDir:config.backupDir,receiptPath:config.receiptPath,partialBackupDir:config.partialBackupDir,partialReceiptPath:config.partialReceiptPath,reportPath:path.join(config.outputDir,name+'-recovery-postflight.json'),maintenance:{appRoot:path.join(config.outputDir,'no-app'),listenPorts:[39491],applicationStopped:true,externalWritersBlocked:true,cleanupWorkerStopped:true,expiresAt:new Date(Date.now()+3600000).toISOString()}};
  return{c,plan};
}
const quietOS=async()=>{};
const run=(c,plan,options={})=>recovery.runRecovery({connection:c,plan,osGuard:quietOS,...options});
const apply=(c,plan,options={})=>run(c,plan,{apply:true,approval:recovery.POLICY,...options});
function proxy(c,overrides){return new Proxy(c,{get(target,key){if(overrides[key])return overrides[key];const v=target[key];return typeof v==='function'?v.bind(target):v;}});}
async function untouched(c){for(const t of ['community_topics','community_schema_state']){const [[r]]=await c.query('SELECT COUNT(*) n FROM '+t);assert.equal(Number(r.n),0);}const [[r]]=await c.query('SELECT COUNT(*) n FROM schema_migrations');assert.equal(Number(r.n),5);const original=JSON.parse(await fs.readFile(path.join(config.backupDir,'verified-baseline.json'),'utf8'));assert.ok(base.baseMatches(original,await base.fingerprint(c)));}
qa('recovery check is read-only and refuses the old install approval token',async()=>{
  const {c,plan}=await fixture();try{assert.equal((await run(c,plan)).check,'PASS');await assert.rejects(()=>apply(c,plan,{approval:base.POLICY}),{code:'EXPLICIT_RECOVERY_APPROVAL_REQUIRED'});await untouched(c);}finally{await c.end();}
});
qa('recovery CLI check is read-only and its apply gate cannot use the old approval',async()=>{
  const {c,plan}=await fixture();await c.end();const file=path.join(config.outputDir,plan.target.database+'-cli-review.json');await fs.writeFile(file,JSON.stringify(plan));
  const env={...process.env,DB_HOST:'127.0.0.1',DB_PORT:'3331',DB_NAME:plan.target.database,DB_USER:'root',DB_PASSWORD:credentials.password,ALLOW_DISCOVERY_007_APPLY:base.POLICY,ALLOW_DISCOVERY_007_RECOVERY:''};
  const args=['scripts/recover-discovery-007.cjs','--review='+file];const checked=spawnSync(process.execPath,[...args,'--check'],{env,encoding:'utf8',windowsHide:true});assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).applied,false);
  const denied=spawnSync(process.execPath,[...args,'--apply'],{env,encoding:'utf8',windowsHide:true});assert.equal(denied.status,1);assert.equal(JSON.parse(denied.stderr).error,'EXPLICIT_RECOVERY_APPROVAL_REQUIRED');const verify=await mysql.createConnection({...credentials,database:plan.target.database});try{await untouched(verify);}finally{await verify.end();}
});
qa('recovery completes atomically with full postflight, and refuses another run',async()=>{
  const {c,plan}=await fixture();try{await base.operatingSystemGuard(plan);let commits=0;const observed=proxy(c,{commit:async()=>{commits++;return c.commit();}});const r=await apply(observed,plan);assert.equal(r.recoveryPostflight,'PASS');assert.equal(r.commitState,'committed');assert.equal(commits,1);assert.deepEqual(r.marker,{migrationVersion:7,applicationRevision:3});const [[topics]]=await c.query('SELECT COUNT(*) n FROM community_topics'),[[marker]]=await c.query('SELECT COUNT(*) n FROM community_schema_state'),[[history]]=await c.query('SELECT COUNT(*) n FROM schema_migrations');assert.equal(Number(topics.n),3);assert.equal(Number(marker.n),1);assert.equal(Number(history.n),6);await assert.rejects(()=>apply(c,{...plan,reportPath:plan.reportPath+'-retry'}),{code:'RECOVERY_BASE_OR_TABLES_CHANGED'});}finally{await c.end();}
});
qa('recovery rolls back after topics, marker and history errors without touching old records',async()=>{
  for(const failAt of ['topics','marker','history']){const {c,plan}=await fixture();try{const broken=proxy(c,{query:async(sql,...args)=>{const result=await c.query(sql,...args);if((failAt==='topics'&&sql.startsWith('INSERT INTO community_topics'))||(failAt==='marker'&&sql.startsWith('INSERT INTO community_schema_state'))||(failAt==='history'&&sql.startsWith('INSERT INTO schema_migrations')))throw new base.GuardError('QA_INJECTED_FAILURE');return result;}});await assert.rejects(()=>apply(broken,plan),e=>e.code==='QA_INJECTED_FAILURE'&&e.recoveryCommitState==='rolled-back');await untouched(c);await assert.rejects(()=>fs.stat(plan.reportPath),{code:'ENOENT'});}finally{await c.end();}}
});
qa('recovery pre-commit postflight failure rolls back all three writes',async()=>{
  const {c,plan}=await fixture();try{const broken=proxy(c,{query:async(sql,...args)=>{const result=await c.query(sql,...args);if(sql.startsWith('SELECT id,name,slug,is_visible,sort_order,deleted_at FROM community_topics'))return[[{...result[0][0],name:'injected incorrect seed'}]];return result;}});await assert.rejects(()=>apply(broken,plan),e=>e.code==='POSTFLIGHT_SEEDS'&&e.recoveryCommitState==='rolled-back');await untouched(c);}finally{await c.end();}
});
qa('recovery rejects wrong columns, missing enforcement and nonempty community state',async()=>{
  for(const mode of ['column','check','data']){const {c,plan}=await fixture();try{if(mode==='column')await c.query('ALTER TABLE community_topics ADD COLUMN qa_extra INT NULL');if(mode==='check')await c.query('ALTER TABLE community_posts ALTER CHECK ck_community_moderation_hold NOT ENFORCED');if(mode==='data')await c.query("INSERT INTO community_topics(id,name,slug) VALUES(?,?,?)",[crypto.randomUUID(),'QA fixture','qa-fixture']);await assert.rejects(()=>apply(c,plan),{code:mode==='data'?'RECOVERY_NOT_EMPTY':'RECOVERY_SCHEMA_MISMATCH'});const [[h]]=await c.query('SELECT COUNT(*) n FROM schema_migrations');assert.equal(Number(h.n),5);}finally{await c.end();}}
});
qa('recovery rejects changed old data and already present history or marker',async()=>{
  for(const mode of ['old','history','marker']){const {c,plan}=await fixture();try{if(mode==='old')await c.query("INSERT INTO tags(name,slug) VALUES('QA fixture','qa-old-data')");if(mode==='history')await c.query('INSERT INTO schema_migrations(filename) VALUES(?)',[base.FILENAME]);if(mode==='marker')await c.query('INSERT INTO community_schema_state(singleton_id,migration_version) VALUES(1,7)');await assert.rejects(()=>apply(c,plan),{code:mode==='marker'?'RECOVERY_NOT_EMPTY':'RECOVERY_BASE_OR_TABLES_CHANGED'});}finally{await c.end();}}
});
qa('recovery refuses client/transaction concurrency and preserves read-only transaction diagnostics',async()=>{
  const {c,plan}=await fixture();let other;try{other=await mysql.createConnection({...credentials,database:plan.target.database});await other.query('START TRANSACTION READ ONLY');await other.query('SELECT COUNT(*) n FROM users');const [[id]]=await other.query('SELECT CONNECTION_ID() id');await assert.rejects(()=>run(c,plan),{code:'OTHER_CLIENT_CONNECTIONS'});await assert.rejects(()=>base.transactionGuard(c,'qa:external-read-only'),e=>{assert.equal(e.code,'OTHER_TRANSACTIONS');assert.ok(e.diagnostics.transactions.some(t=>t.connectionId===String(id.id)&&Number(t.readOnly)===1));return true;});await other.rollback();await other.end();other=null;await untouched(c);}finally{await other?.rollback();await other?.end();await c.end();}
});
qa('transaction arriving after the client scan is logged and aborts recovery',async()=>{
  const {c,plan}=await fixture();let other;try{let injected=false;const raced=proxy(c,{query:async(sql,...args)=>{const result=await c.query(sql,...args);if(!injected&&sql.startsWith('SELECT ID FROM information_schema.PROCESSLIST')){injected=true;other=await mysql.createConnection({...credentials,database:plan.target.database});await other.query('START TRANSACTION READ ONLY');await other.query('SELECT COUNT(*) n FROM users');await new Promise(r=>setTimeout(r,200));}return result;}});await assert.rejects(()=>apply(raced,plan),e=>e.code==='OTHER_TRANSACTIONS'&&e.diagnostics.phase==='recovery:precheck'&&!!e.diagnostics.runnerConnectionId&&e.diagnostics.transactions.length>0);await untouched(c);}finally{await other?.rollback();await other?.end();await c.end();}
});
qa('reconnect during the recovery transaction causes rollback and never a success report',async()=>{
  const {c,plan}=await fixture();try{const broken=proxy(c,{query:async(sql,...args)=>{const result=await c.query(sql,...args);if(sql.startsWith('INSERT INTO community_topics')){const transient=await mysql.createConnection(credentials);await transient.end();}return result;}});await assert.rejects(()=>apply(broken,plan),e=>e.code==='NEW_CONNECTION_DURING_MAINTENANCE'&&e.recoveryCommitState==='rolled-back');await untouched(c);}finally{await c.end();}
});
qa('lost COMMIT acknowledgement is reported unknown, preserves atomic state and forbids retry',async()=>{
  const {c,plan}=await fixture();try{const broken=proxy(c,{commit:async()=>{await c.commit();throw new base.GuardError('QA_COMMIT_ACK_LOST');}});await assert.rejects(()=>apply(broken,plan),e=>e.code==='QA_COMMIT_ACK_LOST'&&e.recoveryCommitState==='unknown');const [[m]]=await c.query('SELECT COUNT(*) n FROM community_schema_state'),[[h]]=await c.query('SELECT COUNT(*) n FROM schema_migrations');assert.equal(Number(m.n),1);assert.equal(Number(h.n),6);await assert.rejects(()=>apply(c,plan),{code:'RECOVERY_BASE_OR_TABLES_CHANGED'});await assert.rejects(()=>fs.stat(plan.reportPath),{code:'ENOENT'});}finally{await c.end();}
});
qa('recovery refuses tampered partial receipt or archive before any data write',async()=>{
  const {c,plan}=await fixture();try{const r=JSON.parse(await fs.readFile(plan.partialReceiptPath));r.payload.partialBaselineHash='0'.repeat(64);const receipt=path.join(config.outputDir,plan.target.database+'-tampered-receipt.json');await fs.writeFile(receipt,JSON.stringify(r));await assert.rejects(()=>apply(c,{...plan,partialReceiptPath:receipt}),{code:'RECEIPT_SIGNATURE'});const bad=path.join(config.outputDir,plan.target.database+'-bad-backup');await fs.mkdir(bad);for(const f of ['metadata.json','verified-baseline.json','main.sql.gz.aes'])await fs.copyFile(path.join(plan.partialBackupDir,f),path.join(bad,f));const bytes=await fs.readFile(path.join(bad,'main.sql.gz.aes'));bytes[0]^=1;await fs.writeFile(path.join(bad,'main.sql.gz.aes'),bytes);await assert.rejects(()=>apply(c,{...plan,partialBackupDir:bad}),{code:'BACKUP_HASH'});await untouched(c);}finally{await c.end();}
});
qa('recovery rejects authenticated but expired or incorrectly bound partial receipts',async()=>{
  const {c,plan}=await fixture(),pack=await base.backupPackage(plan.partialBackupDir,{expectedTables:44});try{const original=JSON.parse(await fs.readFile(plan.partialReceiptPath));for(const [label,change]of [['expired',p=>p.restore.verifiedAt=new Date(Date.now()-25*3600000).toISOString()],['source',p=>p.source.uuid='wrong-source'],['archive',p=>p.partialArchiveHash='0'.repeat(64)]]){const receipt=structuredClone(original);change(receipt.payload);receipt.signature=base.mac(pack.key,receipt.payload);const file=path.join(config.outputDir,plan.target.database+'-'+label+'.json');await fs.writeFile(file,JSON.stringify(receipt));await assert.rejects(()=>apply(c,{...plan,partialReceiptPath:file}),{code:'RECOVERY_RECEIPT_INVALID_OR_EXPIRED'});}await untouched(c);}finally{pack.key.fill(0);await c.end();}
});

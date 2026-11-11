// Opt-in isolated restore only. Never loads app .env or connects to port 3306.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {spawn,spawnSync}=require('node:child_process');
const mysql=require('mysql2/promise');
const runner=require('../scripts/migrate-discovery-007.cjs');
const enabled=process.env.DISCOVERY_007_RUNNER_QA;
const qa=(name,fn)=>test(name,{skip:!enabled},fn);
let config,credentials,sql,counter=0;
async function guard(c){const actual=await runner.identity(c);assert.equal(actual.port,3331);assert.notEqual(actual.uuid,config.source.uuid);assert.ok(path.resolve(actual.datadir).toLowerCase()===path.resolve(config.qaDatadir).toLowerCase());assert.notEqual(path.resolve(actual.datadir).toLowerCase(),path.resolve(config.source.datadir).toLowerCase());}
before(async()=>{
  if(!enabled)return;config=JSON.parse(await fs.readFile(enabled,'utf8'));assert.equal(config.qaPort,3331);
  const cmd='Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)))';
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(cmd,'utf16le').toString('base64')],{input:(await fs.readFile(config.qaPasswordDpapiFile)).toString('base64'),encoding:'utf8',windowsHide:true});assert.equal(r.status,0);
  credentials={host:'127.0.0.1',port:3331,user:'root',password:Buffer.from(r.stdout.trim(),'base64').toString(),dateStrings:true,supportBigNumbers:true,bigNumberStrings:true};
  const c=await mysql.createConnection(credentials);try{await guard(c);}finally{await c.end();}
  const pack=await runner.backupPackage(config.backupDir);
  try{const d=crypto.createDecipheriv('aes-256-gcm',pack.key,Buffer.from(pack.meta.iv,'base64'));d.setAuthTag(Buffer.from(pack.meta.tag,'base64'));sql=zlib.gunzipSync(Buffer.concat([d.update(await fs.readFile(path.join(config.backupDir,'main.sql.gz.aes'))),d.final()]));}finally{pack.key.fill(0);}
});
after(()=>{sql?.fill(0);});
async function fixture(){
  const name='discovery007_runner_'+Date.now()+String(++counter);let c=await mysql.createConnection(credentials);
  try{await guard(c);await c.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');}finally{await c.end();}
  const child=spawn(config.mysqlBinary,['--no-defaults','--host=127.0.0.1','--port=3331','--user=root','--database='+name,'--binary-mode=1','--default-character-set=utf8mb4'],{env:{...process.env,MYSQL_PWD:credentials.password},windowsHide:true,stdio:['pipe','ignore','pipe']});child.stderr.resume();
  const exited=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('QA restore failed')));child.once('exit',code=>code===0?resolve():reject(Error('QA restore failed')));});child.stdin.end(sql);await exited;
  c=await mysql.createConnection({...credentials,database:name});await guard(c);
  const target=await runner.identity(c);const plan={version:1,kind:'qa',target,backupDir:config.backupDir,receiptPath:config.receiptPath,reportPath:path.join(config.outputDir,name+'-postflight.json'),maintenance:{appRoot:path.join(config.outputDir,'no-app'),listenPorts:[39491],applicationStopped:true,externalWritersBlocked:true,cleanupWorkerStopped:true,expiresAt:new Date(Date.now()+3600000).toISOString()}};
  return{c,plan};
}
const quietOS=async()=>{};
const run=(c,plan,extra={})=>runner.run({connection:c,plan,osGuard:quietOS,...extra});
function proxy(c,query){return new Proxy(c,{get(target,key){if(key==='query')return query;const v=target[key];return typeof v==='function'?v.bind(target):v;}});}
async function unchanged(c,community=0){const [[r]]=await c.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LEFT(TABLE_NAME,10)='community_'");assert.equal(Number(r.n),community);const [[h]]=await c.query('SELECT COUNT(*) n FROM schema_migrations');assert.equal(Number(h.n),5);}
qa('runner check is read-only; explicit apply gate leaves main-clone schema untouched',async()=>{
  const {c,plan}=await fixture();try{assert.deepEqual(await run(c,plan),{check:'PASS',applied:false,applicationMustRemainStopped:true});await assert.rejects(()=>run(c,plan,{apply:true}),{code:'EXPLICIT_APPLY_APPROVAL_REQUIRED'});await unchanged(c);}finally{await c.end();}
});
qa('runner refuses Sleep clients and new transient connections, without KILL',async()=>{
  const {c,plan}=await fixture();let other;try{other=await mysql.createConnection({...credentials,database:plan.target.database});await assert.rejects(()=>run(c,plan),{code:'OTHER_CLIENT_CONNECTIONS'});await other.end();other=null;let once=false;await assert.rejects(()=>run(c,plan,{osGuard:async()=>{if(!once){once=true;const transient=await mysql.createConnection(credentials);await transient.end();}}}),{code:'NEW_CONNECTION_DURING_MAINTENANCE'});await unchanged(c);}finally{await other?.end();await c.end();}
});
qa('runner blocks changed DB identity, stale backup data and an existing report before DDL',async()=>{
  const {c,plan}=await fixture();try{await assert.rejects(()=>run(c,{...plan,target:{...plan.target,uuid:'wrong'}}),{code:'TARGET_IDENTITY_OR_VERSION'});await assert.rejects(()=>run(c,{...plan,reportPath:path.join(config.outputDir,'missing-'+plan.target.database,'report.json')}),{code:'REPORT_DIRECTORY_UNAVAILABLE'});await fs.writeFile(plan.reportPath,'existing');await assert.rejects(()=>run(c,plan),{code:'REPORT_ALREADY_EXISTS'});plan.reportPath+='-new';await c.query('SET SESSION TRANSACTION READ WRITE');await c.query("INSERT INTO tags(name,slug) VALUES('Synthetic QA changed baseline','qa-changed-baseline')");await assert.rejects(()=>run(c,plan),{code:'LIVE_DATABASE_DIFFERS_FROM_BACKUP'});await unchanged(c);}finally{await c.end();}
});
qa('runner rejects tampered restore receipt and corrupted encrypted backup',async()=>{
  const {c,plan}=await fixture();try{const r=JSON.parse(await fs.readFile(plan.receiptPath,'utf8'));r.payload.restore.verifiedAt=new Date().toISOString();const receipt=path.join(config.outputDir,'tampered-receipt.json');await fs.writeFile(receipt,JSON.stringify(r));await assert.rejects(()=>run(c,{...plan,receiptPath:receipt}),{code:'RECEIPT_SIGNATURE'});const bad=path.join(config.outputDir,'corrupt-backup-'+plan.target.database);await fs.mkdir(bad);for(const f of ['metadata.json','verified-baseline.json','main.sql.gz.aes'])await fs.copyFile(path.join(plan.backupDir,f),path.join(bad,f));const bytes=await fs.readFile(path.join(bad,'main.sql.gz.aes'));bytes[0]^=1;await fs.writeFile(path.join(bad,'main.sql.gz.aes'),bytes);await assert.rejects(()=>run(c,{...plan,backupDir:bad}),{code:'BACKUP_HASH'});await unchanged(c);}finally{await c.end();}
});
qa('runner rejects signed but expired or differently bound restore evidence',async()=>{
  const {c,plan}=await fixture();const pack=await runner.backupPackage(plan.backupDir);
  try{const original=JSON.parse(await fs.readFile(plan.receiptPath,'utf8'));const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
    for(const [label,change]of [['expired',p=>p.restore.verifiedAt=new Date(Date.now()-25*3600000).toISOString()],['baseline',p=>p.baselineHash='0'.repeat(64)],['archive',p=>p.archiveHash='0'.repeat(64)],['revision',p=>p.sqlSha256='0'.repeat(64)]]){const r=structuredClone(original);change(r.payload);r.signature=crypto.createHmac('sha256',pack.key).update(canonical(r.payload)).digest('hex');const receipt=path.join(config.outputDir,label+'-receipt.json');await fs.writeFile(receipt,JSON.stringify(r));await assert.rejects(()=>run(c,{...plan,receiptPath:receipt}),{code:'RESTORE_RECEIPT_INVALID_OR_EXPIRED'});}await unchanged(c);
  }finally{pack.key.fill(0);await c.end();}
});
qa('runner applies revision 3 once, validates exact contract and only then appends 007 history',async()=>{
  const {c,plan}=await fixture();try{await runner.operatingSystemGuard(plan);const result=await run(c,plan,{apply:true,approval:runner.POLICY});assert.equal(result.databasePostflight,'PASS');assert.equal(result.tables,14);assert.equal(result.applicationMustRemainStopped,true);assert.equal(result.realAccountSmoke,'PENDING_MANUAL_APPROVAL');const [[h]]=await c.query('SELECT COUNT(*) n FROM schema_migrations');assert.equal(Number(h.n),6);assert.equal((await fs.stat(plan.reportPath)).isFile(),true);await assert.rejects(()=>run(c,{...plan,reportPath:plan.reportPath+'-retry'}),{code:'COMMUNITY_ALREADY_PRESENT_OR_PARTIAL'});}finally{await c.end();}
});
qa('runner stops at first DDL error; no marker/history, no automatic retry or DROP',async()=>{
  const {c,plan}=await fixture();try{const broken=proxy(c,async(sql,...a)=>{if(sql.startsWith('CREATE TABLE community_posts'))throw new runner.GuardError('INJECTED_QA_DDL_FAILURE');return c.query(sql,...a);});await assert.rejects(()=>run(broken,plan,{apply:true,approval:runner.POLICY}),{code:'INJECTED_QA_DDL_FAILURE'});await unchanged(c,3);const [[m]]=await c.query('SELECT COUNT(*) n FROM community_schema_state');assert.equal(Number(m.n),0);await assert.rejects(()=>run(c,plan,{apply:true,approval:runner.POLICY}),{code:'COMMUNITY_ALREADY_PRESENT_OR_PARTIAL'});}finally{await c.end();}
});
qa('runner rolls back topic seed on marker failure while preserving committed DDL',async()=>{
  const {c,plan}=await fixture();try{const broken=proxy(c,async(sql,...a)=>{if(sql.startsWith('INSERT INTO community_schema_state'))throw new runner.GuardError('INJECTED_QA_SEED_FAILURE');return c.query(sql,...a);});await assert.rejects(()=>run(broken,plan,{apply:true,approval:runner.POLICY}),{code:'INJECTED_QA_SEED_FAILURE'});await unchanged(c,14);const [[t]]=await c.query('SELECT COUNT(*) n FROM community_topics'),[[s]]=await c.query('SELECT COUNT(*) n FROM community_schema_state');assert.equal(Number(t.n),0);assert.equal(Number(s.n),0);}finally{await c.end();}
});
qa('runner postflight detects a removed UNIQUE and never records success',async()=>{
  const {c,plan}=await fixture();try{const broken=proxy(c,async(sql,...a)=>{const r=await c.query(sql,...a);if(sql==='COMMIT')await c.query('ALTER TABLE community_topics DROP INDEX uq_community_topics_slug');return r;});await assert.rejects(()=>run(broken,plan,{apply:true,approval:runner.POLICY}),{code:'POSTFLIGHT_SCHEMA_CONTRACT'});await unchanged(c,14);await assert.rejects(()=>fs.stat(plan.reportPath),{code:'ENOENT'});}finally{await c.end();}
});
qa('runner detects a reconnect between DDL statements even after the connection has closed',async()=>{
  const {c,plan}=await fixture();try{let injected=false;const broken=proxy(c,async(sql,...a)=>{const r=await c.query(sql,...a);if(!injected&&sql.startsWith('CREATE TABLE ')){injected=true;const transient=await mysql.createConnection(credentials);await transient.end();}return r;});await assert.rejects(()=>run(broken,plan,{apply:true,approval:runner.POLICY}),{code:'NEW_CONNECTION_DURING_MAINTENANCE'});await unchanged(c,1);}finally{await c.end();}
});
qa('runner cannot attest source identity or a schema outside the dedicated restore prefix',async()=>{
  const {c,plan}=await fixture();try{await assert.rejects(()=>runner.verifyRestore({connection:c,backupDir:config.backupDir,sourceIdentity:plan.target,receiptPath:plan.reportPath}),{code:'RESTORE_ISOLATION'});await c.query('CREATE TABLE community_partial(id INT)');await assert.rejects(()=>runner.verifyRestore({connection:c,backupDir:config.backupDir,sourceIdentity:config.source,receiptPath:plan.reportPath}),{code:'RESTORE_ISOLATION'});}finally{await c.end();}
});

// Standalone 007 revision 3. Import/check never applies SQL. Never starts/stops apps or cleanup.
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {spawnSync}=require('node:child_process');
const mysql=require('mysql2/promise');
const REPO=path.resolve(__dirname,'..');
const SQL_SHA='42ac374c5a8ca28e3073130f464bee921aa64ea7a86563fd45c7c57b7d16c5df';
const CONTRACT_SHA='91075f898f124404fac84ab3b2a69939fc8b5c98f94b9b0ae9262d2e66f6535c';
const FILENAME='007_discovery_community.sql';
const HISTORY=['001_home_settings.sql','002_users.sql','003_content.sql','004_blueprint.sql','005_cyber_virtual_ips.mjs'];
const POLICY='revision-3-explicitly-approved';
class GuardError extends Error { constructor(code,diagnostics){super(code);this.code=code;if(diagnostics)this.diagnostics=diagnostics;} }
const fail=code=>{throw new GuardError(code);};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const identifier=value=>'`'+String(value).replaceAll('`','``')+'`';
const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
async function json(file){return JSON.parse(await fs.readFile(file,'utf8'));}
function unprotect(bytes){
  if(process.platform!=='win32')fail('WINDOWS_DPAPI_REQUIRED');
  const command='Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)))';
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  if(r.status!==0)fail('BACKUP_KEY_UNAVAILABLE');
  return Buffer.from(r.stdout.trim(),'base64');
}
async function backupPackage(backupDir,{expectedTables=30}={}){
  if(![30,44].includes(expectedTables))fail('BACKUP_SCOPE');
  const meta=await json(path.join(backupDir,'metadata.json'));
  if(meta.format!=='mysql-single-transaction-gzip-aes256gcm-dpapi-currentuser-v1'||!meta.database)fail('BACKUP_FORMAT');
  const archive=await fs.readFile(path.join(backupDir,'main.sql.gz.aes'));
  if(hash(archive)!==meta.archiveSha256||archive.length!==meta.bytes)fail('BACKUP_HASH');
  const key=unprotect(Buffer.from(meta.wrappedKey,'base64'));
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(meta.iv,'base64'));
    decipher.setAuthTag(Buffer.from(meta.tag,'base64'));
    const compressed=Buffer.concat([decipher.update(archive),decipher.final()]);
    try{const sql=zlib.gunzipSync(compressed,{maxOutputLength:256*1024*1024});try{if(!sql.length)fail('BACKUP_EMPTY');}finally{sql.fill(0);}}finally{compressed.fill(0);}
    const baseline=await json(path.join(backupDir,'verified-baseline.json'));
    const community=Object.keys(baseline).filter(t=>t.startsWith('community_'));
    if(Object.keys(baseline).length!==expectedTables||!baseline.users||!baseline.tags||!baseline.schema_migrations||Object.keys(baseline).some(t=>t.startsWith('blog_'))||community.length!==(expectedTables===44?14:0))fail('BACKUP_BASELINE');
    return {key,meta,baseline,baselineHash:hash(canonical(baseline))};
  }catch(e){key.fill(0);throw e;}
}
async function sqlContract(){
  const text=await fs.readFile(path.join(REPO,'sql/planned',FILENAME),'utf8');
  const bytes=await fs.readFile(path.join(REPO,'sql/planned/007_discovery_contract.json'));
  if(hash(text)!==SQL_SHA||hash(bytes)!==CONTRACT_SHA)fail('MIGRATION_CHECKSUM');
  const contract=JSON.parse(bytes);
  if(contract.sqlSha256!==SQL_SHA||contract.revision!==3||Object.keys(contract.tables).length!==14)fail('CONTRACT_INVALID');
  return {contract,statements:text.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean)};
}
async function identity(c){const [[r]]=await c.query('SELECT DATABASE() db,@@port port,@@server_uuid uuid,@@datadir datadir,VERSION() version');return{database:r.db,port:Number(r.port),uuid:r.uuid,datadir:r.datadir,version:r.version};}
function identityMatches(actual,expected){return actual.database===expected.database&&actual.port===Number(expected.port)&&actual.uuid===expected.uuid&&samePath(actual.datadir,expected.datadir);}
async function snapshotTables(c){
    const [tables]=await c.query("SELECT TABLE_NAME,ENGINE,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME");const out={};
    for(const t of tables){
      if(t.TABLE_TYPE!=='BASE TABLE'||t.ENGINE!=='InnoDB')fail('UNSUPPORTED_BASE_OBJECT');
      const [[ddl]]=await c.query('SHOW CREATE TABLE '+identifier(t.TABLE_NAME));
      const [cols]=await c.query('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,CHARACTER_SET_NAME,COLLATION_NAME,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[t.TABLE_NAME]);
      const [rows]=await c.query('SELECT * FROM '+identifier(t.TABLE_NAME));
      out[t.TABLE_NAME]={rows:rows.length,ddlCanonical:hash(ddl['Create Table'].replaceAll('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci','COLLATE utf8mb4_unicode_ci')),columns:hash(JSON.stringify(cols)),data:hash(rows.map(r=>hash(JSON.stringify(r))).sort().join('\n'))};
    }
    return out;
}
async function fingerprint(c){
  await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await c.query('SET SESSION TRANSACTION READ ONLY');await c.beginTransaction();
  try{return await snapshotTables(c);}finally{await c.rollback();}
}
function baseMatches(baseline,actual){return Object.keys(baseline).every(t=>actual[t]&&['rows','ddlCanonical','columns','data'].every(k=>baseline[t][k]===actual[t][k]));}
async function foreignKeys(c){
  const [rows]=await c.query('SELECT CONSTRAINT_NAME,TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION');
  const [[db]]=await c.query('SELECT DATABASE() db');const groups=new Map();
  for(const r of rows){if(r.REFERENCED_TABLE_SCHEMA!==db.db)fail('CROSS_DATABASE_FK');const k=r.TABLE_NAME+'.'+r.CONSTRAINT_NAME;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
  for(const cols of groups.values()){const k=cols[0];const [[r]]=await c.query(`SELECT COUNT(*) n FROM ${identifier(k.TABLE_NAME)} c LEFT JOIN ${identifier(k.REFERENCED_TABLE_NAME)} p ON ${cols.map(x=>`c.${identifier(x.COLUMN_NAME)}=p.${identifier(x.REFERENCED_COLUMN_NAME)}`).join(' AND ')} WHERE ${cols.map(x=>`c.${identifier(x.COLUMN_NAME)} IS NOT NULL`).join(' AND ')} AND p.${identifier(k.REFERENCED_COLUMN_NAME)} IS NULL`);if(Number(r.n))fail('FK_DATA_INVALID');}
  return groups.size;
}
const mac=(key,payload)=>crypto.createHmac('sha256',key).update(canonical(payload)).digest('hex');
function verifyMac(key,payload,signature){const expected=mac(key,payload);if(!/^[0-9a-f]{64}$/.test(signature||'')||!crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))fail('RECEIPT_SIGNATURE');}
async function verifyRestore({connection,backupDir,sourceIdentity,receiptPath}){
  // Only attests an existing isolated restore, never creates/restores a DB or applies SQL.
  const qa=await identity(connection);
  if(qa.port===3306||qa.uuid===sourceIdentity.uuid||!/^discovery007_(recovery|runner_restore)_\d+$/.test(qa.database)||samePath(qa.datadir,sourceIdentity.datadir))fail('RESTORE_ISOLATION');
  const pack=await backupPackage(backupDir);
  try{
    if(pack.meta.database!==sourceIdentity.database)fail('RESTORE_SOURCE_MISMATCH');
    const actual=await fingerprint(connection);
    if(Object.keys(actual).length!==30||!baseMatches(pack.baseline,actual))fail('RESTORE_BASELINE_MISMATCH');
    const fk=await foreignKeys(connection);if(fk!==32)fail('RESTORE_FK_COUNT');
    const payload={format:1,sqlSha256:SQL_SHA,contractSha256:CONTRACT_SHA,source:sourceIdentity,archiveHash:pack.meta.archiveSha256,baselineHash:pack.baselineHash,restore:{identity:qa,foreignKeys:fk,verifiedAt:new Date().toISOString()}};
    await fs.writeFile(receiptPath,JSON.stringify({payload,signature:mac(pack.key,payload)},null,2)+'\n',{flag:'wx',mode:0o600});return payload;
  }finally{pack.key.fill(0);}
}
async function validateReceipt(pack,receiptFile){
  const receipt=await json(receiptFile),p=receipt.payload;verifyMac(pack.key,p,receipt.signature);
  const age=Date.now()-Date.parse(p?.restore?.verifiedAt);
  if(p.format!==1||p.sqlSha256!==SQL_SHA||p.contractSha256!==CONTRACT_SHA||p.archiveHash!==pack.meta.archiveSha256||p.baselineHash!==pack.baselineHash||p.source?.database!==pack.meta.database||!Number.isFinite(age)||age<0||age>24*3600000||p.restore.foreignKeys!==32||p.restore.identity.uuid===p.source.uuid||p.restore.identity.port===3306||samePath(p.restore.identity.datadir,p.source.datadir))fail('RESTORE_RECEIPT_INVALID_OR_EXPIRED');
  return p;
}
function validatePlan(plan,source){
  if(plan.version!==1||!['local','qa'].includes(plan.kind)||!plan.target||!plan.maintenance||!path.isAbsolute(plan.backupDir)||!path.isAbsolute(plan.receiptPath)||!path.isAbsolute(plan.reportPath))fail('REVIEW_PLAN_REQUIRED');
  if(plan.kind==='local'){
    if(plan.target.database!=='personal_site'||plan.target.port!==3306||!identityMatches(plan.target,source)||!samePath(plan.maintenance.appRoot,REPO))fail('LOCAL_TARGET_REVIEW_MISMATCH');
  }else if(plan.target.port===3306||plan.target.uuid===source.uuid||!/^discovery007_runner_\d+$/.test(plan.target.database)||samePath(plan.target.datadir,source.datadir)||samePath(plan.maintenance.appRoot,REPO))fail('QA_ISOLATION');
  if(!path.isAbsolute(plan.maintenance.appRoot)||!Array.isArray(plan.maintenance.listenPorts)||!plan.maintenance.listenPorts.length||plan.maintenance.listenPorts.some(p=>!Number.isSafeInteger(p)||p<1||p>65535))fail('MAINTENANCE_SCOPE_REQUIRED');
}
async function operatingSystemGuard(plan){
  if(process.platform!=='win32')fail('WINDOWS_MAINTENANCE_PROBE_REQUIRED');
  const appRoot=path.resolve(plan.maintenance.appRoot).replaceAll('\\','/').replaceAll("'","''");const ports=plan.maintenance.listenPorts.join(',');
  const cmd=`$ErrorActionPreference='Stop'; $root='${appRoot}'; $p=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^node(\\.exe)?$' -and $_.CommandLine -and (($_.CommandLine.Replace('\\','/').IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match 'next[\\/]|next dev|next start|start-server|scripts[\\/]start\\.mjs') -or $_.CommandLine -match 'discovery-media-cleanup[.]cjs') } | Select-Object -ExpandProperty ProcessId); $l=@(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(${ports}) } | Select-Object -ExpandProperty LocalPort -Unique); [Console]::Out.Write((@{processes=$p;ports=$l}|ConvertTo-Json -Compress))`;
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(cmd,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
  if(r.status!==0)fail('MAINTENANCE_OS_UNVERIFIED');const s=JSON.parse(r.stdout);
  if(s.processes.length||s.ports.length)fail('APPLICATION_STILL_RUNNING');
}
const diagnosticContexts=new WeakMap();
async function transactionGuard(c,phase='maintenance'){
  let own=diagnosticContexts.get(c);
  if(!own){const [[r]]=await c.query('SELECT CONNECTION_ID() AS runnerConnectionId');own=String(r.runnerConnectionId);if(!/^[1-9][0-9]*$/.test(own))fail('CONNECTION_ID_UNVERIFIED');diagnosticContexts.set(c,own);}
  const [rows]=await c.query('SELECT trx_id AS transactionId,trx_mysql_thread_id AS connectionId,trx_state AS state,trx_started AS started,trx_is_read_only AS readOnly,trx_rows_modified AS rowsModified FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id<>? ORDER BY trx_mysql_thread_id,trx_id',[own]);
  // One snapshot, no PROCESSLIST join/filter and no exception for read-only or thread 0.
  if(rows.length)throw new GuardError('OTHER_TRANSACTIONS',{runnerConnectionId:own,phase,detectedAtUtc:new Date().toISOString(),transactions:rows.map(r=>({transactionId:String(r.transactionId),connectionId:String(r.connectionId),state:r.state,started:r.started,readOnly:r.readOnly,rowsModified:String(r.rowsModified)}))});
  return own;
}
async function maintenance(c,plan,expectedConnections,osGuard=operatingSystemGuard,phase='maintenance'){
  const m=plan.maintenance,remaining=Date.parse(m.expiresAt)-Date.now();
  if(m.applicationStopped!==true||m.externalWritersBlocked!==true||m.cleanupWorkerStopped!==true||!Number.isFinite(remaining)||remaining<=0||remaining>2*3600000)fail('MAINTENANCE_NOT_CONFIRMED');
  const [grants]=await c.query('SHOW GRANTS');
  const visibility=grants.some(r=>Object.values(r).some(value=>{const match=String(value).match(/^GRANT (.+) ON \*\.\* TO /);return match&&match[1].split(',').map(p=>p.trim()).some(p=>p==='ALL PRIVILEGES'||p==='PROCESS');}));
  if(!visibility)fail('PROCESS_VISIBILITY_REQUIRED');
  const [others]=await c.query("SELECT ID FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND USER NOT IN ('event_scheduler','system user')");
  if(others.length)fail('OTHER_CLIENT_CONNECTIONS');
  await transactionGuard(c,phase);
  const [[locks]]=await c.query("SELECT COUNT(*) n FROM performance_schema.metadata_locks WHERE OBJECT_SCHEMA=DATABASE() AND LOCK_STATUS='PENDING'");if(Number(locks.n))fail('PENDING_METADATA_LOCKS');
  const [[events]]=await c.query('SELECT COUNT(*) n FROM information_schema.EVENTS');if(Number(events.n))fail('DATABASE_EVENT_WRITER');
  const [replicas]=await c.query('SHOW REPLICA STATUS');if(replicas.length)fail('REPLICATION_WRITER');
  const [[status]]=await c.query("SHOW GLOBAL STATUS LIKE 'Connections'");const n=String(status.Value);
  if(expectedConnections!==undefined&&n!==expectedConnections)fail('NEW_CONNECTION_DURING_MAINTENANCE');
  await osGuard(plan);return n;
}
async function fresh(c,baseline){
  const current=await fingerprint(c);
  if(Object.keys(current).some(t=>t.startsWith('community_')))fail('COMMUNITY_ALREADY_PRESENT_OR_PARTIAL');
  if(Object.keys(current).length!==30||!baseMatches(baseline,current))fail('LIVE_DATABASE_DIFFERS_FROM_BACKUP');
  const [history]=await c.query('SELECT filename FROM schema_migrations ORDER BY filename');if(canonical(history.map(r=>r.filename))!==canonical(HISTORY))fail('MIGRATION_HISTORY_CONFLICT');
  for(const table of ['TRIGGERS','ROUTINES']){const schema=table==='TRIGGERS'?'TRIGGER_SCHEMA':'ROUTINE_SCHEMA';const [[r]]=await c.query(`SELECT COUNT(*) n FROM information_schema.${table} WHERE ${schema}=DATABASE()`);if(Number(r.n))fail('UNREVIEWED_DATABASE_OBJECT');}
  if(await foreignKeys(c)!==32)fail('BASE_FK_MISMATCH');
}
async function verifyHistory(c,baseline,actual,historyAdded=false){
  const before=baseline.schema_migrations,now=actual.schema_migrations;
  if(!now||before.ddlCanonical!==now.ddlCanonical||before.columns!==now.columns)fail('HISTORY_SCHEMA_CHANGED');
  const [rows]=await c.query('SELECT * FROM schema_migrations');const old=historyAdded?rows.filter(r=>r.filename!==FILENAME):rows;
  if(old.length!==before.rows||hash(old.map(r=>hash(JSON.stringify(r))).sort().join('\n'))!==before.data)fail('HISTORY_CHANGED');
  const expected=historyAdded?[...HISTORY,FILENAME]:HISTORY;
  if(canonical(rows.map(r=>r.filename).sort())!==canonical([...expected].sort()))fail('MIGRATION_HISTORY_CONFLICT');
}
async function postflight(c,baseline,contract,{inTransaction=false,historyAdded=false}={}){
  const actual=inTransaction?await snapshotTables(c):await fingerprint(c),tables=Object.keys(actual).filter(t=>t.startsWith('community_'));
  const core=historyAdded?Object.fromEntries(Object.entries(baseline).filter(([t])=>t!=='schema_migrations')):baseline;
  if(tables.length!==14||Object.keys(actual).length!==44||!baseMatches(core,actual))fail('POSTFLIGHT_BASE_OR_TABLES');
  await verifyHistory(c,baseline,actual,historyAdded);
  for(const [t,s]of Object.entries(contract.tables))if(!actual[t]||actual[t].ddlCanonical!==s.ddl||actual[t].columns!==s.columns)fail('POSTFLIGHT_SCHEMA_CONTRACT');
  const [state]=await c.query('SELECT singleton_id,migration_version,application_revision,completed_at FROM community_schema_state');
  if(state.length!==1||state[0].singleton_id!==1||state[0].migration_version!==7||state[0].application_revision!==3||!state[0].completed_at)fail('POSTFLIGHT_MARKER');
  const [topics]=await c.query('SELECT id,name,slug,is_visible,sort_order,deleted_at FROM community_topics ORDER BY id');
  const expected=[['Chia sẻ chung','chia-se-chung',10],['Hỏi đáp','hoi-dap',20],['Trải nghiệm','trai-nghiem',30]].map(([name,slug,sort_order],i)=>({id:'70000000-0000-4000-8000-00000000000'+(i+1),name,slug,is_visible:1,sort_order,deleted_at:null}));
  if(canonical(topics)!==canonical(expected))fail('POSTFLIGHT_SEEDS');
  for(const t of tables.filter(t=>!['community_schema_state','community_topics'].includes(t)))if(actual[t].rows!==0)fail('UNEXPECTED_COMMUNITY_WRITES');
  const [constraints]=await c.query("SELECT CONSTRAINT_TYPE,ENFORCED FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND LEFT(TABLE_NAME,10)='community_'");const counts={};
  for(const r of constraints){counts[r.CONSTRAINT_TYPE]=(counts[r.CONSTRAINT_TYPE]||0)+1;if(r.CONSTRAINT_TYPE==='CHECK'&&r.ENFORCED!=='YES')fail('CHECK_NOT_ENFORCED');}
  if(canonical(counts)!==canonical(contract.constraints)||await foreignKeys(c)!==58)fail('POSTFLIGHT_CONSTRAINTS');
  return{tables:14,constraints:counts,foreignKeys:58,basePreserved:true};
}
async function run({connection,plan,apply=false,approval,osGuard=operatingSystemGuard}){
  if(typeof apply!=='boolean')fail('EXPLICIT_MODE_REQUIRED');
  const {contract,statements}=await sqlContract(),pack=await backupPackage(plan.backupDir);let locked=false;
  try{
    const receipt=await validateReceipt(pack,plan.receiptPath);validatePlan(plan,receipt.source);
    const actual=await identity(connection);if(!identityMatches(actual,plan.target)||actual.version!=='8.0.46')fail('TARGET_IDENTITY_OR_VERSION');
    try{await fs.lstat(plan.reportPath);fail('REPORT_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
    try{if(!(await fs.stat(path.dirname(plan.reportPath))).isDirectory())fail('REPORT_DIRECTORY_UNAVAILABLE');await fs.access(path.dirname(plan.reportPath),require('node:fs').constants.W_OK);}catch{fail('REPORT_DIRECTORY_UNAVAILABLE');}
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    const generation=await maintenance(connection,plan,undefined,osGuard,'install:precheck');await fresh(connection,pack.baseline);
    await maintenance(connection,plan,generation,osGuard,'install:after-precheck');
    if(!apply)return{check:'PASS',applied:false,applicationMustRemainStopped:true};
    if(approval!==POLICY)fail('EXPLICIT_APPLY_APPROVAL_REQUIRED');
    const lockName=migrationLockName(actual);
    const [[lock]]=await connection.query('SELECT GET_LOCK(?,0) acquired',[lockName]);if(Number(lock.acquired)!==1)fail('MIGRATION_LOCK_BUSY');locked=lockName;
    await maintenance(connection,plan,generation,osGuard,'install:locked');await fresh(connection,pack.baseline);
    await connection.query('SET SESSION TRANSACTION READ WRITE');
    for(const [i,statement]of statements.entries()){await maintenance(connection,plan,generation,osGuard,`install:statement-${i+1}`);await connection.query(statement);}
    await maintenance(connection,plan,generation,osGuard,'install:before-postflight');
    const result=await postflight(connection,pack.baseline,contract);
    await maintenance(connection,plan,generation,osGuard,'install:after-postflight');
    await connection.query('SET SESSION TRANSACTION READ WRITE');await connection.beginTransaction();
    try{
      await connection.query('INSERT INTO schema_migrations(filename) VALUES(?)',[FILENAME]);
      const [old]=await connection.query('SELECT * FROM schema_migrations WHERE filename<>?',[FILENAME]);
      if(old.length!==pack.baseline.schema_migrations.rows||hash(old.map(r=>hash(JSON.stringify(r))).sort().join('\n'))!==pack.baseline.schema_migrations.data)fail('HISTORY_CHANGED');
      await maintenance(connection,plan,generation,osGuard,'install:before-history-commit');await connection.commit();
    }catch(e){await connection.rollback();throw e;}
    await maintenance(connection,plan,generation,osGuard,'install:after-history-commit');
    const report={sqlSha256:SQL_SHA,databasePostflight:'PASS',...result,historyAdded:FILENAME,applicationMustRemainStopped:true,realAccountSmoke:'PENDING_MANUAL_APPROVAL',cleanupEnabled:false,finishedAt:new Date().toISOString()};
    await fs.writeFile(plan.reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
  }catch(e){try{await connection.rollback();}catch{}throw e;}
  finally{if(locked)try{await connection.query('SELECT RELEASE_LOCK(?)',[locked]);}catch{}pack.key.fill(0);}
}
function argumentsOf(args){
  if(args.some(a=>a!=='--check'&&a!=='--apply'&&!a.startsWith('--review='))||args.filter(a=>a.startsWith('--review=')).length!==1||args.filter(a=>a==='--check'||a==='--apply').length>1)fail('INVALID_ARGUMENTS');
  const review=args.find(a=>a.startsWith('--review=')).slice(9);if(!path.isAbsolute(review))fail('ABSOLUTE_REVIEW_REQUIRED');return{review,apply:args.includes('--apply')};
}
function migrationLockName(actual){return 'discovery007:'+hash(canonical({uuid:actual.uuid,database:actual.database})).slice(0,48);}
module.exports={run,verifyRestore,fingerprint,snapshotTables,foreignKeys,baseMatches,identity,identityMatches,sqlContract,backupPackage,validateReceipt,validatePlan,argumentsOf,maintenance,transactionGuard,operatingSystemGuard,GuardError,POLICY,postflight,verifyHistory,migrationLockName,hash,canonical,mac,verifyMac,SQL_SHA,CONTRACT_SHA,FILENAME,HISTORY};
if(require.main===module){
  (async()=>{let c;try{
    const args=argumentsOf(process.argv.slice(2)),plan=await json(args.review);
    const host=process.env.DB_HOST??'127.0.0.1',port=Number(process.env.DB_PORT??3306),database=process.env.DB_NAME;
    if(!['127.0.0.1','localhost','::1'].includes(host)||port!==plan.target.port||database!==plan.target.database)fail('ENV_TARGET_MISMATCH');
    if(args.apply&&process.env.ALLOW_DISCOVERY_007_APPLY!==POLICY)fail('EXPLICIT_APPLY_APPROVAL_REQUIRED');
    c=await mysql.createConnection({host,port,database,user:process.env.DB_USER,password:process.env.DB_PASSWORD,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
    const result=await run({connection:c,plan,apply:args.apply,approval:process.env.ALLOW_DISCOVERY_007_APPLY});console.log(JSON.stringify(result));
  }catch(e){console.error(JSON.stringify({error:e instanceof GuardError?e.code:'DISCOVERY_007_FAILED_REDACTED',...(e instanceof GuardError&&e.diagnostics?{diagnostics:e.diagnostics}:{}),applicationMustRemainStopped:true,noAutomaticRetryOrRecovery:true}));process.exitCode=1;}finally{await c?.end();}})();
}

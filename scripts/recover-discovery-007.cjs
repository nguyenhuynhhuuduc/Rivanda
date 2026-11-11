// Only completes the reviewed empty 14-table state. No CREATE/ALTER/DROP or automatic retry.
'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const mysql=require('mysql2/promise');
const base=require('./migrate-discovery-007.cjs');
const {GuardError,hash,canonical,mac,verifyMac}=base;
const PURPOSE='discovery007-empty-recovery-v1';
const POLICY='revision-3-recovery-explicitly-approved';
const fail=code=>{throw new GuardError(code);};
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
function reviewShape(plan){
  if(plan.purpose!==PURPOSE||!path.isAbsolute(plan.partialBackupDir||'')||!path.isAbsolute(plan.partialReceiptPath||''))fail('RECOVERY_REVIEW_REQUIRED');
  if(samePath(plan.backupDir,plan.partialBackupDir))fail('RECOVERY_SEPARATE_BACKUP_REQUIRED');
}
async function emptyState(c,original,contract,{inTransaction=false}={}){
  const actual=inTransaction?await base.snapshotTables(c):await base.fingerprint(c);
  const names=Object.keys(actual),community=names.filter(t=>t.startsWith('community_'));
  if(names.length!==44||community.length!==14||!base.baseMatches(original,actual))fail('RECOVERY_BASE_OR_TABLES_CHANGED');
  for(const [table,expected]of Object.entries(contract.tables)){
    const t=actual[table];if(!t||t.ddlCanonical!==expected.ddl||t.columns!==expected.columns)fail('RECOVERY_SCHEMA_MISMATCH');
    if(t.rows!==0)fail('RECOVERY_NOT_EMPTY');
  }
  await base.verifyHistory(c,original,actual,false);
  const [constraints]=await c.query("SELECT CONSTRAINT_TYPE,ENFORCED FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND LEFT(TABLE_NAME,10)='community_'");const counts={};
  for(const r of constraints){counts[r.CONSTRAINT_TYPE]=(counts[r.CONSTRAINT_TYPE]||0)+1;if(r.CONSTRAINT_TYPE==='CHECK'&&r.ENFORCED!=='YES')fail('CHECK_NOT_ENFORCED');}
  if(canonical(counts)!==canonical(contract.constraints)||await base.foreignKeys(c)!==58)fail('RECOVERY_CONSTRAINTS');
  for(const [table,column]of [['TRIGGERS','TRIGGER_SCHEMA'],['ROUTINES','ROUTINE_SCHEMA']]){const [[r]]=await c.query(`SELECT COUNT(*) n FROM information_schema.${table} WHERE ${column}=DATABASE()`);if(Number(r.n))fail('UNREVIEWED_DATABASE_OBJECT');}
  return actual;
}
async function verifyPartialRestore({connection,plan,receiptPath}){
  reviewShape(plan);const {contract}=await base.sqlContract();let original,partial;
  try{
    original=await base.backupPackage(plan.backupDir);const sourceReceipt=await base.validateReceipt(original,plan.receiptPath);
    partial=await base.backupPackage(plan.partialBackupDir,{expectedTables:44});
    const qa=await base.identity(connection),source=sourceReceipt.source;
    if(qa.port===3306||qa.uuid===source.uuid||samePath(qa.datadir,source.datadir)||!/^discovery007_recovery_restore_\d+$/.test(qa.database))fail('RECOVERY_RESTORE_ISOLATION');
    if(partial.meta.database!==source.database||!base.baseMatches(original.baseline,partial.baseline))fail('RECOVERY_BACKUP_SOURCE_MISMATCH');
    const actual=await emptyState(connection,original.baseline,contract);
    if(!base.baseMatches(partial.baseline,actual))fail('RECOVERY_RESTORE_MISMATCH');
    const payload={format:PURPOSE,source,sqlSha256:base.SQL_SHA,contractSha256:base.CONTRACT_SHA,originalArchiveHash:original.meta.archiveSha256,originalBaselineHash:original.baselineHash,partialArchiveHash:partial.meta.archiveSha256,partialBaselineHash:partial.baselineHash,restore:{identity:qa,foreignKeys:58,verifiedAt:new Date().toISOString()}};
    await fs.writeFile(receiptPath,JSON.stringify({payload,signature:mac(partial.key,payload)},null,2)+'\n',{flag:'wx',mode:0o600});return payload;
  }finally{original?.key.fill(0);partial?.key.fill(0);}
}
async function recoveryReceipt(plan,original,partial,sourceReceipt){
  const receipt=await json(plan.partialReceiptPath),p=receipt.payload;verifyMac(partial.key,p,receipt.signature);
  const age=Date.now()-Date.parse(p?.restore?.verifiedAt);
  if(p.format!==PURPOSE||p.sqlSha256!==base.SQL_SHA||p.contractSha256!==base.CONTRACT_SHA||p.originalArchiveHash!==original.meta.archiveSha256||p.originalBaselineHash!==original.baselineHash||p.partialArchiveHash!==partial.meta.archiveSha256||p.partialBaselineHash!==partial.baselineHash||!base.identityMatches(p.source,sourceReceipt.source)||partial.meta.database!==p.source.database||p.restore?.foreignKeys!==58||!Number.isFinite(age)||age<0||age>86400000||p.restore.identity.port===3306||p.restore.identity.uuid===p.source.uuid||samePath(p.restore.identity.datadir,p.source.datadir)||!/^discovery007_recovery_restore_\d+$/.test(p.restore.identity.database))fail('RECOVERY_RECEIPT_INVALID_OR_EXPIRED');
  if(!base.baseMatches(original.baseline,partial.baseline))fail('RECOVERY_BACKUP_BASE_CHANGED');
  return p;
}
async function runRecovery({connection,plan,apply=false,approval,osGuard=base.operatingSystemGuard}){
  if(typeof apply!=='boolean')fail('EXPLICIT_MODE_REQUIRED');reviewShape(plan);
  const {contract,statements}=await base.sqlContract();let original,partial,locked=false,commitState='not-started';
  const guard=(generation,phase)=>base.maintenance(connection,plan,generation,osGuard,phase);
  try{
    original=await base.backupPackage(plan.backupDir);const sourceReceipt=await base.validateReceipt(original,plan.receiptPath);
    partial=await base.backupPackage(plan.partialBackupDir,{expectedTables:44});await recoveryReceipt(plan,original,partial,sourceReceipt);
    base.validatePlan(plan,sourceReceipt.source);const target=await base.identity(connection);
    if(!base.identityMatches(target,plan.target)||target.version!=='8.0.46')fail('TARGET_IDENTITY_OR_VERSION');
    try{await fs.lstat(plan.reportPath);fail('REPORT_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
    try{if(!(await fs.stat(path.dirname(plan.reportPath))).isDirectory())fail('REPORT_DIRECTORY_UNAVAILABLE');await fs.access(path.dirname(plan.reportPath),require('node:fs').constants.W_OK);}catch{fail('REPORT_DIRECTORY_UNAVAILABLE');}
    await connection.query('SET SESSION TRANSACTION READ ONLY');const generation=await guard(undefined,'recovery:precheck');
    const before=await emptyState(connection,original.baseline,contract);
    if(!base.baseMatches(partial.baseline,before))fail('RECOVERY_LIVE_DIFFERS_FROM_BACKUP');
    await guard(generation,'recovery:after-precheck');
    if(!apply)return{check:'PASS',applied:false,recoveryScope:PURPOSE,applicationMustRemainStopped:true};
    if(approval!==POLICY)fail('EXPLICIT_RECOVERY_APPROVAL_REQUIRED');
    const lockName=base.migrationLockName(target);const [[lock]]=await connection.query('SELECT GET_LOCK(?,0) acquired',[lockName]);if(Number(lock.acquired)!==1)fail('MIGRATION_LOCK_BUSY');locked=lockName;
    await guard(generation,'recovery:locked');
    const lockedState=await emptyState(connection,original.baseline,contract);if(!base.baseMatches(partial.baseline,lockedState))fail('RECOVERY_LIVE_DIFFERS_FROM_BACKUP');
    await connection.query('SET SESSION innodb_lock_wait_timeout=5');await connection.query('SET SESSION lock_wait_timeout=5');
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');await connection.query('SET SESSION TRANSACTION READ WRITE');
    await connection.beginTransaction();commitState='open';
    // Lock the empty ranges and old history before writing; no nested transaction/DDL.
    await connection.query('SELECT filename FROM schema_migrations ORDER BY filename FOR UPDATE');
    for(const table of Object.keys(contract.tables)){const [rows]=await connection.query('SELECT * FROM `'+table+'` FOR UPDATE');if(rows.length)fail('RECOVERY_NOT_EMPTY');}
    await emptyState(connection,original.baseline,contract,{inTransaction:true});
    const seeds=statements.filter(s=>/^INSERT INTO community_(topics|schema_state)\b/.test(s));if(seeds.length!==2)fail('RECOVERY_SEED_CONTRACT');
    for(const [i,sql]of seeds.entries()){await guard(generation,i===0?'recovery:before-topics':'recovery:before-marker');await connection.query(sql);}
    await guard(generation,'recovery:before-history');await connection.query('INSERT INTO schema_migrations(filename) VALUES(?)',[base.FILENAME]);
    await base.postflight(connection,original.baseline,contract,{inTransaction:true,historyAdded:true});
    await guard(generation,'recovery:before-commit');commitState='unknown';await connection.commit();commitState='committed';
    const post=await base.postflight(connection,original.baseline,contract,{historyAdded:true});
    await guard(generation,'recovery:after-postflight');
    const report={recoveryPostflight:'PASS',...post,marker:{migrationVersion:7,applicationRevision:3},seedTopics:3,historyAdded:base.FILENAME,commitState,applicationMustRemainStopped:true,realAccountSmoke:'PENDING',cleanupEnabled:false,finishedAt:new Date().toISOString()};
    await fs.writeFile(plan.reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
  }catch(e){
    try{await connection.rollback();if(commitState==='open')commitState='rolled-back';}catch{}
    e.recoveryCommitState=commitState;throw e;
  }finally{if(locked)try{await connection.query('SELECT RELEASE_LOCK(?)',[locked]);}catch{}original?.key.fill(0);partial?.key.fill(0);}
}
module.exports={runRecovery,verifyPartialRestore,emptyState,recoveryReceipt,PURPOSE,POLICY};
if(require.main===module){
  (async()=>{let c;try{
    const args=base.argumentsOf(process.argv.slice(2)),plan=await json(args.review);reviewShape(plan);
    const host=process.env.DB_HOST??'127.0.0.1',port=Number(process.env.DB_PORT??3306),database=process.env.DB_NAME;
    if(!['127.0.0.1','localhost','::1'].includes(host)||port!==plan.target.port||database!==plan.target.database)fail('ENV_TARGET_MISMATCH');
    if(args.apply&&process.env.ALLOW_DISCOVERY_007_RECOVERY!==POLICY)fail('EXPLICIT_RECOVERY_APPROVAL_REQUIRED');
    c=await mysql.createConnection({host,port,database,user:process.env.DB_USER,password:process.env.DB_PASSWORD,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
    console.log(JSON.stringify(await runRecovery({connection:c,plan,apply:args.apply,approval:process.env.ALLOW_DISCOVERY_007_RECOVERY})));
  }catch(e){console.error(JSON.stringify({error:e instanceof GuardError?e.code:'RECOVERY_007_FAILED_REDACTED',...(e instanceof GuardError&&e.diagnostics?{diagnostics:e.diagnostics}:{}),commitState:e.recoveryCommitState??'not-started',applicationMustRemainStopped:true,noAutomaticRetryOrRecovery:true}));process.exitCode=1;}finally{await c?.end();}})();
}

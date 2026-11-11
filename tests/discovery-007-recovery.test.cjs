const {test}=require('node:test');
const assert=require('node:assert/strict');
const base=require('../scripts/migrate-discovery-007.cjs');
const recovery=require('../scripts/recover-discovery-007.cjs');
test('transaction guard pins own ID and records sanitized phase/time/transaction metadata',async()=>{
  let idQueries=0;const rows=[{transactionId:'901',connectionId:'88',state:'RUNNING',started:'2026-11-10 16:23:16',readOnly:1,rowsModified:'0',SQL_TEXT:'must not be logged',password:'must not be logged'}];
  const c={query:async(sql,args)=>{if(sql==='SELECT CONNECTION_ID() AS runnerConnectionId'){idQueries++;return[[{runnerConnectionId:77}]];}assert.ok(!sql.includes('PROCESSLIST'));assert.deepEqual(args,['77']);return[rows];}};
  for(const phase of ['recovery:before-marker','recovery:before-history'])await assert.rejects(()=>base.transactionGuard(c,phase),e=>{assert.equal(e.code,'OTHER_TRANSACTIONS');assert.equal(e.diagnostics.runnerConnectionId,'77');assert.equal(e.diagnostics.phase,phase);assert.ok(Number.isFinite(Date.parse(e.diagnostics.detectedAtUtc)));assert.deepEqual(e.diagnostics.transactions,[{transactionId:'901',connectionId:'88',state:'RUNNING',started:'2026-11-10 16:23:16',readOnly:1,rowsModified:'0'}]);return true;});
  assert.equal(idQueries,1);
});
test('transaction guard never exempts read-only, missing PROCESSLIST or thread zero',async()=>{
  for(const connectionId of ['0','88']){const c={query:async sql=>sql==='SELECT CONNECTION_ID() AS runnerConnectionId'?[[{runnerConnectionId:77}]]:[[{transactionId:'1',connectionId,state:'RUNNING',started:null,readOnly:1,rowsModified:'0'}]]};await assert.rejects(()=>base.transactionGuard(c,'test'),e=>e.code==='OTHER_TRANSACTIONS'&&e.diagnostics.transactions[0].connectionId===connectionId);}
});
test('snapshotTables cannot begin/commit/rollback inside the recovery transaction',async()=>{
  const c={query:async sql=>{assert.ok(sql.startsWith('SELECT TABLE_NAME,ENGINE,TABLE_TYPE'));return[[]];}};
  assert.deepEqual(await base.snapshotTables(c),{});
});
test('recovery requires its own purpose and separate approval policy',async()=>{
  assert.notEqual(recovery.POLICY,base.POLICY);
  await assert.rejects(()=>recovery.runRecovery({connection:{query:()=>assert.fail()},plan:{purpose:'old-install'}}),{code:'RECOVERY_REVIEW_REQUIRED'});
  await assert.rejects(()=>recovery.runRecovery({connection:{query:()=>assert.fail()},plan:{},apply:'false'}),{code:'EXPLICIT_MODE_REQUIRED'});
});

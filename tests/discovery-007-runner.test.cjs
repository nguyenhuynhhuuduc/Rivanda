const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const runner=require('../scripts/migrate-discovery-007.cjs');
test('007 CLI defaults to check and requires one absolute review path',()=>{
  const review=path.resolve('review.json');assert.deepEqual(runner.argumentsOf(['--review='+review]),{review,apply:false});
  assert.equal(runner.argumentsOf(['--apply','--review='+review]).apply,true);
  for(const args of [[],['--force'],['--review=relative.json'],['--review='+review,'--review='+review],['--check','--apply','--review='+review],['--apply','--apply','--review='+review]])assert.throws(()=>runner.argumentsOf(args));
});
test('007 pins SQL revision 3 and exact 14-table schema contract',async()=>{
  const {contract,statements}=await runner.sqlContract();assert.equal(contract.revision,3);assert.equal(Object.keys(contract.tables).length,14);
  assert.equal(statements.filter(s=>s.startsWith('CREATE TABLE ')).length,14);
  assert.equal(statements.filter(s=>/^ALTER|^DROP|^DELETE|^UPDATE/.test(s)).length,0);
  assert.ok(!statements.some(s=>s.includes('blog_')));
  assert.equal(statements.at(-1),'COMMIT');
});
test('007 rejects absent, expired or ambiguous maintenance acknowledgements before SQL',async()=>{
  const c={query:()=>assert.fail('No SQL expected')};const good={applicationStopped:true,externalWritersBlocked:true,cleanupWorkerStopped:true,expiresAt:new Date(Date.now()+60000).toISOString()};
  for(const maintenance of [{...good,applicationStopped:false},{...good,externalWritersBlocked:false},{...good,cleanupWorkerStopped:false},{...good,expiresAt:null},{...good,expiresAt:new Date(Date.now()-1000).toISOString()},{...good,expiresAt:new Date(Date.now()+3*3600000).toISOString()}])await assert.rejects(()=>runner.maintenance(c,{maintenance}),{code:'MAINTENANCE_NOT_CONFIRMED'});
});
test('007 rejects limited process visibility and any external client, even Sleep',async()=>{
  const plan={maintenance:{applicationStopped:true,externalWritersBlocked:true,cleanupWorkerStopped:true,expiresAt:new Date(Date.now()+60000).toISOString()}};
  await assert.rejects(()=>runner.maintenance({query:async()=>[[{'Grants':'GRANT SELECT ON *.*'}]]},plan),{code:'PROCESS_VISIBILITY_REQUIRED'});
  await assert.rejects(()=>runner.maintenance({query:async()=>[[{'Grants':"GRANT ALL PRIVILEGES ON `qa`.* TO 'qa'@'localhost'"}]]},plan),{code:'PROCESS_VISIBILITY_REQUIRED'});
  await assert.rejects(()=>runner.maintenance({query:async sql=>sql==='SHOW GRANTS'?[[{'Grants':"GRANT PROCESS ON *.* TO 'qa'@'localhost'"}]]:[[{ID:49}]]},plan),{code:'OTHER_CLIENT_CONNECTIONS'});
});
test('007 QA review cannot target main server, datadir or database',()=>{
  const source={database:'personal_site',port:3306,uuid:'main-uuid',datadir:path.resolve('main-data')};
  const plan={version:1,kind:'qa',target:{database:'discovery007_runner_1',port:3331,uuid:'qa-uuid',datadir:path.resolve('qa-data')},backupDir:path.resolve('backup'),receiptPath:path.resolve('receipt'),reportPath:path.resolve('report'),maintenance:{appRoot:path.resolve('qa-app'),listenPorts:[39491]}};
  runner.validatePlan(plan,source);
  for(const target of [{...plan.target,port:3306},{...plan.target,uuid:source.uuid},{...plan.target,datadir:source.datadir},{...plan.target,database:'personal_site'}])assert.throws(()=>runner.validatePlan({...plan,target},source),{code:'QA_ISOLATION'});
});
test('007 baseline comparison includes schema, columns, row counts and all data hashes',()=>{
  const row={rows:1,ddlCanonical:'ddl',columns:'columns',data:'data'};const b={users:row};assert.ok(runner.baseMatches(b,{users:{...row}}));
  for(const key of Object.keys(row))assert.equal(runner.baseMatches(b,{users:{...row,[key]:'changed'}}),false);
  assert.equal(runner.baseMatches(b,{}),false);
});

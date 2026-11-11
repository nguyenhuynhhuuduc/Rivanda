// Fixture-only action/render tests. No .env, MySQL, emails or real uploads.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {discoveryLoader,root}=require('./helpers/discovery-loader.cjs');
const id='72000000-0000-4000-8000-000000000001',owner={id:'72000000-0000-4000-8000-000000000002',role:'member'};
const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);
function actionHarness(){
  let user=owner,old={authorId:owner.id,revision:1},writes=0,uploads=0,fail=false;
  const load=discoveryLoader({}, {'@/lib/auth':{getCurrentUser:async()=>user},'@/lib/discovery-community/read':{getCommunityPost:async()=>old},
    '@/lib/discovery-community/media':{validateFiles:()=>{},prepareMedia:async()=>{uploads++;return[];}},
    '@/lib/discovery-community/store':{saveCommunityPost:async()=>{writes++;if(fail)throw Error('SQL internal credential sentinel');return id;},deleteCommunityPost:async()=>{writes++;},moderateCommunityPost:async()=>{writes++;}},
    'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:url=>{throw Object.assign(Error('REDIRECT'),{url});}}});
  return{actions:load('src/app/(light)/discovery/community-actions.ts'),setUser:x=>user=x,setOld:x=>old=x,setFail:()=>fail=true,counters:()=>({writes,uploads})};
}
function form(extra={}){const f=new FormData();for(const[k,v]of Object.entries({kind:'status',title:'',body:'QA action',topicId:'',visibility:'public',intent:'publish',tags:'qa',...extra}))f.set(k,v);return f;}
test('actions reject guest before storage, writes and moderation',async()=>{const h=actionHarness();h.setUser(null);for(const key of ['savePostAction','deletePostAction','moderatePostAction'])assert.ok((await h.actions[key]({},form())).error);assert.equal(h.counters().uploads,0);assert.equal(h.counters().writes,0);});
test('edit preflight rejects wrong owner / stale revision before image processing',async()=>{for(const old of [{authorId:id,revision:1},{authorId:owner.id,revision:2},null]){const h=actionHarness();h.setOld(old);assert.ok((await h.actions.savePostAction({},form({id,revision:'1'}))).error);assert.equal(h.counters().uploads,0);assert.equal(h.counters().writes,0);}});
test('runtime validation rejects malformed kind/body/ID/revision/tags',async()=>{for(const extra of [{kind:'shell'},{body:'x'.repeat(1001)},{id:'bad',revision:'1'},{id,revision:'NaN'},{tags:'x'.repeat(40)}]){const h=actionHarness();assert.ok((await h.actions.savePostAction({},form(extra))).error);assert.equal(h.counters().writes,0);assert.equal(h.counters().uploads,0);}});
test('successful action redirects to exact post, generic DB errors do not leak internals',async()=>{const h=actionHarness();await assert.rejects(()=>h.actions.savePostAction({},form()),e=>e.url===`/discovery/posts/${id}?saved=1`);assert.equal(h.counters().writes,1);const broken=actionHarness();broken.setFail();const result=await broken.actions.savePostAction({},form());assert.match(result.error,/Không thể xử lý/);assert.doesNotMatch(result.error,/SQL|credential|sentinel/);});
test('delete needs confirmation; moderation requires server Admin',async()=>{const h=actionHarness();assert.ok((await h.actions.deletePostAction({},form({id,revision:'1'}))).error);assert.ok((await h.actions.moderatePostAction({},form({id,revision:'1',decision:'hide',note:'QA'}))).error);assert.equal(h.counters().writes,0);await assert.rejects(()=>h.actions.deletePostAction({},form({id,revision:'1',confirm:'yes'})),e=>e.url==='/account/discovery?deleted=1');});
test('post card escapes content, real media route and post-specific URL; no inert interaction controls',()=>{
  const load=discoveryLoader({}, {'next/link':Link,'./SharePost':{SharePost:({id})=>React.createElement('a',{href:`/discovery/posts/${id}`},'Share')}}),{PostCard}=load('src/components/discovery-community/PostCard.tsx');
  const p={id,authorId:owner.id,authorName:'QA <img onerror=x>',avatar:null,title:'<script>title</script>',body:'<script>content</script>',publishedAt:new Date(),createdAt:new Date(),visibility:'public',media:[{id,width:10,height:10}],tags:['qa'],likes:2,saves:1,comments:3};
  const html=render(React.createElement(PostCard,{post:p}));assert.doesNotMatch(html,/<script>|<img onerror/);assert.ok(html.includes(`/api/discovery/media/${id}?size=thumb`));assert.ok(html.includes(`/discovery/posts/${id}`));assert.ok(html.includes('2'));assert.doesNotMatch(html,/<button/);
});
test('media API: denied access, malformed UUID and path traversal never read disk',async()=>{
  for(const file of [null,'../secret.webp','not-a-uuid.webp']){let reads=0;const route=discoveryLoader({}, {'@/lib/auth':{getCurrentUser:async()=>null},'@/lib/discovery-community/read':{getMedia:async()=>file},'@/lib/uploads':{UPLOAD_DIR:'/qa-only'},'fs/promises':{readFile:async()=>{reads++;return Buffer.from('image');}}})('src/app/api/discovery/media/[id]/route.ts');const r=await route.GET(new Request('https://qa.invalid/api/discovery/media/'+id),{params:Promise.resolve({id})});assert.equal(r.status,404);assert.equal(reads,0);}
});
test('media API: valid authorized image is no-store, nosniff and inline',async()=>{
  const route=discoveryLoader({}, {'@/lib/auth':{getCurrentUser:async()=>owner},'@/lib/discovery-community/read':{getMedia:async()=>id+'.webp'},'@/lib/uploads':{UPLOAD_DIR:'/qa-only'},'@/lib/discovery-community/files.cjs':{namespace:async()=>'/qa-only/discovery',filePath:(r,n)=>r+'/'+n},'fs/promises':{readFile:async()=>Buffer.from('image')}})('src/app/api/discovery/media/[id]/route.ts');const r=await route.GET(new Request('https://qa.invalid/api/discovery/media/'+id),{params:Promise.resolve({id})});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
});
test('Discovery writes use Server Actions and existing Next CSRF protections; no cross-domain legacy writes',()=>{
  const source=fs.readFileSync(path.join(root,'src/app/(light)/discovery/community-actions.ts'),'utf8');assert.ok(source.startsWith('"use server"'));assert.doesNotMatch(source,/lib\/blog|lib\/discovery"|lib\/community"|createSession/);
  const config=fs.readFileSync(path.join(root,'next.config.mjs'),'utf8');assert.doesNotMatch(config,/allowedOrigins|disable.*csrf/i);
});

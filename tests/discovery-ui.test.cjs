// Read-only fixture tests: no env, database connections, real accounts or storage writes.
const test=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup:render}=require('react-dom/server');
const {discoveryLoader}=require('./helpers/discovery-loader.cjs');
const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);
const actor={id:'74000000-0000-4000-8000-000000000002',role:'member',displayName:'UI Fixture'};
const post={id:'74000000-0000-4000-8000-000000000001',authorId:actor.id,authorName:'UI Fixture',avatar:null,kind:'status',title:'A real service result',body:'Content',visibility:'public',status:'published',revision:1,createdAt:new Date(),publishedAt:new Date(),likes:3,comments:2,saves:1,liked:false,saved:false,media:[],tags:[],reviewNote:null};
const load=discoveryLoader({}, {'next/link':Link});
test('effective labels never call draft/pending/hidden publicly visible',()=>{
  const {PostStateBadge,PostStateNotice}=load('src/components/discovery-community/DiscoveryUI.tsx');
  for(const status of ['draft','pending','hidden','rejected']) { const html=render(React.createElement(PostStateBadge,{status,visibility:'public'}));assert.doesNotMatch(html,/Công khai/);assert.ok(render(React.createElement(PostStateNotice,{status,visibility:'public'})).length>20); }
  assert.match(render(React.createElement(PostStateBadge,{status:'published',visibility:'private'})),/Riêng tư/);
  assert.match(render(React.createElement(PostStateNotice,{status:'published',visibility:'private'})),/Admin/);
});
test('guest interaction links preserve exact feed filters, post and comment destination; unsafe next is rejected',()=>{
  const {SocialBar}=load('src/components/discovery-community/Interactions.tsx');
  const next='/discovery?order=popular&q=hello&topic=chia-se-chung&cursor=fixture';
  const html=render(React.createElement(SocialBar,{postId:post.id,likes:3,saves:1,comments:2,active:true,loggedIn:false,returnTo:next}));
  assert.ok(html.includes('/login?next='+encodeURIComponent(next)));assert.ok(html.includes('/login?next='+encodeURIComponent(`/discovery/posts/${post.id}#comments`)));assert.doesNotMatch(html,/<form/);
  const {discoveryLoginHref}=load('src/components/discovery-community/DiscoveryUI.tsx');
  for(const s of ['https://outside.invalid','//outside.invalid','/\\outside.invalid','/\n/evil'])assert.equal(discoveryLoginHref(s),'/login?next=%2F');
});
test('signed-in social controls retain desired state, real action fields and accessible pressed state',()=>{
  const {SocialBar}=load('src/components/discovery-community/Interactions.tsx');
  const html=render(React.createElement(SocialBar,{postId:post.id,likes:3,saves:1,comments:2,liked:true,saved:false,active:true,loggedIn:true}));
  for(const s of ['name="postId"','value="like:off"','value="save:on"','aria-pressed="true"','3','2'])assert.ok(html.includes(s));
});
test('suggestions use existing public popular query; recommendation failure leaves the main feed usable',async()=>{
  let fail=false,calls=[];
  const page=discoveryLoader({}, {'next/link':Link,'@/lib/auth':{getCurrentUser:async()=>null},'@/lib/discovery-community/read':{communityReady:async()=>true,communityTopics:async()=>[],communityFeed:async f=>{calls.push(f);if(f.order==='popular'&&fail)throw Error('fixture');return{posts:[post],next:null};}}})('src/app/(light)/discovery/page.tsx');
  let html=render(await page.default({searchParams:Promise.resolve({q:'hello'})}));assert.ok(calls.some(f=>f.order==='popular'&&!f.q&&!f.authorId));assert.match(html,/Đáng chú ý trong tuần/);assert.match(html,/A real service result/);
  fail=true;calls=[];html=render(await page.default({searchParams:Promise.resolve({})}));assert.match(html,/Chưa tải được gợi ý/);assert.match(html,/A real service result/);
});
test('empty recommendations have no fake people, ranks or post counts',async()=>{
  const page=discoveryLoader({}, {'next/link':Link,'@/lib/auth':{getCurrentUser:async()=>null},'@/lib/discovery-community/read':{communityReady:async()=>true,communityTopics:async()=>[],communityFeed:async()=>({posts:[],next:null})}})('src/app/(light)/discovery/page.tsx');
  const html=render(await page.default({searchParams:Promise.resolve({})}));assert.match(html,/Chưa có bài công khai trong tuần để gợi ý/);assert.doesNotMatch(html,/người đang online|1\.2k|Top 1/);
});
test('oversized popular cursor keeps safe Discovery filters instead of returning Login to Home',async()=>{
  const page=discoveryLoader({}, {'next/link':Link,'@/lib/auth':{getCurrentUser:async()=>null},'@/lib/discovery-community/read':{communityReady:async()=>true,communityTopics:async()=>[],communityFeed:async()=>({posts:[post],next:null})}})('src/app/(light)/discovery/page.tsx');
  const html=render(await page.default({searchParams:Promise.resolve({order:'popular',q:'hello',topic:'chia-se-chung',cursor:'x'.repeat(3000)})}));
  assert.ok(html.includes('/login?next='+encodeURIComponent('/discovery?order=popular&q=hello&topic=chia-se-chung')));assert.ok(!html.includes('href="/login?next=%2F"'));
});
test('feed failure does not claim recommendations are truly empty',async()=>{
  const page=discoveryLoader({}, {'next/link':Link,'@/lib/auth':{getCurrentUser:async()=>null},'@/lib/discovery-community/read':{communityReady:async()=>true,communityTopics:async()=>[],communityFeed:async()=>{throw Error('fixture');}}})('src/app/(light)/discovery/page.tsx');
  const html=render(await page.default({searchParams:Promise.resolve({})}));assert.match(html,/Gợi ý tạm chưa khả dụng/);assert.doesNotMatch(html,/Chưa có bài công khai trong tuần để gợi ý/);
});
test('existing login action returns to exact Discovery destination after validated login, rejects external redirect',async()=>{
  const redirect=url=>{throw Object.assign(Error('REDIRECT'),{url});};
  const auth=discoveryLoader({}, {'next/headers':{headers:async()=>new Map()},'next/navigation':{redirect},'@/lib/auth':{createSession:async()=>{},destroySession:async()=>{}},'@/lib/password':{verifyPassword:async()=>true,dummyVerify:async()=>{}},'@/lib/ratelimit':{isBlocked:async()=>false,clearAttempts:async()=>{},recordFailure:async()=>{}},'@/lib/users':{findUserByEmail:async()=>({id:actor.id,passwordHash:'synthetic-only',isActive:true}),touchLogin:async()=>{}},'@/lib/password-reset':{}})('src/app/(auth)/actions.ts');
  for(const next of ['/discovery?topic=chia-se-chung&q=hello',`/discovery/posts/${post.id}#comments`,'https://outside.invalid']) {const fd=new FormData();fd.set('email','ui-fixture@example.invalid');fd.set('password','synthetic-only');fd.set('next',next);await assert.rejects(()=>auth.loginAction({},fd),e=>e.url===(next.startsWith('https:')?'/':next));}
});

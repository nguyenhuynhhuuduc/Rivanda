// OAuth tests: synthetic provider responses, real JWT cryptography, no .env/real DB.
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server'),{NextRequest}=require('next/server'),jose=require('jose');
const {discoveryLoader}=require('./helpers/discovery-loader.cjs');
const env={APP_URL:'https://site.example.invalid',SESSION_SECRET:'synthetic-oauth-session-secret-for-tests-only',GOOGLE_CLIENT_ID:'test-google-client',GOOGLE_CLIENT_SECRET:'test-google-secret',FACEBOOK_APP_ID:'test-facebook-app',FACEBOOK_APP_SECRET:'test-facebook-secret'};
const load=(mocks={},globals={},db={})=>discoveryLoader(db,mocks,{process:{env},TextEncoder,AbortSignal,...globals});
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',isActive:true,role:'member'};
const profile={id:'provider-123',email:'oauth@example.invalid',emailVerified:true,firstName:'OAuth',lastName:'Fixture',avatarUrl:null};
const ctx=provider=>({params:Promise.resolve({provider})});
const headersMock=jar=>({cookies:async()=>({get:k=>jar.has(k)?{value:jar.get(k)}:undefined,set:(k,v,options)=>jar.set(k,v),delete:k=>jar.delete(k)})});
const location=r=>new URL(r.headers.get('location'));
const state=load()('src/lib/oauth-state.ts');

test('Signed flow binds provider/state/expiry/purpose, clamps redirect and rejects tampering',async()=>{
  const {token,flow}=await state.createOAuthFlow('google','//evil.invalid');
  assert.equal((await state.readOAuthFlow(token,'google',flow.state)).next,'/');
  for(const [t,p,s]of [[token,'facebook',flow.state],[token,'google','b'.repeat(64)],[token.slice(0,-8)+'tampered','google',flow.state],['','google',flow.state]])assert.equal(await state.readOAuthFlow(t,p,s),null);
  const expired=await new jose.SignJWT(flow).setProtectedHeader({alg:'HS256'}).setAudience('oauth-flow-v1').setIssuedAt(1).setExpirationTime(2).sign(crypto.createHash('sha256').update('oauth-flow-v1\0'+env.SESSION_SECRET).digest());
  assert.equal(await state.readOAuthFlow(expired,'google',flow.state),null);
});

for(const provider of ['google','facebook'])test(`${provider} start uses official endpoint + exact callback; linking requires same-origin POST and website session`,async()=>{
  let current=null;const jar=new Map();const start=load({'next/headers':headersMock(jar),'@/lib/auth':{getCurrentUser:async()=>current}})('src/app/api/auth/[provider]/start/route.ts');
  let res=await start.GET(new NextRequest(`${env.APP_URL}/api/auth/${provider}/start?next=%2Fdiscovery%3Fsort%3Dfollowing`),ctx(provider));
  const target=location(res);assert.equal(target.hostname,provider==='google'?'accounts.google.com':'www.facebook.com');assert.equal(target.searchParams.get('redirect_uri'),`${env.APP_URL}/api/auth/${provider}/callback`);
  const flow=await state.readOAuthFlow(jar.get('oauth_flow'),provider,target.searchParams.get('state'));assert.equal(flow.next,'/discovery?sort=following');assert.equal(flow.userId,null);
  if(provider==='google'){assert.equal(target.searchParams.get('nonce'),flow.nonce);assert.equal(target.searchParams.get('code_challenge'),crypto.createHash('sha256').update(flow.verifier).digest('base64url'));}
  res=await start.POST(new NextRequest(`${env.APP_URL}/api/auth/${provider}/start`,{method:'POST',headers:{origin:'https://evil.invalid'}}),ctx(provider));assert.equal(res.status,403);
  res=await start.POST(new NextRequest(`${env.APP_URL}/api/auth/${provider}/start`,{method:'POST',headers:{origin:env.APP_URL}}),ctx(provider));assert.equal(location(res).pathname,'/login');
  current=user;jar.set('session','synthetic-session-A');res=await start.POST(new NextRequest(`${env.APP_URL}/api/auth/${provider}/start`,{method:'POST',headers:{origin:env.APP_URL}}),ctx(provider));
  const linked=await state.readOAuthFlow(jar.get('oauth_flow'),provider,location(res).searchParams.get('state'));assert.equal(linked.userId,user.id);assert.equal(linked.sessionHash,state.sessionFingerprint('synthetic-session-A'));assert.equal(linked.next,'/account/security');
});

for(const provider of ['google','facebook'])for(const mode of ['login','link','changed-session','changed-user','guest-link','email-exists','replay','cancel','already-signed-in'])test(`${provider} callback ${mode}: ownership, session and session creation`,async()=>{
  const linking=['link','changed-session','changed-user','guest-link'].includes(mode);
  const issued=await state.createOAuthFlow(provider,'/discovery/posts/test',linking?{id:user.id,session:'synthetic-session-A'}:undefined);
  const jar=new Map([['oauth_flow',issued.token],['session',mode==='changed-session'?'synthetic-session-B':'synthetic-session-A']]);
  let sessions=0,links=0,logins=0,fetches=0;
  const current=linking?(mode==='guest-link'?null:mode==='changed-user'?{...user,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}:user):mode==='already-signed-in'?user:null;
  const real=load()('src/lib/oauth.ts');
  const callback=load({'next/headers':headersMock(jar),'@/lib/auth':{getCurrentUser:async()=>current,createSession:async id=>{assert.equal(id,user.id);sessions++;}},'@/lib/oauth':{...real,fetchProfile:async(p,c,v,n)=>{assert.equal(p,provider);assert.equal(v,issued.flow.verifier);assert.equal(n,issued.flow.nonce);fetches++;return profile;}},'@/lib/users':{loginWithOAuth:async()=>{logins++;return mode==='email-exists'?{ok:false,reason:'email_exists'}:{ok:true,user};},linkOAuthIdentity:async(id,p)=>{assert.equal(id,user.id);assert.equal(p,provider);links++;return{ok:true};},touchLogin:async()=>{}}})('src/app/api/auth/[provider]/callback/route.ts');
  const req=new NextRequest(`${env.APP_URL}/api/auth/${provider}/callback?${new URLSearchParams({state:issued.flow.state,...(mode==='cancel'?{error:'access_denied'}:{code:'synthetic-code'})})}`);
  const res=await callback.GET(req,ctx(provider)),to=location(res);assert.equal(jar.has('oauth_flow'),false);
  if(mode==='login'||mode==='replay'){assert.equal(sessions,1);assert.equal(logins,1);assert.equal(to.pathname,'/discovery/posts/test');}
  else if(mode==='link'){assert.equal(links,1);assert.equal(sessions,0);assert.equal(logins,0);assert.equal(to.searchParams.get('linked'),'1');}
  else {assert.equal(sessions,0);assert.equal(links,0);if(mode==='email-exists')assert.equal(to.searchParams.get('error'),'email_exists');else if(mode==='already-signed-in')assert.equal(to.pathname,'/discovery/posts/test');else assert.equal(fetches,0);}
  if(mode==='replay'){const repeated=await callback.GET(req,ctx(provider));assert.equal(sessions,1);assert.equal(location(repeated).searchParams.get('error'),'oauth_failed');}
});

test('Google ID token validates real signature, issuer, audience, azp, nonce, expiration; subject is provider identity',async()=>{
  const {privateKey,publicKey}=await jose.generateKeyPair('RS256'),jwk=await jose.exportJWK(publicKey);jwk.kid='qa-key';
  const sign=(claims={},key=privateKey)=>new jose.SignJWT({nonce:'expected-nonce',email:profile.email,email_verified:true,given_name:'QA',...claims}).setProtectedHeader({alg:'RS256',kid:'qa-key'}).setSubject('google-subject').setIssuer(claims.iss||'https://accounts.google.com').setAudience(claims.aud||env.GOOGLE_CLIENT_ID).setIssuedAt().setExpirationTime(claims.exp||'5m').sign(key);
  let token=await sign();const requests=[];const oauth=load({jose:{...jose,createRemoteJWKSet:()=>jose.createLocalJWKSet({keys:[jwk]})}},{fetch:async(url,options)=>{requests.push(url);assert.equal(options.body.get('code_verifier'),'test-verifier');return Response.json({id_token:token});}})('src/lib/oauth.ts');
  assert.equal((await oauth.fetchProfile('google','test-code','test-verifier','expected-nonce')).id,'google-subject');
  for(const claims of [{nonce:'wrong'},{aud:'another-client'},{iss:'https://evil.invalid'},{azp:'another-client'},{exp:1}]){token=await sign(claims);await assert.rejects(()=>oauth.fetchProfile('google','test-code','test-verifier','expected-nonce'));}
  const other=await jose.generateKeyPair('RS256');token=await sign({},other.privateKey);await assert.rejects(()=>oauth.fetchProfile('google','test-code','test-verifier','expected-nonce'));
  assert.ok(requests.every(url=>url==='https://oauth2.googleapis.com/token'));
});

test('Facebook validates token app/user/expiry and uses appsecret_proof + Bearer /me, accepts missing email for explicit link',async()=>{
  const now=Math.floor(Date.now()/1000),good={is_valid:true,app_id:env.FACEBOOK_APP_ID,type:'USER',user_id:'facebook-subject',expires_at:now+3600,data_access_expires_at:now+7200};let debug=good,meId='facebook-subject';
  const oauth=load({}, {fetch:async(raw,options)=>{const url=new URL(raw);if(url.pathname.endsWith('/oauth/access_token'))return Response.json({access_token:'synthetic-user-token'});if(url.pathname.endsWith('/debug_token')){assert.equal(options.headers.Authorization,`Bearer ${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`);return Response.json({data:debug});}assert.ok(url.pathname.endsWith('/me'));assert.equal(options.headers.Authorization,'Bearer synthetic-user-token');assert.equal(url.searchParams.has('access_token'),false);assert.equal(url.searchParams.get('appsecret_proof'),crypto.createHmac('sha256',env.FACEBOOK_APP_SECRET).update('synthetic-user-token').digest('hex'));return Response.json({id:meId,first_name:'QA'});}})('src/lib/oauth.ts');
  const p=await oauth.fetchProfile('facebook','synthetic-code');assert.equal(p.id,'facebook-subject');assert.equal(p.email,null);
  for(const bad of [{is_valid:false},{app_id:'other-app'},{type:'APP'},{expires_at:now-1},{data_access_expires_at:now-1}]){debug={...good,...bad};await assert.rejects(()=>oauth.fetchProfile('facebook','synthetic-code'));}
  debug=good;meId='different-user';await assert.rejects(()=>oauth.fetchProfile('facebook','synthetic-code'));
});

test('Login/Register have both honest provider controls; disabled without credentials, real URLs with next when configured',()=>{
  for(const configured of [false,true]){const component=load({'@/lib/oauth':{isConfigured:()=>configured}})('src/components/auth/SocialButtons.tsx').SocialButtons;const html=render(React.createElement(component,{next:'/discovery/posts/test'}));assert.match(html,/Đăng nhập bằng Google/);assert.match(html,/Đăng nhập bằng Facebook/);if(configured){assert.match(html,/\/api\/auth\/google\/start\?next=%2Fdiscovery%2Fposts%2Ftest/);assert.match(html,/\/api\/auth\/facebook\/start/);}else{assert.equal((html.match(/disabled=""/g)||[]).length,2);assert.doesNotMatch(html,/href=/);}}
});
test('Security page shows only current account provider status and deliberate POST links, preserving password form',async()=>{
  for(const providers of [[],['google'],['google','facebook']]){
    const Security=load({'@/lib/auth':{requireUser:async path=>{assert.equal(path,'/account/security');return user;}},'@/lib/users':{findUserById:async id=>{assert.equal(id,user.id);return{passwordHash:'synthetic-hash'};},linkedOAuthProviders:async id=>{assert.equal(id,user.id);return providers;}},'@/lib/oauth':{isConfigured:()=>true},'../actions':{changePasswordAction:async()=>{}},'@/components/site/PasswordInput':{PasswordInput:({name,label})=>React.createElement('label',null,label,React.createElement('input',{name,type:'password'}))}})('src/app/(light)/account/security/page.tsx');
    const html=render(await Security.default({searchParams:Promise.resolve({})}));assert.match(html,/name="current"/);assert.match(html,/name="password"/);
    for(const p of ['google','facebook']){if(providers.includes(p))assert.doesNotMatch(html,new RegExp('action="/api/auth/'+p+'/start"'));else assert.ok(html.includes(`action="/api/auth/${p}/start"`));}
    assert.equal((html.match(/method="post"/g)||[]).length,2-providers.length);assert.doesNotMatch(html,/provider_user_id|synthetic-hash/);
  }
});

// All writes below target an in-memory fixture; never loads .env or real uploads/DB.
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {discoveryLoader}=require('./helpers/discovery-loader.cjs');
const Link=({href,children,...rest})=>React.createElement('a',{href,...rest},children);
const settings={siteName:'QA',badgeText:'QA',heroTitle:'Home',heroSubtitle:'Intro',heroImage:'admin.webp',ctaHref:'/journeystory',ctaLabel:'Khám phá',instagramUrl:'',facebookUrl:'',xUrl:'',aboutText:'',contactEmail:''};
const trip={id:'trip',slug:'kept-slug',title:'Journey',description:null,locationName:null,coverFile:'journey.webp',photoCount:1,createdAt:null,isFeatured:true};
const bg=discoveryLoader({})('src/lib/home-background.ts');
function hero(journeys,adminFile,failed={}){let n=0;const load=discoveryLoader({}, {'next/link':Link,react:{...React,cache:fn=>fn,useState:()=>[n++===0?0:failed,()=>{}]}});const Hero=load('src/components/home/TravelShowcase.tsx').TravelShowcase;return render(React.createElement(Hero,{journeys,settings:{...settings,heroImage:adminFile},ctaHref:'/journeystory',ctaLabel:'Khám phá',children:null}));}
const layer=html=>html.match(/data-background-journey="trip">([\s\S]*?)<\/div>/)?.[1]||html;
test('Home background priority: journey → Admin → default, including broken files',()=>{
  assert.equal(bg.homeBackgroundFile('journey.webp','admin.webp'),'journey.webp');
  assert.equal(bg.homeBackgroundFile(null,'admin.webp'),'admin.webp');
  assert.equal(bg.homeBackgroundFile('journey.webp','admin.webp',{'journey.webp':true}),'admin.webp');
  assert.equal(bg.homeBackgroundFile('journey.webp','admin.webp',{'journey.webp':true,'admin.webp':true}),null);
  assert.equal(bg.homeBackgroundFile(null,null),null);assert.equal(bg.homeBackgroundFile('same.webp','same.webp',{'same.webp':true}),null);
});
test('Actual TravelShowcase layers use Admin fallback even while a journey is selected',()=>{
  assert.match(layer(hero([trip],'admin.webp')),/src="\/uploads\/journey.webp"/);
  for(const journeys of [[{...trip,coverFile:null}],[trip]]){const html=hero(journeys,'admin.webp',{'journey.webp':true});assert.match(layer(html),/src="\/uploads\/admin.webp"/);assert.match(html,/href="\/journeystory\/journeys\/kept-slug"/);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);}
  const html=hero([trip],'admin.webp',{'journey.webp':true,'admin.webp':true});assert.doesNotMatch(layer(html),/<img/);assert.ok(html.includes(bg.HOME_DEFAULT_BACKGROUND));
});
test('No journey: Admin image or the same default gradient shown in Admin; removal does not remove journey cover',()=>{
  assert.match(hero([],'admin.webp'),/src="\/uploads\/admin.webp"/);assert.ok(hero([],null).includes(bg.HOME_DEFAULT_BACKGROUND));
  const html=hero([trip],null);assert.match(layer(html),/src="\/uploads\/journey.webp"/);assert.doesNotMatch(html,/admin.webp/);
});
function fixture({denied=false,dbFail=false}={}){
  let row={site_name:'QA',badge_text:'QA',hero_title:'Home',hero_subtitle:'Intro',hero_image:'admin.webp',cta_href:'/journeystory',cta_label:'Khám phá',instagram_url:'',x_url:'',facebook_url:'',about_text:'',contact_email:''},reads=0,saves=0,uploads=0,deletes=0;const invalidated=[];
  const db={query:async sql=>{assert.match(sql,/^SELECT \* FROM home_settings/);reads++;return[[{...row}]];},execute:async(sql,values)=>{assert.match(sql,/UPDATE home_settings SET/);saves++;if(dbFail)throw Error('QA_DB_FAIL');row.hero_image=values[6];return[{}];}};
  const load=discoveryLoader(db,{'next/cache':{revalidatePath:(...a)=>invalidated.push(a)},'next/navigation':{redirect:url=>{throw Object.assign(Error('REDIRECT'),{url});}},'@/lib/auth':{requirePermission:async p=>{assert.equal(p,'settings.manage');if(denied)throw Error('DENIED');return{id:'admin'};}},'@/lib/activity':{logActivity:async()=>{}},'@/lib/uploads':{saveImage:async()=>{uploads++;return'new.webp';},deleteImage:async()=>{deletes++;},UploadError:class extends Error{}}});
  return{action:load('src/app/admin/actions.ts').saveHomeAction,settings:load('src/lib/settings.ts'),counters:()=>({reads,saves,uploads,deletes}),invalidated};
}
test('Save/remove real action + settings model: persisted null survives fresh read and Admin reload',async()=>{
  const f=fixture(),data=new FormData();data.set('removeImage','on');await assert.rejects(()=>f.action(data),e=>e.url==='/admin/home?saved=1');
  const reloaded=await f.settings.getHomeSettings();assert.equal(reloaded.heroImage,null);assert.equal(f.counters().saves,1);assert.equal(f.counters().uploads,0);assert.equal(f.counters().deletes,0);assert.deepEqual(f.invalidated,[['/','layout']]);
  assert.doesNotMatch(hero([],reloaded.heroImage),/<img/);assert.match(layer(hero([trip],reloaded.heroImage)),/journey.webp/);
  const Picker=discoveryLoader({})('src/components/admin/HomeBackgroundPicker.tsx').HomeBackgroundPicker;const admin=render(React.createElement(Picker,{currentFile:reloaded.heroImage}));assert.doesNotMatch(admin,/name="removeImage"|src="\/uploads\/admin.webp"/);assert.ok(admin.includes(bg.HOME_DEFAULT_BACKGROUND));
});
test('Save keeps unchanged image or uploads a new one; explicit removal wins even with a stale selected file',async()=>{
  for(const intent of ['keep','upload','remove-with-file']){const f=fixture(),data=new FormData();if(intent!=='keep')data.set('heroImage',new File(['synthetic'],'new.webp',{type:'image/webp'}));if(intent==='remove-with-file')data.set('removeImage','on');await assert.rejects(()=>f.action(data),e=>e.url==='/admin/home?saved=1');assert.equal((await f.settings.getHomeSettings()).heroImage,intent==='keep'?'admin.webp':intent==='upload'?'new.webp':null);assert.equal(f.counters().uploads,intent==='upload'?1:0);assert.equal(f.counters().deletes,0);}
});
test('Save/remove refuses unauthorized calls; DB failure does not discard prior reference/files',async()=>{
  const blocked=fixture({denied:true});await assert.rejects(()=>blocked.action(new FormData()),/DENIED/);assert.equal(blocked.counters().reads,0);assert.equal(blocked.counters().saves,0);
  const f=fixture({dbFail:true}),data=new FormData();data.set('removeImage','on');await assert.rejects(()=>f.action(data),/QA_DB_FAIL/);assert.equal((await f.settings.getHomeSettings()).heroImage,'admin.webp');assert.equal(f.counters().deletes,0);
});
test('Admin labels explain fallback priority next to checkbox and keep existing action fields',()=>{
  const Picker=discoveryLoader({})('src/components/admin/HomeBackgroundPicker.tsx').HomeBackgroundPicker;const html=render(React.createElement(Picker,{currentFile:'admin.webp'}));
  assert.match(html,/name="heroImage"/);assert.match(html,/name="removeImage"/);assert.match(html,/Chỉ gỡ ảnh Admin/);assert.match(html,/Home vẫn ưu tiên ảnh bìa hành trình/);assert.match(html,/Không xóa ảnh JourneyStory/);assert.ok(html.includes(bg.HOME_DEFAULT_BACKGROUND));
});

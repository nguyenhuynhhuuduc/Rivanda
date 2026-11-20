// Targeted regression: real read/model/component code with fixtures only. No .env/real DB.
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {discoveryLoader}=require('./helpers/discovery-loader.cjs');
const Link=({href,children,...props})=>React.createElement('a',{href,...props},children);
const settings={siteName:'QA',badgeText:'QA',heroTitle:'Home',heroSubtitle:'Intro',heroImage:null,ctaHref:'/journeystory',ctaLabel:'Khám phá',instagramUrl:'',xUrl:'',facebookUrl:'',aboutText:'',contactEmail:''};
const trips=[{id:'01',slug:'trip-one',title:'Trip one',description:'First trip',locationName:'Place one',coverFile:'first.webp',photoCount:1,createdAt:null,isFeatured:true},{id:'02',slug:'trip-empty',title:'Trip without cover',description:'Empty public trip',locationName:null,coverFile:null,photoCount:0,createdAt:null,isFeatured:false}];
function hero(adminFile,selected){let calls=0;const load=discoveryLoader({}, {'next/link':Link,react:{...React,cache:fn=>fn,useState:()=>[calls++===0?selected:{},()=>{}]}});const Hero=load('src/components/home/TravelShowcase.tsx').TravelShowcase;return render(React.createElement(Hero,{journeys:trips,settings:{...settings,heroImage:adminFile},ctaHref:'/journeystory',ctaLabel:'Khám phá',children:null}));}
test('Home read keeps public trip metadata without a cover; library filter and published image constraints stay intact',async()=>{
  const db={query:async(sql,args)=>{if(sql.includes('AS photo_count')){assert.match(sql,/c.status = 'published'/);assert.match(sql,/p2.status = 'published'/);return[trips.map(t=>({id:t.id,title:t.title,slug:t.slug,description:t.description,location_name:t.locationName,start_date:null,end_date:null,is_featured:0,cover_photo_id:null,cover_file:t.coverFile,photo_count:t.photoCount}))];}assert.match(sql,/^SELECT id, created_at FROM trips WHERE id IN \(\?\)/);return[args[0].map(id=>({id,created_at:new Date('2026-01-01')}))];}};
  const reader=discoveryLoader(db)('src/lib/journeystory-read.ts');const library=await reader.journeyCollections(),home=await reader.journeyCollections({includeEmpty:true});
  assert.equal(library.length,1);assert.equal(home.length,2);assert.equal(home[1].photoCount,0);assert.equal(home[1].coverFile,null);assert.equal(home[1].slug,'trip-empty');
});
test('Home route opts into empty public trips independently of Admin background',async()=>{
  const received=[];const load=discoveryLoader({}, {'@/lib/settings':{getHomeSettings:async()=>settings,getHomeSections:async()=>[]},'@/lib/journeystory-read':{journeyCollections:async opts=>{received.push(opts);return trips;}},'@/components/site/SiteHeader':{SiteHeader:()=>null},'@/components/site/SiteFooter':{SiteFooter:()=>null},'@/components/home/Sections':{HomeSection:()=>null},'@/components/home/TravelShowcase':{TravelShowcase:({journeys})=>React.createElement('p',null,journeys.length)}});
  const page=load('src/app/page.tsx');await page.default();settings.heroImage='admin.webp';try{await page.default();}finally{settings.heroImage=null;}
  assert.equal(received.length,2);assert.equal(received[0].includeEmpty,true);assert.equal(received[1].includeEmpty,true);
});
test('Before/after Admin removal: same cards, active state, arrows, progress, counter and See more',()=>{
  for(const admin of ['admin.webp',null])for(const selected of [0,1]){const html=hero(admin,selected),trip=trips[selected];
    assert.equal((html.match(/data-journey-card=/g)||[]).length,2);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
    assert.ok(html.includes(`data-selected-journey="${trip.id}"`));assert.ok(html.includes(`href="/journeystory/journeys/${trip.slug}"`));assert.ok(html.includes(`<h1>${trip.title}</h1>`));
    assert.match(html,/aria-label="Hành trình trước"/);assert.match(html,/aria-label="Hành trình tiếp theo"/);assert.match(html,/class="progress"/);assert.match(html,/class="counter"/);assert.ok(html.includes(`width:${(selected+1)/2*100}%`));
    const layer=html.match(new RegExp('data-background-journey="'+trip.id+'">([\\s\\S]*?)</div>'))[1];
    if(trip.coverFile)assert.ok(layer.includes('/uploads/'+trip.coverFile));else if(admin)assert.ok(layer.includes('/uploads/'+admin));else assert.doesNotMatch(layer,/<img/);
  }
});

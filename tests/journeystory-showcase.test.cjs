// Fixture-only UI/read tests. No .env, real database, uploads or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
const {discoveryLoader}=require('./helpers/discovery-loader.cjs');
const Link=({href,children,...p})=>React.createElement('a',{href,...p},children);
const load=(db={},mocks={})=>discoveryLoader(db,{'next/link':Link,...mocks});
const view=load()('src/lib/journeystory-view.ts');
const journey=(n,extra={})=>({id:String(n).padStart(2,'0'),slug:'trip-'+n,title:'Hành trình '+n,description:'Ghi chép chuyến đi '+n,locationName:'Địa điểm '+n,coverFile:'cover-'+n+'.webp',photoCount:3,createdAt:new Date(Date.UTC(2026,0,n)).toISOString(),isFeatured:false,...extra});
const settings={siteName:'QA Travel',badgeText:'Những hành trình đáng nhớ',heroTitle:'Khám phá cùng tôi',heroSubtitle:'Lời giới thiệu đã lưu',heroImage:null,ctaHref:'/documents/blog',ctaLabel:'Đọc Blog',instagramUrl:'',facebookUrl:'',xUrl:'',aboutText:'',contactEmail:''};
const photos=[{id:'photo-1',src:'/uploads/portrait.webp',width:800,height:1200,title:'Dọc',caption:'Chú thích <script>x</script>',locationName:'Huế',mapsUrl:'https://www.google.com/maps/place/Hue'},
  {id:'photo-2',src:'/uploads/landscape.webp',width:1600,height:900,title:'Ngang',caption:null,locationName:null,mapsUrl:'javascript:alert(1)'}];

test('Collection query parsing: finite page and allowlisted sort, stable encoded old slug URL',()=>{
  for(const value of [undefined,[],{},'__proto__','constructor','wrong'])assert.equal(view.journeySort(value),'newest');
  for(const value of ['newest','oldest','az','za'])assert.equal(view.journeySort(value),value);
  for(const value of ['0','-2','1e5','2x',[],undefined,'1000000'])assert.equal(view.journeyPage(value),1);
  assert.equal(view.journeyPage('23'),23);assert.equal(view.journeyHref('Huế /a?b#'),'/journeystory/journeys/Hu%E1%BA%BF%20%2Fa%3Fb%23');
});
test('Collection sort uses publication/creation date, four orders, stable ties and no mutation',()=>{
  const a=[journey(3,{title:'Zulu'}),journey(1,{title:'Alpha'}),journey(2,{title:'Beta'})],before=JSON.stringify(a);
  for(const [sort,ids]of [['newest',['03','02','01']],['oldest',['01','02','03']],['az',['01','02','03']],['za',['03','02','01']]])assert.deepEqual(Array.from(view.collectionPage(a,sort,1).journeys,x=>x.id),ids);
  assert.equal(JSON.stringify(a),before);assert.deepEqual(Array.from(view.collectionPage([journey(2,{title:'Same',createdAt:null}),journey(1,{title:'Same',createdAt:null})],'az',1).journeys,x=>x.id),['01','02']);
});
test('Collection pagination: all 25 distinct trips, clamped page, honest empty state',()=>{
  const a=Array.from({length:25},(_,i)=>journey(i+1));const pages=[1,2,3].map(p=>view.collectionPage(a,'newest',p));
  assert.deepEqual(pages.map(p=>p.journeys.length),[12,12,1]);assert.equal(new Set(pages.flatMap(p=>p.journeys.map(t=>t.id))).size,25);
  assert.equal(view.collectionPage(a,'newest',999).page,3);assert.equal(view.collectionPage([],'newest',1).total,0);
});
test('Google Maps: valid exact hosts only, no javascript, credentials, custom port or lookalike',()=>{
  for(const u of ['https://www.google.com/maps/place/Hue','https://maps.google.com/?q=Hue','https://maps.app.goo.gl/abc','https://goo.gl/maps/abc','https://www.google.com.vn/maps'])assert.equal(view.safeMapsUrl(u),u);
  for(const u of ['javascript:alert(1)','http://google.com/maps','https://google.com.evil.invalid/maps','https://evil.invalid/?q=google.com/maps','https://u:p@www.google.com/maps','https://www.google.com:444/maps','https://www.google.com/search?q=Hue',null,'https://maps.app.goo.gl/'])assert.equal(view.safeMapsUrl(u),null);
});
test('Swipe and carousel boundaries: horizontal threshold, no accidental vertical navigation',()=>{
  assert.equal(view.swipeStep(-100,8),1);assert.equal(view.swipeStep(100,8),-1);assert.equal(view.swipeStep(25,0),0);assert.equal(view.swipeStep(50,80),0);
  assert.equal(view.wrapIndex(-1,3),2);assert.equal(view.wrapIndex(3,3),0);assert.equal(view.wrapIndex(9,0),0);
});
test('Read adapter reuses public Trip API; server dates batched and no invented publication dates',async()=>{
  const queries=[];const db={query:async(sql,args)=>{queries.push({sql,args});assert.match(sql,/^\s*SELECT/);if(sql.includes('AS photo_count')){assert.match(sql,/status = 'published'/);return[[{id:'visible',title:'Published trip',slug:'kept-slug',description:null,location_name:null,start_date:null,end_date:null,is_featured:1,cover_photo_id:null,cover_file:'real.webp',photo_count:2},{id:'empty',title:'No public photos',photo_count:0}]];}assert.equal(args[0].length,1);assert.equal(args[0][0],'visible');return[[{id:'visible',created_at:new Date('2025-02-03T00:00:00Z')}]];}};
  const entries=await load(db)('src/lib/journeystory-read.ts').journeyCollections();assert.equal(entries.length,1);assert.equal(entries[0].slug,'kept-slug');assert.equal(entries[0].coverFile,'real.webp');assert.equal(entries[0].createdAt,'2025-02-03T00:00:00.000Z');assert.equal(queries.length,2);
});
test('Maps absent/incomplete schema: no fake link or SQL installation',async()=>{
  let calls=0;const service=load({query:async sql=>{calls++;assert.match(sql,/information_schema.COLUMNS/);return[[]];}})('src/lib/journeystory-read.ts');
  const p=await service.journeyPlaces('trip',[]);assert.equal(p.trip.length,0);assert.equal(Object.keys(p.photos).length,0);assert.equal(calls,1);
});
test('Maps optional existing data: bounded published photo query and unsafe URLs dropped',async()=>{
  const columns=Object.entries({journey_places:['id','name','maps_url'],journey_trip_places:['trip_id','place_id','sort_order'],journey_photo_places:['photo_id','place_id']}).flatMap(([t,cs])=>cs.map(c=>({t,c})));
  const service=load({query:async(sql,args)=>{assert.match(sql,/^SELECT/);if(sql.includes('information_schema'))return[columns];if(sql.includes('journey_trip_places')){assert.equal(args[0],'trip');return[[{name:'Huế',maps_url:'https://www.google.com/maps/place/Hue'},{name:'Bad',maps_url:'https://evil.invalid/'}]];}assert.match(sql,/ph.status='published'/);assert.equal(args[0][0],'photo-1');return[[{photo_id:'photo-1',name:'Huế',maps_url:'https://maps.app.goo.gl/abc'},{photo_id:'photo-2',name:'Bad',maps_url:'javascript:x'}]];}})('src/lib/journeystory-read.ts');
  const places=await service.journeyPlaces('trip',['photo-1']);assert.equal(places.trip.length,1);assert.equal(places.photos['photo-1'].name,'Huế');assert.equal(places.photos['photo-2'],undefined);
});
test('Home SSR: full canvas background and active trip content/See more share same selected data',()=>{
  const Hero=load()('src/components/home/TravelShowcase.tsx').TravelShowcase;
  const html=render(React.createElement(Hero,{journeys:[journey(1),journey(2)],settings,ctaHref:'/documents/blog',ctaLabel:'Đọc Blog'},React.createElement('p',null,'Existing Home section')));
  assert.match(html,/data-home-travel/);assert.match(html,/data-selected-journey="01"/);assert.match(html,/data-background-journey="01"/);assert.match(html,/<h1>Hành trình 1<\/h1>/);assert.match(html,/href="\/journeystory\/journeys\/trip-1"/);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  for(const text of ['See more','Discovery','Cyber Lab','Blog','Existing Home section','Câu chuyện của tôi'])assert.ok(html.includes(text));assert.doesNotMatch(html,/A PERSONAL SPACE/);
});
test('Home empty/error/single: settings retained, no fake trip link, unusable navigation disabled',()=>{
  const Hero=load()('src/components/home/TravelShowcase.tsx').TravelShowcase,props={settings,ctaHref:'/documents/blog',ctaLabel:'Đọc Blog',children:null};
  let html=render(React.createElement(Hero,{...props,journeys:[],unavailable:true}));assert.match(html,/Khám phá cùng tôi/);assert.match(html,/Chưa tải được hành trình/);assert.doesNotMatch(html,/See more|Chọn hành trình/);
  html=render(React.createElement(Hero,{...props,journeys:[journey(1)]}));assert.equal((html.match(/disabled=""/g)||[]).length,2);
});
test('Collections: genuine GET sort, twelve cards/date/cursor links and no carousel',async()=>{
  const Collections=load({}, {'@/lib/journeystory-read':{journeyCollections:async()=>Array.from({length:13},(_,i)=>journey(i+1))}})('src/components/journeystory/JourneyCollections.tsx').JourneyCollections;
  const html=render(await Collections({searchParams:Promise.resolve({sort:'oldest'}),base:'/journeystory'}));assert.equal((html.match(/class="collection"/g)||[]).length,12);assert.match(html,/13 bộ sưu tập/);assert.match(html,/action="\/journeystory"/);assert.match(html,/name="sort"/);assert.match(html,/sort=oldest&amp;page=2/);assert.match(html,/01\/01\/2026/);assert.doesNotMatch(html,/aria-roledescription="carousel"|Start Machine/);
});
test('Collections empty/error/fallback honestly rendered without invented pictures',async()=>{
  for(const failure of [false,true]){const Collections=load({}, {'@/lib/journeystory-read':{journeyCollections:async()=>{if(failure)throw Error('DB secret');return[];}}})('src/components/journeystory/JourneyCollections.tsx').JourneyCollections;const html=render(await Collections({searchParams:Promise.resolve({})}));assert.match(html,failure?/Chưa tải được hành trình/:/Chưa có hành trình/);assert.doesNotMatch(html,/DB secret/);}
  const Image=load()('src/components/journeystory/JourneyImage.tsx').JourneyImage;const html=render(React.createElement(Image,{file:null,title:'Trip'}));assert.match(html,/Chưa có ảnh bìa/);assert.doesNotMatch(html,/<img/);
});
test('Journey detail: published-only pagination, old album/status and photo URLs retained, no fake Maps',async()=>{
  const calls=[],trip=journey(1);const page=load({}, {'next/navigation':{notFound(){throw Error('NOT_FOUND');}},'@/lib/discovery':{getTripBySlug:async()=>trip,PUBLIC:['published'],listAlbums:async()=>[],listStatuses:async()=>[{id:'story',content:'Existing story',createdAt:new Date('2026-01-01')}],mediumOf:p=>p.src,listPhotos:async f=>{calls.push(f);return{photos:f.offset===0?photos:[],total:2};}},'@/lib/journeystory-read':{journeyPlaces:async()=>({trip:[],photos:{}})}})('src/app/(light)/journeystory/journeys/[slug]/page.tsx');
  const html=render(await page.default({params:Promise.resolve({slug:'trip-1'}),searchParams:Promise.resolve({page:'999'})}));assert.equal(calls.length,2);assert.equal(calls[0].statuses[0],'published');assert.equal(calls[1].offset,0);assert.equal(calls[1].tripId,trip.id);assert.match(html,/Existing story/);assert.match(html,/data-journey-gallery/);assert.match(html,/journeystory\/photos\/photo-1/);assert.doesNotMatch(html,/maps.google|Google Maps/);assert.equal((await page.generateMetadata({params:Promise.resolve({slug:'trip-1'})})).alternates.canonical,'/journeystory/journeys/trip-1');
});
test('Gallery SSR: natural ratios, lightbox buttons, existing detail links, text escaping and safe Maps',()=>{
  const Gallery=load()('src/components/journeystory/JourneyGallery.tsx').JourneyGallery;const html=render(React.createElement(Gallery,{photos}));
  assert.match(html,/width="800" height="1200"/);assert.match(html,/width="1600" height="900"/);assert.match(html,/<dialog/);assert.match(html,/Mở ảnh Dọc/);assert.match(html,/journeystory\/photos\/photo-2/);assert.match(html,/noopener noreferrer/);assert.doesNotMatch(html,/javascript:|<script>x<\/script>/);assert.equal((html.match(/>Google Maps ↗/g)||[]).length,1);
});
test('A shortened server result cannot leave stale selection, broken See more or an empty open lightbox',()=>{
  const statefulLoader=()=>{let n=0;return load({}, {react:{...React,cache:fn=>fn,useState:()=>[n++===0?99:{},()=>{}]}});};
  const Hero=statefulLoader()('src/components/home/TravelShowcase.tsx').TravelShowcase;
  const home=render(React.createElement(Hero,{journeys:[journey(1),journey(2)],settings,ctaHref:'/documents/blog',ctaLabel:'Đọc Blog',children:null}));
  assert.match(home,/<h1>Hành trình 2<\/h1>/);assert.match(home,/href="\/journeystory\/journeys\/trip-2"/);assert.equal((home.match(/aria-pressed="true"/g)||[]).length,1);
  const Gallery=statefulLoader()('src/components/journeystory/JourneyGallery.tsx').JourneyGallery;
  const html=render(React.createElement(Gallery,{photos}));assert.match(html,/Ảnh 2 \/ 2/);assert.match(html,/aria-label="Đóng ảnh"/);
});

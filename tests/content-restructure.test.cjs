// Chỉ fixture/VM: không nạp .env, không ghi MySQL hoặc dữ liệu người dùng.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');
const { unstable_getResponseFromNextConfig: routeResponse } = require('next/experimental/testing/server');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
    URL, URLSearchParams, FormData, Buffer, Response, Request, Uint8Array, console: { error() {} } }, { filename: file });
  return exports;
}
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const owner = { id: 'owner', role: 'contributor' };
const permissions = load('src/lib/permissions.ts');
const docs = load('src/lib/documents.ts', { './db': {}, './permissions': permissions });
const params = { params: Promise.resolve({ id }) };
const redirect = url => { throw Object.assign(Error('REDIRECT'), { url }); };
const empty = new Proxy({}, { get: () => () => null });

test('Redirect Next thật: ánh xạ URL cũ, giữ ID/slug và toàn bộ query, không vòng lặp', async () => {
  const nextConfig = (await import(pathToFileURL(path.join(root, 'next.config.mjs')).href)).default;
  const mappings = [
    ...['explore', 'trending', 'journeys', 'albums', 'locations'].map(s => [`/discovery/${s}`, `/journeystory/${s}`]),
    ...['journeys', 'albums', 'tags'].map(s => [`/discovery/${s}/hanh-trinh-cu`, `/journeystory/${s}/hanh-trinh-cu`]),
    [`/discovery/photos/${id}`, `/journeystory/photos/${id}`], [`/discovery/${id}`, `/journeystory/photos/${id}`],
    ['/documents', '/resources'], ['/document', '/resources'],
    ['/documents/resources', '/resources/documents'], [`/documents/resources/${id}`, `/resources/${id}`],
    ['/documents/projects', '/resources/projects'], ['/document/blog-cu', '/documents/blog/blog-cu'],
    ['/shopping', '/shop'], ['/hacking', '/cyber-lab'],
  ];
  for (const [old, dest] of mappings) {
    const url = new URL(old, 'https://fixture.invalid');
    // Helper Next chuẩn hóa array query thành chuỗi; query lặp được kiểm HTTP riêng.
    url.search = '?q=Hu%E1%BA%BF&tag=a&page=2&location=H%C3%A0+N%E1%BB%99i';
    const response = await routeResponse({ url: url.href, nextConfig });
    assert.equal(response.status, 308, old);
    const target = new URL(response.headers.get('location'));
    assert.equal(target.pathname, dest);
    assert.deepEqual([...target.searchParams], [...url.searchParams]);
    assert.equal((await routeResponse({ url: target.href, nextConfig })).headers.get('location'), null, dest);
  }
  for (const p of ['/discovery', '/discovery/posts/future', '/documents/blog', '/documents/blog/blog-cu', '/cyber-lab/practice', '/shop', '/login', '/profile/' + id, '/api/documents/' + id + '/view']) {
    assert.equal((await routeResponse({ url: 'https://fixture.invalid' + p, nextConfig })).headers.get('location'), null, p);
  }
});

function resourcePage(doc, user) {
  return load('src/app/(light)/resources/[id]/page.tsx', {
    'next/link': () => null, 'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } },
    '@/components/icons': empty, '@/components/ui/kit': empty, '@/lib/format': empty,
    '@/lib/auth': { getCurrentUser: async () => user }, '@/lib/community': { isBookmarked: async () => false },
    '@/lib/documents': { ...docs, getDocument: async () => doc }, '@/lib/permissions': permissions,
    '@/app/(light)/documents/actions': { toggleDocBookmarkAction: async () => {} },
  });
}

for (const [access, published] of [['private', true], ['public', false], ['members', false], ['private', false], ['public', true], ['members', true]]) {
  for (const user of [null, { id: 'other', role: 'member' }, owner, { id: 'admin', role: 'admin' }]) {
    test(`SEC-06: metadata/page ${access}/${published}/${user?.role ?? 'guest'}`, async () => {
      const doc = { id, title: 'TITLE_FIXTURE', description: 'DESCRIPTION_FIXTURE', uploaderId: owner.id,
        isPublished: published, access, canDownload: true, fileExt: 'pdf', kind: 'document', createdAt: new Date(), fileSize: 12 };
      const page = resourcePage(doc, user);
      const allowed = docs.canAccessDocument(doc, user) || (published && access !== 'private');
      const metadata = await page.generateMetadata(params);
      assert.equal(metadata.title, allowed ? doc.title : 'Tài liệu');
      assert.equal(metadata.description, allowed ? doc.description : undefined);
      if (allowed) {
        assert.equal(metadata.alternates.canonical, `/resources/${id}`);
        assert.ok(await page.default(params));
      } else {
        assert.doesNotMatch(JSON.stringify(metadata), /TITLE_FIXTURE|DESCRIPTION_FIXTURE/);
        await assert.rejects(page.default(params), /NOT_FOUND/);
      }
    });
  }
}

test('SEC-06: ID không hợp lệ/không tồn tại và route cũ không làm lộ metadata', async () => {
  const page = resourcePage(null, null);
  for (const value of ['invalid', id]) {
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: value }) });
    assert.equal(metadata.title, 'Tài liệu');
    assert.equal(metadata.description, undefined);
  }
  const old = load('src/app/(light)/documents/resources/[id]/page.tsx', { '@/app/(light)/resources/[id]/page': page });
  assert.equal((await old.generateMetadata(params)).description, undefined);
});

test('Resources: API view/download giữ quyền, không đọc file khi bị chặn; members quay về URL mới', async () => {
  for (const [access, published, user] of [
    ['private', true, null], ['private', true, { id: 'other', role: 'member' }],
    ['public', false, null], ['public', false, { id: 'other', role: 'member' }],
    ['private', false, owner], ['private', false, { id: 'admin', role: 'admin' }],
    ['members', true, null], ['members', true, { id: 'other', role: 'member' }], ['public', true, null],
  ]) {
    const doc = { id, isPublished: published, access, uploaderId: owner.id, canDownload: true,
      fileExt: 'pdf', storedFile: id + '.pdf', originalName: 'fixture.pdf' };
    for (const kind of ['view', 'download']) {
      let reads = 0, counts = 0;
      const route = load(`src/app/api/documents/[id]/${kind}/route.ts`, {
        'fs/promises': { readFile: async () => { reads++; return Buffer.from('fixture'); } },
        '@/lib/auth': { getCurrentUser: async () => user }, '@/lib/uploads': { DOC_DIR: 'fixture' }, '@/lib/permissions': permissions,
        '@/lib/documents': { ...docs, getDocument: async () => doc, countDownload: async () => { counts++; } },
      });
      const response = await route.GET(new Request('https://fixture.invalid/api/documents/' + id + '/' + kind), params);
      const allowed = docs.canAccessDocument(doc, user);
      if (allowed) { assert.equal(response.status, 200); assert.equal(reads, 1); assert.equal(counts, kind === 'download' ? 1 : 0); }
      else {
        assert.equal(reads, 0); assert.equal(counts, 0);
        if (kind === 'download' && access === 'members' && published && !user) {
          const dest = new URL(response.headers.get('location'));
          assert.equal(dest.pathname, '/login'); assert.equal(dest.searchParams.get('next'), '/resources/' + id);
        } else assert.equal(response.status, 404);
      }
    }
  }
});

test('JourneyStory: trang chi tiết giữ ID/slug, chỉ lấy ảnh published và canonical đúng', async () => {
  const item = { id, slug: 'fixture', title: 'Fixture', description: 'Fixture description', createdAt: new Date(), uploaderId: id };
  const shared = { 'next/link': () => null, 'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } },
    '@/components/site/Cards': empty, '@/components/site/PhotoTile': empty, '@/components/ui/kit': empty, '@/lib/format': empty,
    '@/components/journeystory/JourneyGallery': empty, '@/lib/journeystory-read': { journeyPlaces: async () => ({ trip: [], photos: {} }) },
    '@/lib/journeystory-view': { journeyPage: () => 1, journeyHref: slug => `/journeystory/journeys/${slug}` } };
  for (const kind of ['journeys', 'albums']) {
    let filter;
    const page = load(`src/app/(light)/journeystory/${kind}/[slug]/page.tsx`, { ...shared,
      '@/lib/discovery': { PUBLIC: ['published'], getTripBySlug: async slug => { assert.equal(slug, 'fixture'); return item; },
        getAlbumBySlug: async slug => { assert.equal(slug, 'fixture'); return item; },
        listPhotos: async f => { filter = f; return { photos: [], total: 0 }; }, listAlbums: async () => [], listStatuses: async () => [] },
    });
    const props = { params: Promise.resolve({ slug: 'fixture' }), searchParams: Promise.resolve({}) };
    assert.ok(await page.default(props));
    assert.equal(filter.statuses[0], 'published'); assert.equal(filter[kind === 'journeys' ? 'tripId' : 'albumId'], id);
    assert.equal((await page.generateMetadata(props)).alternates.canonical, `/journeystory/${kind}/fixture`);
  }
  const photo = load('src/app/(light)/journeystory/photos/[id]/page.tsx', { ...shared,
    '@/components/ConfirmButton': empty, '@/components/icons': empty, '@/components/site/ShareButton': empty,
    '@/lib/auth': { getCurrentUser: async () => null }, '@/lib/community': {}, '@/lib/tags': { getPhotoTags: async () => [] },
    '@/app/(light)/discovery/actions': empty,
    '@/lib/discovery': { PUBLIC: ['published'], getPhoto: async (value, states) => { assert.equal(value, id); assert.equal(states[0], 'published'); return item; },
      listComments: async () => [], listPhotoAlbums: async () => [], relatedPhotos: async () => [], mediumOf: () => '/uploads/fixture.jpg' },
  });
  assert.ok(await photo.default({ ...params, searchParams: Promise.resolve({}) }));
  assert.equal((await photo.generateMetadata(params)).alternates.canonical, '/journeystory/photos/' + id);
});

function moderation(state = 'pending', deny = false, role = 'moderator') {
  const calls = { reads: 0, updates: 0, notifications: 0, logs: 0, sql: [] };
  let status = state;
  const discovery = load('src/lib/discovery.ts', { './slug': {}, './db': { pool: { query: async (sql, args) => {
    calls.sql.push(sql);
    assert.match(sql, /WHERE id = \? AND status = 'pending'/);
    assert.equal(args[2], id);
    // Mô phỏng tính nguyên tử của một UPDATE InnoDB, không tách check/write.
    if (status !== 'pending') return [{ affectedRows: 0 }];
    status = args[0]; calls.updates++;
    return [{ affectedRows: 1 }];
  } } } });
  const actions = load('src/app/admin/discovery-actions.ts', {
    'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect },
    '@/lib/auth': { requirePermission: async p => { assert.equal(p, 'moderation.review'); if (deny || !permissions.can(role, p)) throw Error('FORBIDDEN'); return { id: 'reviewer', role }; } },
    '@/lib/discovery': { ...discovery, getPhoto: async () => { calls.reads++; return { uploaderId: owner.id, status }; } },
    '@/lib/activity': { logActivity: async () => { calls.logs++; } },
    '@/lib/notifications': { notify: async () => { calls.notifications++; } },
    '@/lib/community': {}, '@/lib/tags': {}, '@/lib/uploads': {}, './helpers': load('src/app/admin/helpers.ts'),
  });
  return { ...actions, calls, status: () => status, discovery };
}

test('DATA-03: chỉ moderator/Admin, decision và ID hợp lệ mới tới DB', async () => {
  const denied = moderation('pending', true);
  await assert.rejects(denied.reviewPhotoAction(id, 'approve', new FormData()), /FORBIDDEN/);
  assert.equal(denied.calls.reads, 0);
  for (const role of ['member', 'contributor', 'moderator', 'admin']) {
    const m = moderation('pending', false, role);
    if (role === 'member' || role === 'contributor') {
      await assert.rejects(m.reviewPhotoAction(id, 'approve', new FormData()), /FORBIDDEN/);
      assert.equal(m.calls.reads, 0);
    } else {
      await assert.rejects(m.reviewPhotoAction(id, 'approve', new FormData()), e => e.url?.includes('saved='));
      assert.equal(m.calls.updates, 1);
    }
  }
  for (const [value, decision] of [[id, 'unknown'], ['bad-id', 'approve'], [id, null]]) {
    const m = moderation();
    await assert.rejects(m.reviewPhotoAction(value, decision, new FormData()), e => e.url?.includes('error='));
    assert.equal(m.calls.reads, 0); assert.equal(m.calls.updates, 0);
  }
  const m = moderation();
  await assert.rejects(m.discovery.setPhotoStatus(id, 'pending', null), /không hợp lệ/);
  assert.equal(m.calls.sql.length, 0);
});

test('DATA-03: không duyệt lại published/rejected/draft/archived; từ chối bắt buộc lý do', async () => {
  for (const state of ['published', 'rejected', 'draft', 'archived']) {
    const m = moderation(state);
    await assert.rejects(m.reviewPhotoAction(id, 'approve', new FormData()), e => e.url?.includes('error='));
    assert.equal(m.status(), state); assert.equal(m.calls.notifications, 0); assert.equal(m.calls.sql.length, 0);
  }
  const m = moderation();
  await assert.rejects(m.reviewPhotoAction(id, 'reject', new FormData()), e => e.url?.includes('error='));
  assert.equal(m.calls.updates, 0);
  const note = new FormData(); note.set('note', 'Lý do fixture');
  await assert.rejects(m.reviewPhotoAction(id, 'reject', note), e => e.url?.includes('saved='));
  assert.equal(m.status(), 'rejected'); assert.equal(m.calls.notifications, 1);
});

test('DATA-03: hai quyết định đồng thời chỉ một cập nhật/thông báo/log; retry cũ không ghi đè', async () => {
  const m = moderation();
  const note = new FormData(); note.set('note', 'Lý do fixture');
  const results = await Promise.allSettled([m.reviewPhotoAction(id, 'approve', new FormData()), m.reviewPhotoAction(id, 'reject', note)]);
  const urls = results.map(r => r.reason?.url ?? '');
  assert.equal(urls.filter(u => u.includes('saved=')).length, 1);
  assert.equal(urls.filter(u => u.includes('error=')).length, 1);
  assert.equal(m.calls.updates, 1); assert.equal(m.calls.notifications, 1); assert.equal(m.calls.logs, 1);
  const state = m.status();
  await assert.rejects(m.reviewPhotoAction(id, 'reject', note), e => e.url?.includes('error='));
  assert.equal(m.status(), state); assert.equal(m.calls.notifications, 1);
});

test('Sitemap dùng URL chuẩn, giữ Blog/Shop, không đưa tài liệu private/members vào', async () => {
  const sitemap = load('src/app/sitemap.ts', {
    '@/lib/oauth': { appUrl: () => 'https://fixture.invalid' },
    '@/lib/discovery': { PUBLIC: ['published'], listPhotos: async f => { assert.equal(f.statuses[0], 'published'); return { photos: [{ id }] }; }, listTrips: async () => [{ slug: 'trip' }], listAlbums: async () => [{ slug: 'album' }] },
    '@/lib/posts': { listPosts: async () => ({ posts: [{ type: 'blog', slug: 'blog' }] }) },
    '@/lib/documents': { listDocuments: async () => ({ docs: [{ id, access: 'public' }, { id: 'hidden', access: 'private' }, { id: 'member', access: 'members' }] }) },
  });
  const urls = (await sitemap.default()).map(r => new URL(r.url).pathname);
  for (const p of ['/discovery', '/journeystory/photos/' + id, '/journeystory/journeys/trip', '/journeystory/albums/album', '/resources/' + id, '/documents/blog/blog', '/shop']) assert.ok(urls.includes(p), p);
  assert.ok(!urls.some(p => /^\/discovery\//.test(p) || p.includes('hidden') || p.includes('member') || p.startsWith('/documents/resources')));
});

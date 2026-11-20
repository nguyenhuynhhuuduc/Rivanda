// Kiểm thử cô lập: không nạp env thật, không kết nối/ghi MySQL hoặc filesystem người dùng.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest } = require('next/server');

const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, env = {}, globals = {}) {
  // Auth hồi quy tách khỏi allocator; allocator có stress test riêng bằng transaction mock.
  mocks = { './cyber-ip': { allocateVirtualIp: async () => '10.10.1.10' }, ...mocks };
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), Buffer, URL, URLSearchParams, Response, Request, Uint8Array, TextEncoder, AbortSignal, FormData, console: { error() {} }, process: { env }, ...globals }, { filename: file });
  return exports;
}
const urls = load('src/lib/url.ts');
const permissions = load('src/lib/permissions.ts');
const user = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'fixture@example.invalid', firstName: 'Fixture', lastName: '', role: 'admin', displayName: 'Fixture', isActive: true };
const row = { id: user.id, email: user.email, password_hash: null, first_name: 'Fixture', last_name: '', avatar_url: null, role: 'member', is_active: 1 };
const Link = ({ href, children }) => React.createElement('a', { href }, children);

test('safeNext chặn origin ngoài, backslash và ký tự điều khiển; giữ query nội bộ', () => {
  for (const value of ['//outside.invalid', 'https://outside.invalid', '/\\outside.invalid', '/\t/outside.invalid', '/\n/outside.invalid', '/\r/outside.invalid', null, {}, '/ x']) assert.equal(urls.safeNext(value), '/');
  assert.equal(urls.safeNext('/cyber-lab/tutorials?q=web&page=2#toc'), '/cyber-lab/tutorials?q=web&page=2#toc');
  assert.equal(urls.returnPath('/cyber-lab/tools', { q: 'an toàn', page: '2' }), '/cyber-lab/tools?q=an+to%C3%A0n&page=2');
});

test('theme khởi tạo theo lựa chọn đã lưu hoặc hệ thống, chịu được storage bị chặn', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8').match(/__html: `([\s\S]*?)`/)[1];
  for (const [saved, systemDark, expected] of [['light', true, 'light'], ['dark', false, 'dark'], [null, true, 'dark'], ['invalid', false, 'light']]) {
    const document = { documentElement: { dataset: {} } };
    vm.runInNewContext(source, { document, localStorage: { getItem: () => saved }, matchMedia: () => ({ matches: systemDark }) });
    assert.equal(document.documentElement.dataset.theme, expected);
  }
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(source, { document, localStorage: { getItem() { throw Error('blocked'); } }, matchMedia: () => ({ matches: true }) });
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

for (const [file, props] of [
  ['src/app/(dark)/cyber-lab/page.tsx', { searchParams: Promise.resolve({ q: 'web' }) }],
  ['src/app/(dark)/cyber-lab/[section]/page.tsx', { params: Promise.resolve({ section: 'tools' }), searchParams: Promise.resolve({ q: 'web', page: '2' }) }],
  ['src/app/(dark)/cyber-lab/articles/[slug]/page.tsx', { params: Promise.resolve({ slug: 'fixture' }), searchParams: Promise.resolve({ from: 'saved' }) }],
]) test(`Cyber Lab chặn guest trước khi đọc nội dung: ${file}`, async () => {
  let back;
  const deny = async value => { back = value; throw Error('AUTH_REQUIRED'); };
  const mocks = { '@/lib/auth': { requireUser: deny }, '@/lib/url': urls, '@/lib/posts': { listPosts() { throw Error('CONTENT_READ'); }, getPostBySlug() { throw Error('CONTENT_READ'); } }, '@/lib/cyber-lab': { SECTIONS: {}, CATEGORIES: {} }, '@/components/site/PostCard': {}, '@/components/site/PostArticle': {}, '@/components/ui/kit': {}, '@/components/icons': {}, '@/lib/community': {}, '../../actions': {} };
  const page = load(file, mocks);
  await assert.rejects(page.default(props), /AUTH_REQUIRED/);
  assert.match(back, /^\/cyber-lab/);
  if (file.includes('[section]')) assert.equal(back, '/cyber-lab/tools?q=web&page=2');
  if (page.generateMetadata) await assert.rejects(page.generateMetadata(props), /AUTH_REQUIRED/);
});

test('Cyber Lab cho member vào và chỉ đọc dữ liệu sau guard', async () => {
  let allowed = false, reads = 0;
  const page = load('src/app/(dark)/cyber-lab/page.tsx', { 'next/link': Link, '@/lib/auth': { requireUser: async () => { allowed = true; return user; } }, '@/lib/url': urls, '@/lib/posts': { listPosts: async () => { assert.equal(allowed, true); reads++; return { posts: [] }; } }, '@/lib/cyber-lab': { SECTIONS: {}, CATEGORIES: {}, LAB_NOTICE: 'Fixture' }, '@/components/site/PostCard': {}, '@/components/ui/kit': new Proxy({}, { get: () => 'div' }) });
  assert.ok(await page.default({ searchParams: Promise.resolve({}) }));
  assert.equal(reads, 1);
});

for (const [status, viewer, allowed] of [['published', null, true], ['pending', null, false], ['rejected', { id: 'other', role: 'member' }, false], ['pending', { id: user.id, role: 'contributor' }, true], ['draft', { id: 'moderator', role: 'moderator' }, true]]) {
  test(`quyền xem ảnh: ${status}/${viewer?.role ?? 'guest'}`, async () => {
    const access = load('src/lib/image-access.ts', { './permissions': permissions, './db': { pool: { query: async () => [[{ image_file: 'photo.jpg', uploader_id: user.id, status }]] } } });
    const result = await access.imageAccess('photo.jpg', viewer);
    assert.equal(result.allowed, allowed);
    assert.equal(result.previewOriginal, true);
  });
}

test('ảnh không còn tham chiếu không được phục vụ', async () => {
  const access = load('src/lib/image-access.ts', { './permissions': permissions, './db': { pool: { query: async () => [[]] } } });
  assert.equal((await access.imageAccess('unreferenced.jpg', null)).allowed, false);
});

test('route ảnh trả bản xem WebP, không trả byte gốc; chặn traversal và ảnh không có quyền', async () => {
  let allowed = true;
  const sharp = require('sharp');
  const original = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#172d46' } }).jpeg().toBuffer();
  const route = load('src/app/uploads/[file]/route.ts', { 'fs/promises': { readFile: async () => original }, '@/lib/uploads': { UPLOAD_DIR: 'synthetic' }, '@/lib/auth': { getCurrentUser: async () => null }, '@/lib/image-access': { imageAccess: async () => ({ allowed, previewOriginal: true }) } });
  const ctx = { params: Promise.resolve({ file: `${user.id}.jpg` }) };
  const response = await route.GET(null, ctx);
  assert.equal(response.status, 200);
  const preview = Buffer.from(await response.arrayBuffer());
  assert.equal((await sharp(preview).metadata()).width, 1800);
  assert.notDeepEqual(preview, original);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  allowed = false;
  assert.equal((await route.GET(null, ctx)).status, 404);
  assert.equal((await route.GET(null, { params: Promise.resolve({ file: '../secret.jpg' }) })).status, 404);
});

test('API download ảnh: guest quay về đăng nhập, cờ tải bị tắt chặn, member tải bản gốc', async () => {
  let viewer = null, allowDownload = false, reads = 0;
  const route = load('src/app/api/photos/[id]/download/route.ts', { 'fs/promises': { readFile: async () => { reads++; return Buffer.from('original'); } }, '@/lib/auth': { getCurrentUser: async () => viewer }, '@/lib/discovery': { PUBLIC: ['published'], getPhoto: async (_id, states) => { assert.equal(states[0], 'published'); return { imageFile: `${user.id}.jpg`, allowDownload }; } }, '@/lib/uploads': { UPLOAD_DIR: 'synthetic' } });
  const req = new NextRequest(`https://fixture.invalid/api/photos/${user.id}/download`), ctx = { params: Promise.resolve({ id: user.id }) };
  const guest = await route.GET(req, ctx);
  assert.equal(new URL(guest.headers.get('location')).pathname, '/login');
  assert.equal(new URL(guest.headers.get('location')).searchParams.get('next'), `/journeystory/photos/${user.id}`);
  assert.equal(reads, 0);
  viewer = user;
  assert.equal((await route.GET(req, ctx)).status, 404);
  allowDownload = true;
  const response = await route.GET(req, ctx);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'original');
  assert.match(response.headers.get('content-disposition'), /^attachment/);
});

test('OAuth không tự liên kết email local ngay cả khi Google verified', async () => {
  const users = load('src/lib/users.ts', { './db': { pool: { execute: async sql => sql.includes('JOIN users') ? [[]] : [[{ ...row, password_hash: 'existing-password' }]], getConnection() { throw Error('MUST_NOT_WRITE'); } } } });
  const result = await users.loginWithOAuth('google', { id: 'provider-id', email: user.email, emailVerified: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'email_exists');
});

test('OAuth tạo user và identity cùng transaction; rollback khi identity lỗi', async () => {
  for (const fail of [false, true]) {
    const events = [];
    const connection = { beginTransaction: async () => events.push('begin'), execute: async sql => { if (sql.startsWith('INSERT INTO user_identities') && fail) throw Error('synthetic failure'); return sql.startsWith('SELECT') ? [[row]] : [{}]; }, commit: async () => events.push('commit'), rollback: async () => events.push('rollback'), release: () => events.push('release') };
    const users = load('src/lib/users.ts', { './db': { pool: { execute: async () => [[]], getConnection: async () => connection } } });
    const promise = users.loginWithOAuth('facebook', { id: 'provider-id', email: user.email, emailVerified: false, firstName: 'Fixture', lastName: '', avatarUrl: null });
    if (fail) await assert.rejects(promise, /synthetic failure/); else assert.equal((await promise).ok, true);
    assert.deepEqual(events, ['begin', fail ? 'rollback' : 'commit', 'release']);
  }
});

const oauthEnv = { APP_URL: 'https://fixture.invalid', GOOGLE_CLIENT_ID: 'synthetic-client', GOOGLE_CLIENT_SECRET: 'synthetic-secret', FACEBOOK_APP_ID: 'synthetic-app', FACEBOOK_APP_SECRET: 'synthetic-secret', SESSION_SECRET: 'synthetic-oauth-session-secret-for-tests-only' };
test('OAuth start giữ next, tạo state/provider và Google PKCE; thiếu cấu hình trả lỗi rõ ràng', async () => {
  for (const configured of [true, false]) {
    const cookies = new Map();
    const oauth = load('src/lib/oauth.ts', {}, configured ? oauthEnv : { APP_URL: oauthEnv.APP_URL });
    const flowState = load('src/lib/oauth-state.ts', { './oauth': oauth, './url': urls }, oauthEnv);
    const start = load('src/app/api/auth/[provider]/start/route.ts', { '@/lib/auth': { getCurrentUser: async () => null }, '@/lib/oauth-state': flowState, 'next/headers': { cookies: async () => ({ get: k => cookies.has(k) ? { value: cookies.get(k) } : undefined, set: (k, v) => cookies.set(k, v), delete: k => cookies.delete(k) }) }, '@/lib/oauth': oauth, '@/lib/url': urls });
    const response = await start.GET(new NextRequest('https://fixture.invalid/api/auth/google/start?next=%2Fcyber-lab%2Ftools%3Fpage%3D2'), { params: Promise.resolve({ provider: 'google' }) });
    const target = new URL(response.headers.get('location'));
    if (configured) { assert.equal(target.hostname, 'accounts.google.com'); assert.equal(target.searchParams.get('code_challenge_method'), 'S256'); const flow = await flowState.readOAuthFlow(cookies.get('oauth_flow'), 'google', target.searchParams.get('state')); assert.equal(flow.provider, 'google'); assert.equal(flow.next, '/cyber-lab/tools?page=2'); }
    else { assert.equal(target.searchParams.get('error'), 'provider_unavailable'); assert.equal(target.searchParams.get('next'), '/cyber-lab/tools?page=2'); }
  }
});

test('OAuth callback chặn state/provider sai, hủy đăng nhập; thành công giữ đích và xóa cookie tạm', async () => {
  for (const mode of ['bad-state', 'bad-provider', 'cancel', 'success']) {
    const flowState = load('src/lib/oauth-state.ts', { './oauth': load('src/lib/oauth.ts', {}, oauthEnv), './url': urls }, oauthEnv);
    const issued = await flowState.createOAuthFlow(mode === 'bad-provider' ? 'facebook' : 'google', '/cyber-lab/tools?page=2');
    const cookies = new Map([['oauth_flow', issued.token]]);
    let fetched = 0, sessions = 0;
    const oauth = { ...load('src/lib/oauth.ts', {}, oauthEnv), fetchProfile: async () => { fetched++; return {}; } };
    const callback = load('src/app/api/auth/[provider]/callback/route.ts', { '@/lib/oauth-state': flowState, 'next/headers': { cookies: async () => ({ get: k => cookies.has(k) ? { value: cookies.get(k) } : undefined, delete: k => cookies.delete(k) }) }, '@/lib/oauth': oauth, '@/lib/url': urls, '@/lib/auth': { createSession: async () => sessions++, getCurrentUser: async () => null }, '@/lib/users': { loginWithOAuth: async () => ({ ok: true, user }), touchLogin: async () => {} } });
    const query = mode === 'cancel' ? `error=access_denied&state=${issued.flow.state}` : `code=synthetic&state=${mode === 'bad-state' ? 'b'.repeat(64) : issued.flow.state}`;
    const response = await callback.GET(new NextRequest(`https://fixture.invalid/api/auth/google/callback?${query}`), { params: Promise.resolve({ provider: 'google' }) });
    const target = new URL(response.headers.get('location'));
    assert.equal(cookies.size, 0);
    assert.equal(fetched, mode === 'success' ? 1 : 0);
    assert.equal(sessions, mode === 'success' ? 1 : 0);
    assert.equal(target.pathname, mode === 'success' ? '/cyber-lab/tools' : '/login');
    if (mode !== 'success') assert.equal(target.searchParams.get('next'), ['bad-state', 'bad-provider'].includes(mode) ? '/' : '/cyber-lab/tools?page=2');
  }
});

test('dashboard tổng hợp dữ liệu thật từ mock SELECT, điền tháng rỗng bằng 0; lỗi DB không biến thành 0 giả', async () => {
  const stats = load('src/lib/admin-stats.ts', { './db': { pool: { query: async sql => {
    assert.match(sql.trim(), /^SELECT/);
    if (sql.includes('UNION ALL')) return [[{ month: '2026-11', kind: 'users', n: 2 }]];
    if (sql.includes('current_month')) return [[{ users: 2, reports: 1, current_month: '2026-11' }]];
    if (sql.includes('GROUP BY status')) return [[{ status: 'pending', n: 3 }]];
    return [[{ members: 2, photos: 3 }]];
  } } } });
  const data = await stats.getDashboardData();
  assert.equal(data.monthly.length, 6);
  assert.equal(data.monthly[0].month, '2026-06');
  assert.equal(data.monthly[5].users, 2);
  assert.equal(data.monthly[0].users, 0);
  assert.equal(data.users, 2);
  const failed = load('src/lib/admin-stats.ts', { './db': { pool: { query: async () => { throw Error('DB unavailable'); } } } });
  await assert.rejects(failed.getDashboardData(), /DB unavailable/);
});

test('biểu đồ không bịa dữ liệu, có empty state và bảng dữ liệu truy cập được', () => {
  const charts = load('src/components/admin/DashboardCharts.tsx', { '@/lib/discovery': { PHOTO_STATUS_LABEL: { pending: 'Chờ duyệt' } } });
  const empty = renderToStaticMarkup(React.createElement(charts.ActivityChart, { months: [] }));
  assert.match(empty, /Chưa có hoạt động/);
  assert.doesNotMatch(empty, /<polyline/);
  const html = renderToStaticMarkup(React.createElement(charts.ActivityChart, { months: [{ month: '2026-11', label: '11/2026', users: 2, photos: 0, posts: 0, documents: 0 }] }));
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('email/password vẫn tạo session và quay về đúng Cyber Lab sau đăng nhập', async () => {
  let sessions = 0;
  const actions = load('src/app/(auth)/actions.ts', { 'next/headers': { headers: async () => new Headers() }, 'next/navigation': { redirect: target => { throw Error(`REDIRECT:${target}`); } }, '@/lib/auth': { createSession: async () => sessions++, getCurrentUser: async () => null }, '@/lib/password-reset': {}, '@/lib/password': { verifyPassword: async () => true }, '@/lib/ratelimit': { isBlocked: async () => false, clearAttempts: async () => {} }, '@/lib/url': urls, '@/lib/users': { findUserByEmail: async () => ({ ...user, passwordHash: 'synthetic' }), touchLogin: async () => {} } }, {}, { Headers });
  const form = new FormData(); form.set('email', user.email); form.set('password', 'synthetic-password'); form.set('next', '/cyber-lab/tools?page=2');
  await assert.rejects(actions.loginAction({}, form), /REDIRECT:\/cyber-lab\/tools\?page=2/);
  assert.equal(sessions, 1);
});

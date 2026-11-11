// Fixture only. No env loading, real DB, upload writes or external services.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  // Keep these tests explicitly on the legacy/read-only branch; Foundation has its own SQL suite.
  mocks = { './blog-read': { blogFoundationReady: async () => false }, '@/lib/blog-read': { blogFoundationReady: async () => false, listBlogTopics: async () => [] }, '@/lib/auth': { getCurrentUser: async () => null }, ...mocks };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), URLSearchParams, console });
  return exports;
}
const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
const ui = { Container: ({ children }) => React.createElement('div', null, children),
  Empty: ({ children }) => React.createElement('div', null, children),
  PageHeading: ({ title, subtitle }) => React.createElement('header', null, React.createElement('h1', null, title), subtitle),
  Pagination: ({ hrefFor }) => React.createElement('a', { href: hrefFor(2) }, 'Trang 2'), inputCls: '', btnPrimary: '' };
const post = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', slug: 'stable-blog', type: 'blog', title: '<script>title</script>', summary: 'Summary fixture',
  coverFile: 'cover.jpg', tags: [{ id: 1, name: 'dulich' }], readMinutes: 3, publishedAt: new Date('2026-11-09T00:00:00Z') };
const format = load('src/lib/format.ts');

test('Blog list: truy vấn hiện tại chỉ published/blog, lấy tác giả thật theo trang, không đọc bí mật', async () => {
  let calls = 0;
  const service = load('src/lib/blog-list.ts', {
    './posts': { listPosts: async filter => { assert.equal(filter.type, 'blog'); assert.equal(filter.onlyPublished, true); assert.equal(filter.q, 'Hue'); assert.equal(filter.offset, 12); return { posts: [post], total: 13 }; } },
    './db': { pool: { query: async (sql, args) => { calls++; assert.match(sql, /SELECT p.id, u.first_name, u.last_name/); assert.match(sql, /u.is_active = 1/); assert.match(sql, /p.type = 'blog' AND p.status = 'published'/); assert.doesNotMatch(sql, /email|password|SELECT \*/); assert.equal(args[0][0], post.id); return [[{ id: post.id, first_name: 'An', last_name: 'Nguyễn' }]]; } } },
  });
  const result = await service.listBlogEntries({ q: 'Hue', limit: 12, offset: 12 });
  assert.equal(result.entries[0].authorName, 'Nguyễn An'); assert.equal(result.total, 13); assert.equal(calls, 1);
});

test('Blog list: trang rỗng không query tác giả; không bịa tên khi tài khoản ẩn/thiếu', async () => {
  let posts = [], calls = 0;
  const service = load('src/lib/blog-list.ts', { './posts': { listPosts: async () => ({ posts, total: posts.length }) },
    './db': { pool: { query: async () => { calls++; return [[{ id: post.id, first_name: null, last_name: null }]]; } } } });
  assert.equal((await service.listBlogEntries({ limit: 12, offset: 0 })).entries.length, 0); assert.equal(calls, 0);
  posts = [post]; assert.equal((await service.listBlogEntries({ limit: 12, offset: 0 })).entries[0].authorName, null);
});

const listItem = load('src/components/blog/BlogListItem.tsx', { 'next/link': Link, '@/lib/format': format });
test('Blog list item: URL cũ, thumbnail, tác giả/ngày và escape nội dung, ảnh thiếu vẫn đọc được', () => {
  const html = render(React.createElement(listItem.BlogListItem, { entry: { post, authorName: 'Nguyễn An' } }));
  assert.ok(html.includes('href="/documents/blog/stable-blog"')); assert.ok(html.includes('/uploads/cover.jpg'));
  assert.ok(html.includes('Nguyễn An')); assert.ok(html.includes('09/11/2026')); assert.ok(html.includes('Chưa phân loại chủ đề'));
  assert.ok(html.includes('sm:flex-row')); assert.ok(!html.includes('<script>title</script>')); assert.ok(html.includes('Summary fixture'));
  const missing = render(React.createElement(listItem.BlogListItem, { entry: { post: { ...post, coverFile: null, summary: null }, authorName: null } }));
  assert.ok(missing.includes('Chưa có thông tin tác giả')); assert.ok(missing.includes('Bài viết chưa có mô tả ngắn.'));
});

test('Blog page: search thật, phân trang giữ query, runtime input và trạng thái rỗng; không có form chủ đề giả', async () => {
  let entries = [{ post, authorName: 'Nguyễn An' }], last;
  const page = load('src/app/(light)/documents/blog/page.tsx', {
    'next/link': Link, '@/components/ui/kit': ui, '@/components/blog/BlogListItem': listItem,
    '@/lib/blog-list': { listBlogEntries: async filter => { last = filter; return { entries, total: 25 }; } },
  });
  const html = render(await page.default({ searchParams: Promise.resolve({ q: '  Huế  ', page: '2' }) }));
  assert.equal(last.q, 'Huế'); assert.equal(last.offset, 12); assert.ok(html.includes('/documents/blog?q=Hu%E1%BA%BF&amp;page=2'));
  assert.ok(html.includes('name="q"')); assert.ok(!html.includes('name="topic"')); assert.ok(!html.includes('href="/documents"'));
  entries = [];
  const empty = render(await page.default({ searchParams: Promise.resolve({ q: 'không có', page: 'bad' }) }));
  assert.equal(last.offset, 0); assert.ok(empty.includes('Không tìm thấy bài viết phù hợp.'));
  await page.default({ searchParams: Promise.resolve({ q: ['x', 'y'], page: '9999999999999999999999' }) });
  assert.equal(last.q, undefined); assert.equal(last.offset, 0);
});

test('Discovery độc lập: thiếu 007 thì không hiện nút ghi hoặc CTA JourneyStory', async () => {
  const page = require('./helpers/discovery-loader.cjs').discoveryLoader({}, { 'next/link': Link, '@/components/ui/kit': ui,
    '@/lib/auth':{getCurrentUser:async()=>null},
    '@/components/discovery-community/PostCard': {}, '@/components/discovery-community/FeedFilters': {}, '@/lib/discovery-community/model': { CommunityError: class extends Error {} },
    '@/lib/discovery-community/read': { communityReady: async () => false } })('src/app/(light)/discovery/page.tsx');
  const html = render(await page.default({searchParams:Promise.resolve({})}));
  assert.ok(html.includes('role="status"')); assert.ok(html.includes('chưa khả dụng'));
  assert.ok(!/journeystory|<button|<form|<a /.test(html));
  assert.ok(!page.metadata.description.includes('JourneyStory'));
});

test('Header/Footer: bỏ Resources, giữ Blog/Discovery/JourneyStory/Cyber Lab/Shop', async () => {
  const mocks = { 'next/link': Link, '@/components/auth/LogoutForm': {}, '@/lib/auth': { getCurrentUser: async () => null },
    '@/lib/notifications': {}, '@/lib/permissions': {}, '@/lib/settings': { getHomeSettings: async () => ({ siteName: 'Fixture' }) },
    '@/components/discovery-community/NotificationBell': { NotificationBell: () => null },
    '@/components/ThemeToggle': { ThemeToggle: () => null }, '@/components/SiteLogo': { SiteLogo: () => null }, '@/components/SocialIcons': { SocialIcons: () => null } };
  const header = load('src/components/site/SiteHeader.tsx', mocks), footer = load('src/components/site/SiteFooter.tsx', mocks);
  const html = render(await header.SiteHeader()) + render(await footer.SiteFooter());
  assert.ok(!html.includes('href="/resources"'));
  for (const href of ['/documents/blog', '/discovery', '/journeystory', '/cyber-lab', '/shop']) assert.ok(html.includes('href="' + href + '"'));
});

test('DocRow: Home bỏ link nhưng giữ nội dung; trang archive/Account vẫn truy cập URL cũ đúng', () => {
  const row = load('src/components/site/DocRow.tsx', { 'next/link': Link, '@/components/icons': { FileIcon: () => null },
    '@/lib/format': format, '@/lib/documents': { KIND_LABEL: { document: 'Tài liệu' }, ACCESS_LABEL: {} } });
  const doc = { id: post.id, title: 'Fixture document', description: 'Preserved', fileExt: 'pdf', fileSize: 12, kind: 'document', access: 'public' };
  const linked = render(React.createElement(row.DocRow, { doc })), text = render(React.createElement(row.DocRow, { doc, linked: false }));
  assert.ok(linked.includes('href="/resources/' + post.id + '"')); assert.ok(!text.includes('<a ')); assert.ok(text.includes('Fixture document')); assert.ok(text.includes('Preserved'));
});

test('Home chỉ đổi link/nhãn: CTA archive về Blog; CTA Cyber Lab/Shop/custom giữ nguyên', async () => {
  let href;
  const page = load('src/app/page.tsx', { 'next/link': Link, '@/components/home/Sections': { HomeSection: () => null },
    '@/components/site/SiteFooter': { SiteFooter: () => null }, '@/components/site/SiteHeader': { SiteHeader: () => null },
    '@/components/SiteLogo': { SiteLogo: () => null }, '@/components/SocialIcons': { SocialIcons: () => null },
    '@/components/ui/kit': { ...ui, btnOutline: '' }, '@/lib/settings': { getHomeSettings: async () => ({ ctaHref: href, ctaLabel: 'CTA fixture', heroTitle: 'Preserved hero' }), getHomeSections: async () => [] } });
  for (href of ['/resources', '/resources/documents?q=a', '/documents', '/documents/?q=a', '/documents/projects', '/document', '/document/', '/cyber-lab', '/shop', '/documents/blog/stable-blog', 'https://example.invalid']) {
    const html = render(await page.default());
    assert.ok(html.includes('Preserved hero')); assert.ok(!/href="\/(resources|documents\/projects)(?:[/?"])/.test(html));
    if (['/cyber-lab', '/shop', '/documents/blog/stable-blog', 'https://example.invalid'].includes(href)) assert.ok(html.includes('href="' + href + '"'));
    else assert.ok(html.includes('Đọc Blog'));
  }
});

test('Search công khai: không dẫn tới Resources; chỉ có tài liệu thì có empty state rõ ràng', async () => {
  const page = load('src/app/(light)/search/page.tsx', { 'next/link': Link, '@/components/ui/kit': ui,
    '@/components/site/PhotoTile': {}, '@/lib/search': { searchAll: async () => ({ photos: [], posts: [], docs: [{ id: post.id, title: 'Archive marker' }] }) } });
  const html = render(await page.default({ searchParams: Promise.resolve({ q: 'archive' }) }));
  assert.ok(html.includes('Không tìm thấy kết quả')); assert.ok(!html.includes('Archive marker')); assert.ok(!html.includes('/resources/'));
});

// Kiểm tra route, auth và trạng thái chưa có backend; không truy cập dữ liệu thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const Link = ({ children, href, prefetch, ...props }) => React.createElement('a', { href, ...props }, children);
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, URL, URLSearchParams,
    require: id => id === 'next/link' ? Link : Object.hasOwn(mocks, id) ? mocks[id] : require(id),
  }, { filename: file });
  return exports;
}
const kit = load('src/components/ui/kit.tsx');
const categories = load('src/lib/cyber-lab.ts');
const urls = load('src/lib/url.ts');
let snapshot = { ownerId: 'fixture-member', status: 'Stopped', ip: null, startedAt: null, pending: false, error: null };
const workspace = load('src/components/cyber-lab/PracticeWorkspace.tsx', { '@/components/ui/kit': kit, '@/lib/cyber-lab': categories,
  './PracticeSessionProvider': { usePracticeSession: ownerId => ({ snapshot, matchesOwner: ownerId === snapshot.ownerId, store: { stop() {} }, start() {}, retry() {} }) },
});
const routes = [
  ['practice', 'src/app/(dark)/cyber-lab/practice/page.tsx'],
  ['desktop', 'src/app/(dark)/cyber-lab/desktop/page.tsx'],
];

test('Cyber Lab giữ tài liệu/bài viết và dẫn đến Practice, không mount terminal', async () => {
  const order = [];
  const page = load('src/app/(dark)/cyber-lab/page.tsx', {
    '@/lib/auth': { requireUser: async () => { order.push('auth'); } },
    '@/lib/url': urls, '@/lib/cyber-lab': categories, '@/components/ui/kit': kit,
    '@/lib/posts': { listPosts: async input => {
      assert.equal(order[0], 'auth');
      assert.equal(input.type, 'hacking');
      assert.equal(input.onlyPublished, true);
      return { posts: [{ id: 'fixture', slug: 'bai-cu', title: 'Bài viết cũ' }] };
    } },
    '@/components/site/PostCard': { PostCard: ({ post, href }) => React.createElement('a', { href }, post.title) },
  });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /href="\/cyber-lab\/practice"[^>]*>Bắt đầu thực hành/);
  assert.match(html, /href="\/cyber-lab\/articles\/bai-cu"/);
  for (const section of Object.keys(categories.SECTIONS)) assert.ok(html.includes(`href="/cyber-lab/${section}"`));
  assert.match(html, /action="\/cyber-lab\/tutorials"/);
  assert.doesNotMatch(html, /Linux Terminal|xterm|aria-busy/);
});

for (const [slug, file] of routes) {
  test(`${slug}: guest bị chặn, giữ URL đăng nhập quay lại`, async () => {
    let destination;
    const page = load(file, {
      '@/lib/auth': { requireUser: async next => { destination = next; throw Error('AUTH_REQUIRED'); } },
      '@/lib/url': urls, '@/components/ui/kit': kit,
      '@/components/cyber-lab/PracticeWorkspace': workspace,
      '@/components/cyber-lab/KaliDesktop': { KaliDesktop: workspace.DesktopUnavailable },
    });
    await assert.rejects(page.default({ searchParams: Promise.resolve({ source: 'lesson' }) }), /AUTH_REQUIRED/);
    assert.equal(destination, `/cyber-lab/${slug}?source=lesson`);
    assert.equal(page.metadata.robots.index, false);
  });

  test(`${slug}: tham số URL không tạo IP hoặc phiên; Desktop bị khóa khi Stopped`, async () => {
    const page = load(file, {
      '@/lib/auth': { requireUser: async () => ({ id: 'fixture-member', role: 'member' }) },
      '@/lib/url': urls, '@/components/ui/kit': kit,
      '@/components/cyber-lab/PracticeWorkspace': workspace,
      '@/components/cyber-lab/KaliDesktop': { KaliDesktop: workspace.DesktopUnavailable },
    });
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ status: 'running', ip: '192.0.2.99', expiresAt: '2099-01-01', connected: 'true' }) }));
    assert.match(html, /Simulator/);
    assert.doesNotMatch(html, /192\.0\.2\.99|2099-01-01|<iframe|<canvas|xterm|wss?:\/\//);
    if (slug === 'desktop') {
      assert.match(html, /Desktop Simulator chưa sẵn sàng/);
      assert.match(html, /href="\/cyber-lab\/practice"/);
    }
  });
}

test('chưa có IP: Start Machine/Open Desktop bị khóa, không có IP tự tạo', () => {
  const html = renderToStaticMarkup(React.createElement(workspace.PracticeWorkspace, { ownerId: 'fixture-member' }));
  const buttons = html.match(/<button\b[^>]*>/g);
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(button => button.includes('disabled=""')));
  assert.match(html, /Start Machine/);
  assert.match(html, /Open Desktop/);
  assert.match(html, /Chưa được cấp/);
  assert.match(html, /Chưa bắt đầu/);
  assert.doesNotMatch(html, /href="\/cyber-lab\/desktop"|\b(?:\d{1,3}\.){3}\d{1,3}\b|\d{1,2}:\d{2}:\d{2}/);
});

test('có IP thì Start được; Open Desktop chỉ có link khi Running, Starting vẫn khóa', () => {
  for (const status of ['Stopped', 'Starting', 'Running']) {
    snapshot = { ...snapshot, status, ip: '10.10.1.10' };
    const html = renderToStaticMarkup(React.createElement(workspace.PracticeWorkspace, { ownerId: 'fixture-member' }));
    assert.match(html, /10\.10\.1\.10/);
    assert.match(html, status === 'Stopped' ? /Start Machine/ : /Stop Machine/);
    assert.equal(html.includes('href="/cyber-lab/desktop"'), status === 'Running');
  }
  snapshot = { ...snapshot, status: 'Running', ip: '10.10.1.10' };
  const other = renderToStaticMarkup(React.createElement(workspace.PracticeWorkspace, { ownerId: 'other-account' }));
  assert.doesNotMatch(other, /10\.10\.1\.10|href="\/cyber-lab\/desktop"/);
  snapshot = { ...snapshot, status: 'Stopped', ip: null };
});

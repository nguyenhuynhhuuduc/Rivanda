const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { blogLoader } = require('./helpers/blog-loader.cjs');
const actor = { id: '10000000-0000-4000-8000-000000000002', role: 'member' };
const id = '20000000-0000-4000-8000-000000000001';
const redirect = url => { throw Object.assign(Error('REDIRECT'), { url }); };
const noDb = { query: () => { throw Error('UNEXPECTED_REAL_DB'); } };
function actions({ user = actor, ready = true, editable = true } = {}) {
  let saves = 0, uploads = 0, deletes = 0;
  const load = blogLoader(noDb, {
    'next/navigation': { redirect }, '@/lib/auth': { requireUser: async () => { if (!user) redirect('/login'); return user; } },
    '@/lib/blog-read': { requireBlogFoundation: async () => { if (!ready) throw new (load('src/lib/blog-policy.ts').BlogError)('Migration 006 chưa sẵn sàng'); }, editableBlog: async () => editable ? {} : null },
    '@/lib/blog-store': { saveBlog: async (_a, input) => { saves++; assert.ok(!Object.hasOwn(input, 'authorId')); return id; }, deleteBlog: async () => { deletes++; }, reserveBlogUpload: async () => {} },
    '@/lib/blog-cover': { saveBlogCover: async () => { uploads++; return '10000000-0000-4000-8000-000000000001.webp'; } }, '@/lib/blog-revalidate': { refreshBlog() {} },
  });
  return { ...load('src/app/(light)/account/blog/actions.ts'), state: () => ({ saves, uploads, deletes }) };
}
function form(extra = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ title: 'Fixture', content: 'Content', summary: '', tags: '', topicId: '', intent: 'draft', ...extra })) fd.set(k, v);
  return fd;
}

test('Blog actions: guest và migration thiếu bị chặn trước upload/ghi', async () => {
  for (const options of [{ user: null }, { ready: false }]) {
    const a = actions(options); const fd = form(); fd.set('cover', new File(['x'], 'fake.png', { type: 'image/png' }));
    await assert.rejects(a.saveBlogAction(fd), e => e.url === '/login' || e.url?.includes('error='));
    assert.equal(a.state().saves, 0); assert.equal(a.state().uploads, 0);
  }
});
test('Blog actions: quyền sở hữu, publish giả, revision/intent/tags sai bị chặn trước file', async () => {
  for (const [options, extra] of [[{ editable: false }, { id, revision: '1' }], [{}, { intent: 'publish' }], [{}, { intent: 'submit', topicId: '' }], [{}, { id, revision: 'bad' }], [{}, { intent: 'unknown' }], [{}, { tags: Array(9).fill('tag').map((t,i) => t+i).join(',') }]]) {
    const a = actions(options), fd = form(extra); fd.set('cover', new File(['x'], 'fake.png', { type: 'image/png' }));
    await assert.rejects(a.saveBlogAction(fd), e => e.url?.includes('error=')); assert.equal(a.state().saves, 0); assert.equal(a.state().uploads, 0);
  }
});
test('Blog actions: User lưu nháp; Admin xuất bản; tác giả không lấy từ form', async () => {
  for (const user of [actor, { ...actor, role: 'admin' }]) {
    const a = actions({ user }), fd = form({ authorId: 'attacker', intent: user.role === 'admin' ? 'publish' : 'draft' });
    await assert.rejects(a.saveBlogAction(fd), e => e.url?.endsWith('/' + id + '?saved=1'));
    assert.equal(a.state().saves, 1);
  }
});
test('Blog review/topic actions: luôn chặn non-Admin ở server trước service', async () => {
  let calls = 0;
  const load = blogLoader(noDb, { 'next/navigation': { redirect }, 'next/cache': {},
    '@/lib/auth': { requireAdmin: async () => { throw Error('FORBIDDEN'); }, requireUser: async () => actor },
    '@/lib/blog-store': { reviewBlog: async () => { calls++; }, saveBlogTopic: async () => { calls++; }, deleteBlogTopic: async () => { calls++; } }, '@/lib/blog-revalidate': {} });
  const a = load('src/app/admin/blog/actions.ts');
  for (const fn of [a.reviewBlogAction, a.saveTopicAction, a.deleteTopicAction]) await assert.rejects(fn(form()), /FORBIDDEN/);
  assert.equal(calls, 0);
});
test('Blog cover: giải mã PNG thật, re-encode WebP trước lưu; ảnh giả/SVG/sai MIME không ghi file', async () => {
  let writes = 0, output;
  const cover = blogLoader(noDb, { './uploads': { saveImage: async file => { writes++; output = Buffer.from(await file.arrayBuffer()); assert.equal(file.type, 'image/webp'); return '10000000-0000-4000-8000-000000000001.webp'; } } })('src/lib/blog-cover.ts');
  const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#abcdef' } }).png().toBuffer();
  await cover.saveBlogCover(new File([png], 'source.png', { type: 'image/png' })); assert.equal((await sharp(output).metadata()).format, 'webp'); assert.equal(writes, 1);
  for (const file of [new File(['<svg/>'], 'fake.png', { type: 'image/png' }), new File([png], 'fake.txt', { type: 'text/plain' }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]) await assert.rejects(cover.saveBlogCover(file));
  assert.equal(writes, 1);
});
test('Blog public metadata: nháp/ẩn không đọc nội dung hoặc tăng view; URL hợp lệ giữ canonical', async () => {
  let record = null, views = 0;
  const page = blogLoader(noDb, { 'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } }, 'next/link': () => null,
    '@/components/site/PostArticle': {}, '@/lib/posts': { incrementViews: async () => { views++; } }, '@/lib/blog-read': { getPublicBlog: async () => record } })('src/app/(light)/documents/blog/[slug]/page.tsx');
  const props = { params: Promise.resolve({ slug: 'stable' }) };
  assert.equal((await page.generateMetadata(props)).description, undefined); await assert.rejects(page.default(props), /NOT_FOUND/); assert.equal(views, 0);
  record = { post: { id, title: 'Published', summary: 'Public summary' }, authorName: 'Fixture', topic: null };
  assert.equal((await page.generateMetadata(props)).alternates.canonical, '/documents/blog/stable'); assert.ok(await page.default(props)); assert.equal(views, 1);
});

test('Adapter Admin cũ: không hard-delete Blog trước/sau 006; nhánh Cyber giữ writer cũ', async () => {
  for (const ready of [false, true]) {
    let type = 'blog', deletes = 0, updates = 0;
    const load = blogLoader(noDb, { 'next/navigation': { redirect }, 'next/cache': { revalidatePath() {} },
      '@/lib/auth': { requireAdmin: async () => {}, getCurrentUser: async () => ({ ...actor, role: 'admin' }) }, '@/lib/activity': { logActivity: async () => {} },
      '@/lib/cyber-lab': { CATEGORIES: {}, SECTIONS: {} }, '@/lib/blog-read': { blogFoundationReady: async () => ready },
      '@/app/(light)/account/blog/actions': { saveBlogAction: async () => { throw Error('NEW_BLOG_ACTION'); } },
      '@/lib/posts': { getPostById: async () => ({ id, type, coverFile: null }), deletePost: async () => { deletes++; return null; }, updatePost: async (_id, input) => { updates++; assert.equal(input.type, 'hacking'); } },
      '@/lib/uploads': { deleteImage: async () => {}, UploadError: Error },
    });
    const a = load('src/app/admin/post-actions.ts');
    await assert.rejects(a.deletePostAction(id), e => e.url?.includes(ready ? '/admin/blog/' : '/admin/posts?error=')); assert.equal(deletes, 0);
    if (ready) await assert.rejects(a.savePostAction(form({ id, type: 'blog', status: 'published' })), e => e.url?.includes('/admin/blog/'));
    type = 'hacking';
    await assert.rejects(a.savePostAction(form({ id, type: 'hacking', status: 'published' })), e => e.url?.includes('/admin/posts/')); assert.equal(updates, 1);
    await a.deletePostAction(id); assert.equal(deletes, 1);
  }
});

// Opt-in only. Fresh loopback mysqld, independently verified datadir; NEVER loads .env.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
const { blogLoader, root } = require('./helpers/blog-loader.cjs');
const enabled = process.env.BLOG_TEST_ISOLATED === '1';
if (!enabled) {
  test('MySQL Blog integration: cần BLOG_TEST_ISOLATED=1 và datadir test riêng', { skip: true }, () => {});
} else {
  let pool, control, store, read, schema;
  const admin = { id: '10000000-0000-4000-8000-000000000001', role: 'admin' };
  const alice = { id: '10000000-0000-4000-8000-000000000002', role: 'member' };
  const bob = { id: '10000000-0000-4000-8000-000000000003', role: 'member' };
  const moderator = { id: '10000000-0000-4000-8000-000000000004', role: 'moderator' };
  const legacy = '20000000-0000-4000-8000-000000000001', cyber = '20000000-0000-4000-8000-000000000003';
  const topic = '60000000-0000-4000-8000-000000000001';
  let cyberHash;
  const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const input = (extra = {}) => ({ title: 'Bài fixture', summary: 'Mô tả fixture', content: '# Nội dung thử nghiệm', tags: ['dulich'], topicId: topic, intent: 'draft', ...extra });
  before(async () => {
    const port = Number(process.env.BLOG_TEST_MYSQL_PORT);
    assert.ok(Number.isInteger(port) && port > 1024 && port !== 3306);
    const expected = fs.realpathSync(process.env.BLOG_TEST_DATADIR).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
    assert.ok(expected.includes('/temp/personal-site-blog-foundation-') && expected.endsWith('/mysql-data'));
    control = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: false });
    const [[server]] = await control.query('SELECT @@port AS port, @@datadir AS datadir');
    assert.equal(server.port, port);
    assert.equal(fs.realpathSync(server.datadir).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase(), expected);
    schema = 'blog006_test_' + randomUUID().replaceAll('-', '');
    await control.query('CREATE DATABASE ' + mysql.escapeId(schema) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    pool = mysql.createPool({ host: '127.0.0.1', port, user: 'root', password: '', database: schema, connectionLimit: 8 });
    const ddl = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.BLOG_TEST_DATADIR), 'base-schema.json'), 'utf8'));
    for (const sql of ddl) { assert.match(sql, /^CREATE TABLE `(users|posts|tags|post_tags)`/); assert.ok(!/\bUSE\b/.test(sql)); await pool.query(sql); }
    for (const [i, actor] of [admin, alice, bob, moderator].entries()) await pool.query("INSERT INTO users(id,email,first_name,last_name,role) VALUES(?,?,?,'Fixture',?)", [actor.id, `user${i}@example.invalid`, `User${i}`, actor.role]);
    for (const [id, type, status] of [[legacy, 'blog', 'published'], ['20000000-0000-4000-8000-000000000002', 'blog', 'draft'], [cyber, 'hacking', 'published']]) await pool.query("INSERT INTO posts(id,type,title,slug,content,status,author_id) VALUES(?,?,?,?,?,?,?)", [id, type, 'Legacy fixture', 'legacy-' + id.slice(-1), 'Original content untouched', status, admin.id]);
    await pool.query("UPDATE posts SET difficulty='beginner',category='legacy-retained',read_minutes=3 WHERE id=?", [legacy]);
    const [beforeRows] = await pool.query('SELECT * FROM posts ORDER BY id');
    const sql = fs.readFileSync(path.join(root, 'sql/planned/006_blog_foundation.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
    const migration = await pool.getConnection();
    try { for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await migration.query(statement); }
    catch (error) { await migration.rollback(); throw error; }
    finally { migration.release(); }
    const [afterRows] = await pool.query('SELECT * FROM posts ORDER BY id');
    assert.equal(digest(beforeRows), digest(afterRows), 'Migration must not modify old Blog/Cyber rows');
    cyberHash = digest(afterRows.filter(r => r.id === cyber));
    const load = blogLoader(pool); store = load('src/lib/blog-store.ts'); read = load('src/lib/blog-read.ts');
    fs.writeFileSync(path.join(path.dirname(process.env.BLOG_TEST_DATADIR), 'test-schema.json'), JSON.stringify({ database: schema, port, datadir: expected }));
  });
  after(async () => {
    if (pool) {
      const [rows] = await pool.query('SELECT * FROM posts WHERE id=?', [cyber]);
      assert.equal(digest(rows), cyberHash, 'Cyber sentinel unchanged after every service test');
      await pool.end();
    }
    if (control) await control.end();
  });

  test('006 thật: backfill giữ Blog cũ, seed 5 chủ đề, không backfill Cyber', async () => {
    assert.equal(await read.blogFoundationReady(), true);
    const [[n]] = await pool.query('SELECT COUNT(*) AS n FROM blog_topics'); assert.equal(n.n, 5);
    const [details] = await pool.query('SELECT post_id,workflow_state FROM blog_post_details ORDER BY post_id');
    assert.equal(details.length, 2); assert.equal(details[0].workflow_state, 'published');
    assert.ok(!details.some(r => r.post_id === cyber));
    const old = await read.getPublicBlog('legacy-1');
    assert.ok(old); assert.equal(old.post.difficulty, 'beginner'); assert.equal(old.post.category, 'legacy-retained');
    assert.equal(await read.getPublicBlog('legacy-2'), null); assert.equal(await read.getPublicBlog('legacy-3'), null);
  });

  test('006 thật: UNIQUE/FK/CHECK và rollback DML khi lỗi giữa chừng', async () => {
    await assert.rejects(pool.query('UPDATE blog_topics SET sort_order=-1 WHERE id=?', [topic]), e => e.code === 'ER_CHECK_CONSTRAINT_VIOLATED');
    await assert.rejects(pool.query('INSERT INTO blog_topics(id,name,slug) SELECT ?,name,slug FROM blog_topics LIMIT 1', [randomUUID()]), e => e.code === 'ER_DUP_ENTRY');
    await assert.rejects(pool.query("INSERT INTO blog_post_details(post_id) VALUES(?)", [randomUUID()]), e => e.code === 'ER_NO_REFERENCED_ROW_2');
    await assert.rejects(pool.query('UPDATE blog_post_details SET reviewed_revision=revision+1 WHERE post_id=?', [legacy]), e => e.code === 'ER_CHECK_CONSTRAINT_VIOLATED');
    const tx = await pool.getConnection(), id = randomUUID();
    try { await tx.beginTransaction(); await tx.query("INSERT INTO blog_topics(id,name,slug) VALUES(?,'Rollback','rollback-fixture')", [id]); await assert.rejects(tx.query('INSERT INTO blog_post_details(post_id) VALUES(?)', [randomUUID()])); await tx.rollback(); }
    finally { tx.release(); }
    const [[n]] = await pool.query('SELECT COUNT(*) AS n FROM blog_topics WHERE id=?', [id]); assert.equal(n.n, 0);
  });

  test('Topics: Admin CRUD, slug ổn định, ẩn/xóa không mất bài, FK SET NULL khi hard delete test', async () => {
    await assert.rejects(store.saveBlogTopic(alice, { name: 'Denied', sortOrder: 1, isVisible: true }), /quyền/);
    await store.saveBlogTopic(admin, { name: 'Chủ đề fixture', slug: 'topic-fixture', sortOrder: 2, isVisible: true });
    const [[t]] = await pool.query("SELECT id FROM blog_topics WHERE slug='topic-fixture'");
    const id = await store.saveBlog(alice, input({ topicId: t.id }));
    await store.saveBlogTopic(admin, { name: 'Đổi tên', slug: 'do-not-change', sortOrder: 3, isVisible: false }, t.id);
    let [[row]] = await pool.query('SELECT * FROM blog_topics WHERE id=?', [t.id]); assert.equal(row.slug, 'topic-fixture'); assert.equal(row.is_visible, 0);
    await store.deleteBlogTopic(admin, t.id);
    assert.ok((await pool.query('SELECT id FROM posts WHERE id=?', [id]))[0].length);
    await pool.query('DELETE FROM blog_topics WHERE id=?', [t.id]); // isolated FK verification only, UI never hard-deletes
    [[row]] = await pool.query('SELECT topic_id FROM blog_post_details WHERE post_id=?', [id]); assert.equal(row.topic_id, null);
  });

  test('User CRUD: owner/type enforced, không thể tự publish hoặc giả role Admin', async () => {
    const id = await store.saveBlog(alice, input());
    assert.equal((await read.editableBlog(id, bob)), null);
    await assert.rejects(store.saveBlog(bob, input(), id, 1), /quyền/);
    await assert.rejects(store.deleteBlog(bob, id, 1), /quyền/);
    await assert.rejects(store.saveBlog(alice, input({ intent: 'publish' })), /Admin/);
    await assert.rejects(store.saveBlog({ ...alice, role: 'admin' }, input({ intent: 'publish' })), /Admin/);
    await assert.rejects(store.saveBlog(admin, input(), cyber, 1), /quyền/);
    await store.saveBlog(alice, input({ title: 'Đã sửa' }), id, 1);
    assert.equal((await read.editableBlog(id, alice)).revision, 2);
    await store.deleteBlog(alice, id, 2);
    assert.equal(await read.editableBlog(id, alice), null);
    const [[row]] = await pool.query('SELECT content,status FROM posts WHERE id=?', [id]); assert.ok(row.content); assert.equal(row.status, 'draft');
  });

  test('Duyệt thật: pending/reject/re-submit/approve/hide; sửa published bỏ public giữ slug', async () => {
    const id = await store.saveBlog(alice, input({ title: 'Workflow fixture', intent: 'submit' }));
    let record = await read.editableBlog(id, alice), slug = record.post.slug;
    assert.equal(await read.getPublicBlog(slug), null);
    await assert.rejects(store.reviewBlog(moderator, id, 1, 'approve', ''), /quyền/);
    await assert.rejects(store.reviewBlog(admin, id, 1, 'reject', ''), /không hợp lệ/);
    await store.reviewBlog(admin, id, 1, 'reject', 'Cần thêm nội dung');
    assert.equal((await read.editableBlog(id, alice)).state, 'rejected');
    await store.saveBlog(alice, input({ intent: 'submit' }), id, 2);
    await store.reviewBlog(admin, id, 3, 'approve', ''); assert.ok(await read.getPublicBlog(slug));
    await store.saveBlog(alice, input({ intent: 'draft', title: 'Phiên bản nháp mới' }), id, 4);
    record = await read.editableBlog(id, alice); assert.equal(record.post.slug, slug); assert.equal(await read.getPublicBlog(slug), null);
    await store.saveBlog(admin, input({ intent: 'publish' }), id, 5); assert.ok(await read.getPublicBlog(slug));
    await store.reviewBlog(admin, id, 6, 'hide', 'Ẩn kiểm tra'); assert.equal(await read.getPublicBlog(slug), null);
  });

  test('Concurrency thật: hai Admin quyết định cùng phiên bản, chỉ một commit', async () => {
    const id = await store.saveBlog(bob, input({ intent: 'submit' }));
    const otherAdmin = { id: randomUUID(), role: 'admin' };
    await pool.query("INSERT INTO users(id,email,first_name,role) VALUES(?,'reviewer2@example.invalid','Reviewer','admin')", [otherAdmin.id]);
    const outcome = await Promise.allSettled([store.reviewBlog(admin, id, 1, 'approve', ''), store.reviewBlog(otherAdmin, id, 1, 'reject', 'Không duyệt')]);
    assert.equal(outcome.filter(r => r.status === 'fulfilled').length, 1);
    const [[counts]] = await pool.query("SELECT COUNT(*) AS n FROM blog_review_events WHERE post_id=? AND decision IN ('approved','rejected')", [id]); assert.equal(counts.n, 1);
    await assert.rejects(store.saveBlog(bob, input(), id, 1), /thay đổi/);
  });

  test('Transaction bài/topic/tag: lỗi tag rollback cả nội dung lẫn revision và quota', async () => {
    const id = await store.saveBlog(bob, input({ title: 'Before rollback' }));
    const fault = { query: pool.query.bind(pool), getConnection: async () => {
      const tx = await pool.getConnection(), query = tx.query.bind(tx);
      tx.query = async (sql, args) => { if (sql.startsWith('INSERT IGNORE INTO post_tags')) throw Error('SYNTHETIC_TAG_FAILURE'); return query(sql, args); };
      const release = tx.release.bind(tx); tx.release = () => { tx.query = query; release(); }; return tx;
    } };
    const failing = blogLoader(fault)('src/lib/blog-store.ts');
    await assert.rejects(failing.saveBlog(bob, input({ title: 'Must rollback', tags: ['rollback-only-tag'] }), id, 1), /SYNTHETIC_TAG_FAILURE/);
    const r = await read.editableBlog(id, bob); assert.equal(r.post.title, 'Before rollback'); assert.equal(r.revision, 1);
    const [[tag]] = await pool.query("SELECT COUNT(*) AS n FROM tags WHERE slug='rollback-only-tag'"); assert.equal(tag.n, 0);
  });

  test('Public list thật: topic/search/page; chủ đề ẩn không public filter, pending không lộ', async () => {
    const id = await store.saveBlog(admin, input({ title: 'Only Public Needle', intent: 'publish' }));
    const r = await read.editableBlog(id, admin);
    const list = await read.publicBlogEntries({ q: 'Only Public Needle', topic: 'kinh-nghiem-du-lich', limit: 1, offset: 0 });
    assert.equal(list.total, 1); assert.equal(list.entries[0].post.id, id);
    assert.equal((await read.publicBlogEntries({ q: 'Only Public Needle', limit: 1, offset: 1 })).entries.length, 0);
    assert.equal((await read.publicBlogEntries({ q: "%' OR 1=1 --", limit: 12, offset: 0 })).total, 0);
    await store.saveBlogTopic(admin, { name: 'Kinh nghiệm du lịch', sortOrder: 10, isVisible: false }, topic);
    assert.equal((await read.publicBlogEntries({ topic: 'kinh-nghiem-du-lich', limit: 12, offset: 0 })).total, 0);
    assert.ok(await read.getPublicBlog(r.post.slug));
    await store.saveBlogTopic(admin, { name: 'Kinh nghiệm du lịch', sortOrder: 10, isVisible: true }, topic);
  });

  test('Quota thật: 25 lưu đồng thời chỉ 20 commit; user bị khóa không ghi được', async () => {
    const actor = { id: randomUUID(), role: 'member' };
    await pool.query("INSERT INTO users(id,email,first_name,role) VALUES(?,'quota@example.invalid','Quota','member')", [actor.id]);
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => store.saveBlog(actor, input({ title: 'Quota ' + i }))));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 20);
    const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM posts WHERE author_id=?', [actor.id]); assert.equal(count.n, 20);
    await pool.query('UPDATE users SET is_active=0 WHERE id=?', [actor.id]);
    await assert.rejects(store.saveBlog(actor, input()), /quyền/);
  });

  test('Readiness: bảng đủ nhưng thiếu marker commit vẫn khóa writer mới', async () => {
    await pool.query('DELETE FROM blog_foundation_state WHERE singleton_id=1');
    assert.equal(await read.blogFoundationReady(), false);
    await assert.rejects(store.saveBlog(bob, input()), /migration 006/);
    await pool.query('INSERT INTO blog_foundation_state(singleton_id,migration_version) VALUES(1,6)');
    assert.equal(await read.blogFoundationReady(), true);
  });

  test('Ảnh bìa Blog: owner đọc nháp; guest/tài khoản khác/Moderator bị chặn; Admin/published hợp lệ', async () => {
    // Auxiliary SELECT-only fixtures for the existing shared image ACL.
    await pool.query('CREATE TABLE photos(image_file VARCHAR(80),thumb_file VARCHAR(80),medium_file VARCHAR(80),uploader_id CHAR(36),status VARCHAR(20))');
    await pool.query('CREATE TABLE home_settings(hero_image VARCHAR(80))');
    const file = randomUUID() + '.webp', publishedFile = randomUUID() + '.webp';
    await store.saveBlog(alice, input({ coverFile: file })); await store.saveBlog(admin, input({ coverFile: publishedFile, intent: 'publish' }));
    const access = blogLoader(pool)('src/lib/image-access.ts');
    for (const [viewer, allowed] of [[null, false], [alice, true], [bob, false], [moderator, false], [admin, true]]) assert.equal((await access.imageAccess(file, viewer)).allowed, allowed);
    assert.equal((await access.imageAccess(publishedFile, null)).allowed, true);
  });
}

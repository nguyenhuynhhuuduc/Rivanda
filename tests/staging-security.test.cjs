const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, env = {}, extra = {}) {
  mocks = { './cyber-ip': { allocateVirtualIp: async () => '10.10.1.10' }, '@/lib/blog-read': { blogFoundationReady: async () => false }, '@/app/(light)/account/blog/actions': { saveBlogAction: async () => { throw Error('UNEXPECTED_FOUNDATION_BRANCH'); } }, ...mocks };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), process: { env }, Buffer, URL, Request, Response, FormData, File, TextEncoder, console: { error() {}, log() {} }, ...extra });
  return exports;
}
const user = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'qa@example.invalid', passwordHash: 'old-hash', firstName: 'QA', lastName: '', role: 'admin', isActive: true, avatarUrl: null };
const secret = 'synthetic-session-secret-for-security-tests-only';

test('SEC-03: JWT cũ bị thu hồi khi hash đổi; token legacy/khóa tài khoản cũng bị từ chối', async () => {
  let dbUser = { ...user }, token;
  const auth = load('src/lib/auth.ts', {
    react: { cache: fn => fn }, 'next/headers': { cookies: async () => ({ get: () => token ? { value: token } : undefined, set: (_, v) => { token = v; }, delete: () => { token = null; } }) },
    './users': { findUserById: async () => dbUser, displayName: u => u.firstName }, './permissions': { can: () => true },
  }, { SESSION_SECRET: secret, NODE_ENV: 'production' });
  await auth.createSession(user.id, 'old-hash');
  assert.equal((await auth.getCurrentUser()).id, user.id);
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  assert.ok(payload.credentialStamp);
  assert.doesNotMatch(JSON.stringify(payload), /old-hash/);
  dbUser.passwordHash = 'new-hash';
  assert.equal(await auth.getCurrentUser(), null);
  await assert.rejects(auth.createSession(user.id, 'old-hash'), /đã thay đổi/);
  await auth.createSession(user.id, 'new-hash');
  assert.equal((await auth.getCurrentUser()).id, user.id);
  dbUser.isActive = false;
  assert.equal(await auth.getCurrentUser(), null);
  dbUser.isActive = true;
  token = await new (require('jose').SignJWT)({}).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
  assert.equal(await auth.getCurrentUser(), null);
});

function transactionDb({ failInvalidate = false } = {}) {
  let password = 'old-hash', used = false, commits = 0, rollbacks = 0, chain = Promise.resolve();
  const sqls = [];
  const pool = {
    query: async () => [[{ user_id: user.id }]],
    getConnection: async () => {
      let releaseLock, locked = false, stagedPassword = password, stagedUsed = used;
      async function acquire() {
        if (locked) return;
        const previous = chain;
        chain = new Promise(resolve => { releaseLock = resolve; });
        await previous; locked = true; stagedPassword = password; stagedUsed = used;
      }
      return {
        beginTransaction: async () => {},
        execute: async (sql, params) => {
          sqls.push(sql);
          if (sql.startsWith('SELECT id FROM users') || sql.startsWith('UPDATE users')) await acquire();
          if (sql.startsWith('SELECT id FROM users')) return [[{ id: user.id }]];
          if (sql.startsWith('SELECT user_id')) return [stagedUsed ? [] : [{ user_id: user.id }]];
          if (sql.startsWith('UPDATE users')) stagedPassword = params[0];
          if (sql.startsWith('UPDATE password_reset_tokens')) { if (failInvalidate) throw Error('DB_FAIL'); stagedUsed = true; }
          return [{ affectedRows: 1 }];
        },
        commit: async () => { password = stagedPassword; used = stagedUsed; commits++; if (locked) { locked = false; releaseLock(); } },
        rollback: async () => { rollbacks++; if (locked) { locked = false; releaseLock(); } },
        release() {},
      };
    },
  };
  return { pool, state: () => ({ password, used, commits, rollbacks }), sqls };
}

test('SEC-03: đổi mật khẩu + vô hiệu reset token commit cùng nhau; lỗi thì rollback', async () => {
  for (const failure of [false, true]) {
    const db = transactionDb({ failInvalidate: failure });
    const users = load('src/lib/users.ts', { './db': db, './oauth': {} });
    if (failure) await assert.rejects(users.setPasswordHash(user.id, 'new-hash'), /DB_FAIL/);
    else await users.setPasswordHash(user.id, 'new-hash');
    assert.equal(db.state().password, failure ? 'old-hash' : 'new-hash');
    assert.equal(db.state().used, !failure);
  }
});

test('SEC-04: hai reset đồng thời chỉ một thành công; lỗi ghi token rollback mật khẩu', async () => {
  const db = transactionDb();
  const reset = load('src/lib/password-reset.ts', { './db': db, './oauth': {}, './mail': {}, './users': {} });
  const outcomes = await Promise.all([reset.consumeResetToken('a'.repeat(64), 'hash-A'), reset.consumeResetToken('a'.repeat(64), 'hash-B')]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(db.state().commits, 1);
  assert.equal(db.state().rollbacks, 1);
  assert.ok(db.sqls.some(sql => sql.includes('FOR UPDATE')));
  const failing = transactionDb({ failInvalidate: true });
  const resetFail = load('src/lib/password-reset.ts', { './db': failing, './oauth': {}, './mail': {}, './users': {} });
  await assert.rejects(resetFail.consumeResetToken('b'.repeat(64), 'new-hash'), /DB_FAIL/);
  assert.equal(failing.state().password, 'old-hash');
  assert.equal(failing.state().used, false);
});

test('SEC-08: thiếu SMTP không tạo reset token hoặc log nội dung email', async () => {
  const output = [];
  const mail = load('src/lib/mail.ts', {}, {}, { console: { log: x => output.push(x), error: x => output.push(x) } });
  assert.equal(await mail.sendMail('private@example.invalid', 'private-subject', 'private-reset-token'), false);
  const reset = load('src/lib/password-reset.ts', { './db': { pool: { query() { throw Error('DB_READ'); } } }, './oauth': {}, './mail': {}, './users': { findUserByEmail() { throw Error('DB_READ'); } } });
  await reset.requestPasswordReset('private@example.invalid');
  assert.equal(output.length, 0);
});

for (const remove of [false, true]) test(`DATA-01: hero ${remove ? 'gỡ' : 'thay'} giữ ảnh cũ nếu DB lỗi`, async () => {
  let deletes = 0;
  const actions = load('src/app/admin/actions.ts', {
    'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: x => { throw Error(x); } }, '@/lib/auth': { requirePermission: async () => user }, '@/lib/activity': {},
    '@/lib/settings': { getHomeSettings: async () => ({ heroImage: 'old-file', siteName: 'QA' }), updateHomeSettings: async () => { throw Error('DB_FAIL'); } },
    '@/lib/uploads': { saveImage: async () => 'new-file', deleteImage: async () => { deletes++; }, UploadError: class extends Error {} },
  });
  const data = new FormData();
  if (remove) data.set('removeImage', 'on'); else data.set('heroImage', new File(['fixture'], 'new.jpg'));
  await assert.rejects(actions.saveHomeAction(data), /DB_FAIL/);
  assert.equal(deletes, 0);
});

for (const remove of [false, true]) test(`DATA-01: cover ${remove ? 'gỡ' : 'thay'} không xóa ảnh khi DB lỗi`, async () => {
  let deletes = 0;
  const actions = load('src/app/admin/post-actions.ts', {
    'next/cache': {}, 'next/navigation': { redirect: x => { throw Error(x); } }, '@/lib/auth': { requireAdmin: async () => {}, getCurrentUser: async () => user }, '@/lib/activity': {}, '@/lib/format': { readMinutes: () => 1 },
    '@/lib/cyber-lab': { CATEGORIES: {}, SECTIONS: {} }, '@/lib/posts': { getPostById: async () => ({ id: user.id, coverFile: 'old-file' }), updatePost: async () => { throw Error('DB_FAIL'); } },
    '@/lib/uploads': { saveImage: async () => 'new-file', deleteImage: async () => { deletes++; }, UploadError: class extends Error {} },
    './helpers': { str: (fd, key) => String(fd.get(key) ?? ''), strOrNull: () => null, flag: (fd, key) => fd.get(key) === 'on', qs: () => '' },
  });
  const data = new FormData(); for (const [key, value] of Object.entries({ id: user.id, type: 'blog', title: 'QA', content: 'QA' })) data.set(key, value);
  if (remove) data.set('removeCover', 'on'); else data.set('cover', new File(['fixture'], 'new.jpg'));
  await assert.rejects(actions.savePostAction(data), /DB_FAIL/);
  assert.equal(deletes, 0);
});

const gateEnv = { APP_ENV: 'staging', STAGING_AUTH_USERNAME: 'qa-user', STAGING_AUTH_PASSWORD: 'synthetic-gate-password-for-tests' };
test('staging gate chặn mọi page/API/asset/Server Action trước nghiệp vụ, chỉ health GET/HEAD công khai', () => {
  const { proxy } = load('src/proxy.ts', {}, gateEnv);
  for (const pathname of ['/', '/login', '/admin', '/api/photos/x/download', '/uploads/a.jpg', '/_next/static/a.js', '/_next/image?url=x', '/sitemap.xml']) {
    for (const method of ['GET', 'POST']) {
      const response = proxy(new NextRequest('https://qa.invalid' + pathname, { method }));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
  for (const method of ['GET', 'HEAD']) assert.equal(proxy(new NextRequest('https://qa.invalid/api/health', { method })).headers.get('x-middleware-next'), '1');
  assert.equal(proxy(new NextRequest('https://qa.invalid/api/health', { method: 'POST' })).status, 401);
});

test('staging gate đúng/sai secret, fail closed, production giữ quyền ứng dụng', () => {
  const request = password => new NextRequest('https://qa.invalid/admin', { headers: { authorization: 'Basic ' + Buffer.from('qa-user:' + password).toString('base64') } });
  const gate = load('src/proxy.ts', {}, gateEnv).proxy;
  assert.equal(gate(request('wrong-password')).status, 401);
  const allowed = gate(request(gateEnv.STAGING_AUTH_PASSWORD));
  assert.equal(allowed.headers.get('x-middleware-next'), '1');
  assert.match(allowed.headers.get('x-robots-tag'), /noindex/);
  assert.equal(load('src/proxy.ts', {}, { APP_ENV: 'staging' }).proxy(request('x')).status, 503);
  assert.equal(load('src/proxy.ts', {}, { RAILWAY_ENVIRONMENT_NAME: 'staging', APP_ENV: 'production' }).proxy(request('x')).status, 503);
  assert.equal(load('src/proxy.ts', {}, { APP_ENV: 'production' }).proxy(request('x')).headers.get('x-middleware-next'), '1');
});

test('config fail closed: thiếu env, root DB user, volume lệch, OAuth nửa cấu hình', async () => {
  const { validateEnvironment } = await import(pathToFileURL(path.join(root, 'scripts/runtime-config.mjs')));
  const valid = { ...gateEnv, SESSION_SECRET: secret, APP_URL: 'https://qa.invalid', DB_HOST: 'db.internal', DB_PORT: '3306', DB_USER: 'app', DB_PASSWORD: 'synthetic', DB_NAME: 'staging', UPLOAD_DIR: path.resolve(root, 'uploads') };
  assert.deepEqual(validateEnvironment(valid), []);
  assert.ok(validateEnvironment({}).length > 0);
  for (const patch of [{ APP_URL: 'http://qa.invalid' }, { DB_USER: 'root' }, { GOOGLE_CLIENT_ID: 'only-id' }, { RAILWAY_PROJECT_ID: 'qa', RAILWAY_VOLUME_MOUNT_PATH: path.resolve(root, 'different') }]) assert.ok(validateEnvironment({ ...valid, ...patch }).length > 0);
});

test('read-only schema gate phát hiện thiếu cột auth, không dựa số lượng bảng', async () => {
  const { REQUIRED, missingColumns } = await import(pathToFileURL(path.join(root, 'scripts/check-schema.mjs')));
  const rows = Object.entries(REQUIRED).flatMap(([TABLE_NAME, names]) => names.split(' ').map(COLUMN_NAME => ({ TABLE_NAME, COLUMN_NAME })));
  assert.equal(Object.keys(REQUIRED).length, 29);
  assert.deepEqual(missingColumns(rows), []);
  assert.deepEqual(missingColumns(rows.filter(r => !(r.TABLE_NAME === 'users' && r.COLUMN_NAME === 'password_hash'))), ['users.password_hash']);
});

test('DB-01: runner dừng ở SQL lỗi duplicate, không ghi migration hoàn tất (DB giả)', async () => {
  let recorded = 0, ended = false;
  const connection = { query: async sql => {
    if (sql === 'SELECT filename FROM schema_migrations') return [[]];
    if (sql === 'ALTER TABLE fixture ADD COLUMN name TEXT') throw Object.assign(Error('fixture duplicate'), { code: 'ER_DUP_FIELDNAME' });
    return [[]];
  }, execute: async () => { recorded++; }, changeUser: async () => {}, end: async () => { ended = true; } };
  const mocks = { 'node:fs': { existsSync: () => false, readdirSync: () => ['001_fixture.sql'], readFileSync: () => 'ALTER TABLE fixture ADD COLUMN name TEXT;' }, 'mysql2/promise': { createConnection: async () => connection } };
  let text = fs.readFileSync(path.join(root, 'scripts/init-db.mjs'), 'utf8').replaceAll('import.meta.url', 'fixtureUrl');
  const compiled = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const processMock = { env: { ALLOW_DATABASE_MIGRATIONS: 'explicitly-approved' }, exitCode: 0 };
  await vm.runInNewContext('(async()=>{' + compiled + '})()', { exports: {}, require: id => mocks[id] ?? require(id), fixtureUrl: pathToFileURL(path.join(root, 'scripts/init-db.mjs')).href, process: processMock, console: { log() {}, error() {} } });
  assert.equal(recorded, 0); assert.equal(ended, true); assert.equal(processMock.exitCode, 1);
});

test('DB-01: không có phê duyệt thì runner dừng trước cả nạp env/kết nối DB (VM)', async () => {
  let connections = 0;
  const source = fs.readFileSync(path.join(root, 'scripts/init-db.mjs'), 'utf8').replaceAll('import.meta.url', 'fixtureUrl');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  await assert.rejects(vm.runInNewContext('(async()=>{' + compiled + '})()', { exports: {}, require: id => id === 'mysql2/promise' ? { createConnection() { connections++; } } : require(id), fixtureUrl: pathToFileURL(path.join(root, 'scripts/init-db.mjs')).href, process: { env: {} } }), /Migration bị khóa/);
  assert.equal(connections, 0);
});

test('container bootstrap chỉ chown mount, hạ UID/GID trước khi start và từ chối sai path/UID (VM)', async () => {
  const source = fs.readFileSync(path.join(root, 'scripts/container-entrypoint.mjs'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  for (const scenario of [{ uid: 0, dir: '/app/uploads', ok: true }, { uid: 1000, dir: '/app/uploads', ok: true }, { uid: 1001, dir: '/app/uploads', ok: false }, { uid: 0, dir: '/etc', ok: false }]) {
    let uid = scenario.uid, gid = scenario.uid, started = false;
    const paths = [], processMock = { env: { UPLOAD_DIR: scenario.dir }, getuid: () => uid, setgid: id => { gid = id; }, setuid: id => { assert.equal(gid, 1000); uid = id; }, umask() {}, exitCode: 0 };
    const mocks = {
      'node:fs/promises': { realpath: async value => value, stat: async () => ({ isDirectory: () => true }), chown: async value => paths.push(value) },
      './runtime-config.mjs': { validateEnvironment: () => [] }, './start.mjs': {},
    };
    await vm.runInNewContext('(async()=>{' + compiled + '})()', { exports: {}, process: processMock, console: { error() {} }, require: id => { if (id === './start.mjs') { assert.equal(uid, 1000); started = true; } return mocks[id]; } });
    assert.equal(started, scenario.ok);
    assert.deepEqual(paths, scenario.ok && scenario.uid === 0 ? ['/app/uploads'] : []);
    assert.equal(processMock.exitCode, scenario.ok ? 0 : 1);
  }
});

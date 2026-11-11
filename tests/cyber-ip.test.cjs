const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id) });
  return exports;
}
const addresses = load('src/lib/cyber-ip-address.ts');

// Mô hình InnoDB tối thiểu: khóa user riêng, khóa allocator toàn cục; stage đến commit.
function database() {
  const users = new Set(), ips = new Map(), locks = new Map();
  let next = 0, deadlock = false;
  async function lock(key) {
    const previous = locks.get(key) || Promise.resolve();
    let unlock;
    const gate = new Promise(resolve => { unlock = resolve; });
    locks.set(key, previous.then(() => gate));
    await previous;
    return unlock;
  }
  const pool = { getConnection: async () => {
    const releases = [], pending = new Map(); let staged;
    return {
      beginTransaction: async () => {},
      execute: async (sql, args = []) => {
        if (sql.startsWith('SELECT id FROM users')) { releases.push(await lock('user:' + args[0])); return [users.has(args[0]) ? [{ id: args[0] }] : []]; }
        if (sql.startsWith('SELECT ip_number')) return [ips.has(args[0]) ? [{ ip_number: ips.get(args[0]) }] : []];
        if (sql.startsWith('SELECT next_slot')) { assert.match(sql, /FOR UPDATE/); releases.push(await lock('pool')); return [[{ next_slot: next }]]; }
        if (sql.startsWith('INSERT INTO cyber_virtual_ips')) {
          if (deadlock) { deadlock = false; throw { code: 'ER_LOCK_DEADLOCK' }; }
          if (ips.has(args[0]) || [...ips.values()].includes(args[1])) throw { code: 'ER_DUP_ENTRY' };
          pending.set(args[0], args[1]); return [{}];
        }
        if (sql.startsWith('UPDATE cyber_ip_allocator')) { staged = args[0]; return [{}]; }
        throw Error('Unexpected mock SQL');
      },
      commit: async () => { for (const [id, ip] of pending) ips.set(id, ip); if (staged !== undefined) next = staged; releases.splice(0).reverse().forEach(fn => fn()); },
      rollback: async () => { pending.clear(); releases.splice(0).reverse().forEach(fn => fn()); }, release() {},
    };
  } };
  return { users, ips, pool, setNext: n => { next = n; }, failOnce: () => { deadlock = true; }, get next() { return next; } };
}

test('128 tài khoản cấp đồng thời không trùng; 50 yêu cầu cho legacy user chỉ tạo 1 IP', async () => {
  const db = database();
  const allocator = load('src/lib/cyber-ip.ts', { './db': { pool: db.pool }, './cyber-ip-address': addresses });
  for (let i = 0; i < 128; i++) db.users.add('user-' + i);
  const ips = await Promise.all([...db.users].map(id => allocator.ensureVirtualIp(id)));
  assert.equal(new Set(ips).size, 128); assert.equal(db.ips.size, 128);
  db.users.add('legacy');
  const legacy = await Promise.all(Array.from({ length: 50 }, () => allocator.ensureVirtualIp('legacy')));
  assert.equal(new Set(legacy).size, 1); assert.equal(db.ips.size, 129); assert.equal(db.next, 129);
  const afterLogin = await allocator.ensureVirtualIp('legacy');
  assert.equal(afterLogin, legacy[0]); assert.equal(db.next, 129);
});

test('deadlock retry rollback, hết pool không ghi, tài khoản không tồn tại bị từ chối', async () => {
  const db = database(); db.users.add('a'); db.users.add('b');
  const allocator = load('src/lib/cyber-ip.ts', { './db': { pool: db.pool }, './cyber-ip-address': addresses });
  db.failOnce(); assert.equal(await allocator.ensureVirtualIp('a'), '10.10.1.10'); assert.equal(db.next, 1);
  db.setNext(62230); await assert.rejects(allocator.ensureVirtualIp('b'), /EXHAUSTED/);
  assert.equal(db.ips.has('b'), false); assert.equal(await allocator.ensureVirtualIp('a'), '10.10.1.10');
  await assert.rejects(allocator.ensureVirtualIp('unknown'), /NOT_FOUND/);
});

test('đăng ký email/OAuth rollback toàn bộ nếu không cấp được IP; cấp IP trước commit', async () => {
  for (const oauth of [false, true]) for (const fail of [false, true]) {
    const events = [];
    const row = { id: 'fixture', email: 'fixture@example.invalid', password_hash: 'hash', first_name: 'QA', last_name: '', role: 'member', is_active: 1 };
    const connection = { beginTransaction: async () => events.push('begin'), execute: async sql => { events.push(sql.startsWith('INSERT INTO users') ? 'user' : sql.startsWith('INSERT INTO user_identities') ? 'identity' : 'select'); return sql.startsWith('SELECT') ? [[row]] : [{}]; }, commit: async () => events.push('commit'), rollback: async () => events.push('rollback'), release() {} };
    const users = load('src/lib/users.ts', {
      './db': { pool: { execute: async () => [[]], getConnection: async () => connection } },
      './cyber-ip': { allocateVirtualIp: async c => { assert.equal(c, connection); events.push('ip'); if (fail) throw Error('NO_IP'); return '10.10.1.10'; } },
    });
    const result = oauth ? users.loginWithOAuth('facebook', { id: 'id', email: row.email, firstName: 'QA', lastName: '', avatarUrl: null }) : users.createUser({ email: row.email, passwordHash: 'hash', firstName: 'QA', lastName: '' });
    if (fail) { await assert.rejects(result, /NO_IP/); assert.equal(events.includes('commit'), false); assert.equal(events.at(-1), 'rollback'); }
    else { await result; assert.ok(events.indexOf('ip') < events.indexOf('commit')); }
  }
});

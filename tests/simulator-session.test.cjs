const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto, ...extra });
  return exports;
}
const addresses = load('src/lib/cyber-ip-address.ts');
const sessions = load('src/lib/practice-session.ts', { './cyber-ip-address': addresses });
const identity = { ok: true, userId: 'account-a', ip: '10.10.1.10' };
function machine(owner = 'account-a') {
  let now = 1000, count = 0, callback;
  const clock = { now: () => now, id: () => `session-${++count}`, schedule: fn => { callback = fn; return 1; }, cancel: () => { callback = undefined; } };
  const store = sessions.createPracticeSessionStore(owner, clock);
  return { store, tick() { now += 350; const fn = callback; callback = undefined; fn?.(); } };
}

test('62.230 IP hợp lệ không trùng, không cấp dải/host dự trữ và xử lý hết pool', () => {
  const values = new Set();
  for (let slot = 0; slot < addresses.CYBER_IP_CAPACITY; slot++) {
    const number = addresses.slotToIpNumber(slot), ip = addresses.ipNumberToString(number);
    assert.equal(addresses.isVirtualIp(ip), true);
    values.add(ip);
  }
  assert.equal(values.size, 62230);
  assert.equal(addresses.ipNumberToString(addresses.slotToIpNumber(0)), '10.10.1.10');
  assert.equal(addresses.ipNumberToString(addresses.slotToIpNumber(62229)), '10.10.254.254');
  for (const ip of ['10.10.0.0', '10.10.0.10', '10.10.255.255', '10.10.1.1', '10.10.1.255', '10.10.01.10', '192.0.2.1']) assert.equal(addresses.isVirtualIp(ip), false);
  assert.throws(() => addresses.slotToIpNumber(62230), /EXHAUSTED/);
});

test('Start -> Starting -> Running; Stop xóa mọi map/history, IP giữ nguyên; restart tạo phiên sạch', async () => {
  const h = machine(), s = h.store;
  await s.start(async () => identity);
  assert.equal(s.getSnapshot().status, 'Stopped'); // Chưa nhận IP thì không start.
  await s.loadIdentity(async () => identity);
  await s.start(async () => identity);
  assert.equal(s.getSnapshot().status, 'Starting');
  const memory = s.getMemory('account-a');
  memory.filesystem.set('/file', 'private'); memory.history.push('synthetic command'); memory.temporary.set('secret', 'temporary');
  assert.equal(s.getMemory('account-b'), null);
  h.tick();
  assert.equal(s.getSnapshot().status, 'Running');
  assert.equal(s.getSnapshot().startedAt, 1350);
  const id = s.getSnapshot().sessionId;
  s.stop();
  assert.equal(memory.filesystem.size, 0); assert.equal(memory.history.length, 0); assert.equal(memory.temporary.size, 0);
  assert.equal(memory.directories.size, 0);
  assert.equal(s.getMemory('account-a'), null);
  assert.equal(s.getSnapshot().ip, identity.ip);
  await s.start(async () => identity); h.tick();
  assert.notEqual(s.getSnapshot().sessionId, id);
  assert.equal(s.getMemory('account-a').filesystem.size, 0);
});

test('double Start chỉ gọi server một lần; Stop vô hiệu phản hồi/timer cũ', async () => {
  const h = machine(), s = h.store;
  await s.loadIdentity(async () => identity);
  let resolve, calls = 0;
  const pending = s.start(() => { calls++; return new Promise(r => { resolve = r; }); });
  await s.start(async () => { calls++; return identity; });
  assert.equal(calls, 1);
  s.stop(); resolve(identity); await pending; h.tick();
  assert.equal(s.getSnapshot().status, 'Stopped');
  assert.equal(s.getMemory('account-a'), null);
  await s.start(async () => identity);
  s.stop(); h.tick();
  assert.equal(s.getSnapshot().status, 'Stopped');
});

test('mỗi tab/owner có RAM riêng; đổi account, logout và refresh không khôi phục dữ liệu', async () => {
  const a = machine(), b = machine();
  await a.store.loadIdentity(async () => identity); await a.store.start(async () => identity); a.tick();
  a.store.getMemory('account-a').filesystem.set('/private', 'one tab only');
  assert.equal(b.store.getSnapshot().status, 'Stopped');
  a.store.changeOwner('account-b');
  assert.equal(a.store.getMemory('account-a'), null); assert.equal(a.store.getSnapshot().ip, null);
  await a.store.loadIdentity(async () => ({ ok: true, userId: 'account-b', ip: '10.10.1.11' }));
  await a.store.start(async () => ({ ok: true, userId: 'account-b', ip: '10.10.1.11' })); a.tick();
  await a.store.loadIdentity(async () => ({ ok: false, signedOut: true, error: 'Đăng nhập lại' }));
  assert.equal(a.store.getSnapshot().status, 'Stopped');
  assert.equal(machine('account-b').store.getSnapshot().sessionId, null);
});

test('IP lỗi/migration chưa chạy/server lỗi khóa Start và không tạo memory; đổi owner trên server xóa phiên', async () => {
  const h = machine(), s = h.store;
  await s.loadIdentity(async () => ({ ok: false, error: 'Migration 005 chưa chạy' }));
  assert.equal(s.getSnapshot().ip, null); assert.match(s.getSnapshot().error, /005/);
  await s.loadIdentity(async () => identity); await s.start(async () => { throw Error('network'); });
  assert.equal(s.getSnapshot().status, 'Stopped'); assert.equal(s.getMemory('account-a'), null);
  await s.start(async () => identity); h.tick();
  const memory = s.getMemory('account-a'); memory.history.push('private');
  await s.loadIdentity(async () => ({ ok: true, userId: 'account-b', ip: '10.10.1.11' }));
  assert.equal(memory.history.length, 0); assert.equal(s.getSnapshot().status, 'Stopped');
});

test('server action chỉ dùng ID từ auth; không nhận session/filesystem/IP từ client', async () => {
  for (const mode of ['guest', 'missing-schema', 'ok']) {
    let owner;
    const action = load('src/app/(dark)/cyber-lab/practice/actions.ts', {
      '@/lib/auth': { getCurrentUser: async () => mode === 'guest' ? null : { id: 'account-a' } },
      '@/lib/cyber-ip': { ensureVirtualIp: async id => { owner = id; if (mode === 'missing-schema') throw { code: 'ER_NO_SUCH_TABLE' }; return identity.ip; } },
    });
    const result = await action.getPracticeIdentityAction('account-b', '10.10.1.99');
    if (mode === 'guest') { assert.equal(result.signedOut, true); assert.equal(owner, undefined); }
    else { assert.equal(owner, 'account-a'); assert.equal(result.ok, mode === 'ok'); }
    if (mode === 'missing-schema') assert.match(result.error, /005/);
  }
});

test('provider thật dọn RAM khi pagehide/logout/broadcast; cleanup không lưu browser storage', async () => {
  const h = machine(), handlers = new Map(), channels = [], effects = [];
  const React = require('react');
  const provider = load('src/components/cyber-lab/PracticeSessionProvider.tsx', {
    react: { ...React, useRef: () => ({ current: null }), useEffect: fn => effects.push(fn) },
    '@/lib/practice-session': { createPracticeSessionStore: () => h.store },
    '@/app/(dark)/cyber-lab/practice/actions': { getPracticeIdentityAction: async () => identity },
  }, {
    window: { addEventListener: (event, fn) => handlers.set(event, fn), removeEventListener: event => handlers.delete(event) },
    BroadcastChannel: class { constructor() { channels.push(this); } addEventListener(event, fn) { this.callback = fn; } close() { this.closed = true; } },
    localStorage: new Proxy({}, { get() { throw Error('Must not use storage'); } }),
    sessionStorage: new Proxy({}, { get() { throw Error('Must not use storage'); } }),
    indexedDB: new Proxy({}, { get() { throw Error('Must not use storage'); } }),
  });
  provider.PracticeSessionProvider({ ownerId: 'account-a', children: null });
  const cleanup = effects[0]();
  for (const clear of [handlers.get('pagehide'), handlers.get('personal-site-clear-practice'), channels[0].callback]) {
    await h.store.loadIdentity(async () => identity); await h.store.start(async () => identity); h.tick();
    const memory = h.store.getMemory('account-a'); memory.filesystem.set('/private', 'secret');
    clear();
    assert.equal(memory.filesystem.size, 0); assert.equal(h.store.getSnapshot().status, 'Stopped'); assert.equal(h.store.getSnapshot().ip, null);
  }
  cleanup(); assert.equal(handlers.size, 0); assert.equal(channels[0].closed, true);
});

test('focus xác minh owner, không cấp IP; phản hồi cũ không xóa trạng thái tài khoản mới', async () => {
  const h = machine(), handlers = new Map(), effects = [];
  let verify = async () => 'account-a', allocations = 0;
  const React = require('react');
  const provider = load('src/components/cyber-lab/PracticeSessionProvider.tsx', {
    react: { ...React, useRef: () => ({ current: null }), useEffect: fn => effects.push(fn) },
    '@/lib/practice-session': { createPracticeSessionStore: () => h.store },
    '@/app/(dark)/cyber-lab/practice/actions': {
      getPracticeIdentityAction: async () => { allocations++; return identity; },
      verifyPracticeOwnerAction: () => verify(),
    },
  }, {
    window: { addEventListener: (event, fn) => handlers.set(event, fn), removeEventListener: event => handlers.delete(event) },
    BroadcastChannel: undefined,
  });
  provider.PracticeSessionProvider({ ownerId: 'account-a', children: null });
  const cleanup = effects[0](), focus = handlers.get('focus');
  await h.store.loadIdentity(async () => identity); await h.store.start(async () => identity); h.tick();
  await focus();
  assert.equal(h.store.getSnapshot().status, 'Running'); assert.equal(allocations, 0);
  verify = async () => null;
  const memory = h.store.getMemory('account-a'); memory.filesystem.set('/private', 'secret');
  await focus();
  assert.equal(h.store.getSnapshot().status, 'Stopped'); assert.equal(memory.filesystem.size, 0);
  for (const failure of [false, true]) {
    h.store.changeOwner('account-a');
    let resolve, reject;
    verify = () => new Promise((ok, bad) => { resolve = ok; reject = bad; });
    const pending = focus();
    h.store.changeOwner('account-b');
    await h.store.loadIdentity(async () => ({ ok: true, userId: 'account-b', ip: '10.10.1.11' }));
    if (failure) reject(Error('fixture')); else resolve(null);
    await pending;
    assert.equal(h.store.getSnapshot().ownerId, 'account-b'); assert.equal(h.store.getSnapshot().ip, '10.10.1.11');
  }
  cleanup();
});

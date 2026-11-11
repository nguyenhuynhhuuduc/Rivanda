// Sudo/root/apt đều mô phỏng trong RAM; không env, DB, process, HTTP hoặc shell thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Error, Map, Set, Date, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), fetch() { throw Error('No network'); }, WebSocket: class { constructor() { throw Error('No socket'); } }, ...extra });
  return exports;
}
const files = load('src/lib/simulator-filesystem.ts'), match = load('src/lib/simulator-match.ts'), sudoModule = load('src/lib/simulator-sudo.ts');
const shellModule = load('src/lib/simulator-shell.ts', { './simulator-filesystem': files, './simulator-match': match, './simulator-sudo': sudoModule });
function fixture({ owner = 'account-a', session = 'session-a', allowed = true } = {}) {
  let active = true, time = 1000;
  const memory = { ownerId: owner, sessionId: session, virtualIp: '10.10.1.10', filesystem: new Map(), directories: new Set(['/', '/home', '/home/kali', '/home/kali/Desktop', '/home/kali/Documents']), temporary: new Map(), history: [] };
  const vfs = files.createVirtualFileSystem(memory, () => active), policy = { sudoAllowed: allowed, now: () => time }, shell = shellModule.createSimulatorShell(memory, vfs, policy);
  const run = line => shell.execute(line);
  const elevate = line => { const result = run(line); return result.passwordPrompt ? shell.submitPassword(sudoModule.SIMULATOR_SUDO_PASSWORD) : result; };
  return { memory, vfs, shell, policy, run, elevate, setTime(value) { time = value; }, stop() { active = false; memory.filesystem.clear(); memory.directories.clear(); memory.temporary.clear(); memory.history.splice(0); } };
}

test('sudo whoami chỉ root sau mật khẩu mô phỏng; user thường vẫn là kali', () => {
  const h = fixture(); assert.equal(h.run('whoami').output, 'kali');
  const waiting = h.run('sudo whoami'); assert.match(waiting.output, /KHÔNG nhập mật khẩu website/); assert.match(waiting.passwordPrompt, /mô phỏng/);
  assert.equal(h.shell.isAwaitingPassword(), true);
  assert.equal(h.shell.submitPassword('kali-sim').output, 'root');
  assert.equal(h.shell.isAwaitingPassword(), false); assert.equal(h.run('whoami').output, 'kali');
  assert.equal(h.run('sudo whoami').output, 'root');
  assert.equal(h.memory.history.filter(line => line === 'sudo whoami').length, 2);
  assert.equal(h.memory.history.includes('kali-sim'), false);
});

test('sai mật khẩu/3 lần/hủy không chạy lệnh, không ghi history hoặc lưu chuỗi đã nhập', () => {
  const h = fixture(); h.run('sudo touch /never-created');
  for (let i = 0; i < 2; i++) assert.ok(h.shell.submitPassword('private-input-marker').passwordPrompt);
  const last = h.shell.submitPassword('private-input-marker'); assert.match(last.output, /3 incorrect/); assert.equal(last.passwordPrompt, undefined);
  assert.throws(() => h.vfs.stat('/never-created'), /Không tìm thấy/);
  assert.equal(JSON.stringify(h.memory.history).includes('private-input-marker'), false);
  assert.equal(JSON.stringify([...h.memory.temporary]).includes('private-input-marker'), false);
  assert.match(h.shell.submitPassword('kali-sim').output, /không có yêu cầu/);
  h.run('sudo touch /also-never-created'); h.shell.cancelPassword();
  assert.equal(h.shell.isAwaitingPassword(), false); assert.throws(() => h.vfs.stat('/also-never-created'), /Không tìm thấy/);
});

test('sudo -l/-k, cache 5 phút, hết hạn và clock rollback bắt xác thực lại', () => {
  const h = fixture(); assert.ok(h.run('sudo -l').passwordPrompt);
  assert.match(h.shell.submitPassword('kali-sim').output, /may run.*as root/);
  assert.match(h.run('sudo -l').output, /apt/);
  h.setTime(1000 + sudoModule.SUDO_TTL_MS - 1); assert.equal(h.run('sudo whoami').output, 'root');
  h.setTime(1000 + sudoModule.SUDO_TTL_MS); assert.ok(h.run('sudo whoami').passwordPrompt); h.shell.cancelPassword();
  assert.equal(h.elevate('sudo whoami').output, 'root');
  assert.equal(h.run('sudo -k').output, ''); assert.equal(h.memory.temporary.has('simulator-sudo-auth'), false);
  assert.ok(h.run('sudo whoami').passwordPrompt); h.shell.cancelPassword();
  h.elevate('sudo whoami'); h.setTime(1); assert.ok(h.run('sudo whoami').passwordPrompt);
});

test('không có quyền sudo hoặc bị thu hồi quyền khi đang nhập: không thể nâng quyền', () => {
  const h = fixture({ allowed: false });
  for (const command of ['sudo whoami', 'sudo -l', 'sudo touch /denied', 'sudo apt update']) {
    const result = h.run(command); assert.match(result.output, /not in the sudoers/); assert.equal(result.passwordPrompt, undefined);
  }
  assert.match(h.shell.submitPassword('kali-sim').output, /không có yêu cầu/);
  assert.equal(h.run('sudo -k').output, ''); assert.equal(h.run('whoami').output, 'kali');
  const revoked = fixture(); revoked.run('sudo whoami'); revoked.policy.sudoAllowed = false;
  assert.match(revoked.shell.submitPassword('kali-sim').output, /not in the sudoers/);
  assert.equal(revoked.memory.temporary.has('simulator-sudo-auth'), false);
});

test('root ảo có owner/rwx đúng, không nâng principal File Manager hoặc callback subscriber', () => {
  const h = fixture(); h.vfs.write('source', 'shared data'); h.run('chmod 000 source');
  assert.match(h.run('cat source').output, /Permission denied/);
  assert.equal(h.elevate('sudo cat source').output, 'shared data'); assert.match(h.run('cat source').output, /Permission denied/);
  assert.equal(h.run('sudo cp source /root-file').output, '');
  assert.equal(h.vfs.stat('/root-file').owner, 'root'); assert.equal(h.vfs.stat('/root-file').group, 'root');
  assert.throws(() => h.vfs.write('/root-file', 'denied'), /Permission denied/);
  assert.match(h.run('chmod 777 /root-file').output, /Operation not permitted/);
  assert.equal(h.run('sudo chmod 600 /root-file').output, '');
  assert.throws(() => h.vfs.read('/root-file'), /Permission denied/);
  let deniedInsideCallback = false, notifications = 0;
  const cancel = h.vfs.subscribe(() => { notifications++; assert.throws(() => h.vfs.read('/root-file'), /Permission denied/); deniedInsideCallback = true; });
  const revision = h.vfs.getRevision(); assert.equal(h.run('sudo touch /root-other').output, '');
  assert.ok(deniedInsideCallback); assert.equal(notifications, 1); assert.ok(h.vfs.getRevision() > revision); cancel();
  h.run('sudo chmod 666 /root-file'); h.vfs.write('/root-file', 'edited from File Manager');
  assert.equal(h.run('sudo cat /root-file').output, 'edited from File Manager');
  assert.equal(h.run('whoami').output, 'kali');
});

test('sudo redirection vẫn theo user thường; lỗi không giữ root, quota và root bảo vệ vẫn giữ', () => {
  const h = fixture(); h.elevate('sudo touch /root-file'); h.run('sudo chmod 600 /root-file');
  assert.match(h.run('sudo echo bad > /root-file').output, /Permission denied/);
  assert.match(h.run('sudo echo bad >> /root-file').output, /Permission denied/);
  assert.equal(h.run('sudo echo good > local-file').output, ''); assert.equal(h.vfs.stat('local-file').owner, 'kali');
  assert.equal(h.run('sudo cat /root-file').output, ''); assert.equal(h.run('whoami').output, 'kali');
  assert.match(h.run('sudo rm -r /').output, /hệ thống/);
  assert.match(h.run('sudo cat /missing/file').output, /Không tìm thấy/); assert.equal(h.run('whoami').output, 'kali');
  while (h.memory.directories.size + h.memory.filesystem.size < 256) h.vfs.write('quota-' + h.memory.filesystem.size, '');
  assert.match(h.run('sudo touch /over-quota').output, /256/); assert.throws(() => h.vfs.stat('/over-quota'), /Không tìm thấy/);
});

test('apt chỉ hướng dẫn, cần sudo cho thao tác quản trị, không cài/chạy gói hay mạng', () => {
  const h = fixture();
  assert.match(h.run('apt help').output, /không có repository/); assert.match(h.run('apt list --installed').output, /Không có package/);
  assert.match(h.run('apt search nano').output, /Chưa có catalog/);
  for (const op of ['update', 'install nano', 'remove nano', 'upgrade']) {
    assert.match(h.run('apt ' + op).output, /Permission denied/);
    assert.match(h.elevate('sudo apt ' + op).output, /Không có package nào được cài/);
  }
  assert.equal(h.memory.filesystem.size, 0); assert.equal(h.memory.directories.size, 5);
  assert.match(h.run('sudo apt install https://example.invalid/tool').output, /không nhận URL/);
  assert.match(h.run('nano').output, /chưa được hỗ trợ/);
  assert.match(h.run('sudo curl example.invalid').output, /command not found/);
});

test('sudo không mở su/shell/executable, không cho option lấy mật khẩu qua command/stdin', () => {
  const h = fixture();
  for (const command of ['sudo -i', 'sudo -s', 'sudo -u root whoami', 'sudo -S whoami']) assert.match(h.run(command).output, /Không hỗ trợ/);
  for (const command of ['sudo bash', 'sudo sh -c whoami', 'sudo su', 'sudo ./script', 'sudo cd /', 'sudo history']) assert.match(h.run(command).output, /command not found/);
  assert.equal(h.shell.isAwaitingPassword(), false); assert.equal(h.run('whoami').output, 'kali');
});

test('sudo cache/pending tách account/session; Stop xóa RAM và vô hiệu handle root cũ', () => {
  const a = fixture(); a.elevate('sudo whoami');
  const b = fixture({ owner: 'account-b', session: 'session-b' }); b.memory.temporary.set('simulator-sudo-auth', a.memory.temporary.get('simulator-sudo-auth'));
  assert.ok(b.run('sudo whoami').passwordPrompt);
  const fresh = fixture({ session: 'session-new' }); fresh.memory.temporary.set('simulator-sudo-auth', a.memory.temporary.get('simulator-sudo-auth'));
  assert.ok(fresh.run('sudo whoami').passwordPrompt);
  const sameSessionShell = shellModule.createSimulatorShell(a.memory, a.vfs, { now: () => 1000 });
  assert.equal(sameSessionShell.execute('sudo whoami').output, 'root');
  const root = a.vfs.asUser('root'); a.run('sudo -k'); a.run('sudo touch /pending'); a.stop();
  assert.match(a.shell.submitPassword('kali-sim').output, /đã kết thúc/);
  assert.throws(() => root.write('/stale', 'no'), /đã kết thúc/); assert.equal(a.memory.temporary.size, 0);
  assert.ok(fixture().run('sudo whoami').passwordPrompt);
});

function terminalHarness(h) {
  const output = [], element = { clientWidth: 640, clientHeight: 350, replaceChildren() {} };
  let effect, input, refs = 0;
  class Terminal {
    constructor(options) { this.options = options; this.textarea = { setAttribute() {} }; }
    loadAddon() {} open() {} attachCustomKeyEventHandler() {} dispose() {} focus() {} clear() {}
    write(value) { output.push(value); } onData(fn) { input = fn; }
  }
  class Observer { observe() {} disconnect() {} }
  const component = load('src/components/cyber-lab/SimulatorTerminal.tsx', {
    react: { useRef(value) { return { current: refs++ === 0 ? element : value }; }, useState(value) { return [value, () => {}]; }, useEffect(fn) { effect = fn; } },
    '@xterm/xterm': { Terminal }, '@xterm/addon-fit': { FitAddon: class { fit() {} } },
    '@/lib/simulator-shell': shellModule, '@xterm/xterm/css/xterm.css': {}, './KaliDesktop.module.css': {},
  }, { getComputedStyle: () => ({ fontFamily: 'monospace', getPropertyValue: () => '#ffffff' }), document: { documentElement: {}, fonts: { ready: Promise.resolve() } }, ResizeObserver: Observer, MutationObserver: Observer, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  component.SimulatorTerminal({ memory: h.memory, fs: h.vfs, onExit() {} }); const cleanup = effect();
  return { output, send: value => input(value), cleanup };
}

test('xterm nhập ẩn: không echo/history/transcript password; paste sau password không thành lệnh', async () => {
  const h = fixture(), terminal = terminalHarness(h); await new Promise(resolve => setImmediate(resolve));
  terminal.send('sudo whoami\r'); terminal.output.splice(0);
  terminal.send('private-input-marker'); terminal.send('\x1b[A'); terminal.send('\x7f');
  assert.equal(terminal.output.length, 0); terminal.send('\r');
  assert.match(terminal.output.join(''), /Sorry, try again/); assert.doesNotMatch(terminal.output.join(''), /private-input/);
  assert.equal(h.memory.history.length, 1); assert.doesNotMatch(JSON.stringify([...h.memory.temporary]), /private-input/);
  terminal.output.splice(0); terminal.send('kali-sim\rtouch leaked\r');
  assert.match(terminal.output.join(''), /root\n/); assert.throws(() => h.vfs.stat('leaked'), /Không tìm thấy/);
  assert.equal(h.memory.history.length, 1);
  terminal.send('whoami\r'); assert.match(terminal.output.join(''), /kali\n/);
  terminal.cleanup();
});

test('xterm Ctrl+C hủy pending, đóng Terminal không tự thực thi hoặc khôi phục mật khẩu', async () => {
  const h = fixture(), terminal = terminalHarness(h); await new Promise(resolve => setImmediate(resolve));
  terminal.send('sudo touch /cancelled\r'); terminal.send('private-input-marker'); terminal.send('\x03');
  terminal.output.splice(0); terminal.send('whoami\r'); assert.match(terminal.output.join(''), /kali\n/);
  assert.throws(() => h.vfs.stat('/cancelled'), /Không tìm thấy/);
  terminal.send('sudo touch /closed\r'); terminal.cleanup(); terminal.output.splice(0); terminal.send('kali-sim\r');
  assert.equal(terminal.output.length, 0); assert.throws(() => h.vfs.stat('/closed'), /Không tìm thấy/);
  assert.doesNotMatch(JSON.stringify(h.memory.history), /private-input/); assert.doesNotMatch(JSON.stringify([...h.memory.temporary]), /private-input/);
  assert.ok(h.run('sudo whoami').passwordPrompt);
});

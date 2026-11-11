// Desktop và lệnh mô phỏng chạy hoàn toàn trong bộ nhớ; không env, MySQL hoặc shell thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks = {}, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Error, Map, Set, Date, setTimeout, clearTimeout, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), ...extra });
  return exports;
}
const fileModule = load('src/lib/simulator-filesystem.ts');
const matchModule = load('src/lib/simulator-match.ts');
const sudoModule = load('src/lib/simulator-sudo.ts');
const shellModule = load('src/lib/simulator-shell.ts', { './simulator-filesystem': fileModule, './simulator-match': matchModule, './simulator-sudo': sudoModule });
const windowModule = load('src/lib/simulator-windows.ts');
function fixture(owner = 'owner-a') {
  let active = true;
  const memory = { ownerId: owner, sessionId: 'session-'+owner, virtualIp: '10.10.1.10', filesystem: new Map(), directories: new Set(['/', '/home', '/home/kali', '/home/kali/Desktop', '/home/kali/Documents']), history: [], temporary: new Map() };
  const vfs = fileModule.createVirtualFileSystem(memory, () => active);
  return { memory, vfs, shell: shellModule.createSimulatorShell(memory, vfs), stop() { active = false; memory.filesystem.clear(); memory.directories.clear(); memory.history.splice(0); memory.temporary.clear(); } };
}

test('Terminal và File Manager cùng RAM: tạo, đọc, sửa, copy, đổi tên, xóa thư mục', () => {
  const h = fixture(); let changes = 0; const unsubscribe = h.vfs.subscribe(() => changes++);
  assert.equal(h.shell.execute('mkdir lab').output, '');
  h.shell.execute('cd lab'); h.shell.execute('echo "hello world" > notes.txt');
  assert.equal(h.vfs.read('/home/kali/lab/notes.txt'), 'hello world\n');
  h.vfs.write('/home/kali/lab/notes.txt', 'Sửa từ File Manager');
  assert.equal(h.shell.execute('cat notes.txt').output, 'Sửa từ File Manager');
  h.shell.execute('echo " + terminal" >> notes.txt');
  assert.match(h.vfs.read('/home/kali/lab/notes.txt'), /terminal/);
  h.shell.execute('cp notes.txt copy.txt'); h.shell.execute('mv copy.txt renamed.txt');
  assert.equal(h.vfs.list('/home/kali/lab').length, 2);
  assert.throws(() => h.vfs.remove('/home/kali/lab'), /thư mục/);
  h.shell.execute('cd ..'); h.shell.execute('rm -r lab');
  assert.throws(() => h.vfs.stat('lab'), /Không tìm thấy/);
  assert.ok(changes >= 6); unsubscribe();
});

test('filesystem chỉ là virtual root, có quota và bảo vệ dữ liệu khi thao tác lỗi', () => {
  const h = fixture();
  assert.equal(fileModule.resolveVirtualPath('../../../../'), '/');
  assert.throws(() => h.vfs.read('/etc/passwd'), /Không tìm thấy/);
  assert.throws(() => h.vfs.remove('/', true), /hệ thống/);
  h.vfs.write('safe.txt', 'giữ nguyên');
  assert.throws(() => h.vfs.write('safe.txt', 'x'.repeat(32769)), /giới hạn RAM/);
  assert.equal(h.vfs.read('safe.txt'), 'giữ nguyên');
  assert.throws(() => h.vfs.write('bad\x1bname', 'x'), /không hợp lệ/);
  h.vfs.mkdir('one'); h.vfs.write('one/file', 'retained');
  assert.throws(() => h.vfs.move('one', 'one/nested'), /không hợp lệ/);
  assert.equal(h.vfs.read('one/file'), 'retained');
  while (h.memory.directories.size + h.memory.filesystem.size < 256) h.vfs.write('file-' + h.memory.filesystem.size, '');
  assert.throws(() => h.vfs.mkdir('overflow'), /256/);
  h.vfs.move('safe.txt', 'renamed-safe.txt');
  assert.equal(h.vfs.read('renamed-safe.txt'), 'giữ nguyên');
});

test('lệnh là whitelist, không thực thi JS/mạng; history và escape output được giới hạn', () => {
  const h = fixture();
  assert.match(h.shell.execute('curl https://example.invalid').output, /chưa được hỗ trợ/);
  assert.match(h.shell.execute('echo $(fetch())').output, /command substitution/);
  assert.match(h.shell.execute('pwd; rm -r /').output, /script/);
  assert.match(h.shell.execute('echo "missing').output, /Thiếu dấu/);
  h.shell.execute('echo "<script>alert(1)</script>" > text.txt');
  assert.equal(h.vfs.read('text.txt'), '<script>alert(1)</script>\n');
  for (let i=0;i<120;i++) h.shell.execute('pwd');
  assert.equal(h.memory.history.length, 100);
  assert.match(h.shell.execute('ip').output, /10\.10\.1\.10/);
  assert.match(h.shell.execute('uname').output, /không có kernel Linux/);
  const safe = shellModule.terminalText('\x1b]52;c;clipboard\x07\ntext');
  assert.doesNotMatch(safe, /[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
});

test('Stop vô hiệu handle cũ; filesystem/terminal/transcript không lộ qua tài khoản khác', () => {
  const a = fixture('a'), b = fixture('b');
  a.shell.execute('echo secret > private.txt');
  a.memory.temporary.set('terminal-transcript', 'private history');
  assert.throws(() => b.vfs.read('private.txt'), /Không tìm thấy/);
  a.stop();
  assert.throws(() => a.vfs.write('resurrect.txt', 'bad'), /đã kết thúc/);
  assert.match(a.shell.execute('touch stale.txt').output, /đã kết thúc/);
  a.shell.getCwd();
  assert.equal(a.memory.filesystem.size, 0); assert.equal(a.memory.history.length, 0); assert.equal(a.memory.temporary.size, 0);
  assert.throws(() => fixture('a').vfs.read('private.txt'), /Không tìm thấy/);
});

test('window manager giữ một instance/app, restore minimize và chặn kéo ra ngoài desktop', () => {
  let windows = windowModule.openDesktopWindow([], 'terminal');
  windows[0].minimized = true;
  windows = windowModule.openDesktopWindow(windows, 'terminal');
  assert.equal(windows.length, 1); assert.equal(windows[0].minimized, false);
  windows = windowModule.openDesktopWindow(windows, 'files');
  assert.equal(windows.length, 2); assert.ok(windows[1].z > windows[0].z);
  const point = windowModule.clampWindow(999,-50,1000,600,640,410);
  assert.equal(point.x,360); assert.equal(point.y,0);
  assert.equal(windowModule.clampWindow(10,10,300,300,640,410).x,0);
});

test('Desktop gate chỉ Running + đúng owner/session; không gọi cấp IP hoặc render terminal khi bị khóa', () => {
  const h = fixture();
  const snapshot = { ownerId:'owner-a',status:'Stopped',sessionId:h.memory.sessionId };
  let loadIdentity;
  const desktop = load('src/components/cyber-lab/KaliDesktop.tsx', {
    './PracticeSessionProvider': { usePracticeSession: (owner, load) => { loadIdentity=load; return { matchesOwner:owner===snapshot.ownerId,snapshot,store:{getSnapshot:()=>snapshot,getMemory:owner=>owner==='owner-a'?h.memory:null,stop(){}} }; } },
    './PracticeWorkspace': { DesktopUnavailable:()=>React.createElement('p',null,'LOCKED') },
    '@/lib/simulator-filesystem':fileModule,'@/lib/simulator-windows':windowModule,
    './SimulatorTerminal':{SimulatorTerminal:()=>React.createElement('p',null,'XTERM')},
    './SimulatorFileManager':{SimulatorFileManager:()=>null},'./KaliDesktop.module.css':{},
  });
  for (const status of ['Stopped','Starting']) {
    snapshot.status=status;
    assert.equal(renderToStaticMarkup(React.createElement(desktop.KaliDesktop,{ownerId:'owner-a'})),'<p>LOCKED</p>');
    assert.equal(loadIdentity,false);
  }
  snapshot.status='Running';
  const html=renderToStaticMarkup(React.createElement(desktop.KaliDesktop,{ownerId:'owner-a'}));
  assert.match(html,/Kali Linux Desktop Simulator/); assert.match(html,/10\.10\.1\.10/);
  assert.equal(renderToStaticMarkup(React.createElement(desktop.KaliDesktop,{ownerId:'owner-b'})),'<p>LOCKED</p>');
  snapshot.sessionId='other-session';
  assert.equal(renderToStaticMarkup(React.createElement(desktop.KaliDesktop,{ownerId:'owner-a'})),'<p>LOCKED</p>');
});

test('focus/desktop xác minh owner không gọi allocator IP', async () => {
  let allocations=0;
  const actions=load('src/app/(dark)/cyber-lab/practice/actions.ts',{
    '@/lib/auth':{getCurrentUser:async()=>({id:'owner-a'})},
    '@/lib/cyber-ip':{ensureVirtualIp:async()=>{allocations++;return'10.10.1.10';}},
  });
  assert.equal(await actions.verifyPracticeOwnerAction(),'owner-a'); assert.equal(allocations,0);
});

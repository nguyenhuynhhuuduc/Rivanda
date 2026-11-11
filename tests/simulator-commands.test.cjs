// Chỉ dữ liệu tổng hợp trong RAM; không đọc env/DB, không tạo Linux process.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Error, Map, Set, Date, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), ...globals });
  return exports;
}
const files = load('src/lib/simulator-filesystem.ts');
const match = load('src/lib/simulator-match.ts');
const sudo = load('src/lib/simulator-sudo.ts');
const shell = load('src/lib/simulator-shell.ts', { './simulator-filesystem': files, './simulator-match': match, './simulator-sudo': sudo });
function fixture() {
  let active = true;
  const memory = { ownerId: 'fixture', sessionId: 'fixture-session', virtualIp: '10.10.1.10', filesystem: new Map(), directories: new Set(['/', '/home', '/home/kali', '/home/kali/Desktop', '/home/kali/Documents']), temporary: new Map(), history: [] };
  const vfs = files.createVirtualFileSystem(memory, () => active), terminal = shell.createSimulatorShell(memory, vfs);
  return { memory, vfs, terminal, run: line => terminal.execute(line).output, stop() { active = false; memory.filesystem.clear(); memory.directories.clear(); memory.temporary.clear(); memory.history.splice(0); } };
}

test('pwd/cd/mkdir -p: tuyệt đối, tương đối, . .. ~; không rút gọn thành phần lỗi', () => {
  const h = fixture();
  assert.equal(h.run('pwd'), '/home/kali');
  assert.equal(h.run('mkdir -p lab/a/b'), '');
  assert.equal(h.run('mkdir -p lab/a/b'), '');
  assert.equal(h.run('cd ./lab/a/b/..'), ''); assert.equal(h.run('pwd'), '/home/kali/lab/a');
  assert.equal(h.run('touch ../../data.txt'), ''); assert.equal(h.vfs.read('/home/kali/data.txt'), '');
  assert.equal(h.run('cd /home/kali/lab/a/.'), '');
  assert.equal(h.run('cd ~'), '');
  assert.match(h.run('cd data.txt'), /Không phải thư mục/);
  assert.match(h.run('cat data.txt/../data.txt'), /Not a directory/);
  assert.match(h.run('touch missing/../bad'), /Không tìm thấy/);
  assert.match(h.run('cat data.txt/'), /Not a directory/);
  assert.match(h.run('cd ""'), /không hợp lệ/);
  assert.match(h.run('cd lab extra'), /quá nhiều/);
  assert.match(h.run('ls -z'), /chưa hỗ trợ/);
  h.run('cd lab/a'); assert.equal(h.run('mv /home/kali/lab /home/kali/renamed'), '');
  assert.equal(h.run('pwd'), '/home/kali/renamed/a');
  h.vfs.move('/home/kali/renamed', '/home/kali/moved');
  assert.equal(h.terminal.getCwd(), '/home/kali/moved/a');
});

test('ls -la: ẩn dotfile mặc định, . .., quyền/owner/size và nhiều đường dẫn', () => {
  const h = fixture(); h.vfs.write('.hidden', 'é🙂'); h.vfs.write('visible', 'abc');
  assert.doesNotMatch(h.run('ls'), /hidden/);
  const listing = h.run('ls -la');
  assert.match(listing, /drwxr-xr-x 1 kali kali 0 .* \./);
  assert.match(listing, /drwxr-xr-x 1 root root 0 .* \.\./);
  assert.match(listing, /-rw-r--r-- 1 kali kali 6 .* \.hidden/);
  assert.match(h.run('ls -l visible'), /-rw-r--r--.*3 .* visible/);
  assert.match(h.run('ls Desktop Documents'), /Desktop:\n\n\nDocuments:/);
});

test('echo/cat/touch: quoting, escape, > literal, append, newline và không truncate khi touch', () => {
  const h = fixture();
  assert.equal(h.run('echo ">"'), '>\n');
  assert.equal(h.run('echo ">>" > "file name"'), '');
  assert.equal(h.vfs.read('file name'), '>>\n');
  assert.equal(h.run('echo -n "hello  " > first'), '');
  assert.equal(h.run('echo world >> first'), '');
  assert.equal(h.run('cat first'), 'hello  world\n');
  assert.equal(h.run('echo -n end > second'), '');
  assert.equal(h.run('cat first second'), 'hello  world\nend');
  const before = h.vfs.stat('first'); h.run('touch first');
  assert.equal(h.vfs.read('first'), 'hello  world\n'); assert.ok(h.vfs.stat('first').modifiedAt >= before.modifiedAt);
  h.run(String.raw`touch escaped\ name`); assert.equal(h.vfs.read('escaped name'), '');
  assert.match(h.run('echo bad > first > second'), /Chỉ hỗ trợ/); assert.equal(h.vfs.read('second'), 'end');
  assert.equal(h.terminal.execute('echo -n x').rawOutput, true);
  assert.equal(h.run("echo '$(fetch()) ; | `literal`'"), '$(fetch()) ; | `literal`\n');
  assert.match(h.run('echo $(fetch())'), /command substitution/);
  assert.match(h.run('cat Desktop'), /Is a directory/);
});

test('cp/mv: đích thư mục, ghi đè file, cây đệ quy, giữ mode và bảo vệ nguồn/đích', () => {
  const h = fixture(); h.run('mkdir -p a/sub dest'); h.run('echo value > a/sub/file');
  h.run('chmod 640 a/sub/file');
  assert.equal(h.run('cp a/sub/file dest'), ''); assert.equal(h.vfs.read('dest/file'), 'value\n');
  assert.equal(h.vfs.stat('dest/file').mode, 0o640);
  h.vfs.write('dest/file', 'old'); h.run('cp a/sub/file dest/file'); assert.equal(h.vfs.read('dest/file'), 'value\n');
  assert.match(h.run('cp a copy'), /cp -r/);
  assert.equal(h.run('cp -r a copy'), ''); assert.equal(h.vfs.read('copy/sub/file'), 'value\n');
  assert.equal(h.run('mv copy dest'), ''); assert.equal(h.vfs.stat('dest/copy/sub/file').mode, 0o640);
  assert.match(h.run('mv a a/sub/nest'), /không hợp lệ/);
  assert.match(h.run('cp -r a a/sub/nest'), /không hợp lệ/);
  assert.match(h.run('cp dest/file dest/file'), /trùng nhau/);
  h.run('echo replace > replacement'); h.run('chmod 000 replacement');
  assert.equal(h.run('mv replacement dest/file'), ''); assert.equal(h.vfs.stat('dest/file').mode, 0);
  h.run('chmod 600 dest/file'); assert.equal(h.vfs.read('dest/file'), 'replace\n');
  assert.equal(h.run('cp a/sub/file dest/copy/sub/file dest'), '');
});

test('quyền file/thư mục: chmod octal/symbolic, đọc/ghi/search, append chỉ ghi, touch owner', () => {
  const h = fixture(); h.run('echo original > note');
  assert.equal(h.run('chmod 444 note'), '');
  assert.match(h.run('echo bad > note'), /Permission denied/); assert.equal(h.vfs.read('note'), 'original\n');
  assert.throws(() => h.vfs.write('note', 'File Manager overwrite'), /Permission denied/);
  h.run('chmod 200 note'); assert.equal(h.run('echo appended >> note'), '');
  assert.match(h.run('cat note'), /Permission denied/); assert.throws(() => h.vfs.read('note'), /Permission denied/);
  assert.equal(h.run('touch note'), ''); h.run('chmod 600 note'); assert.equal(h.vfs.read('note'), 'original\nappended\n');
  h.run('chmod u-w,g=rx,o= note'); assert.equal(h.vfs.stat('note').mode, 0o450);
  h.run('chmod a-rwx,u=rw note'); assert.equal(h.vfs.stat('note').mode, 0o600);
  h.run('chmod +x note'); assert.equal(h.vfs.stat('note').mode, 0o711);
  const mode = h.vfs.stat('note').mode;
  assert.match(h.run('chmod 4755 note'), /Mode không hợp lệ/); assert.equal(h.vfs.stat('note').mode, mode);
  assert.match(h.run('chmod 777 /home'), /Operation not permitted/);
  assert.match(h.run('touch /outside'), /Permission denied/);
  h.run('mkdir locked'); h.run('touch locked/existing'); h.run('chmod 500 locked');
  assert.equal(h.run('echo ok > locked/existing'), '');
  assert.match(h.run('touch locked/new'), /Permission denied/);
  assert.match(h.run('rm locked/existing'), /Permission denied/);
  h.run('chmod 100 locked'); assert.equal(h.run('cd locked'), ''); assert.equal(h.run('pwd'), '/home/kali/locked');
  assert.match(h.run('ls'), /Permission denied/); assert.equal(h.run('cat existing'), 'ok\n'); h.run('cd ..');
  h.run('chmod 000 locked'); assert.match(h.run('cd locked'), /Permission denied/);
  assert.match(h.run('cat locked/../note'), /Permission denied/);
  assert.equal(h.run('chmod 700 locked'), '');
});

test('rm -r: thư mục cần -r, file chỉ đọc vẫn xóa theo quyền cha; lỗi không xóa nửa cây', () => {
  const h = fixture(); h.run('mkdir empty');
  assert.match(h.run('rm empty'), /thư mục/); assert.equal(h.run('rm -r empty'), '');
  h.run('echo keep > readonly'); h.run('chmod 000 readonly'); assert.equal(h.run('rm readonly'), '');
  h.run('mkdir -p tree/a tree/b'); h.run('touch tree/a/one tree/b/two'); h.run('chmod 500 tree/b');
  assert.match(h.run('rm -r tree'), /Permission denied/);
  assert.equal(h.vfs.read('tree/a/one'), ''); assert.equal(h.vfs.read('tree/b/two'), '');
  h.run('chmod 700 tree/b'); assert.equal(h.run('rm -r tree'), '');
  assert.match(h.run('rm -r /'), /hệ thống/);
  h.run('mkdir safe'); h.run('cd safe'); assert.match(h.run('rm -r .'), /trực tiếp/);
  assert.match(h.run('rm -r ..'), /hệ thống|trực tiếp/);
  assert.equal(h.run('rm -f missing'), ''); assert.match(h.run('rm missing'), /Không tìm thấy/);
});

test('mkdir -p/cp -r rollback khi quota/quyền lỗi; không thông báo thay đổi hoặc hỏng tệp', () => {
  const h = fixture();
  while (h.memory.directories.size + h.memory.filesystem.size < 254) h.vfs.write('f' + h.memory.filesystem.size, '');
  const revision = h.vfs.getRevision();
  assert.match(h.run('mkdir -p partial/a/b'), /256/);
  assert.throws(() => h.vfs.stat('partial'), /Không tìm thấy/); assert.equal(h.vfs.getRevision(), revision);
  const second = fixture(); second.run('mkdir src'); second.run('touch src/a src/b'); second.run('chmod 000 src/b');
  const before = second.vfs.getRevision(); assert.match(second.run('cp -r src output'), /Permission denied/);
  assert.throws(() => second.vfs.stat('output'), /Không tìm thấy/); assert.equal(second.vfs.getRevision(), before);
  assert.equal(second.vfs.read('src/a'), '');
});

test('grep: BRE giới hạn, fixed, case/line/invert/count, nhiều file, recursive và lỗi quyền', () => {
  const h = fixture(); h.vfs.mkdir('texts'); h.vfs.write('texts/a.txt', 'Alpha\nbeta\nA1\n\na.b\nlast'); h.vfs.write('texts/b.txt', 'beta\n');
  assert.equal(h.run("grep -in '^a.*' texts/a.txt"), '1:Alpha\n3:A1\n5:a.b\n');
  assert.equal(h.run("grep '^[A-Z][0-9]$' texts/a.txt"), 'A1\n');
  assert.equal(h.run("grep -F a.b texts/a.txt"), 'a.b\n');
  assert.equal(h.run("grep '^$' texts/a.txt"), '\n');
  assert.equal(h.run('grep -c beta texts/a.txt texts/b.txt'), 'texts/a.txt:1\ntexts/b.txt:1\n');
  assert.equal(h.run('grep -rl beta texts'), 'texts/a.txt\ntexts/b.txt\n');
  assert.equal(h.run("grep -v '^[^b].*' texts/b.txt"), 'beta\n');
  assert.equal(h.run('grep missing texts/a.txt'), '');
  assert.match(h.run("grep '[' texts/a.txt"), /không hợp lệ/);
  assert.match(h.run("grep '\\(a\\)' texts/a.txt"), /chỉ hỗ trợ BRE/);
  h.run('chmod 000 texts/a.txt'); assert.match(h.run('grep Alpha texts/a.txt'), /Permission denied/);
  assert.match(h.run('grep beta texts'), /thư mục/);
});

test('find: path/type/name wildcard, dotfile, độ sâu và lỗi quyền; không thực thi biểu thức', () => {
  const h = fixture(); h.run('mkdir -p lab/sub'); h.run('touch lab/a.txt lab/.hidden lab/sub/b.txt lab/sub/c.log');
  assert.deepEqual(h.run("find lab -type f -name '*.txt'").split('\n').sort(), ['lab/a.txt', 'lab/sub/b.txt']);
  assert.equal(h.run('find lab -type d'), 'lab\nlab/sub');
  assert.equal(h.run('find lab -mindepth 1 -maxdepth 1'), 'lab/sub\nlab/.hidden\nlab/a.txt');
  assert.equal(h.run("find . -maxdepth 0 -name '.'"), '.');
  assert.equal(h.run("find /home/kali/lab -name '?.log'"), '/home/kali/lab/sub/c.log');
  assert.match(h.run('find lab -exec malicious'), /chưa hỗ trợ/);
  assert.match(h.run('find lab -maxdepth -1'), /số nguyên/);
  h.run('chmod 000 lab/sub'); assert.match(h.run('find lab'), /Permission denied/);
  assert.equal(h.run('find lab -maxdepth 0'), 'lab');
});

test('head/tail: đếm dòng, file rỗng/thiếu newline cuối, nhiều file và lỗi đầu vào', () => {
  const h = fixture(); h.vfs.write('lines', 'one\ntwo\nthree'); h.vfs.write('empty', '');
  assert.equal(h.run('head -n 2 lines'), 'one\ntwo\n');
  assert.equal(h.run('tail -n 2 lines'), 'two\nthree');
  assert.equal(h.run('head -n 0 lines'), ''); assert.equal(h.run('tail -n0 lines'), '');
  assert.equal(h.run('head lines'), 'one\ntwo\nthree'); assert.equal(h.run('tail empty'), '');
  assert.equal(h.run('tail -1 lines'), 'three');
  assert.equal(h.run('head -n 1 empty lines'), '==> empty <==\n\n==> lines <==\none\n');
  assert.match(h.run('head -n bad lines'), /số nguyên/); assert.match(h.run('tail -n'), /Thiếu số/);
  assert.match(h.run('head Desktop'), /Is a directory/);
});

test('history giữ thứ tự/số tăng qua giới hạn 100; whoami và lỗi không âm thầm bỏ đối số', () => {
  const h = fixture();
  assert.equal(h.run('whoami'), 'kali'); assert.match(h.run('whoami extra'), /Cách dùng/);
  for (let i = 0; i < 110; i++) h.run('pwd');
  assert.equal(h.memory.history.length, 100);
  assert.match(h.run('history 2'), /^112  pwd\n113  history 2$/);
  assert.equal(h.run('history 0'), ''); assert.match(h.run('history nope'), /số nguyên/);
  assert.equal(h.run('history -c'), ''); assert.equal(h.memory.history.length, 0);
  assert.equal(h.run('history'), '1  history');
});

test('metadata và thao tác Terminal ↔ File Manager cùng RAM; quyền bị từ chối có thông báo UI', () => {
  const h = fixture(); let changes = 0; h.vfs.subscribe(() => changes++);
  h.run('echo shared > note'); h.run('chmod 444 note');
  const remount = files.createVirtualFileSystem(h.memory, () => true);
  assert.equal(remount.stat('note').mode, 0o444);
  assert.throws(() => h.vfs.write('note', 'UI'), /Permission denied/);
  h.run('chmod 600 note'); h.vfs.write('note', 'File Manager'); assert.equal(h.run('cat note'), 'File Manager');
  h.run('mv note renamed'); assert.ok(h.vfs.list().some(item => item.name === 'renamed'));
  assert.ok(changes >= 5);
  const component = load('src/components/cyber-lab/SimulatorFileManager.tsx', { '@/lib/simulator-filesystem': files, './KaliDesktop.module.css': {} });
  h.run('chmod 000 /home/kali');
  const html = renderToStaticMarkup(React.createElement(component.SimulatorFileManager, { fs: h.vfs }));
  assert.match(html, /role="alert"/); assert.match(html, /Permission denied/); assert.doesNotMatch(html, /Thư mục trống/);
  h.stop(); assert.equal(h.memory.temporary.size, 0); assert.throws(() => h.vfs.chmod('renamed', '777'), /đã kết thúc/);
});

test('matcher giới hạn xử lý, không regex backtracking hoặc chạy shell/JS', () => {
  const h = fixture(); h.vfs.write('large1', 'b'.repeat(32768)); h.vfs.write('large2', 'b'.repeat(32768));
  assert.match(h.run(`grep '${'a*'.repeat(63)}$' large1 large2`), /giới hạn xử lý/);
  assert.match(h.run('curl https://example.invalid'), /chưa được hỗ trợ/);
  assert.match(h.run('cat large1 | grep b'), /pipe/);
  assert.match(h.run('sh -c whoami'), /chưa được hỗ trợ/);
  assert.match(h.run('./large1'), /chưa được hỗ trợ/);
  assert.equal(match.createTextMatcher('a+b')('a+b'), true);
  assert.equal(match.createTextMatcher('a*b')('aaab'), true);
  assert.equal(match.createTextMatcher('^a*b$')('xaaab'), false);
});

function descendants(element) {
  if (!element || typeof element !== 'object') return [];
  const children = React.Children.toArray(element.props?.children);
  return [element, ...children.flatMap(descendants)];
}
test('File Manager thật: chỉnh sửa, chmod từ Terminal khóa lưu/đọc, conflict và lỗi không ghi đè', () => {
  const h = fixture(); h.run('echo original > note');
  const states = []; let cursor = 0;
  const component = load('src/components/cyber-lab/SimulatorFileManager.tsx', {
    react: { ...React, useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; }, useSyncExternalStore(_subscribe, get) { return get(); } },
    '@/lib/simulator-filesystem': files, './KaliDesktop.module.css': {},
  });
  const render = () => { cursor = 0; return descendants(component.SimulatorFileManager({ fs: h.vfs })); };
  const button = (tree, label) => tree.find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label));
  let tree = render(); button(tree, 'Mở note').props.onClick(); tree = render();
  tree.find(node => node.type === 'textarea').props.onChange({ target: { value: 'edited from UI' } });
  h.run('chmod 444 note'); tree = render(); button(tree, 'Lưu tệp').props.onClick(); tree = render();
  assert.match(tree.find(node => node.props?.role === 'alert').props.children, /Permission denied/);
  assert.equal(h.vfs.read('note'), 'original\n');
  h.run('chmod 000 note'); tree = render();
  assert.equal(tree.some(node => node.type === 'textarea'), false);
  assert.match(tree.find(node => node.props?.role === 'alert').props.children, /Permission denied/);
  h.run('chmod 600 note'); tree = render(); button(tree, 'Lưu tệp').props.onClick();
  assert.equal(h.run('cat note'), 'edited from UI');
  h.run('echo external > note'); tree = render(); button(tree, 'Lưu tệp').props.onClick(); tree = render();
  assert.match(tree.find(node => node.props?.role === 'alert').props.children, /Tệp đã thay đổi/);
  assert.equal(h.vfs.read('note'), 'external\n');
  button(tree, 'Nạp lại tệp').props.onClick(); tree = render();
  assert.equal(tree.find(node => node.type === 'textarea').props.value, 'external\n');
  h.run('mkdir group'); h.run('mv note group/renamed'); tree = render();
  assert.equal(tree.find(node => node.type === 'label').props.children, '/home/kali/group/renamed');
  button(tree, 'Mở group').props.onClick(); h.run('mv group moved-group'); tree = render();
  assert.ok(tree.some(node => node.props?.title === '/home/kali/moved-group'));
  assert.ok(button(tree, 'Mở renamed'));
});

test('xterm adapter thật giữ đúng newline của echo -n/cat và transcript, không thêm dòng giả', async () => {
  const h = fixture(), output = [], element = { clientWidth: 640, clientHeight: 350, replaceChildren() {} };
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
    '@/lib/simulator-shell': shell, '@xterm/xterm/css/xterm.css': {}, './KaliDesktop.module.css': {},
  }, {
    getComputedStyle: () => ({ fontFamily: 'monospace', getPropertyValue: () => '#ffffff' }),
    document: { documentElement: {}, fonts: { ready: Promise.resolve() } },
    ResizeObserver: Observer, MutationObserver: Observer, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    fetch() { throw Error('No network'); }, WebSocket: class { constructor() { throw Error('No socket'); } },
  });
  component.SimulatorTerminal({ memory: h.memory, fs: h.vfs, onExit() {} }); const cleanup = effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof input, 'function');
  const submit = command => { input(command); output.splice(0); input('\r'); return output.join(''); };
  assert.equal(submit('echo -n text'), '\r\ntextkali@simulator:/home/kali$ ');
  assert.equal(submit('echo text'), '\r\ntext\nkali@simulator:/home/kali$ ');
  h.vfs.write('file', 'no newline');
  assert.equal(submit('cat file'), '\r\nno newlinekali@simulator:/home/kali$ ');
  assert.match(h.memory.temporary.get('terminal-transcript'), /cat file\nno newline$/);
  cleanup();
});

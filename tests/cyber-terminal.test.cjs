// xterm lifecycle bằng mock, không mở socket, shell, database hay tài khoản thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = fs.readFileSync(path.join(__dirname, '../src/components/cyber-lab/CyberTerminal.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;

function harness({ ssr = false, fail = false } = {}) {
  const exports = {}, states = [], imports = [], instances = [], observers = [], frames = new Map();
  let effect, nextFrame = 0, fits = 0, clears = 0, background = '#ffffff';
  const element = { clientWidth: 320, clientHeight: 280, replaceChildren() { clears++; } };
  class Terminal {
    constructor(options) {
      if (fail) throw Error('fixture import/init failure');
      this.options = options;
      this.lines = [];
      this.attrs = {};
      this.textarea = { setAttribute: (key, value) => { this.attrs[key] = value; } };
      instances.push(this);
    }
    loadAddon(addon) { this.addon = addon; }
    open(target) { assert.equal(target, element); this.opened = true; }
    attachCustomKeyEventHandler(handler) { this.keyHandler = handler; }
    writeln(line) { this.lines.push(line); }
    dispose() { this.disposed = true; }
    onData() { throw Error('Must not accept or echo shell input without backend'); }
  }
  class FitAddon { fit() { fits++; } }
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  vm.runInNewContext(code, {
    exports,
    require(id) {
      if (id.endsWith('.css')) return {};
      if (id === 'react' && !ssr) return {
        useRef: () => ({ current: element }), useId: () => 'fixture-terminal',
        useState: value => [value, next => states.push(next)],
        useEffect: callback => { effect = callback; },
      };
      if (id.startsWith('@xterm/')) {
        imports.push(id);
        return id === '@xterm/xterm' ? { Terminal } : { FitAddon };
      }
      return require(id);
    },
    document: { documentElement: {}, fonts: { ready: Promise.resolve() } },
    getComputedStyle: () => ({ fontFamily: 'monospace', getPropertyValue: name => name === '--surface' ? background : '#172d46' }),
    ResizeObserver: Observer, MutationObserver: Observer,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(frame) { frames.delete(frame); },
    fetch() { throw Error('No backend requests in UI phase'); },
    WebSocket: class { constructor() { throw Error('No socket in UI phase'); } },
  });
  return {
    Component: exports.CyberTerminal, states, imports, instances, observers, frames,
    start() { exports.CyberTerminal(); return effect(); },
    flushFrames() { for (const [key, callback] of frames) { frames.delete(key); callback(); } },
    setBackground(value) { background = value; },
    get fits() { return fits; }, get clears() { return clears; },
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('SSR không nạp runtime xterm; thông báo rõ backend chưa sẵn sàng', () => {
  const h = harness({ ssr: true });
  const html = renderToStaticMarkup(React.createElement(h.Component));
  assert.equal(h.imports.length, 0);
  assert.match(html, /Backend chưa sẵn sàng/);
  assert.match(html, /chưa thực thi lệnh/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
});

test('terminal chỉ đọc, tự fit, đổi theme trực tiếp và giải phóng khi unmount', async () => {
  const h = harness();
  const stop = h.start();
  await settle();
  assert.deepEqual(h.states, ['loading', 'unavailable']);
  const terminal = h.instances[0];
  assert.equal(terminal.opened, true);
  assert.equal(terminal.options.disableStdin, true);
  assert.equal(terminal.options.cursorBlink, false);
  assert.equal(terminal.textarea.readOnly, true);
  assert.equal(terminal.keyHandler({ key: 'Tab' }), false);
  assert.equal(terminal.keyHandler({ key: 'p' }), false);
  assert.equal(terminal.options.screenReaderMode, true);
  assert.match(terminal.attrs['aria-describedby'], /-notice$/);
  assert.match(terminal.lines.join('\n'), /Chưa kết nối tới Linux sandbox/);
  h.flushFrames();
  assert.equal(h.fits, 1);
  h.observers[0].callback(); // resize container
  h.flushFrames();
  assert.equal(h.fits, 2);
  h.setBackground('#111f32');
  h.observers[1].callback(); // đổi data-theme
  assert.equal(terminal.options.theme.background, '#111f32');
  stop();
  assert.equal(terminal.disposed, true);
  assert.equal(h.frames.size, 0);
  assert.ok(h.observers.every(observer => observer.disconnected));
  assert.equal(h.clears, 1);
});

test('unmount trước khi import xong không tạo terminal hoặc cập nhật state muộn', async () => {
  const h = harness();
  h.start()();
  await settle();
  assert.equal(h.instances.length, 0);
  assert.deepEqual(h.states, ['loading']);
  assert.equal(h.observers.length, 0);
});

test('khởi tạo lỗi hiện error và dọn khung, không giả vờ đang kết nối backend', async () => {
  const h = harness({ fail: true });
  const stop = h.start();
  await settle();
  assert.deepEqual(h.states, ['loading', 'error']);
  assert.equal(h.instances.length, 0);
  assert.equal(h.observers.length, 0);
  assert.equal(h.clears, 1);
  stop();
});

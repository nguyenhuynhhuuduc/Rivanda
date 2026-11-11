const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const exportsForLoader = {};
const source = fs.readFileSync(path.join(root, 'src/components/CloudLoader.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
vm.runInNewContext(compiled, { exports: exportsForLoader, require: id => id.endsWith('.css') ? new Proxy({}, { get: (_, key) => String(key) }) : require(id) });
const { CloudLoader } = exportsForLoader;

test('cloud loader giữ nguyên các path SVG, lớp mask và 21 đường chuyển động của mẫu', () => {
  const original = fs.readFileSync(path.join(root, 'design-references/cloud-loader.html'), 'utf8');
  const rendered = renderToStaticMarkup(React.createElement(CloudLoader));
  const paths = text => [...text.matchAll(/<path\s+d="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(paths(rendered), paths(original));
  assert.equal((rendered.match(/<circle /g) || []).length, 5);
  assert.equal((rendered.match(/<mask /g) || []).length, 2);
  assert.equal((rendered.match(/<filter /g) || []).length, 1);
  assert.deepEqual([...rendered.matchAll(/<line[^>]* y1="([^"]+)"/g)].map(m => Number(m[1])), Array.from({ length: 21 }, (_, i) => -40 + i * 9));
  assert.match(rendered, /role="status"/);
  assert.match(rendered, /aria-hidden="true"/);
});

test('hai cloud loader không trùng SVG id và mọi url mask/filter trỏ đúng phần tử', () => {
  const rendered = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(CloudLoader), React.createElement(CloudLoader)));
  const ids = [...rendered.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of rendered.matchAll(/url\(#([^\)]+)\)/g)) assert.ok(ids.includes(id));
});

test('cloud loader giữ keyframes và nhịp chuyển động theo CSS tham chiếu', () => {
  const original = fs.readFileSync(path.join(root, 'design-references/cloud-loader.css'), 'utf8');
  const current = fs.readFileSync(path.join(root, 'src/components/CloudLoader.module.css'), 'utf8');
  function keyframe(css, name) {
    const start = css.indexOf(`@keyframes ${name}`);
    assert.notEqual(start, -1);
    let depth = 0, opened = false;
    for (let i = start; i < css.length; i++) {
      if (css[i] === '{') { depth++; opened = true; }
      if (css[i] === '}' && --depth === 0 && opened) return css.slice(start, i + 1).replace(/\s+/g, '');
    }
    assert.fail('Unclosed keyframes');
  }
  for (const name of ['rotation', 'lines', 'cloud']) assert.equal(keyframe(current, name), keyframe(original, name));
  const rhythms = css => [...css.matchAll(/animation(?:-delay)?:\s*([^;]+);/g)].map(m => m[1].replace(/\s+/g, ''));
  assert.deepEqual(rhythms(current).filter(value => value !== 'none'), rhythms(original));
});

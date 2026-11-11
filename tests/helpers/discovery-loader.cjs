const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function discoveryLoader(db, mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {}; cache.set(absolute, exports);
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    function localRequire(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.endsWith('.module.css')) return { __esModule:true, default: new Proxy({}, {get:(_,key)=>String(key)}) };
      if (id === 'react') return { ...require('react'), cache: fn => fn };
      if (id.startsWith('@/') || id.startsWith('.')) {
        let resolved = id.startsWith('@/') ? path.resolve(root, 'src', id.slice(2)) : path.resolve(path.dirname(absolute), id);
        if (resolved === path.join(root, 'src/lib/db')) return { pool: db };
        if (/\.(json|cjs)$/.test(resolved) && fs.existsSync(resolved)) return require(resolved);
        if (!resolved.startsWith(path.join(root, 'src') + path.sep)) throw Error('TEST_IMPORT_OUTSIDE_SOURCE');
        resolved += fs.existsSync(resolved + '.ts') ? '.ts' : '.tsx';
        return load(resolved);
      }
      return require(id);
    }
    vm.runInNewContext(code, { exports, require: localRequire, Buffer, File, FormData, Uint8Array, URL, URLSearchParams, Response, Request,
      process: { cwd: () => root, env: { UPLOAD_DIR: process.env.DISCOVERY_QA_UPLOAD_DIR || path.join(process.env.DISCOVERY_QA_ROOT || require('node:os').tmpdir(), 'discovery-test-uploads'), SESSION_SECRET: 'synthetic-discovery-cursor-secret-for-tests-only' } }, console: { error() {} } }, { filename: file });
    return exports;
  }
  return load;
}
module.exports = { discoveryLoader, root };

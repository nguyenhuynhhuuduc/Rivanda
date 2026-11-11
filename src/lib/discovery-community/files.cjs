// Private Discovery namespace only. Never traverse or clean the shared upload root.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const policy = require('./retention.json');
const FILE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/i;
async function namespace(pool, uploadDir, create = false) {
  if (!uploadDir || !path.isAbsolute(uploadDir)) throw Error('STORAGE_ROOT_REQUIRED');
  const [[db]] = await pool.query('SELECT @@server_uuid AS server_id,DATABASE() AS db');
  if (!db.db) throw Error('DATABASE_REQUIRED');
  if (create) await fs.mkdir(uploadDir, { recursive: true });
  const base = await fs.realpath(uploadDir), root = path.join(base, policy.namespace);
  const binding = createHash('sha256').update(JSON.stringify([db.server_id, db.db, root, 'discovery-v3'])).digest('hex');
  if (create) {
    try {
      await fs.mkdir(root);
      await fs.writeFile(path.join(root, '.discovery-storage.json'), JSON.stringify({ version: 3, binding }), { flag: 'wx', mode: 0o600 });
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(root) !== root) throw Error('UNSAFE_STORAGE_ROOT');
  const markerPath=path.join(root,'.discovery-storage.json');let marker;
  for(let attempt=0;;attempt++){
    try{const markerStat=await fs.lstat(markerPath);if(!markerStat.isFile()||markerStat.isSymbolicLink())throw Error('UNSAFE_STORAGE_MARKER');marker=JSON.parse(await fs.readFile(markerPath,'utf8'));break;}
    catch(e){if(!create||attempt>=4||!(e.code==='ENOENT'||e instanceof SyntaxError))throw e;await new Promise(resolve=>setTimeout(resolve,10));}
  }
  if(marker.version!==3||marker.binding!==binding)throw Error('STORAGE_DATABASE_BINDING_MISMATCH');
  return root;
}
function filePath(root, name) { if (!FILE.test(name)) throw Error('INVALID_STORAGE_FILE'); return path.join(root, name); }
async function writeExclusive(root, name, bytes) {
  const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(root)!==root)throw Error('UNSAFE_STORAGE_ROOT');
  const handle=await fs.open(filePath(root,name),'wx',0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
module.exports={namespace,filePath,writeExclusive,FILE,policy};

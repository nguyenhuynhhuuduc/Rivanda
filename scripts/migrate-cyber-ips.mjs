// Migration 005 riêng, không nằm trong runner SQL cũ. KHÔNG tự chạy/startup/pre-deploy.
import mysql from 'mysql2/promise';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

const CAPACITY = 62230, BASE = 168427520;
export const DDL = [
  `CREATE TABLE IF NOT EXISTS cyber_ip_allocator (
    id TINYINT UNSIGNED NOT NULL,
    next_slot INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_cyber_allocator_id CHECK (id = 1),
    CONSTRAINT chk_cyber_allocator_slot CHECK (next_slot BETWEEN 0 AND 62230)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS cyber_virtual_ips (
    user_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    ip_number INT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_cyber_virtual_ip (ip_number),
    CONSTRAINT fk_cyber_ip_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_cyber_ip_range CHECK (ip_number BETWEEN 168427786 AND 168492798 AND MOD(ip_number, 256) BETWEEN 10 AND 254)
  ) ENGINE=InnoDB`,
];

const normalize = value => String(value).toLowerCase().replace(/[\s`()]/g, '').replace(/ip_number%256/g, 'modip_number,256');
export async function validateSchema(connection) {
  const [tables] = await connection.execute("SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','cyber_ip_allocator','cyber_virtual_ips','schema_migrations')");
  if (!tables.some(r => r.TABLE_NAME === 'users' && r.ENGINE === 'InnoDB') || !tables.some(r => r.TABLE_NAME === 'schema_migrations')) throw Error('BASE_SCHEMA_REQUIRED');
  if (tables.some(r => ['cyber_ip_allocator', 'cyber_virtual_ips'].includes(r.TABLE_NAME) && r.ENGINE !== 'InnoDB')) throw Error('ENGINE_MISMATCH');
  const [columns] = await connection.execute("SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','cyber_ip_allocator','cyber_virtual_ips')");
  const userId = columns.find(r => r.TABLE_NAME === 'users' && r.COLUMN_NAME === 'id');
  if (!userId || userId.COLUMN_TYPE !== 'char(36)' || userId.COLLATION_NAME !== 'utf8mb4_unicode_ci') throw Error('USER_ID_SCHEMA_MISMATCH');
  const expected = { cyber_ip_allocator: { id: 'tinyintunsigned', next_slot: 'intunsigned' }, cyber_virtual_ips: { user_id: 'char36', ip_number: 'intunsigned', assigned_at: 'timestamp' } };
  for (const [table, shape] of Object.entries(expected)) {
    if (!tables.some(r => r.TABLE_NAME === table)) continue;
    for (const [column, type] of Object.entries(shape)) {
      const actual = columns.find(r => r.TABLE_NAME === table && r.COLUMN_NAME === column);
      if (!actual || normalize(actual.COLUMN_TYPE).replace(/(?:tinyint|int)\d+/g, m => m.replace(/\d+/, '')) !== type || actual.IS_NULLABLE !== 'NO') throw Error('IP_SCHEMA_MISMATCH');
    }
    if (table === 'cyber_virtual_ips' && columns.find(r => r.TABLE_NAME === table && r.COLUMN_NAME === 'user_id').COLLATION_NAME !== userId.COLLATION_NAME) throw Error('IP_COLLATION_MISMATCH');
    const [indexes] = await connection.query(`SHOW INDEX FROM ${table}`);
    const unique = column => indexes.some(r => r.Non_unique === 0 && r.Column_name === column && indexes.filter(i => i.Key_name === r.Key_name).length === 1);
    if (!unique(table === 'cyber_virtual_ips' ? 'user_id' : 'id') || (table === 'cyber_virtual_ips' && !unique('ip_number'))) throw Error('IP_UNIQUE_REQUIRED');
  }
  if (tables.some(r => r.TABLE_NAME === 'cyber_virtual_ips')) {
    const [fk] = await connection.execute("SELECT k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='cyber_virtual_ips' AND k.COLUMN_NAME='user_id'");
    if (!fk.some(r => r.REFERENCED_TABLE_NAME === 'users' && r.REFERENCED_COLUMN_NAME === 'id' && r.DELETE_RULE === 'CASCADE')) throw Error('IP_FOREIGN_KEY_REQUIRED');
  }
  const [checks] = await connection.execute("SELECT t.TABLE_NAME, t.CONSTRAINT_NAME, t.ENFORCED, c.CHECK_CLAUSE FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS t JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.TABLE_SCHEMA=DATABASE() AND t.TABLE_NAME IN ('cyber_ip_allocator','cyber_virtual_ips') AND t.CONSTRAINT_TYPE='CHECK'");
  for (const [table, name, clause] of [
    ['cyber_ip_allocator', 'chk_cyber_allocator_id', 'id=1'],
    ['cyber_ip_allocator', 'chk_cyber_allocator_slot', 'next_slotbetween0and62230'],
    ['cyber_virtual_ips', 'chk_cyber_ip_range', 'ip_numberbetween168427786and168492798andmodip_number,256between10and254'],
  ]) if (tables.some(r => r.TABLE_NAME === table) && !checks.some(r => r.CONSTRAINT_NAME === name && r.ENFORCED === 'YES' && normalize(r.CHECK_CLAUSE) === clause)) throw Error('IP_CHECK_REQUIRED');
}

export async function backfill(connection) {
  await connection.beginTransaction();
  try {
    const [users] = await connection.execute('SELECT id FROM users ORDER BY id FOR UPDATE');
    const [rows] = await connection.execute('SELECT user_id, ip_number FROM cyber_virtual_ips');
    const owners = new Set(users.map(u => u.id)), assigned = new Map(), used = new Set();
    let highest = -1;
    for (const row of rows) {
      const host = Number(row.ip_number) - BASE, third = Math.floor(host / 256), fourth = host % 256;
      if (!owners.has(row.user_id) || assigned.has(row.user_id) || used.has(Number(row.ip_number)) || !Number.isInteger(host) || third < 1 || third > 254 || fourth < 10 || fourth > 254) throw Error('EXISTING_IP_DATA_INVALID');
      highest = Math.max(highest, (third - 1) * 245 + fourth - 10);
      assigned.set(row.user_id, Number(row.ip_number)); used.add(Number(row.ip_number));
    }
    await connection.execute('INSERT INTO cyber_ip_allocator (id, next_slot) SELECT 1, 0 WHERE NOT EXISTS (SELECT 1 FROM cyber_ip_allocator WHERE id = 1)');
    const [pool] = await connection.execute('SELECT next_slot FROM cyber_ip_allocator WHERE id = 1 FOR UPDATE');
    const previous = Number(pool[0]?.next_slot);
    if (!Number.isInteger(previous) || previous < 0 || previous > CAPACITY) throw Error('ALLOCATOR_INVALID');
    let next = Math.max(previous, highest + 1);
    const missing = users.filter(user => !assigned.has(user.id));
    if (next + missing.length > CAPACITY) throw Error('IP_POOL_EXHAUSTED');
    for (const user of missing) {
      const ip = BASE + (Math.floor(next / 245) + 1) * 256 + next % 245 + 10;
      await connection.execute('INSERT INTO cyber_virtual_ips (user_id, ip_number) VALUES (?, ?)', [user.id, ip]);
      next++;
    }
    await connection.execute('UPDATE cyber_ip_allocator SET next_slot = ? WHERE id = 1', [next]);
    await connection.execute("INSERT INTO schema_migrations (filename) VALUES ('005_cyber_virtual_ips.mjs') ON DUPLICATE KEY UPDATE filename=VALUES(filename)");
    await connection.commit();
    return { existing: assigned.size, added: missing.length, nextSlot: next };
  } catch (error) { await connection.rollback(); throw error; }
}

export async function migrate(connection) {
  const [lock] = await connection.execute("SELECT GET_LOCK('personal_site_cyber_ip_005', 10) AS acquired");
  if (Number(lock[0]?.acquired) !== 1) throw Error('MIGRATION_LOCK_UNAVAILABLE');
  try {
    await validateSchema(connection); // Kiểm schema có sẵn trước DDL; không tự sửa bảng sai.
    const [count] = await connection.execute('SELECT COUNT(*) AS n FROM users');
    if (Number(count[0]?.n) > CAPACITY) throw Error('IP_POOL_EXHAUSTED');
    for (const ddl of DDL) await connection.query(ddl);
    await validateSchema(connection);
    return await backfill(connection);
  } finally { await connection.execute("SELECT RELEASE_LOCK('personal_site_cyber_ip_005')"); }
}

async function main() {
  // Guard trước cả load env/kết nối; import để test không chạy main.
  if (!process.argv.includes('--apply') || process.env.ALLOW_DATABASE_MIGRATIONS !== 'explicitly-approved' || process.env.CYBER_IP_BACKUP_CONFIRMED !== 'yes' || process.env.CYBER_IP_MAINTENANCE_CONFIRMED !== 'yes') throw Error('EXPLICIT_APPROVAL_BACKUP_MAINTENANCE_REQUIRED');
  if (typeof process.loadEnvFile === 'function' && existsSync('.env.local')) process.loadEnvFile('.env.local');
  if (['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME'].some(key => !process.env[key])) throw Error('DB_CONFIG_REQUIRED');
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectTimeout: 10000 });
  try { console.log(JSON.stringify(await migrate(connection))); } finally { await connection.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Migration IP chưa hoàn tất. Đối chiếu schema/backup trước khi thử lại; DDL có thể đã tạo bảng, dữ liệu backfill lỗi được rollback.'); process.exitCode = 1; });
}

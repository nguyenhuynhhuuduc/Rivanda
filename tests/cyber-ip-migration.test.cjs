const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const migration = () => import(pathToFileURL(path.join(__dirname, '../scripts/migrate-cyber-ips.mjs')));

function fixture({ failAfter = Infinity, rows = [], next = 0 } = {}) {
  let data = { rows: structuredClone(rows), next, history: false }, staged, writes = 0, rollbacks = 0;
  const users = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const connection = {
    beginTransaction: async () => { staged = structuredClone(data); },
    execute: async (sql, args = []) => {
      if (sql.startsWith('SELECT id FROM users')) return [users];
      if (sql.startsWith('SELECT user_id')) return [staged.rows];
      if (sql.startsWith('INSERT INTO cyber_ip_allocator')) return [{}];
      if (sql.startsWith('SELECT next_slot')) return [[{ next_slot: staged.next }]];
      if (sql.startsWith('INSERT INTO cyber_virtual_ips')) {
        if (++writes > failAfter) throw Error('SYNTHETIC_WRITE_FAILURE');
        assert.equal(staged.rows.some(r => r.user_id === args[0] || r.ip_number === args[1]), false);
        staged.rows.push({ user_id: args[0], ip_number: args[1] }); return [{}];
      }
      if (sql.startsWith('UPDATE cyber_ip_allocator')) { staged.next = args[0]; return [{}]; }
      if (sql.startsWith('INSERT INTO schema_migrations')) { staged.history = true; return [{}]; }
      throw Error('Unexpected fixture SQL');
    },
    commit: async () => { data = staged; }, rollback: async () => { staged = null; rollbacks++; },
  };
  return { connection, get data() { return data; }, get rollbacks() { return rollbacks; } };
}

test('backfill legacy giữ IP cũ, tăng counter an toàn, chạy lại idempotent', async () => {
  const { backfill } = await migration();
  const h = fixture({ rows: [{ user_id: 'a', ip_number: 168427800 }] }); // 10.10.1.24
  const result = await backfill(h.connection);
  assert.equal(result.existing, 1); assert.equal(result.added, 2);
  assert.equal(h.data.rows[0].ip_number, 168427800);
  assert.equal(new Set(h.data.rows.map(r => r.ip_number)).size, 3);
  const previous = structuredClone(h.data);
  const repeated = await backfill(h.connection);
  assert.equal(repeated.added, 0); assert.deepEqual(h.data, previous);
});

test('backfill lỗi giữa chừng rollback mappings/counter/history; không xóa dữ liệu cũ', async () => {
  const { backfill } = await migration();
  const h = fixture({ failAfter: 1 });
  await assert.rejects(backfill(h.connection), /SYNTHETIC/);
  assert.equal(h.data.rows.length, 0); assert.equal(h.data.next, 0); assert.equal(h.data.history, false); assert.equal(h.rollbacks, 1);
});

test('migration từ chối IP trùng, dự trữ, orphan và capacity; không cấp lại IP', async () => {
  const { backfill } = await migration();
  for (const options of [
    { rows: [{ user_id: 'a', ip_number: 168427786 }, { user_id: 'b', ip_number: 168427786 }] },
    { rows: [{ user_id: 'a', ip_number: 168427521 }] },
    { rows: [{ user_id: 'orphan', ip_number: 168427786 }] }, { next: 62229 },
  ]) {
    const h = fixture(options), before = structuredClone(h.data);
    await assert.rejects(backfill(h.connection), /INVALID|EXHAUSTED/);
    assert.deepEqual(h.data, before); assert.equal(h.rollbacks, 1);
  }
});

test('schema có sẵn sai hoặc thiếu unique/check bị chặn trước khi migration tiếp tục', async () => {
  const { validateSchema, DDL } = await migration();
  assert.match(DDL[1], /PRIMARY KEY \(user_id\)/); assert.match(DDL[1], /UNIQUE KEY uq_cyber_virtual_ip \(ip_number\)/);
  for (const bad of ['engine', 'unique', 'check']) {
    const connection = {
      execute: async sql => {
        if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [[{ TABLE_NAME: 'users', ENGINE: 'InnoDB' }, { TABLE_NAME: 'schema_migrations', ENGINE: 'InnoDB' }, { TABLE_NAME: 'cyber_ip_allocator', ENGINE: bad === 'engine' ? 'MyISAM' : 'InnoDB' }]];
        if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[
          { TABLE_NAME: 'users', COLUMN_NAME: 'id', COLUMN_TYPE: 'char(36)', COLLATION_NAME: 'utf8mb4_unicode_ci', IS_NULLABLE: 'NO' },
          { TABLE_NAME: 'cyber_ip_allocator', COLUMN_NAME: 'id', COLUMN_TYPE: 'tinyint unsigned', IS_NULLABLE: 'NO' },
          { TABLE_NAME: 'cyber_ip_allocator', COLUMN_NAME: 'next_slot', COLUMN_TYPE: 'int unsigned', IS_NULLABLE: 'NO' },
        ]];
        if (sql.includes('CHECK_CONSTRAINTS')) return [[]];
        throw Error('Unexpected metadata SQL');
      },
      query: async () => [bad === 'unique' ? [] : [{ Non_unique: 0, Column_name: 'id', Key_name: 'PRIMARY' }]],
    };
    await assert.rejects(validateSchema(connection), /ENGINE_MISMATCH|UNIQUE_REQUIRED|CHECK_REQUIRED/);
  }
});

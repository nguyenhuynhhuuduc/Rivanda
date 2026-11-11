// Khởi tạo database và chạy lần lượt các file SQL trong thư mục sql/
// Chạy: npm run init-db
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// DDL MySQL không rollback nguyên file được. Không cho startup/pre-deploy vô tình chạy.
if (process.env.ALLOW_DATABASE_MIGRATIONS !== "explicitly-approved") {
  throw new Error("Migration bị khóa. Cần backup, đối chiếu schema và phê duyệt riêng trước khi bật ALLOW_DATABASE_MIGRATIONS.");
}

// Tự nạp biến môi trường từ .env.local hoặc .env nếu có
for (const envName of [".env.local", ".env"]) {
  const envPath = path.join(rootDir, envName);
  if (fs.existsSync(envPath)) {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
    } else {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
    }
  }
}

function splitSqlStatements(sqlText) {
  const withoutComments = sqlText
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const host = process.env.DB_HOST ?? "127.0.0.1";
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? "root";
const password = process.env.DB_PASSWORD ?? "";
const dbName = process.env.DB_NAME ?? "personal_site";
const safeDbId = `\`${dbName.replace(/`/g, "``")}\``;

console.log(`Đang kết nối MySQL tại ${host}:${port} (user: ${user})...`);

const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  charset: "utf8mb4",
});

try {
  // 1. Tạo database nếu chưa có, đồng bộ charset/collation chuẩn utf8mb4_unicode_ci và chọn database
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS ${safeDbId} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(
    `ALTER DATABASE ${safeDbId} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.changeUser({ database: dbName });
  console.log(`Đã sẵn sàng database "${dbName}".`);

  // 2. Tạo bảng lưu lịch sử chạy migration
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(120) NOT NULL,
      applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [appliedRows] = await connection.query("SELECT filename FROM schema_migrations");
  const appliedSet = new Set(appliedRows.map((r) => r.filename));

  // 3. Đọc danh sách file .sql theo thứ tự tên file và thực thi từng câu lệnh
  const sqlDir = path.join(rootDir, "sql");
  const sqlFiles = fs
    .readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    if (appliedSet.has(file)) {
      console.log(`- [Bỏ qua] ${file} (đã có lịch sử; schema phải được xác minh riêng)`);
      continue;
    }

    const filePath = path.join(sqlDir, file);
    const rawSql = fs.readFileSync(filePath, "utf8");
    const statements = splitSqlStatements(rawSql).filter(
      (stmt) =>
        !/^CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+personal_site\b/i.test(stmt) &&
        !/^USE\s+personal_site\b/i.test(stmt)
    );

    console.log(`- [Đang chạy] ${file} (${statements.length} câu lệnh)...`);
    for (const stmt of statements) {
      // Kể cả duplicate column/index: dừng để đối chiếu, không ghi migration hoàn tất.
      await connection.query(stmt);
    }

    await connection.execute("INSERT IGNORE INTO schema_migrations (filename) VALUES (?)", [file]);
    console.log(`  ✓ Hoàn tất ${file}`);
  }

  const [finalTables] = await connection.query("SHOW TABLES");
  console.log(`\nKhởi tạo hoàn tất! Tổng số bảng hiện có trong "${dbName}": ${finalTables.length} bảng.`);
} catch (err) {
  console.error("\nLỗi khi khởi tạo database:", err.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}

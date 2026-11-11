// Tạo tài khoản admin (hoặc nâng một tài khoản có sẵn lên admin).
// Chạy: npm run create-admin   (cần Node 20.6 trở lên và file .env.local)
import mysql from "mysql2/promise";
import readline from "node:readline/promises";
import { randomBytes, randomUUID, scrypt } from "node:crypto";

// Phải giống tham số trong src/lib/password.ts
const N = 32768, R = 8, P = 1, KEYLEN = 64, MAXMEM = 64 * 1024 * 1024;

function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }, (err, key) => {
      if (err) return reject(err);
      resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`);
    });
  });
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question("Email admin: ")).trim().toLowerCase();
const lastName = (await rl.question("Họ: ")).trim();
const firstName = (await rl.question("Tên: ")).trim();

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "personal_site",
});

try {
  const [rows] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
  if (rows.length > 0) {
    await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
    console.log(`Đã nâng tài khoản ${email} lên admin (mật khẩu giữ nguyên).`);
  } else {
    const password = await rl.question("Mật khẩu (ít nhất 8 ký tự): ");
    if (password.length < 8) throw new Error("Mật khẩu cần ít nhất 8 ký tự.");
    if (!firstName) throw new Error("Cần nhập tên.");
    await pool.execute(
      "INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, 'admin')",
      [randomUUID(), email, await hashPassword(password), firstName, lastName]
    );
    console.log(`Đã tạo admin ${email}.`);
  }
} catch (err) {
  console.error("Lỗi:", err.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}

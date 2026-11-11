import { randomBytes, scrypt, timingSafeEqual } from "crypto";

// Băm mật khẩu bằng scrypt có sẵn trong Node.js (không cần cài thêm thư viện).
// Định dạng lưu: scrypt$N$r$p$salt(base64)$hash(base64)
// Lưu ý: scripts/create-admin.mjs dùng cùng tham số này, hãy sửa cả hai nếu đổi.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  keylen: number,
  n: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEYLEN, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const key = await derive(password, salt, expected.length, Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Dùng để mất thời gian như thật khi email không tồn tại,
// tránh việc kẻ xấu đoán được email nào đã đăng ký qua thời gian phản hồi.
let dummy: Promise<string> | null = null;
export function dummyVerify(password: string): Promise<boolean> {
  dummy ??= hashPassword("khong-ai-dung-mat-khau-nay");
  return dummy.then((h) => verifyPassword(password, h)).then(() => false);
}

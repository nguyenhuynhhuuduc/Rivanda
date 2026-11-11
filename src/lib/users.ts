import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { pool } from "./db";
import { allocateVirtualIp } from "./cyber-ip";
import type { OAuthProfile, Provider } from "./oauth";

import type { Role } from "./permissions";
export type { Role };

export type DbUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: Role;
  isActive: boolean;
};

type UserRow = RowDataPacket & {
  id: string;
  email: string;
  password_hash: string | null;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: Role;
  is_active: number;
};

const map = (r: UserRow): DbUser => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  firstName: r.first_name,
  lastName: r.last_name,
  avatarUrl: r.avatar_url,
  role: r.role,
  isActive: r.is_active === 1,
});

// Tên Việt: Họ đứng trước, Tên đứng sau.
export function displayName(u: { firstName: string; lastName: string }): string {
  return [u.lastName, u.firstName].filter(Boolean).join(" ");
}

export function isDuplicateError(err: unknown): boolean {
  return (err as { code?: string })?.code === "ER_DUP_ENTRY";
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const [rows] = await pool.execute<UserRow[]>(
    "SELECT * FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] ? map(rows[0]) : null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  const [rows] = await pool.execute<UserRow[]>(
    "SELECT * FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] ? map(rows[0]) : null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}): Promise<DbUser> {
  const id = randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.email, input.passwordHash, input.firstName, input.lastName, input.avatarUrl ?? null]
    );
    await allocateVirtualIp(connection, id);
    const [rows] = await connection.execute<UserRow[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (!rows[0]) throw new Error("Không tạo được tài khoản");
    await connection.commit();
    return map(rows[0]);
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function touchLogin(id: string): Promise<void> {
  await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [id]);
}

export type OAuthResult =
  | { ok: true; user: DbUser }
  | { ok: false; reason: "email_exists" | "no_email" | "disabled" | "unverified_email" };

export async function loginWithOAuth(
  provider: Provider,
  profile: OAuthProfile
): Promise<OAuthResult> {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(profile.id)) throw new Error("Danh tính OAuth không hợp lệ.");
  // 1. Đã từng đăng nhập bằng nhà cung cấp này
  const [found] = await pool.execute<UserRow[]>(
    `SELECT u.* FROM user_identities i
       JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.provider_user_id = ? LIMIT 1`,
    [provider, profile.id]
  );
  if (found[0]) {
    const u = map(found[0]);
    return u.isActive ? { ok: true, user: u } : { ok: false, reason: "disabled" };
  }

  if (!profile.email) return { ok: false, reason: "no_email" };
  const email = profile.email.trim().toLowerCase();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "no_email" };
  if (provider === "google" && !profile.emailVerified) return { ok: false, reason: "unverified_email" };

  // Không tự gộp chỉ vì email trùng: tài khoản local chưa có bước xác minh email.
  const existing = await findUserByEmail(email);
  if (existing) {
    if (!existing.isActive) return { ok: false, reason: "disabled" };
    return { ok: false, reason: "email_exists" };
  }

  // 3. Tạo tài khoản mới
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = randomUUID();
    await connection.execute(
      "INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_url) VALUES (?, ?, NULL, ?, ?, ?)",
      [id, email, (profile.firstName || "Thành viên").slice(0, 60), profile.lastName.slice(0, 60), profile.avatarUrl]
    );
    await connection.execute("INSERT INTO user_identities (provider, provider_user_id, user_id) VALUES (?, ?, ?)", [provider, profile.id, id]);
    await allocateVirtualIp(connection, id);
    const [created] = await connection.execute<UserRow[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (!created[0]) throw new Error("Không tạo được tài khoản OAuth.");
    await connection.commit();
    return { ok: true, user: map(created[0]) };
  } catch (err) {
    await connection.rollback();
    // Một callback khác có thể đã tạo cùng identity; chỉ dùng đúng identity đó.
    if (isDuplicateError(err)) {
      const [linked] = await pool.execute<UserRow[]>(
        "SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.provider_user_id = ? LIMIT 1", [provider, profile.id]
      );
      if (linked[0]) { const u = map(linked[0]); return u.isActive ? { ok: true, user: u } : { ok: false, reason: "disabled" }; }
      return { ok: false, reason: "email_exists" };
    }
    throw err;
  } finally { connection.release(); }
}

// ===== Hồ sơ và tài khoản =====
export type PublicProfile = {
  id: string; firstName: string; lastName: string; displayName: string;
  avatarUrl: string | null; bio: string | null; role: Role; createdAt: Date;
};

export async function getPublicProfile(id: string): Promise<PublicProfile | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, first_name, last_name, avatar_url, bio, role, created_at FROM users WHERE id = ? AND is_active = 1 LIMIT 1", [id]);
  const r = rows[0];
  if (!r) return null;
  const u = { firstName: r.first_name as string, lastName: r.last_name as string };
  return {
    id: r.id as string, ...u, displayName: displayName(u), avatarUrl: (r.avatar_url as string | null) ?? null,
    bio: (r.bio as string | null) ?? null, role: r.role as Role, createdAt: r.created_at as Date,
  };
}

export async function updateProfile(
  id: string, input: { firstName: string; lastName: string; bio: string | null; avatarUrl?: string | null }, executor: Pick<PoolConnection,"query"> = pool
): Promise<void> {
  if (input.avatarUrl !== undefined) {
    await executor.query("UPDATE users SET first_name = ?, last_name = ?, bio = ?, avatar_url = ? WHERE id = ?",
      [input.firstName, input.lastName, input.bio, input.avatarUrl, id]);
  } else {
    await executor.query("UPDATE users SET first_name = ?, last_name = ?, bio = ? WHERE id = ?",
      [input.firstName, input.lastName, input.bio, id]);
  }
}

export async function getAvatarAndBio(id: string): Promise<{ avatarUrl: string | null; bio: string | null }> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT avatar_url, bio FROM users WHERE id = ?", [id]);
  return { avatarUrl: (rows[0]?.avatar_url as string | null) ?? null, bio: (rows[0]?.bio as string | null) ?? null };
}

export async function setPasswordHash(id: string, hash: string): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, id]);
    await connection.execute("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL", [id]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function setUserRole(id: string, role: Role): Promise<void> {
  await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
}

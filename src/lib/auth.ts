import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { createHmac, timingSafeEqual } from "node:crypto";
import { can, type Permission } from "./permissions";
import { displayName, findUserById, type Role } from "./users";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 ngày

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
};

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET chưa được đặt hoặc ngắn hơn 32 ký tự");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string, verifiedPasswordHash?: string | null): Promise<void> {
  const user = await findUserById(userId);
  if (!user?.isActive) throw new Error("Không thể tạo phiên đăng nhập.");
  if (verifiedPasswordHash !== undefined && user.passwordHash !== verifiedPasswordHash) throw new Error("Thông tin xác thực đã thay đổi. Hãy đăng nhập lại.");
  const token = await new SignJWT({ credentialStamp: credentialStamp(user.id, user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setExpirationTime("7d")
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

// Không đưa password hash vào JWT. Đổi/reset hash thu hồi mọi token cũ mà không thêm cột DB.
function credentialStamp(userId: string, passwordHash: string | null): string {
  return createHmac("sha256", secretKey()).update(JSON.stringify(["session-v2", userId, passwordHash])).digest("hex");
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

// Luôn đọc quyền và trạng thái từ database, nên khóa tài khoản hay đổi quyền có hiệu lực ngay.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const u = await findUserById(payload.sub);
    if (!u || !u.isActive) return null;
    const stamp = payload.credentialStamp;
    if (typeof stamp !== "string" || !/^[a-f0-9]{64}$/.test(stamp) ||
      !timingSafeEqual(Buffer.from(stamp, "hex"), Buffer.from(credentialStamp(u.id, u.passwordHash), "hex"))) return null;
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: displayName(u),
      avatarUrl: u.avatarUrl,
      role: u.role,
    };
  } catch {
    return null;
  }
});

export async function isAdmin(): Promise<boolean> {
  return (await getCurrentUser())?.role === "admin";
}

/** Bắt buộc đăng nhập. Chưa đăng nhập thì chuyển tới trang đăng nhập, xong quay lại `next`. */
export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Bắt buộc có quyền cụ thể. Không đủ quyền thì về trang chủ. */
export async function requirePermission(p: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!can(user.role, p)) redirect("/");
  return user;
}

/** Trang chỉ dành cho admin (quản lý nội dung, cấu hình). */
export async function requireAdmin(): Promise<void> {
  await requirePermission("content.manage");
}

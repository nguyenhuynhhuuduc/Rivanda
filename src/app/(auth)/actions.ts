"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { consumeResetToken, requestPasswordReset } from "@/lib/password-reset";
import { dummyVerify, hashPassword, verifyPassword } from "@/lib/password";
import { clearAttempts, isBlocked, recordFailure } from "@/lib/ratelimit";
import { safeNext } from "@/lib/url";
import {
  findUserByEmail,
  touchLogin,
} from "@/lib/users";

export type AuthState = {
  error?: string;
  values?: { firstName?: string; lastName?: string; email?: string };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

function field(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export async function loginAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email", 255).toLowerCase();
  const password = String(fd.get("password") ?? "").slice(0, 200);
  const next = safeNext(String(fd.get("next") ?? ""));
  const values = { email };

  if (!email || !password) return { error: "Nhập email và mật khẩu.", values };

  const ip = await clientIp();
  if (await isBlocked(email, ip)) {
    return { error: "Bạn đã thử quá nhiều lần. Hãy đợi 15 phút rồi thử lại.", values };
  }

  const user = await findUserByEmail(email);
  let ok = false;
  if (user?.passwordHash) ok = await verifyPassword(password, user.passwordHash);
  else await dummyVerify(password);

  if (!user || !ok || !user.isActive) {
    await recordFailure(email, ip);
    return { error: "Email hoặc mật khẩu không đúng.", values };
  }

  await clearAttempts(email);
  await touchLogin(user.id);
  try { await createSession(user.id, user.passwordHash); }
  catch { return { error: "Không thể đăng nhập. Hãy kiểm tra thông tin và thử lại.", values }; }
  redirect(next);
}

export async function registerAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const lastName = field(fd, "lastName", 60);
  const firstName = field(fd, "firstName", 60);
  const email = field(fd, "email", 255).toLowerCase();
  // Chặn hoàn toàn việc bỏ qua xác thực Email OTP bằng gọi trực tiếp Server Action.
  return {
    error: "Vui lòng gửi và xác thực mã OTP qua email trước khi hoàn tất tạo tài khoản.",
    values: { firstName, lastName, email },
  };
}

export async function logoutAction() {
  const current = await getCurrentUser().catch(() => null);
  if (current) {
    try {
      const { markOffline } = await import("@/lib/discovery-community/presence");
      markOffline(current.id);
    } catch { /* không chặn đăng xuất */ }
  }
  await destroySession();
  redirect("/");
}

export async function forgotPasswordAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = field(fd, "email", 255).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Email chưa đúng định dạng.", values: { email } };

  // Giới hạn theo IP để tránh bị lợi dụng gửi hàng loạt email
  const ip = await clientIp();
  if (await isBlocked(`reset:${ip}`, ip)) {
    return { error: "Bạn đã thử quá nhiều lần. Hãy đợi 15 phút rồi thử lại.", values: { email } };
  }
  await recordFailure(`reset:${ip}`, ip);
  await requestPasswordReset(email);
  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Mật khẩu cần ít nhất 8 ký tự." };
  if (password.length > 128) return { error: "Mật khẩu quá dài (tối đa 128 ký tự)." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "Hai mật khẩu chưa khớp." };

  const ok = await consumeResetToken(token, await hashPassword(password));
  if (!ok) return { error: "Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu lại." };
  redirect("/login?reset=1");
}

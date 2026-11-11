"use server";

import { getCurrentUser } from "@/lib/auth";
import { ensureVirtualIp } from "@/lib/cyber-ip";

export type PracticeIdentity = { ok: true; userId: string; ip: string } | { ok: false; error: string; signedOut?: boolean };

/** Desktop/focus chỉ xác minh owner, không cấp hoặc thay đổi IP. */
export async function verifyPracticeOwnerAction(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

// Không nhận userId hoặc IP từ client; không nhận/lưu dữ liệu thực hành.
export async function getPracticeIdentityAction(): Promise<PracticeIdentity> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, signedOut: true, error: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." };
  try { return { ok: true, userId: user.id, ip: await ensureVirtualIp(user.id) }; }
  catch (error) {
    const code = (error as { code?: string }).code;
    return { ok: false, error: code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR"
      ? "Chưa có cấu hình IP mô phỏng. Quản trị viên cần kiểm tra và chạy migration 005 sau khi sao lưu."
      : "Không nhận được IP mô phỏng. Hãy thử lại sau hoặc liên hệ quản trị viên." };
  }
}

import { PasswordInput } from "@/components/site/PasswordInput";
import { btnPrimary } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { changePasswordAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bảo mật" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser("/account/security");
  const [sp, db] = await Promise.all([searchParams, findUserById(user.id)]);
  const hasPassword = !!db?.passwordHash;
  return (
    <div className="max-w-md">
      <h2 className="font-display text-2xl font-bold">Bảo mật</h2>
      <p className="mt-1 text-sm text-muted">{hasPassword ? "Đổi mật khẩu đăng nhập." : "Tài khoản của bạn đăng nhập bằng Google/Facebook. Bạn có thể đặt thêm mật khẩu."}</p>
      {sp.ok && <p role="status" className="mt-4 rounded-md bg-card px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-danger/100/10 px-4 py-3 text-sm text-danger">{sp.error}</p>}
      <form action={changePasswordAction} className="mt-6 space-y-4">
        {hasPassword && <PasswordInput name="current" label="Mật khẩu hiện tại" autoComplete="current-password" />}
        <PasswordInput name="password" label="Mật khẩu mới (ít nhất 8 ký tự)" autoComplete="new-password" />
        <PasswordInput name="confirm" label="Nhập lại mật khẩu mới" autoComplete="new-password" />
        <button className={btnPrimary}>Lưu mật khẩu</button>
      </form>
    </div>
  );
}

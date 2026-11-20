import { PasswordInput } from "@/components/site/PasswordInput";
import { btnPrimary } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { findUserById, linkedOAuthProviders } from "@/lib/users";
import { isConfigured } from "@/lib/oauth";
import { errorMessage } from "@/app/(auth)/error-messages";
import { changePasswordAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bảo mật" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; linked?: string }> }) {
  const user = await requireUser("/account/security");
  const [sp, db, providers] = await Promise.all([searchParams, findUserById(user.id), linkedOAuthProviders(user.id)]);
  const hasPassword = !!db?.passwordHash;
  return (
    <div className="max-w-md">
      <h2 className="font-display text-2xl font-bold">Bảo mật</h2>
      <p className="mt-1 text-sm text-muted">{hasPassword ? "Đổi mật khẩu đăng nhập." : "Tài khoản của bạn đăng nhập bằng Google/Facebook. Bạn có thể đặt thêm mật khẩu."}</p>
      {sp.ok && <p role="status" className="mt-4 rounded-md bg-card px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-danger/100/10 px-4 py-3 text-sm text-danger">{errorMessage(sp.error) ?? sp.error}</p>}
      {sp.linked === "1" && <p role="status" className="mt-4 text-sm text-success">Đã liên kết tài khoản. Lần sau bạn có thể đăng nhập bằng phương thức này.</p>}
      <form action={changePasswordAction} className="mt-6 space-y-4">
        {hasPassword && <PasswordInput name="current" label="Mật khẩu hiện tại" autoComplete="current-password" />}
        <PasswordInput name="password" label="Mật khẩu mới (ít nhất 8 ký tự)" autoComplete="new-password" />
        <PasswordInput name="confirm" label="Nhập lại mật khẩu mới" autoComplete="new-password" />
        <button className={btnPrimary}>Lưu mật khẩu</button>
      </form>
      <section className="mt-10 border-t border-line pt-6" aria-labelledby="linked-accounts">
        <h3 id="linked-accounts" className="text-lg font-semibold">Tài khoản liên kết</h3>
        <p className="mt-2 text-sm text-muted">Liên kết Google và Facebook với cùng hồ sơ này. Email trùng không tự tạo liên kết; bạn sẽ xác nhận tài khoản tại nhà cung cấp.</p>
        <div className="mt-4 space-y-3">
          {(["google", "facebook"] as const).map(provider => {
            const label = provider === "google" ? "Google" : "Facebook";
            const linked = providers.includes(provider);
            return <div key={provider} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4">
              <span className="text-sm font-medium">{label}{linked ? " · Đã liên kết" : ""}</span>
              {!linked && <form method="post" action={`/api/auth/${provider}/start`}>
                <button className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-50`} disabled={!isConfigured(provider)}>Liên kết {label}</button>
                {!isConfigured(provider) && <p className="mt-2 text-xs text-muted">Chưa được cấu hình.</p>}
              </form>}
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}

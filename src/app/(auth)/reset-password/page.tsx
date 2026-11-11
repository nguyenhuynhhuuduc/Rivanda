import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";
import { linkCls } from "@/components/auth/styles";
import { findValidResetToken } from "@/lib/password-reset";
import { getHomeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đặt lại mật khẩu" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = token ? await findValidResetToken(token) : null;
  const s = await getHomeSettings();
  return (
    <AuthShell siteName={s.siteName} image={s.heroImage} tagline={s.heroTitle}>
      <h1 className="font-display text-4xl font-bold tracking-tight">Đặt mật khẩu mới</h1>
      {valid ? (
        <div className="mt-8"><ResetForm token={token} /></div>
      ) : (
        <p role="alert" className="mt-6 text-muted">
          Liên kết đã hết hạn hoặc không hợp lệ.{" "}
          <Link href="/forgot-password" className={linkCls}>Yêu cầu liên kết mới</Link>
        </p>
      )}
    </AuthShell>
  );
}

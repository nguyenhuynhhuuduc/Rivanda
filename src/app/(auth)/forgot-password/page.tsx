import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";
import { linkCls } from "@/components/auth/styles";
import { getHomeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quên mật khẩu" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const sp = await searchParams;
  const s = await getHomeSettings();
  return (
    <AuthShell siteName={s.siteName} image={s.heroImage} tagline={s.heroTitle}>
      <h1 className="font-display text-4xl font-bold tracking-tight">Quên mật khẩu</h1>
      {sp.sent ? (
        <p role="status" className="mt-6 leading-relaxed text-muted">
          Nếu email này đã đăng ký, chúng tôi vừa gửi một liên kết đặt lại mật khẩu (có hiệu lực 1 giờ).
          Hãy kiểm tra cả hộp thư rác.
        </p>
      ) : (
        <>
          <p className="mb-8 mt-3 text-sm text-muted">Nhập email, chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu mới.</p>
          <ForgotForm />
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className={linkCls}>Quay lại đăng nhập</Link>
      </p>
    </AuthShell>
  );
}

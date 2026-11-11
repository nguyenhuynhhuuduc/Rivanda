import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { getCurrentUser } from "@/lib/auth";
import { getHomeSettings } from "@/lib/settings";
import { safeNext } from "@/lib/url";
import { errorMessage } from "../error-messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);
  const s = await getHomeSettings();

  return (
    <AuthShell siteName={s.siteName} image={s.heroImage} tagline={s.heroTitle}>
      <h1 className="font-display text-4xl font-bold tracking-tight">Đăng nhập</h1>
      <p className="mb-8 mt-3 text-sm text-muted">
        Đăng nhập để lưu ảnh, thích và bình luận.
      </p>
      {sp.reset && <p role="status" className="mb-4 text-sm text-success">Đã đặt lại mật khẩu. Hãy đăng nhập.</p>}
      <LoginForm next={next} initialError={errorMessage(sp.error)} />
      <SocialButtons next={next} />
    </AuthShell>
  );
}

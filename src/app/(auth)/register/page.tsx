import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { linkCls } from "@/components/auth/styles";
import { getCurrentUser } from "@/lib/auth";
import { getHomeSettings } from "@/lib/settings";
import { safeNext } from "@/lib/url";
import { errorMessage } from "../error-messages";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đăng ký" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);
  const s = await getHomeSettings();

  return (
    <AuthShell siteName={s.siteName} image={s.heroImage} tagline={s.heroTitle}>
      <h1 className="font-display text-4xl font-bold tracking-tight">Tạo tài khoản</h1>
      <p className="mb-8 mt-3 text-sm text-muted">
        Đã có tài khoản?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={linkCls}>
          Đăng nhập
        </Link>
      </p>
      <RegisterForm next={next} initialError={errorMessage(sp.error)} />
      <SocialButtons next={next} />
    </AuthShell>
  );
}

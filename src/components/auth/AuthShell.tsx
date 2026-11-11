import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteLogo } from "@/components/SiteLogo";

type Props = {
  siteName: string;
  image: string | null;
  tagline: string;
  children: React.ReactNode;
};

// Khung hai cột dùng chung cho đăng nhập và đăng ký.
export function AuthShell({ siteName, image, tagline, children }: Props) {
  return (
    <main id="main-content" className="home-hero grid min-h-screen place-items-center px-4 py-8 text-fg">
      <div className="glass-panel grid w-full max-w-5xl overflow-hidden rounded-3xl p-3 md:grid-cols-2 md:gap-3">
        <aside className="relative hidden min-h-[580px] overflow-hidden rounded-2xl text-cream md:block">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/uploads/${image}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_28%,#3a5f86_0%,#172d46_42%,#0a1624_100%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/35" />

          <div className="absolute inset-x-6 top-6 flex items-center justify-between">
            <SiteLogo name={siteName} className="w-[72px]" />
            <Link
              href="/"
              className="rounded-full bg-white/15 px-3.5 py-1.5 text-xs backdrop-blur-sm transition hover:bg-white/25"
            >
              Về trang chủ
            </Link>
          </div>

          <p className="absolute inset-x-8 bottom-10 text-center text-2xl font-medium leading-snug">
            {tagline}
          </p>
        </aside>

        <section className="flex min-w-0 flex-col justify-center px-5 py-6 sm:px-10 md:px-10">
          <div className="mb-8 flex items-center justify-between gap-3"><Link href="/" aria-label={`${siteName} — Trang chủ`} className="flex items-center gap-2 text-sm text-muted hover:text-fg"><span className="md:hidden"><SiteLogo name={siteName} className="w-12" /></span><span>← Trang chủ</span></Link><ThemeToggle /></div>
          {children}
        </section>
      </div>
    </main>
  );
}

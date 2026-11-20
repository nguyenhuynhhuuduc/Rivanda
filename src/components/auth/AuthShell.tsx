import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteLogo } from "@/components/SiteLogo";
import { AUTH_BRAND_CONFIG } from "./auth-brand.config";
import styles from "./AuthShell.module.css";

type Props = {
  siteName: string;
  image: string | null;
  tagline: string;
  children: React.ReactNode;
};

// Khung hai cột dùng chung cho đăng nhập, đăng ký và khôi phục mật khẩu.
export function AuthShell({ siteName, children }: Props) {
  return (
    <main id="main-content" className="home-hero grid min-h-screen place-items-center px-4 py-8 text-fg">
      <div className="glass-panel grid w-full max-w-5xl overflow-hidden rounded-3xl p-3 md:grid-cols-2 md:gap-3">
        <aside className={styles.brandPanel} aria-label={`Giới thiệu ${siteName}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={AUTH_BRAND_CONFIG.imageSrc}
            alt={AUTH_BRAND_CONFIG.imageAlt}
            style={{ objectPosition: AUTH_BRAND_CONFIG.objectPosition }}
            className={styles.photo}
          />
          <div className={styles.scrim} aria-hidden="true" />
          <div className={styles.frameLine} aria-hidden="true" />

          <div className={styles.topBar}>
            <SiteLogo name={siteName} className="w-[72px]" />
            <Link href="/" className={styles.homeLink}>
              Về trang chủ
            </Link>
          </div>

          <div className={styles.editorialFooter}>
            <p className={styles.kicker}>
              <span className={styles.goldRule} aria-hidden="true" />
              <span>{AUTH_BRAND_CONFIG.kicker}</span>
            </p>
            <p className={`${styles.slogan} font-display`}>
              <span className={styles.sloganChunk}>{AUTH_BRAND_CONFIG.sloganLine1}</span>{" "}
              <span className={styles.sloganChunk}>{AUTH_BRAND_CONFIG.sloganLine2}</span>
            </p>
            <p className={styles.description}>
              {AUTH_BRAND_CONFIG.description}
            </p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col justify-center px-5 py-6 sm:px-10 md:px-10">
          <div className="mb-8 flex items-center justify-between gap-3"><Link href="/" aria-label={`${siteName} — Trang chủ`} className="flex items-center gap-2 text-sm text-muted hover:text-fg"><span className="md:hidden"><SiteLogo name={siteName} className="w-12" /></span><span>← Trang chủ</span></Link><ThemeToggle /></div>
          {children}
        </section>
      </div>
    </main>
  );
}

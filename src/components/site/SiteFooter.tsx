import Link from "next/link";
import { SocialIcons } from "@/components/SocialIcons";
import { getHomeSettings } from "@/lib/settings";
import { SiteLogo } from "@/components/SiteLogo";

export async function SiteFooter() {
  const s = await getHomeSettings();
  const col = "space-y-2.5 text-sm text-muted";
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Link href="/" aria-label={`${s.siteName} — Trang chủ`} className="inline-block"><SiteLogo name={s.siteName} className="w-[84px]" /></Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{s.heroSubtitle}</p>
          <div className="mt-5 text-fg"><SocialIcons instagramUrl={s.instagramUrl} xUrl={s.xUrl} facebookUrl={s.facebookUrl} /></div>
        </div>
        <nav aria-label="Khám phá" className={col}>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-link">Khám phá</p>
          <p><Link href="/journeystory" className="hover:text-fg">JourneyStory</Link></p>
          <p><Link href="/discovery" className="hover:text-fg">Discovery</Link></p>
          <p><Link href="/cyber-lab" className="hover:text-fg">Cyber Lab</Link></p>
          <p><Link href="/documents/blog" className="hover:text-fg">Blog</Link></p>
          <p><Link href="/shop" className="hover:text-fg">Shop</Link></p>
        </nav>
        <nav aria-label="Thông tin" className={col}>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-link">Thông tin</p>
          <p><Link href="/about" className="hover:text-fg">Giới thiệu</Link></p>
          <p><Link href="/contact" className="hover:text-fg">Liên hệ</Link></p>
          <p><Link href="/privacy" className="hover:text-fg">Quyền riêng tư</Link></p>
          <p><Link href="/terms" className="hover:text-fg">Điều khoản</Link></p>
        </nav>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">© {new Date().getFullYear()} {s.siteName}</div>
    </footer>
  );
}

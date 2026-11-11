import Link from "next/link";
import { HomeSection } from "@/components/home/Sections";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteLogo } from "@/components/SiteLogo";
import { SocialIcons } from "@/components/SocialIcons";
import { btnOutline, btnPrimary, Container } from "@/components/ui/kit";
import { getHomeSections, getHomeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const destinations = [
  { number: "01", href: "/discovery", name: "Discovery", text: "Câu chuyện, góc nhìn và kết nối cùng cộng đồng.", label: "Khám phá cộng đồng" },
  { number: "02", href: "/cyber-lab", name: "Cyber Lab", text: "Hướng dẫn, công cụ và nghiên cứu về công nghệ, bảo mật.", label: "Học và thực hành · Thành viên" },
  { number: "03", href: "/documents/blog", name: "Blog", text: "Những bài viết và kinh nghiệm muốn chia sẻ.", label: "Đọc Blog" },
];

export default async function HomePage() {
  const [s, sections] = await Promise.all([getHomeSettings(), getHomeSections()]);
  // Chỉ đổi đích/nhãn điều hướng cũ; không sửa settings đã lưu trong DB.
  const ctaPath = s.ctaHref.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const resourceCta = ["/document", "/documents"].includes(ctaPath) || /^\/(?:resources|documents\/(?:resources|projects))(?:\/|$)/.test(ctaPath);
  return (
    <div className="bg-bg text-fg">
      <SiteHeader />
      <main id="main-content">
        <section className="home-hero relative overflow-hidden border-b border-line">
          <Container className="relative grid items-center gap-12 py-16 md:py-24 lg:min-h-[720px] lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <div className="relative z-10">
              <p className="rise mb-7 inline-flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium tracking-wide text-muted">
                <span className="h-2 w-2 shrink-0 rounded-full bg-gold" />{s.badgeText || "Khám phá · Ghi chép · Chia sẻ"}
              </p>
              <h1 className="rise rise-2 max-w-2xl font-display text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">{s.heroTitle}</h1>
              <p className="rise rise-2 mt-7 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">{s.heroSubtitle}</p>
              <div className="rise rise-3 mt-9 flex flex-wrap gap-3">
                <Link href={resourceCta ? "/documents/blog" : s.ctaHref} className={`${btnPrimary} shadow-lg shadow-navy/10`}>{resourceCta ? "Đọc Blog" : s.ctaLabel}<span aria-hidden="true">↗</span></Link>
                <Link href="/about" className={btnOutline}>Câu chuyện của tôi <span aria-hidden="true">→</span></Link>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-4 border-t border-line pt-6">
                <span className="text-xs uppercase tracking-[.18em] text-muted">Kết nối và chia sẻ</span>
                <SocialIcons instagramUrl={s.instagramUrl} xUrl={s.xUrl} facebookUrl={s.facebookUrl} />
                <Link href="/contact" className="text-sm font-medium text-link hover:underline">Liên hệ →</Link>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md pb-6 pl-3 pr-3 sm:pl-8 lg:pr-0">
              <div className="hero-orbit" aria-hidden="true" />
              <div className="glass-panel relative overflow-hidden rounded-[2rem]">
                {s.heroImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/uploads/${s.heroImage}`} alt="Góc nhìn và hành trình của tôi" fetchPriority="high" className="aspect-[4/5] w-full object-cover" />
                ) : (
                  <div className="relative flex aspect-[4/5] flex-col justify-between overflow-hidden bg-navy-deep p-8 text-cream">
                    <div className="absolute -right-20 top-14 h-72 w-72 rounded-full border border-gold/30" aria-hidden="true" />
                    <div className="absolute -right-8 top-28 h-48 w-48 rounded-full border border-cream/20" aria-hidden="true" />
                    <p className="relative font-mono text-xs tracking-[.2em] text-gold-light">A PERSONAL SPACE</p>
                    <div className="relative"><span className="font-display text-7xl text-gold-light" aria-hidden="true">↗</span><p className="mt-6 font-display text-4xl leading-tight">Đi xa hơn.<br />Hiểu sâu hơn.<br />Chia sẻ nhiều hơn.</p></div>
                    <p className="relative text-xs uppercase tracking-[.2em] text-cream/70">Discovery / Cyber Lab / Documents</p>
                  </div>
                )}
              </div>
              <div className="glass-panel absolute -bottom-1 left-0 right-8 flex items-center gap-4 rounded-2xl p-5 sm:right-12">
                <SiteLogo name={s.siteName} className="w-12" />
                <div className="min-w-0"><p className="truncate font-display text-lg font-bold">{s.siteName}</p><p className="mt-1 text-xs text-muted">Một nơi lưu lại những điều đáng nhớ.</p></div>
              </div>
            </div>
          </Container>
          <Container className="pb-12">
            <div className="grid gap-4 md:grid-cols-3">
              {destinations.map((d) => <Link key={d.href} href={d.href} className="group rounded-2xl border border-line bg-surface/80 p-6 transition hover:-translate-y-1 hover:border-gold/60 motion-reduce:transform-none">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-muted">{d.number} / {d.label}</span><span aria-hidden="true" className="text-muted group-hover:text-link">↗</span></div>
                <h2 className="mt-5 font-display text-2xl font-bold">{d.name}</h2><p className="mt-2 text-sm leading-relaxed text-muted">{d.text}</p>
              </Link>)}
            </div>
          </Container>
        </section>
        {sections.filter((x) => x.enabled).map((x) => <HomeSection key={x.key} name={x.key} settings={s} />)}
      </main>
      <SiteFooter />
    </div>
  );
}

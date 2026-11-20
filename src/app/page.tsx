import { HomeSection } from "@/components/home/Sections";
import { TravelShowcase } from "@/components/home/TravelShowcase";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getHomeSections, getHomeSettings } from "@/lib/settings";
import { journeyCollections } from "@/lib/journeystory-read";
import { collectionPage } from "@/lib/journeystory-view";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const [s, sections, result] = await Promise.all([
    getHomeSettings(), getHomeSections(), journeyCollections({ includeEmpty: true }).then(journeys => ({ journeys, unavailable: false })).catch(() => ({ journeys: [], unavailable: true })),
  ]);
  const ctaPath = s.ctaHref.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const resourceCta = ["/document", "/documents"].includes(ctaPath) || /^\/(?:resources|documents\/(?:resources|projects))(?:\/|$)/.test(ctaPath);
  const ordered = collectionPage(result.journeys, "newest", 1, Math.max(result.journeys.length, 1)).journeys;
  const journeys = [...ordered.filter(t => t.isFeatured), ...ordered.filter(t => !t.isFeatured)].slice(0, 8);
  return <div className="bg-bg text-fg">
    <SiteHeader />
    <main id="main-content">
      <TravelShowcase journeys={journeys} settings={s} ctaHref={resourceCta ? "/documents/blog" : s.ctaHref} ctaLabel={resourceCta ? "Đọc Blog" : s.ctaLabel} unavailable={result.unavailable}>
        {sections.filter(x => x.enabled).map(x => <HomeSection key={x.key} name={x.key} settings={s} />)}
      </TravelShowcase>
    </main>
    <SiteFooter />
  </div>;
}

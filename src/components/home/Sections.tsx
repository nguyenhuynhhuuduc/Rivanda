import Link from "next/link";
import { DocRow } from "@/components/site/DocRow";
import { JourneyCard } from "@/components/site/Cards";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { PostCard } from "@/components/site/PostCard";
import { btnOutline, btnPrimary, Container, SectionHeading } from "@/components/ui/kit";
import { listPhotos, listTrips, PUBLIC } from "@/lib/discovery";
import { listDocuments } from "@/lib/documents";
import { listPosts } from "@/lib/posts";
import type { HomeSectionKey, HomeSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";

// Mỗi khu vực tự lấy dữ liệu của mình; không có dữ liệu (hoặc DB chưa khởi tạo) thì không làm sập trang chủ.
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function FeaturedJourneys() {
  const featured = await safe(() => listTrips({ onlyWithPhotos: true, featuredOnly: true, limit: 3 }), []);
  const trips = featured.length ? featured : await safe(() => listTrips({ onlyWithPhotos: true, limit: 3 }), []);
  if (!trips.length) return null;
  return (
    <section className="py-16"><Container>
      <SectionHeading eyebrow="Hành trình" title="Hành trình nổi bật" href="/discovery/journeys" />
      <div className="grid gap-8 md:grid-cols-3">{trips.map((t) => <JourneyCard key={t.id} trip={t} />)}</div>
    </Container></section>
  );
}

async function LatestDiscovery() {
  const { photos } = await safe(() => listPhotos({ statuses: PUBLIC, limit: 8 }), { photos: [], total: 0 });
  if (!photos.length) return null;
  return (
    <section className="bg-card/50 py-16"><Container>
      <SectionHeading eyebrow="Discovery" title="Ảnh mới đăng" href="/discovery/explore" />
      <PhotoGrid photos={photos} />
    </Container></section>
  );
}

async function CyberLab() {
  const user = await getCurrentUser();
  if (!user) return <section className="border-y border-line bg-card/50 py-20"><Container><div className="glass-panel grid items-center gap-6 rounded-3xl p-7 sm:p-10 md:grid-cols-[1fr_auto]"><div><p className="text-xs font-medium uppercase tracking-[.2em] text-link">Cyber Lab · Không gian thành viên</p><h2 className="mt-3 font-display text-3xl font-bold">Học để hiểu. Thực hành để tiến bộ.</h2><p className="mt-4 max-w-xl leading-relaxed text-muted">Đăng nhập để đọc hướng dẫn, khám phá công cụ và các bài thực hành về bảo mật hợp pháp.</p></div><Link href="/login?next=%2Fcyber-lab" className={btnPrimary}>Đăng nhập để khám phá ↗</Link></div></Container></section>;
  const { posts } = await safe(() => listPosts({ type: "hacking", onlyPublished: true, limit: 3 }), { posts: [], total: 0 });
  return (
    <section className="border-y border-line bg-card/50 py-20 text-fg"><Container>
      <SectionHeading eyebrow="Cyber Lab" title="Học để hiểu cách hệ thống được bảo vệ" href="/cyber-lab" linkLabel="Vào Cyber Lab" />
      {posts.length ? (
        <div className="grid gap-6 md:grid-cols-3">{posts.map((p) => <PostCard key={p.id} post={p} href={`/cyber-lab/articles/${p.slug}`} />)}</div>
      ) : (
        <p className="max-w-xl text-muted">Hướng dẫn, công cụ, bài lab và nghiên cứu về bảo mật, viết cho mục đích học tập hợp pháp.</p>
      )}
    </Container></section>
  );
}

async function LatestArticles() {
  const [{ posts }, { docs }] = await Promise.all([
    safe(() => listPosts({ type: "blog", onlyPublished: true, limit: 3 }), { posts: [], total: 0 }),
    safe(() => listDocuments({ onlyPublished: true, kinds: ["document", "resource"], limit: 3 }), { docs: [], total: 0 }),
  ]);
  if (!posts.length && !docs.length) return null;
  return (
    <section className="py-16"><Container>
      <SectionHeading eyebrow="Blog" title="Bài viết và tài liệu mới" href="/documents/blog" />
      {posts.length > 0 && <div className="mb-10 grid gap-6 md:grid-cols-3">{posts.map((p) => <PostCard key={p.id} post={p} href={`/documents/blog/${p.slug}`} />)}</div>}
      {docs.length > 0 && <ul className="space-y-3">{docs.map((d) => <DocRow key={d.id} doc={d} linked={false} />)}</ul>}
    </Container></section>
  );
}

async function FeaturedProjects() {
  const featured = (await safe(() => listDocuments({ onlyPublished: true, kinds: ["project"], featuredOnly: true, limit: 3 }), { docs: [], total: 0 })).docs;
  const docs = featured.length ? featured : (await safe(() => listDocuments({ onlyPublished: true, kinds: ["project"], limit: 3 }), { docs: [], total: 0 })).docs;
  if (!docs.length) return null;
  return (
    <section className="bg-card/50 py-16"><Container>
      <SectionHeading eyebrow="Dự án" title="Dự án nổi bật" />
      <ul className="space-y-3">{docs.map((d) => <DocRow key={d.id} doc={d} linked={false} />)}</ul>
    </Container></section>
  );
}

function About({ s }: { s: HomeSettings }) {
  return (
    <section className="py-20"><Container className="max-w-3xl text-center">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-link">Giới thiệu</p>
      <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">{s.siteName}</h2>
      <p className="mt-5 whitespace-pre-wrap font-serif text-xl leading-relaxed text-muted">
        {(s.aboutText || s.heroSubtitle).split(/\n{2,}/)[0]}
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/about" className={btnPrimary}>Đọc thêm</Link>
        <Link href="/contact" className={btnOutline}>Liên hệ</Link>
      </div>
    </Container></section>
  );
}

export async function HomeSection({ name, settings }: { name: HomeSectionKey; settings: HomeSettings }) {
  switch (name) {
    case "featured_journeys": return <FeaturedJourneys />;
    case "latest_discovery": return <LatestDiscovery />;
    case "cyber_lab": return <CyberLab />;
    case "latest_articles": return <LatestArticles />;
    case "featured_projects": return <FeaturedProjects />;
    case "about": return <About s={settings} />;
  }
}

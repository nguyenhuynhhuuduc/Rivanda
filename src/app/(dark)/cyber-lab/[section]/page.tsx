import { notFound } from "next/navigation";
import Link from "next/link";
import { PostCard } from "@/components/site/PostCard";
import { btnPrimary, Chip, Container, Empty, inputCls, PageHeading, Pagination } from "@/components/ui/kit";
import { CATEGORIES, SECTIONS } from "@/lib/cyber-lab";
import { listPosts } from "@/lib/posts";
import { requireUser } from "@/lib/auth";
import { returnPath } from "@/lib/url";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cyber Lab", robots: { index: false, follow: false } };
const PAGE_SIZE = 12;

export default async function CyberSectionPage({
  params, searchParams,
}: { params: Promise<{ section: string }>; searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  const { section } = await params;
  const sp = await searchParams;
  await requireUser(returnPath(`/cyber-lab/${encodeURIComponent(section)}`, sp));
  const def = SECTIONS[section];
  if (!def) notFound();
  const q = (sp.q ?? "").trim().slice(0, 80);
  const category = sp.category && CATEGORIES[sp.category] ? sp.category : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { posts, total } = await listPosts({
    type: "hacking", section: def.section, category, q: q || undefined, onlyPublished: true,
    limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, category, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/cyber-lab/${section}${s ? `?${s}` : ""}`;
  };

  return (
    <Container className="py-14">
      <Link href="/cyber-lab" className="text-sm text-muted hover:text-fg">← Cyber Lab</Link>
      <div className="mt-6"><PageHeading eyebrow="Cyber Lab" title={def.label} subtitle={def.desc} /></div>

      <nav aria-label="Mục" className="mb-6 flex flex-wrap gap-2">
        {Object.entries(SECTIONS).map(([slug, s]) => <Chip key={slug} href={`/cyber-lab/${slug}`} active={slug === section}>{s.label}</Chip>)}
      </nav>

      <form action={`/cyber-lab/${section}`} className="mb-6 flex max-w-xl gap-3">
        {category && <input type="hidden" name="category" value={category} />}
        <label htmlFor="q" className="sr-only">Tìm bài viết</label>
        <input id="q" name="q" defaultValue={q} maxLength={80} placeholder="Tìm bài viết..." className={inputCls} />
        <button className={btnPrimary}>Tìm</button>
      </form>

      <div className="mb-8 flex flex-wrap gap-2">
        <Chip href={href({ category: undefined, page: undefined })} active={!category}>Tất cả chuyên mục</Chip>
        {Object.entries(CATEGORIES).map(([key, c]) => <Chip key={key} href={href({ category: key, page: undefined })} active={category === key}>{c.label}</Chip>)}
      </div>

      {posts.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => <PostCard key={p.id} post={p} href={`/cyber-lab/articles/${p.slug}`} />)}
        </div>
      ) : <Empty>{q || category ? "Không tìm thấy bài viết phù hợp." : "Chưa có bài viết nào ở mục này."}</Empty>}

      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => href({ page: String(n) })} />
    </Container>
  );
}

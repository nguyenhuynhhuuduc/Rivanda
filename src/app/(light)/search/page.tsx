import Link from "next/link";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { btnPrimary, Container, inputCls, PageHeading, SectionHeading } from "@/components/ui/kit";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tìm kiếm" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const r = q.length >= 2 ? await searchAll(q) : null;
  const none = r && !r.photos.length && !r.posts.length;

  return (
    <Container className="py-14">
      <PageHeading eyebrow="Tìm kiếm" title="Tìm trên toàn website" />
      <form action="/search" className="mb-12 flex max-w-xl gap-3">
        <label htmlFor="q" className="sr-only">Từ khóa</label>
        <input id="q" name="q" defaultValue={q} maxLength={80} autoFocus placeholder="Ảnh, bài viết..." className={inputCls} />
        <button className={btnPrimary}>Tìm</button>
      </form>

      {q && !r && <p className="text-muted">Hãy nhập ít nhất 2 ký tự.</p>}
      {none && <p className="text-muted">Không tìm thấy kết quả cho “{q}”.</p>}

      {r && r.photos.length > 0 && (
        <section className="mb-14"><SectionHeading eyebrow="JourneyStory" title="Ảnh" href={`/journeystory/explore?q=${encodeURIComponent(q)}`} linkLabel="Xem thêm" /><PhotoGrid photos={r.photos} /></section>
      )}
      {r && r.posts.length > 0 && (
        <section className="mb-14">
          <SectionHeading eyebrow="Bài viết" title="Bài viết" />
          <ul className="divide-y divide-line">
            {r.posts.map((p) => (
              <li key={p.id} className="py-4">
                <Link href={p.type === "hacking" ? `/cyber-lab/articles/${p.slug}` : `/documents/blog/${p.slug}`} className="font-display text-lg font-bold hover:text-link">{p.title}</Link>
                <p className="text-xs text-muted">{p.type === "hacking" ? "Cyber Lab" : "Blog"}</p>
                {p.summary && <p className="mt-1 text-sm text-muted">{p.summary}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}

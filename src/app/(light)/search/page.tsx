import Link from "next/link";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { Avatar, btnPrimary, Container, inputCls, PageHeading, SectionHeading } from "@/components/ui/kit";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tìm kiếm" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const r = q.length >= 2 ? await searchAll(q) : null;
  const none =
    r &&
    !r.members.length &&
    !r.communityPosts.length &&
    !r.photos.length &&
    !r.posts.length;

  return (
    <Container className="py-14">
      <PageHeading eyebrow="Tìm kiếm" title="Tìm trên toàn website" />
      <form action="/search" className="mb-12 flex max-w-xl gap-3">
        <label htmlFor="q" className="sr-only">Từ khóa</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          maxLength={80}
          autoFocus
          placeholder="Bài viết, thành viên, CyberLab IP, ảnh..."
          className={inputCls}
        />
        <button className={btnPrimary}>Tìm</button>
      </form>

      {q && !r && <p className="text-muted">Hãy nhập ít nhất 2 ký tự.</p>}
      {none && <p className="text-muted">Không tìm thấy kết quả cho “{q}”.</p>}

      {r && r.members.length > 0 && (
        <section className="mb-14">
          <SectionHeading
            eyebrow="Cộng đồng"
            title="Thành viên"
            href={`/discovery?tab=users&q=${encodeURIComponent(q)}`}
            linkLabel="Tìm thêm thành viên"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {r.members.map((m) => (
              <Link
                key={m.id}
                href={m.profileUrl}
                className="flex items-center gap-3.5 rounded-xl border border-line bg-surface p-4 transition hover:border-link"
              >
                <Avatar name={m.displayName} url={m.avatarUrl} size={46} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{m.displayName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {m.cyberIp && (
                      <span className="rounded bg-card px-1.5 py-0.5 font-mono text-link">
                        {m.cyberIp}
                      </span>
                    )}
                    <span className="truncate font-mono">ID: {m.id.slice(0, 8)}…</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {r && r.communityPosts.length > 0 && (
        <section className="mb-14">
          <SectionHeading
            eyebrow="Discovery"
            title="Bài viết cộng đồng"
            href={`/discovery?q=${encodeURIComponent(q)}`}
            linkLabel="Xem trên Discovery"
          />
          <ul className="divide-y divide-line">
            {r.communityPosts.map((p) => (
              <li key={p.id} className="py-4">
                <Link href={p.href} className="flex items-start gap-3.5 group">
                  <Avatar name={p.authorName} url={p.authorAvatar} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-bold group-hover:text-link">{p.title}</p>
                    <p className="text-xs text-muted">{p.authorName} · Discovery</p>
                    {p.excerpt && <p className="mt-1 text-sm text-muted">{p.excerpt}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r && r.photos.length > 0 && (
        <section className="mb-14">
          <SectionHeading
            eyebrow="JourneyStory"
            title="Ảnh"
            href={`/journeystory/explore?q=${encodeURIComponent(q)}`}
            linkLabel="Xem thêm"
          />
          <PhotoGrid photos={r.photos} />
        </section>
      )}

      {r && r.posts.length > 0 && (
        <section className="mb-14">
          <SectionHeading eyebrow="Bài viết" title="Blog & Cyber Lab" />
          <ul className="divide-y divide-line">
            {r.posts.map((p) => (
              <li key={p.id} className="py-4">
                <Link
                  href={p.type === "hacking" ? `/cyber-lab/articles/${p.slug}` : `/documents/blog/${p.slug}`}
                  className="font-display text-lg font-bold hover:text-link"
                >
                  {p.title}
                </Link>
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

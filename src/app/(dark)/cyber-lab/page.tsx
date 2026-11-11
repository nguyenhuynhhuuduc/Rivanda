import Link from "next/link";
import { PostCard } from "@/components/site/PostCard";
import { btnPrimary, Container, Empty, inputCls, PageHeading, SectionHeading } from "@/components/ui/kit";
import { CATEGORIES, LAB_NOTICE, SECTIONS } from "@/lib/cyber-lab";
import { listPosts } from "@/lib/posts";
import { requireUser } from "@/lib/auth";
import { returnPath } from "@/lib/url";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cyber Lab", robots: { index: false, follow: false } };

export default async function CyberLabPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser(returnPath("/cyber-lab", await searchParams));
  const { posts } = await listPosts({ type: "hacking", onlyPublished: true, limit: 6 });
  return (
    <Container className="py-14">
      <PageHeading eyebrow="Cyber Lab" title="Học để hiểu cách hệ thống được bảo vệ"
        subtitle="Hướng dẫn, công cụ, bài lab và nghiên cứu về bảo mật, viết cho mục đích học tập hợp pháp." />

      <div className="mb-8">
        <Link href="/cyber-lab/practice" className={btnPrimary}>Bắt đầu thực hành <span aria-hidden="true">→</span></Link>
      </div>

      <form action="/cyber-lab/tutorials" className="mb-12 flex max-w-xl gap-3">
        <label htmlFor="q" className="sr-only">Tìm bài viết</label>
        <input id="q" name="q" maxLength={80} placeholder="Tìm bài viết Cyber Lab..." className={inputCls} />
        <button className={btnPrimary}>Tìm</button>
      </form>

      <section className="mb-16">
        <SectionHeading eyebrow="Mục" title="Bắt đầu từ đâu" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(SECTIONS).map(([slug, s]) => (
            <Link key={slug} href={`/cyber-lab/${slug}`} className="rounded-md border border-line p-6 transition hover:border-gold">
              <h3 className="font-display text-xl font-bold">{s.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <SectionHeading eyebrow="Chuyên mục" title="Theo chủ đề" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <Link key={key} href={`/cyber-lab/tutorials?category=${key}`} className="group rounded-md bg-card p-5 transition hover:bg-card/70">
              <h3 className="font-medium group-hover:text-link">{c.label}</h3>
              <p className="mt-1 text-sm text-muted">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="Mới nhất" title="Bài viết gần đây" />
        {posts.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => <PostCard key={p.id} post={p} href={`/cyber-lab/articles/${p.slug}`} />)}
          </div>
        ) : <Empty>Chưa có bài viết nào.</Empty>}
      </section>

      <p className="mt-16 rounded-md border border-gold/40 bg-gold/10 px-5 py-4 text-sm leading-relaxed">{LAB_NOTICE}</p>
    </Container>
  );
}

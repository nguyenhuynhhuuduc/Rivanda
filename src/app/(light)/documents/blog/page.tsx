import Link from "next/link";
import { BlogListItem } from "@/components/blog/BlogListItem";
import { btnPrimary, Container, Empty, inputCls, PageHeading, Pagination } from "@/components/ui/kit";
import { listBlogEntries } from "@/lib/blog-list";
import { blogFoundationReady, listBlogTopics } from "@/lib/blog-read";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blog", alternates: { canonical: "/documents/blog" } };
const PAGE_SIZE = 12;

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; topic?: string }> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const topic = typeof sp.topic === "string" && sp.topic.length <= 120 ? sp.topic : "";
  const [ready, topics, user] = await Promise.all([blogFoundationReady(), listBlogTopics(), getCurrentUser()]);
  const rawPage = typeof sp.page === "string" ? Number.parseInt(sp.page, 10) : 1;
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && Number.isSafeInteger((rawPage - 1) * PAGE_SIZE) ? rawPage : 1;
  const { entries, total } = await listBlogEntries({ q: q || undefined, topic: topic || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const hrefFor = (n: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (topic) query.set("topic", topic);
    query.set("page", String(n));
    return `/documents/blog?${query}`;
  };
  return (
    <Container className="py-14">
      <Link href="/" className="text-sm text-muted hover:text-fg">← Trang chủ</Link>
      <div className="mt-6"><PageHeading eyebrow="Blog" title="Blog" subtitle="Bài viết về những điều tôi học và nghĩ." /></div>
      <form action="/documents/blog" className="mb-5 flex max-w-xl flex-col gap-3 sm:flex-row">
        <label htmlFor="blog-q" className="sr-only">Tìm bài viết Blog</label>
        <input id="blog-q" name="q" defaultValue={q} maxLength={80} placeholder="Tìm theo tiêu đề hoặc mô tả..." className={`${inputCls} min-w-0 flex-1`} />
        {ready && <><label htmlFor="blog-topic" className="sr-only">Lọc chủ đề</label><select id="blog-topic" name="topic" defaultValue={topic} className={`${inputCls} min-w-0 sm:w-48`}><option value="">Tất cả chủ đề</option>{topics.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}</select></>}
        <button className={btnPrimary}>Tìm kiếm</button>
      </form>
      {ready ? <Link href={user ? "/account/blog" : "/login?next=%2Faccount%2Fblog"} className="mb-8 inline-block text-sm text-link underline">{user ? "Quản lý / viết Blog của tôi" : "Đăng nhập để viết Blog"}</Link> : <p role="status" className="mb-8 text-sm text-muted">Chủ đề và đăng bài của thành viên đang khóa: migration 006 chưa sẵn sàng. Bài Blog cũ vẫn được giữ nguyên.</p>}
      {entries.length ? (
        <ul className="space-y-5">{entries.map((entry) => <BlogListItem key={entry.post.id} entry={entry} />)}</ul>
      ) : <Empty>{q || topic ? "Không tìm thấy bài viết phù hợp." : "Chưa có bài viết nào."}{(q || topic) && <Link href="/documents/blog" className="ml-2 text-link underline">Xóa bộ lọc</Link>}</Empty>}
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={hrefFor} />
    </Container>
  );
}

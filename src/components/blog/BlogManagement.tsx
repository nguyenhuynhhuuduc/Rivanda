import Link from "next/link";
import { btnOutline, Pagination, Empty } from "@/components/ui/kit";
import { BLOG_STATE_LABEL, type BlogActor } from "@/lib/blog-policy";
import { blogFoundationReady, managedBlogs } from "@/lib/blog-read";
import { reviewBlogAction } from "@/app/admin/blog/actions";
import { inputCls, btnPrimary } from "@/components/ui/kit";

export async function BlogManagement({ actor, page, state }: { actor: BlogActor; page: number; state?: string }) {
  if (!await blogFoundationReady()) return <p role="status" className="rounded-lg border border-line p-5 text-muted">Blog Foundation chưa khả dụng: migration 006 chưa sẵn sàng. Bài Blog cũ vẫn được giữ; chức năng ghi mới đang khóa.</p>;
  const admin = actor.role === "admin", base = admin ? "/admin/blog" : "/account/blog";
  const { entries, total } = await managedBlogs(actor, page, state);
  const href = (p: number, s = state) => `${base}?${new URLSearchParams({ page: String(p), ...(s ? { state: s } : {}) })}`;
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-3"><Link href={`${base}/new`} className={btnPrimary}>Viết Blog</Link>{admin && <Link href="/admin/blog/topics" className={btnOutline}>Quản lý chủ đề</Link>}</div>
    <nav aria-label="Trạng thái bài Blog" className="flex flex-wrap gap-3 text-sm"><Link href={href(1, "")} className="text-link">Tất cả</Link>{(["draft", "pending", "published", "rejected", "hidden"] as const).map((s) => <Link key={s} href={href(1, s)} className="text-link underline">{BLOG_STATE_LABEL[s]}</Link>)}</nav>
    {!entries.length && <Empty>Chưa có bài viết ở trạng thái này.</Empty>}
    <ul className="space-y-4">{entries.map((r) => <li key={r.post.id} className="rounded-lg border border-line bg-card/40 p-5">
      <h2 className="break-words font-display text-xl font-bold">{r.post.title}</h2><p className="mt-2 break-words text-sm text-muted">{BLOG_STATE_LABEL[r.state]} · {r.authorName || "Chưa có thông tin tác giả"} · v{r.revision}</p>
      {r.reviewNote && <p className="mt-2 break-words text-sm text-muted">{r.reviewNote}</p>}
      <Link href={`${base}/${r.post.id}`} className="mt-3 inline-block text-sm text-link underline">Mở trình chỉnh sửa</Link>
      {admin && (r.state === "pending" || r.state === "published") && <form action={reviewBlogAction} className="mt-4 flex flex-wrap items-start gap-3">
        <input type="hidden" name="id" value={r.post.id} /><input type="hidden" name="revision" value={r.revision} />
        <input name="note" maxLength={500} placeholder="Lý do (bắt buộc khi từ chối)" aria-label={`Ghi chú duyệt ${r.post.title}`} className={`${inputCls} basis-full sm:min-w-0 sm:flex-1 sm:basis-0`} />
        {r.state === "pending" ? <><button name="decision" value="approve" className={btnPrimary}>Duyệt</button><button name="decision" value="reject" className={btnOutline}>Từ chối</button></> : <button name="decision" value="hide" className={btnOutline}>Ẩn bài</button>}
      </form>}
    </li>)}</ul>
    <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / 20))} hrefFor={href} />
  </div>;
}

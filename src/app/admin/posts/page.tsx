import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { adminBtn, adminBtnDanger, adminBtnGhost, AdminPagination, Card, Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listPosts } from "@/lib/posts";
import { deletePostAction } from "../post-actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { posts, total } = await listPosts({ onlyPublished: false, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageTitle title="Bài viết" hint="Bài Blog (mục Documents) và bài Cyber Lab." />
        <div className="flex shrink-0 gap-2">
          <Link href="/admin/posts/new?type=blog" className={adminBtn}>Viết Blog</Link>
          <Link href="/admin/posts/new?type=hacking" className={adminBtnGhost}>Viết Cyber Lab</Link>
        </div>
      </div>
      <Flash saved={sp.saved} error={sp.error} />

      <div className="space-y-3">
        {posts.length === 0 && <p className="text-muted">Chưa có bài viết nào.</p>}
        {posts.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{p.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {p.type === "hacking" ? "Cyber Lab" : "Blog"} ·{" "}
                  {p.status === "published" ? "Đã đăng" : "Bản nháp"} · {formatDate(p.updatedAt)} · {p.viewCount} lượt xem
                </p>
              </div>
              <div className="flex gap-2">
                {p.status === "published" && (
                  <Link href={p.type === "hacking" ? `/cyber-lab/articles/${p.slug}` : `/documents/blog/${p.slug}`} target="_blank" className={adminBtnGhost}>
                    Xem
                  </Link>
                )}
                <Link href={`/admin/posts/${p.id}`} className={adminBtnGhost}>Sửa</Link>
                <form action={deletePostAction.bind(null, p.id)}>
                  <ConfirmButton message={p.type === "blog" ? "Mở trình Blog để xác nhận xóa mềm, giữ dữ liệu?" : "Xóa bài viết này vĩnh viễn?"} className={adminBtnDanger}>{p.type === "blog" ? "Quản lý / xóa mềm" : "Xóa"}</ConfirmButton>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => `/admin/posts?page=${n}`} />
    </div>
  );
}

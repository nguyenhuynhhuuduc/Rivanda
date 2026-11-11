import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { btnOutline } from "@/components/ui/kit";
import { ModeratePost } from "@/components/discovery-community/ManageForms";
import { communityReady, ownCommunityPage } from "@/lib/discovery-community/read";
import { CommunityError, STATE_LABEL } from "@/lib/discovery-community/model";
export const dynamic = "force-dynamic";
export default async function AdminCommunity({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const user = await requireUser("/admin/discovery"); if (user.role !== "admin") notFound(); const q = await searchParams;
  let feed: Awaited<ReturnType<typeof ownCommunityPage>> = { posts: [], next: null }, error = "";
  try { if (await communityReady()) feed = await ownCommunityPage(user, true, q.cursor); else error = "Discovery chưa khả dụng: cần migration 007."; } catch (e) { error = e instanceof CommunityError ? e.message : "Không tải được danh sách."; }
  return <div className="space-y-5"><h1 className="font-display text-3xl font-bold">Kiểm duyệt Discovery</h1><Link href="/admin/discovery/reports" className={btnOutline}>Báo cáo bài viết / bình luận →</Link><Link href="/admin/discovery/trash" className={btnOutline}>Thùng rác / khôi phục</Link><p className="text-sm text-muted">Bài cập nhật gần nhất. Ẩn/gỡ giữ lại dữ liệu và ghi lịch sử quyết định; bài bị giữ kiểm duyệt cần Admin duyệt lại khi tác giả gửi.</p>{error && <p role="alert">{error} <Link className="text-link" href="/admin/discovery">Tải lại</Link></p>}{feed.posts.map(p => <section key={p.id} className="rounded-xl border border-line bg-surface p-5"><div className="mb-4"><p className="text-xs text-muted">{STATE_LABEL[p.status]} · {p.visibility === "public" ? "Công khai" : "Chỉ tác giả"} · Phiên bản {p.revision}</p><Link href={`/discovery/posts/${p.id}`} className="mt-2 block break-words text-lg font-semibold text-link">{p.title || p.body.slice(0, 100) || "Bài ảnh"}</Link><p className="mt-1 text-sm text-muted">{p.authorName}</p></div><ModeratePost id={p.id} revision={p.revision} pending={p.status === "pending"} /></section>)}{!error && !feed.posts.length && <p>Chưa có bài.</p>}{feed.next && <Link className={btnOutline} href={`/admin/discovery?cursor=${encodeURIComponent(feed.next)}`}>Trang tiếp theo</Link>}</div>;
}

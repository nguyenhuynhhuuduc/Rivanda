import Link from "next/link";
import { ActivityChart, PhotoStatusChart } from "@/components/admin/DashboardCharts";
import { adminBtn, adminBtnGhost, Card, PageTitle } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth";
import { getDashboardData } from "@/lib/admin-stats";
import { can, type Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await requirePermission("admin.access");
  const data = await getDashboardData().catch(() => null);
  if (!data) return <div><PageTitle title="Tổng quan" hint={`Xin chào, ${user.displayName}.`} /><Card><p role="alert" className="font-medium text-danger">Chưa thể tải số liệu quản trị.</p><p className="mt-2 text-sm text-muted">Vui lòng kiểm tra kết nối database và schema. Các biểu đồ tạm thời không hiển thị để tránh đưa ra số liệu không chính xác.</p><Link href="/admin" className={`${adminBtnGhost} mt-5`}>Thử tải lại</Link></Card></div>;
  const s = data.stats;
  const pending = data.photoStates.find((x) => x.status === "pending")?.count ?? 0;
  const cards: { label: string; value: number; caption: string; href: string; permission: Permission; icon: string }[] = [
    { label: "Tài khoản", value: data.users, caption: "Tất cả vai trò", href: "/admin/users", permission: "users.manage", icon: "◎" },
    { label: "Ảnh trong thư viện", value: s.photos, caption: `${pending} ảnh chờ duyệt`, href: "/admin/photos", permission: "content.manage", icon: "▧" },
    { label: "Bài đã xuất bản", value: s.blogPosts + s.hackingPosts, caption: "Blog & Cyber Lab", href: "/admin/posts", permission: "content.manage", icon: "▤" },
    { label: "Tài liệu & dự án", value: s.documents, caption: "Tất cả trạng thái", href: "/admin/documents", permission: "content.manage", icon: "⌘" },
  ];
  const rows: { label: string; value: number; href: string; permission: Permission }[] = [
    { label: "Ảnh chờ duyệt", value: pending, href: "/admin/moderation", permission: "moderation.review" },
    { label: "Báo cáo chưa xử lý", value: data.openReports, href: "/admin/reports", permission: "report.handle" },
    { label: "Bình luận đang hiển thị", value: s.comments, href: "/admin/comments", permission: "comment.moderate" },
    { label: "Hành trình", value: s.trips, href: "/admin/trips", permission: "content.manage" },
    { label: "Lượt thích ảnh", value: s.likes, href: "/admin/photos", permission: "content.manage" },
    { label: "Lượt lưu ảnh", value: s.saves, href: "/admin/photos", permission: "content.manage" },
    { label: "Email chờ Shop", value: s.waitlist, href: "/admin/waitlist", permission: "content.manage" },
  ];
  return <div className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><PageTitle title="Tổng quan" hint={`Xin chào, ${user.displayName}. Cùng nhìn lại không gian của bạn.`} />{can(user.role, "content.manage") && <Link href="/admin/posts/new" className={adminBtn}>＋ Tạo bài viết</Link>}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((c) => {
      const content = <><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted">{c.label}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-card text-xl text-link" aria-hidden="true">{c.icon}</span></div><p className="mt-5 text-4xl font-semibold tracking-tight tabular-nums">{c.value.toLocaleString("vi-VN")}</p><p className="mt-2 text-xs text-muted">{c.caption}</p></>;
      return can(user.role, c.permission) ? <Link key={c.label} href={c.href} className="glass-panel rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-gold motion-reduce:transform-none">{content}</Link> : <div key={c.label} className="glass-panel rounded-2xl p-5">{content}</div>;
    })}</div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(240px,1fr)]">
      <Card title="Hoạt động trong 6 tháng"><p className="mb-6 text-xs leading-relaxed text-muted">Số bản ghi tạo mới mỗi tháng, theo ngày tạo trong database. Bài viết gồm cả bản nháp.</p><ActivityChart months={data.monthly} /></Card>
      <Card title="Trạng thái thư viện ảnh"><PhotoStatusChart states={data.photoStates} /></Card>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)]">
      <Card title="Tình hình nội dung"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Số liệu nội dung và tương tác hiện tại</caption><thead><tr className="border-b border-line text-xs text-muted"><th className="py-3 font-medium">Hạng mục</th><th className="py-3 text-right font-medium">Số lượng</th></tr></thead><tbody>{rows.filter((r) => can(user.role, r.permission)).map((r) => <tr key={r.label} className="border-b border-line last:border-0"><th className="py-3.5 font-normal"><Link href={r.href} className="hover:text-link">{r.label} <span aria-hidden="true">↗</span></Link></th><td className="py-3.5 text-right font-semibold tabular-nums">{r.value.toLocaleString("vi-VN")}</td></tr>)}</tbody></table></div></Card>
      <Card title="Bắt đầu công việc"><p className="mb-5 text-sm leading-relaxed text-muted">Các thao tác phù hợp với vai trò của bạn.</p><div className="grid gap-3">{can(user.role, "moderation.review") && <Link href="/admin/moderation" className={adminBtnGhost}>Kiểm duyệt ảnh <span className="ml-auto">{pending}</span></Link>}{can(user.role, "report.handle") && <Link href="/admin/reports" className={adminBtnGhost}>Xem báo cáo <span className="ml-auto">{data.openReports}</span></Link>}{can(user.role, "content.manage") && <><Link href="/admin/photos" className={adminBtnGhost}>Đăng ảnh mới ↗</Link><Link href="/admin/status" className={adminBtnGhost}>Đăng nhật ký ↗</Link><Link href="/admin/documents" className={adminBtnGhost}>Chia sẻ tài liệu ↗</Link></>}</div><p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">Số liệu được lấy từ database khi tải trang. Không có dữ liệu mẫu hoặc tỷ lệ tăng trưởng giả định.</p></Card>
    </div>
  </div>;
}

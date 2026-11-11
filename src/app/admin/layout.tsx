import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { getCurrentUser } from "@/lib/auth";
import { countOpenReports } from "@/lib/community";
import { countPhotosByStatus } from "@/lib/discovery";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteLogo } from "@/components/SiteLogo";

// Layout riêng cho khu quản trị: rõ ràng, nhiều thông tin. Menu hiện theo quyền của vai trò.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const staff = !!user && can(user.role, "admin.access");

  let items: NavItem[] = [];
  if (user && staff) {
    const [pending, reports] = await Promise.all([countPhotosByStatus("pending").catch(() => 0), countOpenReports().catch(() => 0)]);
    const r = user.role;
    items = [
      { href: "/admin", label: "Tổng quan", exact: true },
      ...(can(r, "settings.manage") ? [{ href: "/admin/home", label: "Trang chủ" }] : []),
      ...(can(r, "moderation.review") ? [{ href: "/admin/moderation", label: "Kiểm duyệt ảnh", badge: pending }] : []),
      ...(can(r, "report.handle") ? [{ href: "/admin/reports", label: "Báo cáo vi phạm", badge: reports }] : []),
      ...(can(r, "comment.moderate") ? [{ href: "/admin/comments", label: "Bình luận" }] : []),
      ...(can(r, "content.manage")
        ? [
            { href: "/admin/photos", label: "Ảnh Discovery" },
            { href: "/admin/trips", label: "Hành trình" },
            { href: "/admin/albums", label: "Album" },
            { href: "/admin/status", label: "Nhật ký (status)" },
            { href: "/admin/posts", label: "Bài viết" },
            { href: "/admin/blog", label: "Quản lý / duyệt Blog" },
            { href: "/admin/blog/topics", label: "Chủ đề Blog" },
            { href: "/admin/discovery", label: "Cộng đồng Discovery" },
            { href: "/admin/documents", label: "Tài liệu" },
            { href: "/admin/waitlist", label: "Email chờ Shop" },
          ]
        : []),
      ...(can(r, "users.manage") ? [{ href: "/admin/users", label: "Người dùng" }] : []),
      ...(can(r, "logs.view") ? [{ href: "/admin/logs", label: "Nhật ký hoạt động" }] : []),
    ];
  }

  return (
    <div className="admin-background min-h-screen font-sans text-fg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3"><SiteLogo name="Trang quản trị" /><span className="font-display text-lg font-bold">Quản trị<span className="hidden font-sans text-xs font-normal text-muted sm:block">Personal workspace</span></span></Link>
          <div className="flex items-center gap-3"><ThemeToggle />
          {user && staff && (
            <div className="flex items-center gap-3 text-xs sm:text-sm">
              <span className="hidden max-w-52 truncate text-muted md:inline">{user.displayName} · {ROLE_LABEL[user.role]}</span>
              <Link href="/" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-fg">Xem website</Link>
              <form action={logoutAction}>
                <button className="rounded-lg border border-line px-3 py-1.5 hover:bg-card">Đăng xuất</button>
              </form>
            </div>
          )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl gap-7 px-4 py-6 sm:px-6 sm:py-8 lg:grid lg:grid-cols-[210px_minmax(0,1fr)]">
        {items.length > 0 && <aside className="mb-6 lg:mb-0"><div className="glass-panel rounded-2xl p-3 lg:sticky lg:top-28"><p className="mb-4 hidden px-3 pt-2 text-[10px] font-semibold uppercase tracking-[.2em] text-muted lg:block">Điều hướng</p><AdminNav items={items} /><div className="mt-5 hidden border-t border-line px-3 pt-4 text-xs text-muted lg:block">Nội dung của bạn.<br /><span className="mt-1 block text-link">Mọi thứ trong tầm nhìn.</span></div></div></aside>}
        <main id="main-content" className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

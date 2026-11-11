import Link from "next/link";
import { Container } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  const unread = await unreadCount(user.id);
  const items = [
    { href: "/account", label: "Hồ sơ" },
    { href: "/account/blog", label: "Blog của tôi" },
    { href: "/account/discovery", label: "Discovery của tôi" },
    { href: "/account/saved", label: "Đã lưu" },
    { href: "/account/collections", label: "Bộ sưu tập" },
    { href: "/account/comments", label: "Bình luận của tôi" },
    { href: "/account/notifications", label: unread ? `Thông báo (${unread})` : "Thông báo" },
    ...(can(user.role, "content.submit") ? [{ href: "/account/content", label: "Nội dung của tôi" }] : []),
    { href: "/account/security", label: "Bảo mật" },
  ];
  return (
    <Container className="py-12">
      <h1 className="mb-8 font-display text-4xl font-bold tracking-tight">Tài khoản</h1>
      <div className="gap-10 md:grid md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Tài khoản" className="mb-8 flex gap-1 overflow-x-auto md:mb-0 md:flex-col">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted transition hover:bg-card hover:text-fg">{i.label}</Link>
          ))}
          <Link href={`/profile/${user.id}`} className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted transition hover:bg-card hover:text-fg">Xem hồ sơ công khai</Link>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}

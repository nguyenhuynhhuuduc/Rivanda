import { NotificationBell } from "@/components/discovery-community/NotificationBell";
import Link from "next/link";
import { LogoutForm } from "@/components/auth/LogoutForm";
import { getCurrentUser } from "@/lib/auth";
import { totalUnreadMessages } from "@/lib/chat/store";
import { unreadCount } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { getHomeSettings } from "@/lib/settings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteLogo } from "@/components/SiteLogo";
import { NavbarSearch } from "@/components/site/NavbarSearch";
import { PresenceHeartbeat } from "@/components/site/PresenceHeartbeat";
import { MessageNavIcon } from "@/components/messages/MessageNavIcon";

export const NAV = [
  { href: "/journeystory", label: "JourneyStory" },
  { href: "/discovery", label: "Community" },
  { href: "/cyber-lab", label: "Cyber Lab" },
  { href: "/documents/blog", label: "Blog" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "Giới thiệu" },
];

const link = "whitespace-nowrap text-sm text-muted transition hover:text-fg";

export async function SiteHeader() {
  const [s, user] = await Promise.all([getHomeSettings(), getCurrentUser()]);
  const [unread, unreadMessages] = user
    ? await Promise.all([unreadCount(user.id), totalUnreadMessages(user.id)])
    : [0, 0];
  const staff = !!user && can(user.role, "admin.access");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" aria-label={`${s.siteName} — Trang chủ`} className="shrink-0"><SiteLogo name={s.siteName} /></Link>

        <nav aria-label="Chính" className="hidden items-center gap-5 xl:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className={link}>{n.label}</Link>)}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3 xl:ml-0">
        <ThemeToggle />
        {user&&<PresenceHeartbeat userId={user.id}/>}
        {user&&<MessageNavIcon key={`msg-${user.id}`} userId={user.id} initialUnread={unreadMessages}/>}
        {user&&<NotificationBell key={user.id} userId={user.id} unread={unread}/>}
        <NavbarSearch />
        <div className="hidden shrink-0 items-center gap-4 xl:flex">
          {user ? (
            <>
              {staff && <Link href="/admin" className={link}>Quản trị</Link>}

              <Link href="/account" className={`${link} max-w-[130px] truncate`}>{user.displayName}</Link>
              <LogoutForm><button className={link}>Đăng xuất</button></LogoutForm>
            </>
          ) : (
            <>
              <Link href="/login" className={link}>Đăng nhập</Link>
              <Link href="/register" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">Đăng ký</Link>
            </>
          )}
        </div>

        <details className="relative xl:hidden">
          <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-md hover:bg-card [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Mở menu</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </summary>
          <div className="absolute right-0 top-12 w-56 rounded-lg border border-line bg-bg p-2 shadow-xl">
            {[...NAV, { href: "/search", label: "Tìm kiếm" }].map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-md px-3 py-2.5 text-sm hover:bg-card">{n.label}</Link>
            ))}
            <div className="my-1 h-px bg-line" />
            {user ? (
              <>
                <Link href="/account" className="block rounded-md px-3 py-2.5 text-sm hover:bg-card">Tài khoản</Link>
                <Link href="/messages" className="block rounded-md px-3 py-2.5 text-sm hover:bg-card">Tin nhắn{unreadMessages ? ` (${unreadMessages})` : ""}</Link>
                <Link href="/account/notifications" className="block rounded-md px-3 py-2.5 text-sm hover:bg-card">Thông báo{unread ? ` (${unread})` : ""}</Link>
                {staff && <Link href="/admin" className="block rounded-md px-3 py-2.5 text-sm hover:bg-card">Quản trị</Link>}
                <LogoutForm><button className="block w-full rounded-md px-3 py-2.5 text-left text-sm hover:bg-card">Đăng xuất</button></LogoutForm>
              </>
            ) : (
              <>
                <Link href="/login" className="block rounded-md px-3 py-2.5 text-sm hover:bg-card">Đăng nhập</Link>
                <Link href="/register" className="block rounded-md px-3 py-2.5 text-sm hover:bg-card">Đăng ký</Link>
              </>
            )}
          </div>
        </details>
        </div>
      </div>
    </header>
  );
}

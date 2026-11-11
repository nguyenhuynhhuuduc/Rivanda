import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listNotifications, markAllRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thông báo" };

export default async function NotificationsPage() {
  const user = await requireUser("/account/notifications");
  const list = await listNotifications(user.id);
  await markAllRead(user.id); // mở trang là coi như đã đọc
  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Thông báo</h2>
      {list.length === 0 ? <p className="mt-6 text-muted">Chưa có thông báo nào.</p> : (
        <ul className="mt-6 divide-y divide-line">
          {list.map((n) => (
            <li key={n.id} className={`py-4 ${n.isRead ? "text-muted" : ""}`}>
              {n.link ? <Link href={n.link} className="hover:text-link">{n.message}</Link> : <span>{n.message}</span>}
              <p className="mt-1 text-xs text-muted">{formatDate(n.createdAt)}{!n.isRead && " · mới"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

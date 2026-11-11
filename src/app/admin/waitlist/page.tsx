import { Card, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listWaitlist } from "@/lib/admin-stats";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminWaitlistPage() {
  await requireAdmin();
  const list = await listWaitlist();

  return (
    <div>
      <PageTitle title="Email chờ Shopping" hint={`${list.length} người đã để lại email ở trang Shopping. Đây là thước đo mức quan tâm trước khi mở bán.`} />
      <Card className="!p-0">
        <ul className="divide-y divide-line text-sm">
          {list.length === 0 && <li className="px-4 py-6 text-muted">Chưa có email nào.</li>}
          {list.map((w) => (
            <li key={w.email} className="flex justify-between px-4 py-3">
              <span>{w.email}</span>
              <span className="text-muted">{formatDate(w.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

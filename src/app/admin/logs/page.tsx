import { Card, PageTitle } from "@/components/admin/ui";
import { listActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth";

export const dynamic = "force-dynamic";
const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" });

export default async function LogsPage() {
  await requirePermission("logs.view");
  const rows = await listActivity(200);
  return (
    <div>
      <PageTitle title="Nhật ký hoạt động" hint="200 thao tác quản trị gần nhất, để theo dõi ai đã làm gì." />
      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr><th className="px-4 py-3 font-medium">Thời gian</th><th className="px-4 py-3 font-medium">Người thực hiện</th><th className="px-4 py-3 font-medium">Thao tác</th><th className="px-4 py-3 font-medium">Đối tượng</th><th className="px-4 py-3 font-medium">IP</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-muted">Chưa có nhật ký nào.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap">{fmt.format(r.createdAt)}</td>
                <td className="px-4 py-2.5">{r.userName}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-2.5 text-muted">{[r.targetType, r.targetId?.slice(0, 8), r.detail].filter(Boolean).join(" · ")}</td>
                <td className="px-4 py-2.5 text-muted">{r.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

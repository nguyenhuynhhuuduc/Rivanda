import Link from "next/link";
import { adminBtn, adminBtnGhost, Card, PageTitle } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth";
import { listReports } from "@/lib/community";
import { formatDate } from "@/lib/format";
import { handleReportAction } from "../discovery-actions";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requirePermission("report.handle");
  const showAll = (await searchParams).all === "1";
  const reports = await listReports(showAll ? "all" : "open");
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Báo cáo vi phạm" hint="Người dùng báo cáo ảnh hoặc bình luận. Xem nội dung rồi ẩn/xóa ở trang Bình luận hoặc Ảnh, sau đó đánh dấu đã xử lý." />
        <Link href={showAll ? "/admin/reports" : "/admin/reports?all=1"} className={adminBtnGhost}>{showAll ? "Chỉ chưa xử lý" : "Xem tất cả"}</Link>
      </div>
      <div className="space-y-3">
        {reports.length === 0 && <p className="text-muted">Không có báo cáo nào.</p>}
        {reports.map((r) => (
          <Card key={r.id}>
            <p className="text-sm">
              <span className="rounded bg-card px-2 py-0.5 text-xs">{r.targetType === "photo" ? "Ảnh" : "Bình luận"}</span>
              <span className="ml-2 text-muted">{r.reporterName} · {formatDate(r.createdAt)}</span>
              <span className={`ml-2 rounded px-2 py-0.5 text-xs ${r.status === "open" ? "bg-warning/10 text-warning" : "bg-card text-muted"}`}>
                {r.status === "open" ? "Chưa xử lý" : r.status === "resolved" ? "Đã xử lý" : "Bỏ qua"}
              </span>
            </p>
            <p className="mt-2 font-medium">Lý do: {r.reason}</p>
            {r.preview && <p className="mt-1 line-clamp-3 text-sm text-muted">Nội dung: {r.preview}</p>}
            <div className="mt-3 flex flex-wrap gap-3">
              {r.photoId && <Link href={`/journeystory/photos/${r.photoId}`} target="_blank" className={adminBtnGhost}>Xem nội dung</Link>}
              {r.status === "open" && (
                <>
                  <form action={handleReportAction.bind(null, r.id, "resolved")}><button className={adminBtn}>Đã xử lý</button></form>
                  <form action={handleReportAction.bind(null, r.id, "dismissed")}><button className={adminBtnGhost}>Bỏ qua</button></form>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

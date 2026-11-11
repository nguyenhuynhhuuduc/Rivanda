import { ConfirmButton } from "@/components/ConfirmButton";
import { adminBtn, adminBtnDanger, adminInput, Card, Field, Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listStatuses, listTrips } from "@/lib/discovery";
import { formatDate } from "@/lib/format";
import { createStatusAction, deleteStatusAction } from "../discovery-actions";

export const dynamic = "force-dynamic";

export default async function AdminStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const [sp, trips, statuses] = await Promise.all([searchParams, listTrips(), listStatuses(50)]);

  return (
    <div>
      <PageTitle title="Nhật ký (status)" hint="Những dòng ngắn về hành trình, hiện ở đầu trang Discovery." />
      <Flash saved={sp.saved} error={sp.error} />

      <Card title="Đăng status mới">
        <form action={createStatusAction} className="space-y-4">
          <Field label="Nội dung (tối đa 1000 ký tự)">
            <textarea name="content" required maxLength={1000} rows={3} className={adminInput} />
          </Field>
          <Field label="Chuyến đi (không bắt buộc)">
            <select name="tripId" className={adminInput}>
              <option value="">Không thuộc chuyến nào</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
          <button className={adminBtn}>Đăng</button>
        </form>
      </Card>

      <div className="mt-6 space-y-3">
        {statuses.length === 0 && <p className="text-muted">Chưa có status nào.</p>}
        {statuses.map((s) => (
          <Card key={s.id}>
            <p className="whitespace-pre-wrap">{s.content}</p>
            <p className="mt-2 text-xs text-muted">{formatDate(s.createdAt)}{s.tripTitle ? ` · ${s.tripTitle}` : ""}</p>
            <form action={deleteStatusAction.bind(null, s.id)} className="mt-3">
              <ConfirmButton message="Xóa status này?" className={adminBtnDanger}>Xóa</ConfirmButton>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}

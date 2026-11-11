import { ConfirmButton } from "@/components/ConfirmButton";
import { adminBtn, adminBtnDanger, adminInput, Card, Field, Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listPhotos, listTrips } from "@/lib/discovery";
import { toDateInput } from "@/lib/format";
import { createTripAction, deleteTripAction, updateTripAction } from "../discovery-actions";

export const dynamic = "force-dynamic";

export default async function AdminTripsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const [sp, trips] = await Promise.all([searchParams, listTrips()]);
  const photosByTrip = await Promise.all(trips.map((t) => listPhotos({ tripId: t.id, limit: 50 }).then((r) => r.photos)));

  return (
    <div>
      <PageTitle title="Hành trình" hint="Gom ảnh, album và nhật ký theo từng chuyến đi. Hành trình đánh dấu “Nổi bật” sẽ lên trang chủ." />
      <Flash saved={sp.saved} error={sp.error} />

      <Card title="Thêm hành trình">
        <form action={createTripAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên hành trình"><input name="title" required maxLength={160} className={adminInput} /></Field>
          <Field label="Địa điểm"><input name="locationName" maxLength={160} className={adminInput} /></Field>
          <Field label="Từ ngày"><input type="date" name="startDate" className={adminInput} /></Field>
          <Field label="Đến ngày"><input type="date" name="endDate" className={adminInput} /></Field>
          <div className="sm:col-span-2"><Field label="Giới thiệu"><textarea name="description" rows={3} maxLength={2000} className={adminInput} /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isFeatured" /> Đánh dấu nổi bật</label>
          <div className="sm:col-span-2"><button className={adminBtn}>Thêm hành trình</button></div>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {trips.length === 0 && <p className="text-muted">Chưa có hành trình nào.</p>}
        {trips.map((t, i) => (
          <Card key={t.id}>
            <form action={updateTripAction.bind(null, t.id)} className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên hành trình"><input name="title" defaultValue={t.title} required maxLength={160} className={adminInput} /></Field>
              <Field label="Địa điểm"><input name="locationName" defaultValue={t.locationName ?? ""} maxLength={160} className={adminInput} /></Field>
              <Field label="Từ ngày"><input type="date" name="startDate" defaultValue={toDateInput(t.startDate)} className={adminInput} /></Field>
              <Field label="Đến ngày"><input type="date" name="endDate" defaultValue={toDateInput(t.endDate)} className={adminInput} /></Field>
              <div className="sm:col-span-2"><Field label="Giới thiệu"><textarea name="description" defaultValue={t.description ?? ""} rows={2} maxLength={2000} className={adminInput} /></Field></div>
              <Field label="Ảnh bìa (mặc định: ảnh mới nhất)">
                <select name="coverPhotoId" defaultValue={t.coverPhotoId ?? ""} className={adminInput}>
                  <option value="">Tự chọn</option>
                  {photosByTrip[i].map((p) => <option key={p.id} value={p.id}>{p.title || p.caption || p.id.slice(0, 8)}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="isFeatured" defaultChecked={t.isFeatured} /> Nổi bật</label>
              <div className="flex items-center justify-between sm:col-span-2">
                <button className={adminBtn}>Lưu</button>
                <span className="text-sm text-muted">{t.photoCount} ảnh đã đăng</span>
              </div>
            </form>
            <form action={deleteTripAction.bind(null, t.id)} className="mt-3">
              <ConfirmButton message="Xóa hành trình này? Ảnh thuộc hành trình vẫn được giữ lại." className={adminBtnDanger}>Xóa hành trình</ConfirmButton>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}

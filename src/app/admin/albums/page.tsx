import { ConfirmButton } from "@/components/ConfirmButton";
import { adminBtn, adminBtnDanger, adminInput, Card, Field, Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listAlbums, listTrips } from "@/lib/discovery";
import { createAlbumAction, deleteAlbumAction, updateAlbumAction } from "../discovery-actions";

export const dynamic = "force-dynamic";

export default async function AdminAlbumsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const [sp, albums, trips] = await Promise.all([searchParams, listAlbums(false), listTrips()]);
  const tripSelect = (value?: string | null) => (
    <select name="tripId" defaultValue={value ?? ""} className={adminInput}>
      <option value="">Không thuộc hành trình nào</option>
      {trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  );

  return (
    <div>
      <PageTitle title="Album" hint="Bộ ảnh theo chủ đề. Gán ảnh vào album ở trang Ảnh Discovery (cột Album của từng ảnh)." />
      <Flash saved={sp.saved} error={sp.error} />

      <Card title="Tạo album">
        <form action={createAlbumAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên album"><input name="title" required maxLength={160} className={adminInput} /></Field>
          <Field label="Thuộc hành trình">{tripSelect()}</Field>
          <div className="sm:col-span-2"><Field label="Mô tả"><textarea name="description" rows={2} maxLength={2000} className={adminInput} /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked /> Hiển thị công khai</label>
          <div className="sm:col-span-2"><button className={adminBtn}>Tạo album</button></div>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {albums.length === 0 && <p className="text-muted">Chưa có album nào.</p>}
        {albums.map((a) => (
          <Card key={a.id}>
            <form action={updateAlbumAction.bind(null, a.id)} className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên album"><input name="title" defaultValue={a.title} required maxLength={160} className={adminInput} /></Field>
              <Field label="Thuộc hành trình">{tripSelect(a.tripId)}</Field>
              <div className="sm:col-span-2"><Field label="Mô tả"><textarea name="description" defaultValue={a.description ?? ""} rows={2} maxLength={2000} className={adminInput} /></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked={a.isPublished} /> Công khai</label>
              <div className="flex items-center gap-3 sm:col-span-2"><button className={adminBtn}>Lưu</button><span className="text-sm text-muted">{a.photoCount} ảnh đã đăng</span></div>
            </form>
            <form action={deleteAlbumAction.bind(null, a.id)} className="mt-3">
              <ConfirmButton message="Xóa album này? Ảnh trong album vẫn được giữ lại." className={adminBtnDanger}>Xóa album</ConfirmButton>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}

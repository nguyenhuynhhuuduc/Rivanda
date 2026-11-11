import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { adminBtn, adminBtnDanger, adminInput, AdminPagination, Card, Field, Flash, PageTitle } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth";
import {
  getPhotoAlbumIds, listAlbums, listAllLocationNames, listPhotos, listTrips, PHOTO_STATUS_LABEL, thumbOf, type PhotoStatus,
} from "@/lib/discovery";
import { toDateInput } from "@/lib/format";
import { getPhotoTags } from "@/lib/tags";
import { deletePhotoAction, updatePhotoAction, uploadPhotosAction } from "../discovery-actions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const STATUSES = Object.keys(PHOTO_STATUS_LABEL) as PhotoStatus[];

export default async function AdminPhotosPage({
  searchParams,
}: { searchParams: Promise<{ saved?: string; error?: string; page?: string; status?: string }> }) {
  await requirePermission("content.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = STATUSES.includes(sp.status as PhotoStatus) ? (sp.status as PhotoStatus) : undefined;

  const [trips, albums, locations, { photos, total }] = await Promise.all([
    listTrips(), listAlbums(false), listAllLocationNames(),
    listPhotos({ statuses: status ? [status] : undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);
  const extra = await Promise.all(photos.map(async (p) => ({ tags: await getPhotoTags(p.id), albumIds: await getPhotoAlbumIds(p.id) })));

  const tripOptions = (<><option value="">Không thuộc hành trình nào</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</>);
  const tab = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-navy text-white" : "bg-surface ring-1 ring-line hover:bg-card"}`;

  return (
    <div>
      <PageTitle title="Ảnh Discovery" hint="Đăng và quản lý ảnh. Ảnh ở trạng thái “Đã đăng” mới hiện với người xem." />
      <Flash saved={sp.saved} error={sp.error} />
      <datalist id="locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>

      <Card title="Đăng ảnh mới">
        <form action={uploadPhotosAction} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Chọn ảnh (JPG, PNG, WebP; tối đa 8MB mỗi ảnh, 20 ảnh mỗi lần)">
              <input type="file" name="images" multiple required accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white hover:file:bg-navy-deep" />
            </Field>
          </div>
          <Field label="Tiêu đề (áp dụng cho tất cả ảnh vừa chọn)"><input name="title" maxLength={160} className={adminInput} /></Field>
          <Field label="Mô tả"><input name="caption" maxLength={500} className={adminInput} /></Field>
          <Field label="Hành trình"><select name="tripId" className={adminInput}>{tripOptions}</select></Field>
          <Field label="Album">
            <select name="albumId" className={adminInput}><option value="">Không thêm vào album</option>{albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>
          </Field>
          <Field label="Địa điểm"><input name="locationName" list="locations" maxLength={160} className={adminInput} /></Field>
          <Field label="Ngày chụp"><input type="date" name="takenAt" className={adminInput} /></Field>
          <div className="sm:col-span-2"><Field label="Thẻ (cách nhau bằng dấu phẩy)"><input name="tags" maxLength={200} placeholder="biển, hoàng hôn, Đà Lạt" className={adminInput} /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublished" defaultChecked /> Đăng công khai ngay</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowDownload" /> Cho thành viên tải ảnh gốc</label>
          <div className="sm:col-span-2"><button className={adminBtn}>Tải lên</button></div>
        </form>
      </Card>

      <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
        <h2 className="mr-3 font-semibold">Ảnh ({total})</h2>
        <Link href="/admin/photos" className={tab(!status)}>Tất cả</Link>
        {STATUSES.map((st) => <Link key={st} href={`/admin/photos?status=${st}`} className={tab(status === st)}>{PHOTO_STATUS_LABEL[st]}</Link>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {photos.length === 0 && <p className="text-muted">Không có ảnh nào.</p>}
        {photos.map((p, i) => (
          <Card key={p.id}>
            <div className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbOf(p)} alt="" loading="lazy" className="h-28 w-28 shrink-0 rounded-lg object-cover" />
              <form action={updatePhotoAction.bind(null, p.id)} className="min-w-0 flex-1 space-y-2.5">
                <input name="title" defaultValue={p.title ?? ""} maxLength={160} placeholder="Tiêu đề" className={adminInput} />
                <input name="caption" defaultValue={p.caption ?? ""} maxLength={500} placeholder="Mô tả" className={adminInput} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="locationName" list="locations" defaultValue={p.locationName ?? ""} maxLength={160} placeholder="Địa điểm" className={adminInput} />
                  <input type="date" name="takenAt" defaultValue={toDateInput(p.takenAt)} className={adminInput} />
                </div>
                <select name="tripId" defaultValue={p.tripId ?? ""} className={adminInput}>{tripOptions}</select>
                <input name="tags" defaultValue={extra[i].tags.map((t) => t.name).join(", ")} maxLength={200} placeholder="Thẻ, cách nhau bằng dấu phẩy" className={adminInput} />
                <select name="albumIds" multiple defaultValue={extra[i].albumIds} size={Math.min(3, Math.max(2, albums.length))} aria-label="Album" className={adminInput}>
                  {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
                <select name="status" defaultValue={p.status} className={adminInput}>
                  {STATUSES.map((st) => <option key={st} value={st}>{PHOTO_STATUS_LABEL[st]}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowDownload" defaultChecked={p.allowDownload} /> Cho tải ảnh gốc</label>
                <div className="flex items-center gap-3">
                  <button className={adminBtn}>Lưu</button>
                  <span className="text-xs text-muted">{p.likes} thích · {p.saves} lưu · {p.comments} bình luận · {p.uploaderName}</span>
                </div>
              </form>
            </div>
            <form action={deletePhotoAction.bind(null, p.id)} className="mt-3">
              <ConfirmButton message="Xóa ảnh này vĩnh viễn?" className={adminBtnDanger}>Xóa ảnh</ConfirmButton>
            </form>
          </Card>
        ))}
      </div>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        hrefFor={(n) => `/admin/photos?${status ? `status=${status}&` : ""}page=${n}`} />
    </div>
  );
}

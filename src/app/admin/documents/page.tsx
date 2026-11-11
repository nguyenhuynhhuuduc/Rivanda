import { ConfirmButton } from "@/components/ConfirmButton";
import { adminBtn, adminBtnDanger, adminInput, Card, Field, Flash, PageTitle } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { ACCESS_LABEL, KIND_LABEL, listDocuments, type DocAccess, type DocKind } from "@/lib/documents";
import { formatBytes, formatDate } from "@/lib/format";
import { deleteDocumentAction, updateDocumentAction, uploadDocumentAction } from "../document-actions";

export const dynamic = "force-dynamic";

const KindSelect = ({ value }: { value?: DocKind }) => (
  <select name="kind" defaultValue={value ?? "document"} aria-label="Loại" className={adminInput}>
    {(Object.keys(KIND_LABEL) as DocKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
  </select>
);
const AccessSelect = ({ value }: { value?: DocAccess }) => (
  <select name="access" defaultValue={value ?? "public"} aria-label="Quyền truy cập" className={adminInput}>
    {(Object.keys(ACCESS_LABEL) as DocAccess[]).map((k) => <option key={k} value={k}>{ACCESS_LABEL[k]}</option>)}
  </select>
);

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const [sp, { docs }] = await Promise.all([searchParams, listDocuments({ onlyPublished: false })]);

  return (
    <div>
      <PageTitle title="Tài liệu và dự án" hint="File để mọi người tải. Chọn quyền truy cập: công khai, chỉ thành viên đăng nhập, hoặc riêng tư (chỉ admin thấy)." />
      <Flash saved={sp.saved} error={sp.error} />

      <Card title="Đăng file mới">
        <form action={uploadDocumentAction} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Tiêu đề"><input name="title" required maxLength={200} className={adminInput} /></Field></div>
          <div className="sm:col-span-2"><Field label="Mô tả ngắn"><textarea name="description" rows={2} maxLength={1000} className={adminInput} /></Field></div>
          <Field label="Loại"><KindSelect /></Field>
          <Field label="Quyền truy cập"><AccessSelect /></Field>
          <Field label="Danh mục (không bắt buộc)"><input name="category" maxLength={60} className={adminInput} /></Field>
          <Field label="File (PDF, Word, Excel, PowerPoint, zip, txt; tối đa 20MB)">
            <input type="file" name="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white hover:file:bg-navy-deep" />
          </Field>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="isPublished" defaultChecked /> Hiển thị</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="canDownload" defaultChecked /> Cho tải về</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" /> Nổi bật (lên trang chủ)</label>
          </div>
          <div className="sm:col-span-2"><button className={adminBtn}>Đăng file</button></div>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {docs.length === 0 && <p className="text-muted">Chưa có file nào.</p>}
        {docs.map((d) => (
          <Card key={d.id}>
            <form action={updateDocumentAction.bind(null, d.id)} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><input name="title" defaultValue={d.title} required maxLength={200} aria-label="Tiêu đề" className={adminInput} /></div>
              <div className="sm:col-span-2"><textarea name="description" defaultValue={d.description ?? ""} rows={2} maxLength={1000} aria-label="Mô tả" className={adminInput} /></div>
              <KindSelect value={d.kind} />
              <AccessSelect value={d.access} />
              <input name="category" defaultValue={d.category ?? ""} maxLength={60} placeholder="Danh mục" aria-label="Danh mục" className={adminInput} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="isPublished" defaultChecked={d.isPublished} /> Hiển thị</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="canDownload" defaultChecked={d.canDownload} /> Cho tải</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" defaultChecked={d.isFeatured} /> Nổi bật</label>
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <button className={adminBtn}>Lưu</button>
                <span className="text-xs text-muted">{d.fileExt.toUpperCase()} · {formatBytes(d.fileSize)} · {formatDate(d.createdAt)} · {d.downloadCount} lượt tải</span>
              </div>
            </form>
            <form action={deleteDocumentAction.bind(null, d.id)} className="mt-3">
              <ConfirmButton message="Xóa file này vĩnh viễn?" className={adminBtnDanger}>Xóa file</ConfirmButton>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}

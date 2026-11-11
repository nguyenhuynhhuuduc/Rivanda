import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { blogFoundationReady, listBlogTopics } from "@/lib/blog-read";
import { PageTitle, Flash, Card, adminInput, adminBtn, adminBtnDanger } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteTopicAction, saveTopicAction } from "../actions";
export const dynamic = "force-dynamic";
export default async function Topics({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin(); const sp = await searchParams;
  if (!await blogFoundationReady()) return <p role="status">Chưa quản lý được chủ đề: migration 006 chưa sẵn sàng.</p>;
  const topics = await listBlogTopics(true);
  return <div><PageTitle title="Chủ đề Blog" hint="Đổi tên không đổi slug. Xóa mềm chủ đề không xóa bài; slug cũ được giữ." /><Link href="/admin/blog" className="text-link underline">← Blog</Link><Flash saved={sp.saved} error={sp.error} />
    <Card title="Thêm chủ đề" className="my-6"><form action={saveTopicAction} className="grid gap-4 sm:grid-cols-2">
      <label>Tên<input name="name" required maxLength={100} className={adminInput} /></label><label>Slug ổn định (để trống: tạo từ tên)<input name="slug" maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={adminInput} /></label>
      <label>Thứ tự<input name="sortOrder" type="number" min={0} max={10000} defaultValue={0} required className={adminInput} /></label><label className="self-center"><input name="isVisible" type="checkbox" defaultChecked /> Hiển thị công khai</label><button className={adminBtn}>Thêm chủ đề</button>
    </form></Card>
    <div className="space-y-5">{topics.map((t) => <Card key={t.id}><form action={saveTopicAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={t.id} /><label>Tên<input name="name" defaultValue={t.name} required maxLength={100} className={adminInput} /></label><label>Slug (giữ nguyên)<input value={t.slug} readOnly className={adminInput} /></label>
      <label>Thứ tự<input name="sortOrder" type="number" min={0} max={10000} required defaultValue={t.sortOrder} className={adminInput} /></label><label className="self-center"><input name="isVisible" type="checkbox" defaultChecked={t.isVisible} /> Hiển thị công khai</label><button className={adminBtn}>Lưu chủ đề</button>
    </form><form action={deleteTopicAction} className="mt-4"><input type="hidden" name="id" value={t.id} /><ConfirmButton message="Xóa mềm chủ đề này? Bài viết và slug vẫn được bảo toàn." className={adminBtnDanger}>Xóa chủ đề</ConfirmButton></form></Card>)}</div>
  </div>;
}

import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { btnOutline, btnPrimary, inputCls } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { listPhotos, PHOTO_STATUS_LABEL, thumbOf } from "@/lib/discovery";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { deleteOwnPhotoAction, submitPhotoAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nội dung của tôi" };

export default async function MyContentPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser("/account/content");
  const [sp, { photos }] = await Promise.all([searchParams, listPhotos({ uploaderId: user.id, limit: 100 })]);
  const canSubmit = can(user.role, "content.submit");

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-2xl font-bold">Nội dung của tôi</h2>
        {sp.ok && <p role="status" className="mt-4 rounded-md bg-card px-4 py-3 text-sm">{sp.ok}</p>}
        {sp.error && <p role="alert" className="mt-4 rounded-md bg-danger/100/10 px-4 py-3 text-sm text-danger">{sp.error}</p>}
      </div>

      {canSubmit && (
        <section className="max-w-xl rounded-md border border-line p-6">
          <h3 className="font-display text-xl font-bold">Gửi ảnh để chờ duyệt</h3>
          <p className="mt-1 text-sm text-muted">Ảnh chỉ hiện công khai sau khi người kiểm duyệt chấp nhận.</p>
          <form action={submitPhotoAction} className="mt-5 space-y-4">
            <input type="file" name="images" multiple required accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh" className="block w-full text-sm" />
            <input name="title" maxLength={160} placeholder="Tiêu đề (áp dụng cho các ảnh vừa chọn)" className={inputCls} />
            <textarea name="caption" rows={2} maxLength={500} placeholder="Mô tả" className={inputCls} />
            <input name="locationName" maxLength={160} placeholder="Địa điểm" className={inputCls} />
            <input name="tags" maxLength={200} placeholder="Thẻ, cách nhau bằng dấu phẩy" className={inputCls} />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="rights" required className="mt-1" /> Tôi xác nhận đây là ảnh của tôi hoặc tôi có quyền sử dụng, và đồng ý với <Link href="/terms" className="text-link underline">điều khoản</Link>.</label>
            <button className={btnPrimary}>Gửi ảnh</button>
          </form>
        </section>
      )}

      <section>
        <h3 className="mb-4 font-display text-xl font-bold">Ảnh đã gửi ({photos.length})</h3>
        {photos.length === 0 ? <p className="text-muted">Chưa có ảnh nào.</p> : (
          <ul className="space-y-4">
            {photos.map((p) => (
              <li key={p.id} className="flex gap-4 rounded-md border border-line p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbOf(p)} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{p.title || p.caption || "(không có chú thích)"}</p>
                  <p className="mt-1 text-muted">{PHOTO_STATUS_LABEL[p.status]} · {formatDate(p.createdAt)}</p>
                  {p.status === "rejected" && p.reviewNote && <p className="mt-1 text-danger">Lý do: {p.reviewNote}</p>}
                  <div className="mt-2 flex gap-3">
                    {p.status === "published" && <Link href={`/journeystory/photos/${p.id}`} className={`${btnOutline} !py-1.5`}>Xem</Link>}
                    <form action={deleteOwnPhotoAction.bind(null, p.id)}>
                      <ConfirmButton message="Xóa ảnh này vĩnh viễn?" className="text-muted hover:text-danger">Xóa</ConfirmButton>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

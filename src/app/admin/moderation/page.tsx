import Link from "next/link";
import { adminBtn, adminBtnDanger, adminInput, Card, Flash, PageTitle } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth";
import { listPhotos, mediumOf } from "@/lib/discovery";
import { formatDate } from "@/lib/format";
import { getPhotoTags } from "@/lib/tags";
import { reviewPhotoAction } from "../discovery-actions";

export const dynamic = "force-dynamic";

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requirePermission("moderation.review");
  const [sp, { photos }] = await Promise.all([searchParams, listPhotos({ statuses: ["pending"], limit: 50 })]);
  const tags = await Promise.all(photos.map((p) => getPhotoTags(p.id)));

  return (
    <div>
      <PageTitle title="Kiểm duyệt ảnh" hint="Ảnh do cộng tác viên gửi. Duyệt thì ảnh hiện công khai; từ chối thì phải ghi lý do để người gửi biết." />
      <Flash saved={sp.saved} error={sp.error} />
      <div className="space-y-5">
        {photos.length === 0 && <p className="text-muted">Không có ảnh nào đang chờ duyệt.</p>}
        {photos.map((p, i) => (
          <Card key={p.id}>
            <div className="grid gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
              <a href={mediumOf(p)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediumOf(p)} alt="" loading="lazy" className="max-h-72 w-full rounded-lg object-cover" />
              </a>
              <div className="min-w-0 text-sm">
                <p className="font-medium">{p.title || p.caption || "(không có tiêu đề)"}</p>
                {p.title && p.caption && <p className="mt-1 text-muted">{p.caption}</p>}
                <p className="mt-2 text-muted">
                  Gửi bởi <Link href={`/profile/${p.uploaderId}`} target="_blank" className="underline">{p.uploaderName}</Link> · {formatDate(p.createdAt)}
                  {p.locationName ? ` · ${p.locationName}` : ""}
                </p>
                {tags[i].length > 0 && <p className="mt-1 text-muted">Thẻ: {tags[i].map((t) => t.name).join(", ")}</p>}

                <div className="mt-4 flex flex-wrap items-start gap-3">
                  <form action={reviewPhotoAction.bind(null, p.id, "approve")}><button className={adminBtn}>Duyệt và đăng</button></form>
                  <form action={reviewPhotoAction.bind(null, p.id, "reject")} className="flex min-w-0 basis-full flex-wrap gap-2 sm:flex-1 sm:basis-auto">
                    <input name="note" maxLength={500} placeholder="Lý do từ chối (bắt buộc)" aria-label="Lý do từ chối" className={adminInput} />
                    <button className={adminBtnDanger}>Từ chối</button>
                  </form>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

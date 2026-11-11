import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { thumbOf, listPhotos, PUBLIC } from "@/lib/discovery";
import { btnOutline, btnPrimary, Empty, inputCls } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { getCollection } from "@/lib/community";
import { deleteCollectionAction, removeFromCollectionAction, updateCollectionAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  const user = await requireUser(`/account/collections/${id}`);
  const col = await getCollection(id);
  if (!col || col.userId !== user.id) notFound();
  const [sp, { photos }] = await Promise.all([searchParams, listPhotos({ statuses: PUBLIC, collectionId: id, limit: 100 })]);

  return (
    <div>
      <Link href="/account/collections" className="text-sm text-muted hover:text-fg">← Bộ sưu tập</Link>
      <h2 className="mt-4 font-display text-2xl font-bold">{col.name}</h2>
      {sp.ok && <p role="status" className="mt-4 rounded-md bg-card px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-danger/100/10 px-4 py-3 text-sm text-danger">{sp.error}</p>}

      <form action={updateCollectionAction.bind(null, id)} className="mt-5 flex max-w-xl flex-wrap items-center gap-3">
        <input name="name" defaultValue={col.name} required maxLength={80} aria-label="Tên bộ sưu tập" className={`${inputCls} flex-1`} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPublic" defaultChecked={col.isPublic} /> Công khai</label>
        <button className={btnPrimary}>Lưu</button>
      </form>
      <form action={deleteCollectionAction.bind(null, id)} className="mt-3">
        <ConfirmButton message="Xóa bộ sưu tập này? Ảnh gốc không bị xóa." className={btnOutline}>Xóa bộ sưu tập</ConfirmButton>
      </form>

      <div className="mt-8">
        {photos.length === 0 ? <Empty>Bộ sưu tập này chưa có ảnh.</Empty> : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id}>
                <Link href={`/journeystory/photos/${p.id}`} className="block overflow-hidden rounded-md bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbOf(p)} alt={p.title || p.caption || "Ảnh"} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </Link>
                <form action={removeFromCollectionAction.bind(null, id, p.id)} className="mt-1">
                  <button className="text-xs text-muted hover:text-danger">Bỏ khỏi bộ sưu tập</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

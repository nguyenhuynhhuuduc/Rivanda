import Link from "next/link";
import { btnPrimary, Empty, inputCls } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { listCollections } from "@/lib/community";
import { createCollectionAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bộ sưu tập" };

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser("/account/collections");
  const [sp, cols] = await Promise.all([searchParams, listCollections(user.id)]);
  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Bộ sưu tập</h2>
      {sp.ok && <p role="status" className="mt-4 rounded-md bg-card px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-danger/100/10 px-4 py-3 text-sm text-danger">{sp.error}</p>}

      <form action={createCollectionAction} className="mt-5 flex max-w-md gap-3">
        <label htmlFor="name" className="sr-only">Tên bộ sưu tập</label>
        <input id="name" name="name" required maxLength={80} placeholder="Tên bộ sưu tập mới" className={inputCls} />
        <button className={`${btnPrimary} shrink-0`}>Tạo</button>
      </form>

      <div className="mt-8">
        {cols.length === 0 ? <Empty>Bạn chưa có bộ sưu tập nào. Mở một ảnh và chọn “Thêm vào bộ sưu tập”.</Empty> : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cols.map((c) => (
              <li key={c.id}>
                <Link href={`/account/collections/${c.id}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden rounded-md bg-card">
                    {c.coverFile && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/uploads/${c.coverFile}`} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    )}
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold">{c.name}</h3>
                  <p className="text-sm text-muted">{c.photoCount} ảnh · {c.isPublic ? "Công khai" : "Riêng tư"}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

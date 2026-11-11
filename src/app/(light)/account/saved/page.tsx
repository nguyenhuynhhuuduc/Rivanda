import Link from "next/link";
import { DocRow } from "@/components/site/DocRow";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { Empty } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { listBookmarkedIds } from "@/lib/community";
import { listPhotos, PUBLIC } from "@/lib/discovery";
import { canAccessDocument, getDocument } from "@/lib/documents";
import { getPostById } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đã lưu" };

export default async function SavedPage() {
  const user = await requireUser("/account/saved");
  const [{ photos, total }, docIds, postIds] = await Promise.all([
    listPhotos({ statuses: PUBLIC, savedBy: user.id, limit: 60 }),
    listBookmarkedIds(user.id, "document"),
    listBookmarkedIds(user.id, "post"),
  ]);
  const docs = (await Promise.all(docIds.map(getDocument))).filter((d): d is NonNullable<typeof d> => !!d && canAccessDocument(d, user));
  const posts = (await Promise.all(postIds.map(getPostById))).filter((p): p is NonNullable<typeof p> => !!p && p.status === "published");

  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-5 font-display text-2xl font-bold">Ảnh đã lưu ({total})</h2>
        {photos.length ? <PhotoGrid photos={photos} /> : <Empty>Bạn chưa lưu ảnh nào. Vào <Link href="/journeystory" className="text-link underline">JourneyStory</Link> và bấm “Lưu ảnh”.</Empty>}
      </section>
      <section>
        <h2 className="mb-5 font-display text-2xl font-bold">Tài liệu đã lưu ({docs.length})</h2>
        {docs.length ? <ul className="space-y-3">{docs.map((d) => <DocRow key={d.id} doc={d} />)}</ul> : <Empty>Chưa lưu tài liệu nào.</Empty>}
      </section>
      <section>
        <h2 className="mb-5 font-display text-2xl font-bold">Bài viết đã lưu ({posts.length})</h2>
        {posts.length ? (
          <ul className="divide-y divide-line">
            {posts.map((p) => (
              <li key={p.id} className="py-3">
                <Link href={p.type === "hacking" ? `/cyber-lab/articles/${p.slug}` : `/documents/blog/${p.slug}`} className="font-medium hover:text-link">{p.title}</Link>
                <span className="ml-2 text-xs text-muted">{p.type === "hacking" ? "Cyber Lab" : "Blog"}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>Chưa lưu bài viết nào.</Empty>}
      </section>
    </div>
  );
}

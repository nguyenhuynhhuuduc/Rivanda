import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCommentsByUser } from "@/lib/discovery";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bình luận của tôi" };

export default async function MyCommentsPage() {
  const user = await requireUser("/account/comments");
  const list = await listCommentsByUser(user.id);
  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Bình luận của tôi</h2>
      {list.length === 0 ? <p className="mt-6 text-muted">Bạn chưa bình luận nào.</p> : (
        <ul className="mt-6 divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className="py-4">
              <p className="whitespace-pre-wrap break-words">{c.content}</p>
              <p className="mt-1 text-xs text-muted">
                {formatDate(c.createdAt)} · tại ảnh{" "}
                <Link href={`/journeystory/photos/${c.photoId}#comments`} className="text-link hover:underline">{c.photoCaption || "(không có chú thích)"}</Link>
                {c.isHidden && <span className="ml-2 text-warning">(đã bị ẩn)</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

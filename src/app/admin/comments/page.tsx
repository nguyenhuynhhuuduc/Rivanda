import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { adminBtnDanger, adminBtnGhost, Card, PageTitle } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth";
import { listRecentComments } from "@/lib/discovery";
import { formatDate } from "@/lib/format";
import { deleteCommentAdminAction, setCommentHiddenAction } from "../discovery-actions";

export const dynamic = "force-dynamic";

export default async function AdminCommentsPage() {
  await requirePermission("comment.moderate");
  const comments = await listRecentComments(100);

  return (
    <div>
      <PageTitle title="Bình luận" hint="100 bình luận mới nhất. Bình luận bị ẩn sẽ không hiện với người xem." />
      <div className="space-y-3">
        {comments.length === 0 && <p className="text-muted">Chưa có bình luận nào.</p>}
        {comments.map((c) => (
          <Card key={c.id} className={c.isHidden ? "opacity-70" : ""}>
            <p className="text-sm">
              <span className="font-medium">{c.authorName}</span>
              <span className="ml-2 text-muted">{formatDate(c.createdAt)}</span>
              {c.isHidden && <span className="ml-2 rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">Đang ẩn</span>}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words">{c.content}</p>
            <p className="mt-2 text-xs text-muted">
              Trong ảnh:{" "}
              <Link href={`/journeystory/photos/${c.photoId}`} target="_blank" className="underline">
                {c.photoCaption || "(không có chú thích)"}
              </Link>
            </p>
            <div className="mt-3 flex gap-3">
              <form action={setCommentHiddenAction.bind(null, c.id, !c.isHidden)}>
                <button className={adminBtnGhost}>{c.isHidden ? "Hiện lại" : "Ẩn"}</button>
              </form>
              <form action={deleteCommentAdminAction.bind(null, c.id)}>
                <ConfirmButton message="Xóa bình luận này vĩnh viễn?" className={adminBtnDanger}>Xóa</ConfirmButton>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

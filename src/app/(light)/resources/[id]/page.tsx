import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookmarkIcon, DownloadIcon } from "@/components/icons";
import { Container, btnOutline, btnPrimary, PageHeading } from "@/components/ui/kit";
import { getCurrentUser } from "@/lib/auth";
import { isBookmarked } from "@/lib/community";
import { ACCESS_LABEL, canAccessDocument, getDocument, KIND_LABEL } from "@/lib/documents";
import { formatBytes, formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { toggleDocBookmarkAction } from "@/app/(light)/documents/actions";

export const dynamic = "force-dynamic";
const ID_RE = /^[a-f0-9-]{36}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!ID_RE.test(id)) return { title: "Tài liệu", robots: { index: false, follow: false } };
  const [doc, user] = await Promise.all([getDocument(id), getCurrentUser()]);
  // Cùng chính sách với page: metadata công khai của tài liệu members được giữ;
  // private/nháp chỉ được tiết lộ cho chủ sở hữu hoặc Admin.
  if (!doc || (!canAccessDocument(doc, user) && !(doc.isPublished && doc.access !== "private"))) {
    return { title: "Tài liệu", robots: { index: false, follow: false } };
  }
  return {
    title: doc.title,
    description: doc.description ?? undefined,
    alternates: { canonical: `/resources/${id}` },
    ...(!doc.isPublished || doc.access !== "public" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) notFound();
  const [doc, user] = await Promise.all([getDocument(id), getCurrentUser()]);
  if (!doc) notFound();

  const allowed = canAccessDocument(doc, user);
  // Tài liệu riêng tư hoặc chưa đăng: ẩn hoàn toàn với người không có quyền
  const publicInfo = doc.isPublished && doc.access !== "private";
  if (!allowed && !publicInfo) notFound();

  const owner = !!user && (user.id === doc.uploaderId || can(user.role, "content.manage"));
  const canDl = allowed && (doc.canDownload || owner);
  const canView = allowed && doc.fileExt === "pdf";
  const saved = user ? await isBookmarked(user.id, "document", id) : false;
  const loginHref = `/login?next=${encodeURIComponent(`/resources/${id}`)}`;

  return (
    <Container className="max-w-3xl py-14">
      <Link href="/resources/documents" className="text-sm text-muted hover:text-fg">← Tài liệu và tài nguyên</Link>
      <div className="mt-6"><PageHeading eyebrow={KIND_LABEL[doc.kind]} title={doc.title} subtitle={doc.description ?? undefined} /></div>

      <dl className="grid grid-cols-2 gap-5 rounded-md bg-card p-6 text-sm sm:grid-cols-4">
        <div><dt className="text-muted">Định dạng</dt><dd className="mt-1 font-medium">{doc.fileExt.toUpperCase()}</dd></div>
        <div><dt className="text-muted">Dung lượng</dt><dd className="mt-1 font-medium">{formatBytes(doc.fileSize)}</dd></div>
        <div><dt className="text-muted">Ngày đăng</dt><dd className="mt-1 font-medium">{formatDate(doc.createdAt)}</dd></div>
        <div><dt className="text-muted">Lượt tải</dt><dd className="mt-1 font-medium">{doc.downloadCount}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-muted">Quyền truy cập: {ACCESS_LABEL[doc.access]}{doc.category ? ` · ${doc.category}` : ""}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        {canDl && <a href={`/api/documents/${id}/download`} className={btnPrimary}><DownloadIcon className="h-4 w-4" /> Tải về</a>}
        {canView && <a href={`/api/documents/${id}/view`} target="_blank" rel="noopener noreferrer" className={btnOutline}>Xem trực tuyến</a>}
        {!allowed && doc.access === "members" && !user && <Link href={loginHref} className={btnPrimary}>Đăng nhập để tải</Link>}
        {allowed && !canDl && !canView && <p className="text-sm text-muted">Tài liệu này không cho tải về.</p>}
        {user ? (
          <form action={toggleDocBookmarkAction.bind(null, id)}>
            <button className={btnOutline} aria-pressed={saved}><BookmarkIcon filled={saved} className="h-4 w-4" /> {saved ? "Đã lưu" : "Lưu tài liệu"}</button>
          </form>
        ) : (
          <Link href={loginHref} className={btnOutline}><BookmarkIcon className="h-4 w-4" /> Lưu tài liệu</Link>
        )}
      </div>
    </Container>
  );
}

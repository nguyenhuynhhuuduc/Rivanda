import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BookmarkIcon, CommentIcon, DownloadIcon, FlagIcon, FolderIcon, HeartIcon } from "@/components/icons";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { ShareButton } from "@/components/site/ShareButton";
import { Avatar, btnPrimary, Chip, Container, inputCls, SectionHeading } from "@/components/ui/kit";
import { getCurrentUser } from "@/lib/auth";
import { collectionIdsWithPhoto, listCollections } from "@/lib/community";
import {
  getPhoto, listComments, listPhotoAlbums, mediumOf, PUBLIC, relatedPhotos, viewerFlags,
} from "@/lib/discovery";
import { formatDate } from "@/lib/format";
import { getPhotoTags } from "@/lib/tags";
import {
  addCommentAction, addToCollectionAction, deleteCommentAction, reportAction, toggleLikeAction, toggleSaveAction,
} from "@/app/(light)/discovery/actions";

export const dynamic = "force-dynamic";
const ID_RE = /^[a-f0-9-]{36}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = ID_RE.test(id) ? await getPhoto(id, PUBLIC) : null;
  if (!p) return { title: "Ảnh" };
  const title = p.title || p.caption?.slice(0, 60) || "Ảnh hành trình";
  return { title, alternates: { canonical: `/journeystory/photos/${id}` }, description: p.caption ?? undefined, openGraph: { title, images: [mediumOf(p)] } };
}

export default async function PhotoPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) notFound();
  const photo = await getPhoto(id, PUBLIC);
  if (!photo) notFound();

  const sp = await searchParams;
  const user = await getCurrentUser();
  const staff = user?.role === "admin" || user?.role === "moderator";
  const [comments, flags, tags, albums, related, cols, inCols] = await Promise.all([
    listComments(id, staff),
    user ? viewerFlags(user.id, id) : Promise.resolve({ liked: false, saved: false }),
    getPhotoTags(id),
    listPhotoAlbums(id),
    relatedPhotos(photo, 4),
    user ? listCollections(user.id) : Promise.resolve([]),
    user ? collectionIdsWithPhoto(user.id, id) : Promise.resolve([]),
  ]);

  const loginHref = `/login?next=${encodeURIComponent(`/journeystory/photos/${id}`)}`;
  const btn = "inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm transition";
  const idle = "border-line hover:border-fg/40 hover:bg-card/60";
  const on = "border-gold bg-gold/15 text-link";
  const title = photo.title || photo.caption || "Ảnh hành trình";

  return (
    <Container className="py-10">
      <Link href="/journeystory/explore" className="text-sm text-muted hover:text-fg">← Quay lại khám phá</Link>

      {sp.ok && <p role="status" className="mt-4 rounded-md bg-card px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-danger/100/10 px-4 py-3 text-sm text-danger">{sp.error}</p>}

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <figure className="overflow-hidden rounded-md bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediumOf(photo)} alt={title} width={photo.width ?? undefined} height={photo.height ?? undefined}
            className="mx-auto max-h-[82vh] w-full object-contain" />
        </figure>

        <aside>
          <h1 className="font-display text-3xl font-bold leading-snug">{title}</h1>
          {photo.title && photo.caption && <p className="mt-3 whitespace-pre-wrap leading-relaxed text-muted">{photo.caption}</p>}

          <dl className="mt-5 space-y-1.5 text-sm text-muted">
            {photo.tripTitle && <div>Hành trình: <Link href={`/journeystory/journeys/${photo.tripSlug}`} className="text-link hover:underline">{photo.tripTitle}</Link></div>}
            {photo.locationName && <div>Địa điểm: <Link href={`/journeystory/explore?location=${encodeURIComponent(photo.locationName)}`} className="text-link hover:underline">{photo.locationName}</Link></div>}
            <div>Ngày: {formatDate(photo.takenAt ?? photo.createdAt)}</div>
            {albums.length > 0 && <div>Album: {albums.map((a, i) => (<span key={a.id}>{i > 0 && ", "}<Link href={`/journeystory/albums/${a.slug}`} className="text-link hover:underline">{a.title}</Link></span>))}</div>}
          </dl>

          {tags.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{tags.map((t) => <Chip key={t.id} href={`/journeystory/tags/${t.slug}`}>#{t.name}</Chip>)}</div>}

          <Link href={`/profile/${photo.uploaderId}`} className="mt-6 flex items-center gap-3 text-sm hover:text-link">
            <Avatar name={photo.uploaderName} size={32} /> <span>Đăng bởi {photo.uploaderName}</span>
          </Link>

          <div className="mt-6 flex flex-wrap gap-3">
            {user ? (
              <>
                <form action={toggleLikeAction.bind(null, id)}>
                  <button className={`${btn} ${flags.liked ? on : idle}`} aria-pressed={flags.liked}>
                    <HeartIcon filled={flags.liked} /> {photo.likes}
                  </button>
                </form>
                <form action={toggleSaveAction.bind(null, id)}>
                  <button className={`${btn} ${flags.saved ? on : idle}`} aria-pressed={flags.saved}>
                    <BookmarkIcon filled={flags.saved} /> {flags.saved ? "Đã lưu" : "Lưu ảnh"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href={loginHref} className={`${btn} ${idle}`}><HeartIcon /> {photo.likes}</Link>
                <Link href={loginHref} className={`${btn} ${idle}`}><BookmarkIcon /> Lưu ảnh</Link>
              </>
            )}
            <ShareButton title={title} className={`${btn} ${idle}`} />
            {photo.allowDownload && (user
              ? <a href={`/api/photos/${id}/download`} className={`${btn} ${idle}`}><DownloadIcon /> Tải về</a>
              : <Link href={loginHref} className={`${btn} ${idle}`}><DownloadIcon /> Đăng nhập để tải</Link>)}
          </div>

          {user && (
            <details className="mt-5 rounded-md border border-line p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><FolderIcon /> Thêm vào bộ sưu tập</summary>
              <form action={addToCollectionAction.bind(null, id)} className="mt-4 space-y-3">
                {cols.length > 0 && (
                  <select name="collectionId" defaultValue="" aria-label="Bộ sưu tập" className={inputCls}>
                    <option value="">Chọn bộ sưu tập</option>
                    {cols.map((c) => <option key={c.id} value={c.id}>{c.name}{inCols.includes(c.id) ? " (đã có)" : ""}</option>)}
                  </select>
                )}
                <input name="newName" maxLength={80} placeholder="Hoặc tạo bộ sưu tập mới" className={inputCls} />
                <button className={btnPrimary}>Thêm</button>
              </form>
            </details>
          )}

          {user && (
            <details className="mt-3 text-sm text-muted">
              <summary className="flex cursor-pointer list-none items-center gap-2"><FlagIcon className="h-4 w-4" /> Báo cáo ảnh này</summary>
              <form action={reportAction.bind(null, id, "photo", id)} className="mt-3 space-y-3">
                <textarea name="reason" required minLength={5} maxLength={500} rows={3} placeholder="Mô tả ngắn lý do báo cáo" className={inputCls} />
                <button className={btnPrimary}>Gửi báo cáo</button>
              </form>
            </details>
          )}
        </aside>
      </div>

      <section id="comments" className="mt-16 max-w-3xl scroll-mt-24">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
          <CommentIcon /> Bình luận ({comments.filter((c) => !c.isHidden).length})
        </h2>

        {user ? (
          <form action={addCommentAction.bind(null, id)} className="mt-5">
            <label htmlFor="content" className="sr-only">Bình luận</label>
            <textarea id="content" name="content" required maxLength={2000} rows={3} placeholder="Viết bình luận của bạn..." className={inputCls} />
            <button className={`${btnPrimary} mt-3`}>Gửi bình luận</button>
          </form>
        ) : (
          <p className="mt-5 text-muted"><Link href={loginHref} className="text-link hover:underline">Đăng nhập</Link> để tham gia bình luận.</p>
        )}

        <ul className="mt-8 space-y-6">
          {comments.length === 0 && <li className="text-muted">Chưa có bình luận nào.</li>}
          {comments.map((c) => (
            <li key={c.id} className={`flex gap-3 ${c.isHidden ? "opacity-50" : ""}`}>
              <Avatar name={c.authorName} url={c.authorAvatar} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link href={`/profile/${c.userId}`} className="font-medium hover:text-link">{c.authorName}</Link>
                  <span className="ml-2 text-muted">{formatDate(c.createdAt)}</span>
                  {c.isHidden && <span className="ml-2 text-warning">(đã ẩn)</span>}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{c.content}</p>
                {user && (
                  <div className="mt-1 flex gap-4 text-xs text-muted">
                    {(user.id === c.userId || staff) && (
                      <form action={deleteCommentAction.bind(null, c.id)}>
                        <ConfirmButton message="Xóa bình luận này?" className="hover:text-danger">Xóa</ConfirmButton>
                      </form>
                    )}
                    {user.id !== c.userId && (
                      <details>
                        <summary className="cursor-pointer list-none hover:text-fg">Báo cáo</summary>
                        <form action={reportAction.bind(null, id, "comment", c.id)} className="mt-2 flex gap-2">
                          <input name="reason" required minLength={5} maxLength={500} placeholder="Lý do" className={`${inputCls} !py-1.5 text-sm`} />
                          <button className={`${btnPrimary} !px-3 !py-1.5`}>Gửi</button>
                        </form>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {related.length > 0 && (
        <section className="mt-20">
          <SectionHeading eyebrow="Gợi ý" title="Ảnh liên quan" />
          <PhotoGrid photos={related} />
        </section>
      )}
    </Container>
  );
}

import Link from "next/link";
import type { BlogListEntry } from "@/lib/blog-list";
import { formatDate } from "@/lib/format";

export function BlogListItem({ entry }: { entry: BlogListEntry }) {
  const { post, authorName } = entry;
  return (
    <li>
      <article>
        <Link href={`/documents/blog/${post.slug}`}
          className="group flex min-w-0 flex-col gap-5 rounded-lg border border-line bg-bg p-4 transition-colors hover:border-fg/30 hover:bg-card/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-link sm:flex-row sm:p-5 motion-reduce:transition-none">
          {post.coverFile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/uploads/${post.coverFile}`} alt="" loading="lazy" width={320} height={200}
              className="aspect-[8/5] w-full shrink-0 rounded-md object-cover sm:w-44 lg:w-56" />
          ) : (
            <div aria-hidden="true" className="grid aspect-[8/5] w-full shrink-0 place-items-center rounded-md bg-card text-sm text-muted sm:w-44 lg:w-56">Blog</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{entry.topic?.name || "Chưa phân loại chủ đề"}</p>
            <h2 className="mt-2 break-words font-display text-xl font-bold leading-snug group-hover:text-link sm:text-2xl">{post.title}</h2>
            <p className="mt-3 line-clamp-3 break-words text-sm leading-relaxed text-muted">{post.summary || "Bài viết chưa có mô tả ngắn."}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
              <span className="min-w-0 max-w-full break-words">{authorName || "Chưa có thông tin tác giả"}</span>
              <time dateTime={new Date(post.publishedAt ?? post.createdAt).toISOString()}>{formatDate(post.publishedAt ?? post.createdAt)}</time>
              <span>{post.readMinutes} phút đọc</span>
            </div>
            {post.tags.length > 0 && <p className="mt-3 flex flex-wrap gap-2 text-xs text-muted">{post.tags.map((tag) => <span key={tag.id} className="break-all">#{tag.name}</span>)}</p>}
          </div>
        </Link>
      </article>
    </li>
  );
}

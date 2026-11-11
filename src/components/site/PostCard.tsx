import Link from "next/link";
import { SECTION_LABEL } from "@/lib/cyber-lab";
import { formatDate } from "@/lib/format";
import { DIFFICULTY_LABEL, type Post } from "@/lib/posts";

export function PostCard({ post, href }: { post: Post; href: string }) {
  return (
    <Link href={href} className="group flex flex-col overflow-hidden rounded-md border border-line bg-bg transition hover:border-fg/30">
      {post.coverFile && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/uploads/${post.coverFile}`} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-link">{post.type === "hacking" ? SECTION_LABEL[post.section] : "Blog"}</p>
        <h2 className="mt-2 font-display text-xl font-bold leading-snug group-hover:text-link">{post.title}</h2>
        {post.summary && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{post.summary}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4 text-xs text-muted">
          <span>{formatDate(post.publishedAt ?? post.createdAt)}</span>
          <span>{post.readMinutes} phút đọc</span>
          {post.difficulty && <span className="rounded-full border border-line px-2.5 py-0.5">{DIFFICULTY_LABEL[post.difficulty]}</span>}
          {post.tags.slice(0, 3).map((t) => <span key={t.id} className="rounded-full border border-line px-2.5 py-0.5">{t.name}</span>)}
        </div>
      </div>
    </Link>
  );
}

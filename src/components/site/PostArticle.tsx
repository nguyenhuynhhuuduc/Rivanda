import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { CATEGORIES, SECTION_LABEL } from "@/lib/cyber-lab";
import { formatDate } from "@/lib/format";
import { DIFFICULTY_LABEL, type Post } from "@/lib/posts";
import { extractToc } from "@/lib/toc";

export function PostArticle({
  post, backHref, backLabel, notice, actions, children,
}: {
  post: Post; backHref: string; backLabel: string; notice?: string;
  actions?: React.ReactNode; children?: React.ReactNode;
}) {
  const toc = extractToc(post.content);
  const cat = post.category ? CATEGORIES[post.category]?.label : null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Link href={backHref} className="text-sm text-muted hover:text-fg">← {backLabel}</Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        <article className="min-w-0 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-link">
            {post.type === "hacking" ? SECTION_LABEL[post.section] : "Blog"}{cat ? ` · ${cat}` : ""}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{post.title}</h1>
          {post.summary && <p className="mt-4 font-serif text-xl leading-relaxed text-muted">{post.summary}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <span>{formatDate(post.publishedAt ?? post.createdAt)}</span>
            <span>{post.readMinutes} phút đọc</span>
            <span>{post.viewCount} lượt xem</span>
            {post.difficulty && <span className="rounded-full border border-line px-3 py-0.5">{DIFFICULTY_LABEL[post.difficulty]}</span>}
            {post.tags.map((t) => <span key={t.id} className="rounded-full border border-line px-3 py-0.5">{t.name}</span>)}
          </div>
          {actions && <div className="mt-5 flex gap-3">{actions}</div>}

          {notice && <p className="mt-8 rounded-md border border-gold/40 bg-gold/10 px-5 py-4 text-sm leading-relaxed">{notice}</p>}

          {post.coverFile && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/uploads/${post.coverFile}`} alt="" className="mt-8 w-full rounded-md" />
          )}

          <div className="mt-10"><Markdown>{post.content}</Markdown></div>
        </article>

        {toc.length > 2 && (
          <aside className="hidden lg:block">
            <nav aria-label="Mục lục" className="sticky top-24 border-l border-line pl-5 text-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-link">Mục lục</p>
              <ul className="space-y-2">
                {toc.map((t) => (
                  <li key={t.id} className={t.level === 3 ? "pl-3" : ""}>
                    <a href={`#${t.id}`} className="text-muted hover:text-fg">{t.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
      {children}
    </div>
  );
}

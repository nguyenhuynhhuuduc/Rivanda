import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookmarkIcon } from "@/components/icons";
import { PostArticle } from "@/components/site/PostArticle";
import { PostCard } from "@/components/site/PostCard";
import { SectionHeading } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { returnPath } from "@/lib/url";
import { isBookmarked } from "@/lib/community";
import { LAB_NOTICE } from "@/lib/cyber-lab";
import { getPostBySlug, incrementViews, listPosts } from "@/lib/posts";
import { togglePostBookmarkAction } from "../../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await requireUser(`/cyber-lab/articles/${encodeURIComponent(slug)}`);
  const p = await getPostBySlug("hacking", slug);
  return { title: p?.title ?? "Bài viết", description: p?.summary ?? undefined, openGraph: { title: p?.title }, robots: { index: false, follow: false } };
}

export default async function CyberArticlePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const user = await requireUser(returnPath(`/cyber-lab/articles/${encodeURIComponent(slug)}`, await searchParams));
  const post = await getPostBySlug("hacking", slug);
  if (!post) notFound();
  await incrementViews(post.id);

  const saved = user ? await isBookmarked(user.id, "post", post.id) : false;
  const back = `/cyber-lab/articles/${slug}`;
  const related = (await listPosts({
    type: "hacking", onlyPublished: true, category: post.category ?? undefined, excludeId: post.id, limit: 3,
  })).posts;

  return (
    <PostArticle
      post={post} backHref="/cyber-lab" backLabel="Quay lại Cyber Lab" notice={LAB_NOTICE}
      actions={
        <form action={togglePostBookmarkAction.bind(null, post.id, back)}>
          <button className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm hover:border-fg/40">
            <BookmarkIcon filled={saved} className="h-4 w-4" /> {saved ? "Đã lưu bài" : "Lưu bài"}
          </button>
        </form>
      }
    >
      {related.length > 0 && (
        <section className="mt-20">
          <SectionHeading eyebrow="Gợi ý" title="Bài viết liên quan" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => <PostCard key={p.id} post={p} href={`/cyber-lab/articles/${p.slug}`} />)}
          </div>
        </section>
      )}
    </PostArticle>
  );
}

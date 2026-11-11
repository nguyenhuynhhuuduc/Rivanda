import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostArticle } from "@/components/site/PostArticle";
import Link from "next/link";
import { incrementViews } from "@/lib/posts";
import { getPublicBlog } from "@/lib/blog-read";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params, r = await getPublicBlog(slug), p = r?.post;
  return { title: p?.title ?? "Bài viết", description: p?.summary ?? undefined, openGraph: { title: p?.title }, ...(p ? { alternates: { canonical: `/documents/blog/${encodeURIComponent(slug)}` } } : { robots: { index: false, follow: false } }) };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const record = await getPublicBlog((await params).slug);
  if (!record) notFound();
  const { post, topic } = record;
  await incrementViews(post.id);
  return <><div className="mx-auto max-w-6xl break-words px-6 pt-8 text-sm text-muted">{record.authorName}{topic?.isVisible && !topic.deletedAt && <Link href={`/documents/blog?topic=${encodeURIComponent(topic.slug)}`} className="ml-3 text-link underline">{topic.name}</Link>}</div><PostArticle post={post} backHref="/documents/blog" backLabel="Quay lại Blog" /></>;
}

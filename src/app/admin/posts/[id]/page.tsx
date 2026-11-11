import { notFound, redirect } from "next/navigation";
import { blogFoundationReady } from "@/lib/blog-read";
import { Flash, PageTitle } from "@/components/admin/ui";
import { PostForm } from "@/components/admin/PostForm";
import { requireAdmin } from "@/lib/auth";
import { getPostById } from "@/lib/posts";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  const [post, sp] = await Promise.all([getPostById(id), searchParams]);
  if (!post) notFound();
  if (post.type === "blog" && await blogFoundationReady()) redirect(`/admin/blog/${id}`);

  return (
    <div>
      <PageTitle title="Sửa bài viết" />
      <Flash saved={sp.saved} error={sp.error} />
      <PostForm post={post} />
    </div>
  );
}

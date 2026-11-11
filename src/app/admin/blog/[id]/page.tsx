import { notFound } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { BLOG_UUID } from "@/lib/blog-policy";
import { BlogEditorScreen } from "@/components/blog/BlogEditorScreen";
export const dynamic = "force-dynamic";
export default async function EditAdminBlog({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireAdmin(); const actor = await requireUser("/admin/blog"), { id } = await params;
  if (!BLOG_UUID.test(id)) notFound();
  return <BlogEditorScreen actor={actor} id={id} searchParams={searchParams} />;
}

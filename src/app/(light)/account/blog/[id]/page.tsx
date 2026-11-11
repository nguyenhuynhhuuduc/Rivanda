import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { BLOG_UUID } from "@/lib/blog-policy";
import { BlogEditorScreen } from "@/components/blog/BlogEditorScreen";
export const dynamic = "force-dynamic";
export const metadata = { title: "Chỉnh sửa Blog", robots: { index: false, follow: false } };
export default async function EditBlog({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireUser("/account/blog"), { id } = await params;
  if (!BLOG_UUID.test(id)) notFound();
  return <BlogEditorScreen actor={actor} id={id} searchParams={searchParams} />;
}

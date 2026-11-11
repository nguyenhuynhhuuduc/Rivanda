import { requireAdmin, requireUser } from "@/lib/auth";
import { BlogEditorScreen } from "@/components/blog/BlogEditorScreen";
export const dynamic = "force-dynamic";
export default async function NewAdminBlog({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin(); const actor = await requireUser("/admin/blog/new");
  return <BlogEditorScreen actor={actor} searchParams={searchParams} />;
}

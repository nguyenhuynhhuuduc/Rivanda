import { requireUser } from "@/lib/auth";
import { BlogEditorScreen } from "@/components/blog/BlogEditorScreen";
export const dynamic = "force-dynamic";
export const metadata = { title: "Viết Blog", robots: { index: false, follow: false } };
export default async function NewBlog({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireUser("/account/blog/new");
  return <BlogEditorScreen actor={actor} searchParams={searchParams} />;
}

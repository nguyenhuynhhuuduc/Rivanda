import { requireUser } from "@/lib/auth";
import { BlogManagement } from "@/components/blog/BlogManagement";
import { Flash } from "@/components/admin/ui";
export const dynamic = "force-dynamic";
export const metadata = { title: "Blog của tôi", robots: { index: false, follow: false } };
export default async function MyBlog({ searchParams }: { searchParams: Promise<{ page?: string; state?: string; saved?: string; error?: string }> }) {
  const actor = await requireUser("/account/blog"), sp = await searchParams;
  const page = Math.min(100000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  return <div><h2 className="mb-6 font-display text-3xl font-bold">Blog của tôi</h2><Flash saved={sp.saved} error={sp.error} /><BlogManagement actor={actor} page={page} state={sp.state} /></div>;
}

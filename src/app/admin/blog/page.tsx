import { requireAdmin, requireUser } from "@/lib/auth";
import { BlogManagement } from "@/components/blog/BlogManagement";
import { PageTitle, Flash } from "@/components/admin/ui";
export const dynamic = "force-dynamic";
export default async function AdminBlog({ searchParams }: { searchParams: Promise<{ page?: string; state?: string; saved?: string; error?: string }> }) {
  await requireAdmin(); const actor = await requireUser("/admin/blog"), sp = await searchParams;
  const page = Math.min(100000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  return <div><PageTitle title="Quản lý Blog" hint="Duyệt bài User, xuất bản bài Admin và quản lý chủ đề." /><Flash saved={sp.saved} error={sp.error} /><BlogManagement actor={actor} page={page} state={sp.state} /></div>;
}

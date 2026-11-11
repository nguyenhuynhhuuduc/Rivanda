import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogEditor } from "./BlogEditor";
import { blogFoundationReady, editableBlog, listBlogTopics } from "@/lib/blog-read";
import type { BlogActor } from "@/lib/blog-policy";
import { Flash } from "@/components/admin/ui";

export async function BlogEditorScreen({ actor, id, searchParams }: { actor: BlogActor; id?: string; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams, base = actor.role === "admin" ? "/admin/blog" : "/account/blog";
  if (!await blogFoundationReady()) return <p role="status">Chức năng viết Blog đang khóa vì migration 006 chưa sẵn sàng. Không có thay đổi nào được lưu.</p>;
  const record = id ? await editableBlog(id, actor) : null;
  if (id && !record) notFound();
  const topics = await listBlogTopics(actor.role === "admin");
  return <div className="max-w-4xl"><Link href={base} className="text-sm text-link underline">← Quản lý Blog</Link><h1 className="my-6 font-display text-3xl font-bold">{record ? "Chỉnh sửa Blog" : "Viết Blog"}</h1><Flash saved={sp.saved} error={sp.error} /><BlogEditor record={record ?? undefined} topics={topics} admin={actor.role === "admin"} /></div>;
}

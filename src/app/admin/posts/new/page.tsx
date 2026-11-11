import { Flash, PageTitle } from "@/components/admin/ui";
import { PostForm } from "@/components/admin/PostForm";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { blogFoundationReady } from "@/lib/blog-read";

export const dynamic = "force-dynamic";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  if (sp.type !== "hacking" && await blogFoundationReady()) redirect("/admin/blog/new");
  return (
    <div>
      <PageTitle title="Viết bài mới" />
      <Flash error={sp.error} />
      <PostForm defaultType={sp.type === "hacking" ? "hacking" : "blog"} />
    </div>
  );
}

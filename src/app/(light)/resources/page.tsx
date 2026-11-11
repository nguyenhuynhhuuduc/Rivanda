import Link from "next/link";
import { DocRow } from "@/components/site/DocRow";
import { PostCard } from "@/components/site/PostCard";
import { Chip, Container, Empty, PageHeading, SectionHeading } from "@/components/ui/kit";
import { listDocuments } from "@/lib/documents";
import { listPosts } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resources", alternates: { canonical: "/resources" } };

export default async function DocumentsPage() {
  const [{ posts }, { docs: resources }, { docs: projects }] = await Promise.all([
    listPosts({ type: "blog", onlyPublished: true, limit: 3 }),
    listDocuments({ onlyPublished: true, kinds: ["document", "resource"], limit: 5 }),
    listDocuments({ onlyPublished: true, kinds: ["project"], limit: 4 }),
  ]);
  return (
    <Container className="py-14">
      <PageHeading eyebrow="Resources" title="Bài viết, tài liệu và dự án"
        subtitle="Những gì tôi viết ra, đúc kết lại và muốn chia sẻ với mọi người." />
      <nav aria-label="Mục" className="mb-12 flex flex-wrap gap-2">
        <Chip href="/documents/blog">Blog</Chip>
        <Chip href="/resources/documents">Tài liệu và tài nguyên</Chip>
        <Chip href="/resources/projects">Dự án</Chip>
      </nav>

      <section className="mb-16">
        <SectionHeading eyebrow="Blog" title="Bài viết mới" href="/documents/blog" />
        {posts.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{posts.map((p) => <PostCard key={p.id} post={p} href={`/documents/blog/${p.slug}`} />)}</div>
        ) : <Empty>Chưa có bài viết nào.</Empty>}
      </section>

      <section className="mb-16">
        <SectionHeading eyebrow="Tài liệu" title="Tài liệu và tài nguyên" href="/resources/documents" />
        {resources.length ? <ul className="space-y-3">{resources.map((d) => <DocRow key={d.id} doc={d} />)}</ul> : <Empty>Chưa có tài liệu nào.</Empty>}
      </section>

      {projects.length > 0 && (
        <section>
          <SectionHeading eyebrow="Dự án" title="Dự án nổi bật" href="/resources/projects" />
          <ul className="space-y-3">{projects.map((d) => <DocRow key={d.id} doc={d} />)}</ul>
        </section>
      )}
    </Container>
  );
}

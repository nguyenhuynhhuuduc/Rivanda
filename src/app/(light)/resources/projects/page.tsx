import Link from "next/link";
import { DocRow } from "@/components/site/DocRow";
import { Container, Empty, PageHeading } from "@/components/ui/kit";
import { listDocuments } from "@/lib/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dự án", alternates: { canonical: "/resources/projects" } };

export default async function ProjectsPage() {
  const { docs } = await listDocuments({ onlyPublished: true, kinds: ["project"] });
  return (
    <Container className="py-14">
      <Link href="/resources" className="text-sm text-muted hover:text-fg">← Resources</Link>
      <div className="mt-6"><PageHeading eyebrow="Resources" title="Dự án" subtitle="Các dự án tôi đã làm và chia sẻ." /></div>
      {docs.length ? <ul className="space-y-3">{docs.map((d) => <DocRow key={d.id} doc={d} />)}</ul> : <Empty>Chưa có dự án nào.</Empty>}
    </Container>
  );
}

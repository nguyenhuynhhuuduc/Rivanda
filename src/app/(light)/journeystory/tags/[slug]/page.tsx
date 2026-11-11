import { notFound } from "next/navigation";
import Link from "next/link";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { Container, Empty, PageHeading } from "@/components/ui/kit";
import { listPhotos, PUBLIC } from "@/lib/discovery";
import { getTagBySlug } from "@/lib/tags";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  return { title: tag ? `#${tag.name}` : "Thẻ", alternates: { canonical: `/journeystory/tags/${encodeURIComponent(slug)}` } };
}

export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const tag = await getTagBySlug((await params).slug);
  if (!tag) notFound();
  const { photos, total } = await listPhotos({ statuses: PUBLIC, tag: tag.slug, limit: 60 });
  return (
    <Container className="py-14">
      <Link href="/journeystory" className="text-sm text-muted hover:text-fg">← JourneyStory</Link>
      <div className="mt-6"><PageHeading eyebrow="Thẻ" title={`#${tag.name}`} subtitle={`${total} ảnh`} /></div>
      {photos.length ? <PhotoGrid photos={photos} /> : <Empty>Chưa có ảnh với thẻ này.</Empty>}
    </Container>
  );
}

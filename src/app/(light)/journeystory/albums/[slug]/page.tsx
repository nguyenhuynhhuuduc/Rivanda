import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { Container, Empty, PageHeading } from "@/components/ui/kit";
import { getAlbumBySlug, listPhotos, PUBLIC } from "@/lib/discovery";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = await getAlbumBySlug((await params).slug);
  return { title: a?.title ?? "Album", description: a?.description ?? undefined, alternates: { canonical: `/journeystory/albums/${encodeURIComponent((await params).slug)}` } };
}

export default async function AlbumPage({ params }: { params: Promise<{ slug: string }> }) {
  const album = await getAlbumBySlug((await params).slug);
  if (!album) notFound();
  const { photos } = await listPhotos({ statuses: PUBLIC, albumId: album.id, limit: 100 });
  return (
    <Container className="py-14">
      <Link href="/journeystory/albums" className="text-sm text-muted hover:text-fg">← Tất cả album</Link>
      <div className="mt-6"><PageHeading eyebrow="Album" title={album.title} subtitle={album.description ?? undefined} /></div>
      {photos.length ? <PhotoGrid photos={photos} /> : <Empty>Album này chưa có ảnh.</Empty>}
    </Container>
  );
}

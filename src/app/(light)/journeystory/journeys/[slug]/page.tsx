import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlbumCard } from "@/components/site/Cards";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { Container, Empty, PageHeading, SectionHeading } from "@/components/ui/kit";
import { formatDate } from "@/lib/format";
import { getTripBySlug, listAlbums, listPhotos, listStatuses, PUBLIC } from "@/lib/discovery";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getTripBySlug((await params).slug);
  return { title: t?.title ?? "Hành trình", description: t?.description ?? undefined, alternates: { canonical: `/journeystory/journeys/${encodeURIComponent((await params).slug)}` } };
}

export default async function JourneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const trip = await getTripBySlug((await params).slug);
  if (!trip) notFound();
  const [{ photos }, albums, statuses] = await Promise.all([
    listPhotos({ statuses: PUBLIC, tripId: trip.id, limit: 100 }),
    listAlbums(true, trip.id),
    listStatuses(20, trip.id),
  ]);
  const meta = [trip.locationName, trip.startDate ? formatDate(trip.startDate) : null, trip.endDate ? formatDate(trip.endDate) : null]
    .filter(Boolean).join(" · ");

  return (
    <Container className="py-14">
      <Link href="/journeystory/journeys" className="text-sm text-muted hover:text-fg">← Tất cả hành trình</Link>
      <div className="mt-6"><PageHeading eyebrow={meta || "Hành trình"} title={trip.title} subtitle={trip.description ?? undefined} /></div>

      {statuses.length > 0 && (
        <section className="mb-14">
          <SectionHeading eyebrow="Nhật ký" title="Ghi lại trên đường" />
          <ul className="space-y-6 border-l border-line pl-6">
            {statuses.map((s) => (
              <li key={s.id}>
                <p className="whitespace-pre-wrap leading-relaxed">{s.content}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(s.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {albums.length > 0 && (
        <section className="mb-14">
          <SectionHeading eyebrow="Album" title="Album của hành trình" />
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{albums.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
        </section>
      )}

      <section>
        <SectionHeading eyebrow="Ảnh" title="Tất cả ảnh" />
        {photos.length ? <PhotoGrid photos={photos} /> : <Empty>Hành trình này chưa có ảnh.</Empty>}
      </section>
    </Container>
  );
}

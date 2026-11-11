import Link from "next/link";
import { Container, Empty, PageHeading } from "@/components/ui/kit";
import { listLocations } from "@/lib/discovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Địa điểm", alternates: { canonical: "/journeystory/locations" } };

export default async function LocationsPage() {
  const locations = await listLocations();
  return (
    <Container className="py-14">
      <PageHeading eyebrow="JourneyStory" title="Địa điểm" subtitle="Những nơi đã có ảnh trên website." />
      {locations.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {locations.map((l) => (
            <Link key={l.name} href={`/journeystory/explore?location=${encodeURIComponent(l.name)}`} className="group relative block overflow-hidden rounded-md bg-card">
              {l.coverFile && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/uploads/${l.coverFile}`} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
              )}
              {!l.coverFile && <div className="aspect-[4/5] w-full" />}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-deep/90 to-transparent p-4 text-cream">
                <p className="font-display text-xl font-bold">{l.name}</p>
                <p className="text-sm text-cream/75">{l.count} ảnh</p>
              </div>
            </Link>
          ))}
        </div>
      ) : <Empty>Chưa có địa điểm nào.</Empty>}
    </Container>
  );
}

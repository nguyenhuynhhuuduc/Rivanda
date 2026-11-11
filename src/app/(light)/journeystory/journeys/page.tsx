import { JourneyCard } from "@/components/site/Cards";
import { Container, Empty, PageHeading } from "@/components/ui/kit";
import { listTrips } from "@/lib/discovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hành trình", alternates: { canonical: "/journeystory/journeys" } };

export default async function JourneysPage() {
  const trips = await listTrips({ onlyWithPhotos: true });
  return (
    <Container className="py-14">
      <PageHeading eyebrow="JourneyStory" title="Hành trình" subtitle="Mỗi hành trình gom ảnh, album và nhật ký của một chuyến đi." />
      {trips.length ? (
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{trips.map((t) => <JourneyCard key={t.id} trip={t} />)}</div>
      ) : <Empty>Chưa có hành trình nào.</Empty>}
    </Container>
  );
}

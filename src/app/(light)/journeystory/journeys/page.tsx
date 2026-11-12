import { JourneyCollections } from "@/components/journeystory/JourneyCollections";
export const dynamic = "force-dynamic";
export const metadata = { title: "Hành trình", alternates: { canonical: "/journeystory/journeys" } };
export default async function JourneysPage({ searchParams }: { searchParams: Promise<{ sort?: string; page?: string }> }) {
  return <JourneyCollections searchParams={searchParams} base="/journeystory/journeys" />;
}

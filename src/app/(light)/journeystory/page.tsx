import { JourneyCollections } from "@/components/journeystory/JourneyCollections";
export const dynamic = "force-dynamic";
export const metadata = { title: "JourneyStory", alternates: { canonical: "/journeystory" } };
export default async function JourneyStoryPage({ searchParams }: { searchParams: Promise<{ sort?: string; page?: string }> }) {
  return <JourneyCollections searchParams={searchParams} />;
}

import { PageLoader } from "@/components/PageLoader";

export default function JourneyLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <PageLoader compact label="Đang tải hành trình…" />
      <div className="mb-10 h-14 w-2/3 rounded-xl bg-card" aria-hidden="true" />
      <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="aspect-[4/3] rounded-2xl bg-card motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  );
}

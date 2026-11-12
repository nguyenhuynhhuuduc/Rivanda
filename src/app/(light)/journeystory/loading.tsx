export default function JourneyLoading() {
  return <div className="mx-auto max-w-6xl px-6 py-14" role="status" aria-label="Đang tải hành trình"><span className="sr-only">Đang tải hành trình…</span><div className="mb-10 h-14 w-2/3 rounded-xl bg-card" /><div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">{[1, 2, 3].map(i => <div key={i} className="aspect-[4/3] rounded-2xl bg-card motion-safe:animate-pulse" />)}</div></div>;
}

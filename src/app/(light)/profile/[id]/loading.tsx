import { PageLoader } from "@/components/PageLoader";

export default function ProfileLoading() {
  return (
    <div className="space-y-4 py-4">
      <PageLoader compact label="Đang tải hồ sơ…" />
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="h-36 rounded-2xl border border-line bg-card" />
      ))}
    </div>
  );
}

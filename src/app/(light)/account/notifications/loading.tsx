import { PageLoader } from "@/components/PageLoader";

export default function NotificationLoading() {
  return (
    <div>
      <PageLoader compact label="Đang tải thông báo…" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="mb-3 h-28 rounded-2xl border border-line bg-card"
        />
      ))}
    </div>
  );
}

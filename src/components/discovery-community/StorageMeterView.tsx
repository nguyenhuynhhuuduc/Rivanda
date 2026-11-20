export type StorageUsageData = { used: number; limit: number };

function formatBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  if (safe < 1024) return `${safe} B`;
  if (safe < 1048576) return `${fmt(safe / 1024)} KiB`;
  return `${fmt(safe / 1048576)} MiB`;
}

export function StorageMeterView({
  usage,
  compact = false,
}: {
  usage: StorageUsageData;
  compact?: boolean;
}) {
  const remaining = Math.max(0, usage.limit - usage.used);
  return (
    <div
      className={
        compact
          ? "rounded-xl border border-line bg-card/45 p-3.5"
          : "my-5 rounded-xl border border-line bg-card/40 p-4"
      }
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p>
          Ảnh Discovery: <strong>{formatBytes(usage.used)}</strong> / {formatBytes(usage.limit)} đã dùng
          hoặc giữ chỗ
        </p>
        <p className="text-xs text-muted">
          Còn lại: <strong className="text-fg">{formatBytes(remaining)}</strong>
        </p>
      </div>
      <progress
        aria-label="Dung lượng ảnh Discovery"
        max={usage.limit}
        value={Math.min(usage.used, usage.limit)}
        className="h-2 w-full accent-gold"
      />
      <p className="mt-2 text-xs leading-6 text-muted">
        Quota gồm ảnh chính và thumbnail. Ảnh đã gỡ/xóa mềm được giữ 30 ngày; dung lượng chỉ hoàn sau
        khi dọn tệp thành công.
      </p>
    </div>
  );
}

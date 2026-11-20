import styles from "./PageLoader.module.css";

export function PageLoader({
  label = "Đang tải trang…",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={compact ? styles.compact : styles.status}
    >
      <span className={styles.spinner} aria-hidden="true">
        <span className={styles.ringOuter} />
        <span className={styles.ringInner} />
        <span className={styles.core} />
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

import type { PostState } from "@/lib/discovery-community/model";
import { STATE_LABEL } from "@/lib/discovery-community/model";
import { safeNext } from "@/lib/url";
import styles from "./Discovery.module.css";

export function discoveryLoginHref(returnTo = "/discovery") {
  return `/login?next=${encodeURIComponent(safeNext(returnTo))}`;
}

export function DiscoveryIcon({ name, className = "" }: { name: "feed" | "spark" | "image" | "edit" | "search" | "people" | "lock" | "globe" | "arrow"; className?: string }) {
  const paths = {
    feed: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
    image: "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M8 8h.01",
    edit: "m14 5 5 5M4 20l5-1L20 8l-5-5L4 14z",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    lock: "M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3M12 14v3",
    globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
    arrow: "M5 12h14M13 6l6 6-6 6",
  };
  return <svg className={`${styles.icon} ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function PostStateBadge({ status, visibility }: { status: PostState; visibility: "public" | "private" }) {
  // A draft with public as its intended audience is still not publicly visible.
  const label = status === "published" ? (visibility === "public" ? "Công khai" : "Riêng tư · Chỉ mình tôi") : STATE_LABEL[status];
  return <span className={`${styles.badge} ${status !== "published" ? styles.reviewBadge : ""}`}><DiscoveryIcon name={status === "published" && visibility === "public" ? "globe" : "lock"} />{label}</span>;
}

export function PostStateNotice({ status, visibility }: { status: PostState; visibility: "public" | "private" }) {
  const messages: Record<PostState, string> = {
    draft: "Bản nháp chưa xuất bản. Khách và thành viên khác không thể xem bài này.",
    pending: "Bài đang chờ Admin duyệt và chưa xuất hiện trên Newsfeed công khai.",
    rejected: "Bài bị từ chối xuất bản. Xem lý do, chỉnh sửa rồi gửi lại để Admin duyệt.",
    hidden: "Bài đã bị ẩn khỏi cộng đồng. Nội dung và lịch sử vẫn được giữ để kiểm duyệt.",
    deleted: "Bài đã xóa mềm và không còn xuất hiện công khai.",
    published: visibility === "private" ? "Bài riêng tư: chỉ bạn và Admin có quyền kiểm duyệt được xem." : "Bài đã xuất bản và mọi người có thể xem.",
  };
  return <p className={styles.stateNotice}>{messages[status]}</p>;
}

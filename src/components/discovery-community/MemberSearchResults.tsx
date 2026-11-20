"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import { ROLE_LABEL } from "@/lib/permissions";
import type { MemberSearchResult, PublicMemberHit } from "@/lib/discovery-community/members";
import { DiscoveryIcon } from "./DiscoveryUI";
import styles from "./Discovery.module.css";

const LIMIT = 8;
const DEBOUNCE_MS = 300;

type Status = "idle" | "typing" | "loading" | "ready" | "error";

export function MemberSearchResults({
  initialQuery,
  initialResult,
  initialError,
}: {
  initialQuery: string;
  initialResult: MemberSearchResult | null;
  initialError?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialResult?.page ?? 1);
  const [result, setResult] = useState<MemberSearchResult | null>(initialResult);
  const [error, setError] = useState(initialError ?? "");
  const [status, setStatus] = useState<Status>(
    initialError ? "error" : initialQuery.trim() ? "ready" : "idle"
  );
  const skipFirstFetch = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
    setPage(initialResult?.page ?? 1);
    setResult(initialResult);
    setError(initialError ?? "");
    setStatus(initialError ? "error" : initialQuery.trim() ? "ready" : "idle");
    skipFirstFetch.current = true;
  }, [initialQuery, initialResult, initialError]);

  async function fetchMembers(targetQuery: string, targetPage: number, syncUrl = true) {
    abortRef.current?.abort();
    const cleaned = targetQuery.trim();
    if (!cleaned) {
      setResult(null);
      setError("");
      setStatus("idle");
      if (syncUrl && typeof window !== "undefined") {
        window.history.replaceState(null, "", "/discovery?tab=users");
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError("");

    try {
      const params = new URLSearchParams({
        q: cleaned,
        page: String(targetPage),
        limit: String(LIMIT),
      });
      const res = await fetch(`/api/discovery/users?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const data = (await res.json()) as MemberSearchResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Không thể tìm kiếm thành viên.");
      }
      setResult(data);
      setPage(data.page);
      setStatus("ready");
      if (syncUrl && typeof window !== "undefined") {
        const nextUrl = new URLSearchParams({ tab: "users", q: cleaned });
        if (data.page > 1) nextUrl.set("page", String(data.page));
        window.history.replaceState(null, "", `/discovery?${nextUrl.toString()}`);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Chưa thể tìm kiếm thành viên lúc này."
      );
      setStatus("error");
    }
  }

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    const cleaned = query.trim();
    if (!cleaned) {
      abortRef.current?.abort();
      setResult(null);
      setError("");
      setStatus("idle");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/discovery?tab=users");
      }
      return;
    }
    if (cleaned.length > 80) {
      setError("Từ khóa tìm kiếm tối đa 80 ký tự.");
      setStatus("error");
      return;
    }

    setStatus("typing");
    const timer = window.setTimeout(() => {
      void fetchMembers(cleaned, 1, true);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return (
    <div className={styles.stack}>
      <div className={`${styles.panel} ${styles.panelBody}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void fetchMembers(query, 1, true);
          }}
          className="space-y-3"
        >
          <label htmlFor="discovery-member-search" className={styles.fieldLabel}>
            Tìm thành viên theo tên hoặc ID-User
          </label>
          <div className={styles.memberSearchRow}>
            <div className={styles.searchInputWrap}>
              <DiscoveryIcon name="search" className={styles.searchLeadingIcon} />
              <input
                id="discovery-member-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={80}
                placeholder="Nhập tên (có dấu/không dấu) hoặc mã ID-User…"
                className={`${styles.searchInput} ${styles.searchInputWithIcon}`}
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Xóa từ khóa tìm thành viên"
                  className={styles.clearBtn}
                >
                  ×
                </button>
              )}
            </div>
            <button type="submit" className={styles.primary}>
              <DiscoveryIcon name="search" />
              Tìm
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={styles.small}>
              Hỗ trợ tìm một phần tên (có dấu hoặc không dấu) và ưu tiên khớp chính xác mã ID-User.
            </p>
            {status === "typing" && (
              <span className={styles.searchStatus} aria-live="polite">
                Đang nhập…
              </span>
            )}
            {status === "loading" && (
              <span className={styles.searchStatus} aria-live="polite">
                Đang tìm kiếm…
              </span>
            )}
          </div>
        </form>
      </div>

      {status === "idle" && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <DiscoveryIcon name="people" />
          </div>
          <h3>Tìm kiếm thành viên cộng đồng</h3>
          <p>
            Nhập tên hiển thị (ví dụ: <strong>Nguyen Duc</strong> hoặc <strong>Đức</strong>) hay dán
            chính xác mã <strong>ID-User</strong> để mở nhanh hồ sơ công khai.
          </p>
        </div>
      )}

      {status === "error" && (
        <div role="alert" className={styles.error}>
          <p>{error || "Không thể tải danh sách thành viên."}</p>
          <button
            type="button"
            onClick={() => void fetchMembers(query, page, true)}
            className={`${styles.readMore} mt-2`}
          >
            Thử lại <DiscoveryIcon name="arrow" />
          </button>
        </div>
      )}

      {status === "loading" && (
        <div className={styles.memberGrid} aria-busy="true" aria-label="Đang tải kết quả thành viên">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className={`${styles.card} ${styles.skeletonCard}`}>
              <div className="flex items-center gap-3">
                <div className={`${styles.skeleton} ${styles.pulse} h-12 w-12 rounded-full`} />
                <div className="flex-1 space-y-2">
                  <div className={`${styles.skeleton} ${styles.pulse} h-4 w-2/3`} />
                  <div className={`${styles.skeleton} ${styles.pulse} h-3 w-1/2`} />
                </div>
              </div>
              <div className={`${styles.skeleton} ${styles.pulse} h-3 w-full`} />
              <div className={`${styles.skeleton} ${styles.pulse} h-9 w-28`} />
            </div>
          ))}
        </div>
      )}

      {status === "ready" && result && result.items.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <DiscoveryIcon name="search" />
          </div>
          <h3>Không tìm thấy thành viên phù hợp</h3>
          <p>
            Không có thành viên hoạt động nào khớp với <strong>“{result.query}”</strong>. Hãy thử
            nhập tên ngắn hơn, bỏ dấu hoặc kiểm tra lại mã ID-User.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className={styles.primary}
          >
            Xóa từ khóa
          </button>
        </div>
      )}

      {status === "ready" && result && result.items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className={styles.small} aria-live="polite">
              Tìm thấy <strong>{result.total}</strong> thành viên cho{" "}
              <strong>“{result.query}”</strong>
            </p>
            {totalPages > 1 && (
              <p className={styles.small}>
                Trang {result.page} / {totalPages}
              </p>
            )}
          </div>

          <div className={styles.memberGrid}>
            {result.items.map((member) => (
              <MemberResultCard key={member.id} member={member} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="Phân trang thành viên" className={styles.memberPager}>
              <button
                type="button"
                disabled={result.page <= 1}
                onClick={() => void fetchMembers(result.query, result.page - 1, true)}
                className={styles.pagerBtn}
              >
                ← Trang trước
              </button>
              <span className={styles.small}>
                Trang {result.page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={!result.hasMore}
                onClick={() => void fetchMembers(result.query, result.page + 1, true)}
                className={styles.pagerBtn}
              >
                Trang sau →
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function MemberResultCard({ member }: { member: PublicMemberHit }) {
  return (
    <article className={`${styles.card} ${styles.memberCard}`}>
      <Link
        href={member.profileUrl}
        aria-label={`Mở ảnh bìa và hồ sơ của ${member.displayName}`}
        className={styles.memberCover}
      >
        {member.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.coverUrl} alt="" loading="lazy" />
        ) : null}
      </Link>
      <div className={styles.memberBody}>
        <div className={styles.memberHead}>
          <Link href={member.profileUrl} className={styles.memberAvatar}>
            <Avatar name={member.displayName} url={member.avatarUrl} size={52} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={member.profileUrl} className={styles.memberName}>
              {member.displayName}
            </Link>
            <p className={styles.memberId} title={`ID-User: ${member.id}`}>
              ID: {member.id}
            </p>
          </div>
        </div>

        <p className={styles.memberBio}>
          {member.bio || "Thành viên chưa thêm giới thiệu."}
        </p>

        <div className={styles.memberFooter}>
          <span className={styles.small}>
            {ROLE_LABEL[member.role]} · {member.followersCount} theo dõi
          </span>
          <Link href={member.profileUrl} className={styles.memberProfileBtn}>
            Xem hồ sơ <DiscoveryIcon name="arrow" />
          </Link>
        </div>
      </div>
    </article>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import type { Topic } from "@/lib/discovery-community/model";
import type { MemberSearchResult } from "@/lib/discovery-community/members";
import { DiscoveryIcon } from "./DiscoveryUI";
import styles from "./Discovery.module.css";

type SearchScope = "posts" | "users";

export function FeedFilters({
  topics,
  order,
  q,
  topic,
  author,
  activeTab = "posts",
  variant = "top",
}: {
  topics: Topic[];
  order: string;
  q?: string;
  topic?: string;
  author?: string;
  loggedIn: boolean;
  activeTab?: SearchScope;
  variant?: "top" | "sidebar";
}) {
  const isTop = variant === "top";
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SearchScope>(activeTab);
  const [postQuery, setPostQuery] = useState(activeTab === "posts" ? (q ?? "") : "");
  const [userQuery, setUserQuery] = useState(activeTab === "users" ? (q ?? "") : "");
  const [quickState, setQuickState] = useState<"idle" | "typing" | "loading" | "ready" | "error">("idle");
  const [quickResult, setQuickResult] = useState<MemberSearchResult | null>(null);
  const [quickError, setQuickError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scope !== "users") {
      abortRef.current?.abort();
      return;
    }
    const cleaned = userQuery.trim();
    if (!cleaned) {
      abortRef.current?.abort();
      setQuickResult(null);
      setQuickError("");
      setQuickState("idle");
      return;
    }
    if (cleaned.length > 80) {
      setQuickError("Từ khóa tìm kiếm tối đa 80 ký tự.");
      setQuickState("error");
      return;
    }

    setQuickState("typing");
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setQuickState("loading");
      setQuickError("");
      try {
        const params = new URLSearchParams({ q: cleaned, page: "1", limit: "5" });
        const res = await fetch(`/api/discovery/users?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const data = (await res.json()) as MemberSearchResult & { error?: string };
        if (!res.ok) throw new Error(data.error || "Chưa thể tìm kiếm thành viên.");
        setQuickResult(data);
        setQuickState("ready");
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setQuickError(err instanceof Error ? err.message : "Chưa thể tìm kiếm thành viên.");
        setQuickState("error");
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [scope, userQuery]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <section
      className={`${styles.panel} ${isTop ? styles.explorerTop : styles.panelBody}`}
      aria-label="Khám phá cộng đồng"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="discovery-filters"
        className={
          isTop
            ? "flex min-h-10 w-full items-center justify-between gap-3 text-left text-sm font-semibold sm:hidden"
            : "flex min-h-10 w-full items-center justify-between gap-3 text-left text-sm font-semibold min-[1100px]:hidden"
        }
      >
        <span className="flex items-center gap-2">
          <DiscoveryIcon name="search" />
          Khám phá cộng đồng{q || topic ? " · Đang lọc" : ""}
        </span>
        <span aria-hidden="true">{open ? "−" : "＋"}</span>
      </button>

      <div
        id="discovery-filters"
        className={
          isTop
            ? `${open ? "mt-3 block" : "hidden"} sm:mt-0 sm:block`
            : `${open ? "mt-4 block" : "hidden"} min-[1100px]:mt-0 min-[1100px]:block`
        }
      >
        <div className={isTop ? styles.explorerHeader : undefined}>
          <h2
            className={
              isTop
                ? `${styles.panelHeading} hidden sm:block`
                : `${styles.panelHeading} hidden min-[1100px]:mb-4 min-[1100px]:block`
            }
          >
            Khám phá cộng đồng
          </h2>

          <div
            className={`${styles.searchTabs} ${isTop ? styles.explorerTabs : ""}`}
            role="tablist"
            aria-label="Phạm vi tìm kiếm Discovery"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scope === "posts"}
              onClick={() => setScope("posts")}
              className={styles.searchTab}
            >
              <DiscoveryIcon name="feed" />
              Bài viết
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === "users"}
              onClick={() => setScope("users")}
              className={styles.searchTab}
            >
              <DiscoveryIcon name="people" />
              Thành viên
            </button>
          </div>
        </div>

        {scope === "posts" ? (
          <form action="/discovery" className={isTop ? "mt-3.5" : "mt-4 space-y-4"}>
            <input type="hidden" name="order" value={order} />
            {author && <input name="author" type="hidden" value={author} />}

            <div className={isTop ? styles.explorerPostsRow : "space-y-4"}>
              <div className="min-w-0">
                <label htmlFor="discovery-filter-q" className={styles.fieldLabel}>
                  Nội dung hoặc hashtag
                </label>
                <div className={styles.searchInputWrap}>
                  <input
                    id="discovery-filter-q"
                    name="q"
                    maxLength={80}
                    value={postQuery}
                    onChange={(e) => setPostQuery(e.target.value)}
                    className={styles.searchInput}
                    placeholder="Tìm câu chuyện, hashtag…"
                  />
                  {postQuery && (
                    <button
                      type="button"
                      onClick={() => setPostQuery("")}
                      aria-label="Xóa từ khóa"
                      className={styles.clearBtn}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <label htmlFor="discovery-filter-topic" className={styles.fieldLabel}>
                  Chủ đề
                </label>
                <select
                  id="discovery-filter-topic"
                  name="topic"
                  defaultValue={topic ?? ""}
                  className={styles.searchSelect}
                >
                  <option value="">Tất cả chủ đề</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className={`${styles.primary} ${isTop ? styles.explorerSubmit : "w-full"}`}
              >
                <DiscoveryIcon name="search" />
                Tìm kiếm
              </button>
            </div>

            {(q || topic || author) && (
              <div className="mt-2.5 flex justify-end">
                <Link
                  href="/discovery"
                  className="text-xs text-link underline underline-offset-4"
                >
                  Xóa bộ lọc
                </Link>
              </div>
            )}
          </form>
        ) : (
          <form action="/discovery" className={isTop ? "mt-3.5 space-y-3" : "mt-4 space-y-3.5"}>
            <input type="hidden" name="tab" value="users" />

            <div className={isTop ? styles.explorerUsersRow : "space-y-3.5"}>
              <div className="min-w-0">
                <label htmlFor="discovery-filter-user" className={styles.fieldLabel}>
                  Tên thành viên, ID-User hoặc IP ID
                </label>
                <div className={styles.searchInputWrap}>
                  <input
                    id="discovery-filter-user"
                    name="q"
                    maxLength={80}
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    className={styles.searchInput}
                    placeholder="Nhập tên, mã ID-User hoặc IP (vd: 10.10.1.10)…"
                    autoComplete="off"
                  />
                  {userQuery && (
                    <button
                      type="button"
                      onClick={() => setUserQuery("")}
                      aria-label="Xóa từ khóa thành viên"
                      className={styles.clearBtn}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className={`${styles.primary} ${isTop ? styles.explorerSubmit : "w-full"}`}
              >
                <DiscoveryIcon name="search" />
                Tìm kiếm
              </button>
            </div>

            {quickState === "idle" && (
              <p className={styles.small}>
                Nhập tên (có dấu hoặc không dấu), mã ID-User hoặc CyberLab IP ID để tìm hồ sơ thành viên.
              </p>
            )}

            {quickState === "typing" && (
              <p className={styles.searchStatus} aria-live="polite">
                Đang nhập…
              </p>
            )}

            {quickState === "loading" && (
              <div className={styles.quickMembers} aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className={styles.quickMemberSkeleton}>
                    <div className={`${styles.skeleton} ${styles.pulse} h-9 w-9 rounded-full`} />
                    <div className="flex-1 space-y-1.5">
                      <div className={`${styles.skeleton} ${styles.pulse} h-3.5 w-3/4`} />
                      <div className={`${styles.skeleton} ${styles.pulse} h-2.5 w-1/2`} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {quickState === "error" && (
              <p role="alert" className={styles.quickError}>
                {quickError}
              </p>
            )}

            {quickState === "ready" && quickResult && quickResult.items.length === 0 && (
              <p className={styles.small}>
                Không tìm thấy thành viên nào khớp “{quickResult.query}”.
              </p>
            )}

            {quickState === "ready" && quickResult && quickResult.items.length > 0 && (
              <div className={styles.quickMembers} aria-label="Gợi ý thành viên">
                {quickResult.items.map((m) => (
                  <Link key={m.id} href={m.profileUrl} className={styles.quickMember}>
                    <Avatar name={m.displayName} url={m.avatarUrl} size={36} />
                    <span className="min-w-0 flex-1">
                      <strong className={styles.quickMemberName}>{m.displayName}</strong>
                      <span className={styles.quickMemberMeta}>
                        {m.cyberIp && <span className={styles.quickMemberIp}>{m.cyberIp}</span>}
                        <span className={styles.quickMemberId}>ID: {m.id}</span>
                      </span>
                    </span>
                  </Link>
                ))}
                {quickResult.total > quickResult.items.length && (
                  <Link
                    href={`/discovery?tab=users&q=${encodeURIComponent(quickResult.query)}`}
                    className={styles.quickMoreLink}
                  >
                    Xem tất cả {quickResult.total} thành viên →
                  </Link>
                )}
              </div>
            )}

            {activeTab === "users" && q && (
              <div className="flex justify-end">
                <Link
                  href="/discovery?tab=users"
                  className="text-xs text-link underline underline-offset-4"
                >
                  Xóa bộ lọc
                </Link>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

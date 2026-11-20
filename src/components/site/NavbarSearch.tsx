"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/kit";
import type { QuickSearchResult } from "@/lib/search";
import styles from "./NavbarSearch.module.css";

const DEBOUNCE_MS = 280;

export function NavbarSearch() {
  const router = useRouter();
  const pathname = usePathname();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [maxBarWidth, setMaxBarWidth] = useState<number>(268);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuickSearchResult | null>(null);

  // Tự tính khoảng trống khả dụng bên trái kính lúp; nếu quá hẹp thì tự thu gọn về kính lúp thay vì làm vỡ Navbar
  useEffect(() => {
    if (!expanded) return;
    function updateRoom() {
      const vw = window.innerWidth;
      if (vw < 640) {
        setMaxBarWidth(268);
        return;
      }
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Chừa vùng an toàn tối thiểu 120px bên trái cho Logo
      const available = Math.floor(rect.right - 120);
      if (available < 190) {
        setDropdownOpen(false);
        setExpanded(false);
        return;
      }
      setMaxBarWidth(Math.min(268, Math.max(220, available)));
    }
    updateRoom();
    window.addEventListener("resize", updateRoom);
    return () => window.removeEventListener("resize", updateRoom);
  }, [expanded]);

  // Đóng dropdown khi điều hướng sang trang mới
  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname]);

  // Focus tự động khi mở rộng thanh tìm kiếm
  useEffect(() => {
    if (!expanded) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  // Click bên ngoài: đóng dropdown nhưng KHÔNG làm mất từ khóa
  useEffect(() => {
    if (!expanded && !dropdownOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        if (!query.trim()) {
          setExpanded(false);
        }
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [expanded, dropdownOpen, query]);

  // Tìm kiếm trực tiếp có debounce & hủy request cũ
  useEffect(() => {
    const cleaned = query.trim();
    if (!cleaned) {
      abortRef.current?.abort();
      setLoading(false);
      setError("");
      setResult(null);
      return;
    }

    if (cleaned.length > 80) {
      setLoading(false);
      setError("Từ khóa tối đa 80 ký tự.");
      return;
    }

    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(cleaned)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const data = (await res.json()) as QuickSearchResult & { error?: string };
        if (!res.ok) throw new Error(data.error || "Chưa thể tìm kiếm lúc này.");
        setResult(data);
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Chưa thể tìm kiếm lúc này.");
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function collapseAll() {
    setDropdownOpen(false);
    setExpanded(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  function handleTriggerClick() {
    if (!expanded) {
      setExpanded(true);
      if (query.trim()) setDropdownOpen(true);
    } else {
      inputRef.current?.focus();
      if (query.trim()) setDropdownOpen(true);
    }
  }

  function handleClearOrClose() {
    if (query.length > 0) {
      setQuery("");
      setResult(null);
      setError("");
      setDropdownOpen(false);
      inputRef.current?.focus();
    } else {
      collapseAll();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      collapseAll();
    } else if (e.key === "Enter") {
      const cleaned = query.trim();
      if (!cleaned) return;
      e.preventDefault();
      setDropdownOpen(false);
      router.push(`/search?q=${encodeURIComponent(cleaned)}`);
    }
  }

  const trimmed = query.trim();
  const showDropdown = expanded && dropdownOpen && trimmed.length > 0;
  const hasMembers = (result?.members.length ?? 0) > 0;
  const hasPosts = (result?.posts.length ?? 0) > 0;
  const isEmpty = !loading && !error && result && !hasMembers && !hasPosts;

  return (
    <div ref={rootRef} className={styles.root}>
      <div
        className={`${styles.bar} ${expanded ? styles.expanded : ""}`}
        style={{ "--nav-search-max": `${maxBarWidth}px` } as React.CSSProperties}
        role="search"
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          aria-label={expanded ? "Tìm kiếm" : "Mở thanh tìm kiếm"}
          aria-expanded={expanded}
          aria-controls="navbar-search-dropdown"
          className={styles.trigger}
        >
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5" />
          </svg>
        </button>

        {expanded && (
          <>
            <input
              ref={inputRef}
              type="search"
              value={query}
              maxLength={80}
              onFocus={() => {
                if (query.trim()) setDropdownOpen(true);
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(Boolean(e.target.value.trim()));
              }}
              onKeyDown={handleKeyDown}
              placeholder="Tìm bài viết, thành viên, IP…"
              aria-label="Tìm bài viết, thành viên hoặc CyberLab IP"
              autoComplete="off"
              className={styles.input}
            />
            {loading && <span className={styles.spinner} aria-hidden="true" />}
            <button
              type="button"
              onClick={handleClearOrClose}
              aria-label={query ? "Xóa từ khóa tìm kiếm" : "Đóng thanh tìm kiếm"}
              className={styles.closeBtn}
            >
              ×
            </button>
          </>
        )}
      </div>

      {showDropdown && (
        <div
          id="navbar-search-dropdown"
          role="region"
          aria-label="Kết quả tìm kiếm trực tiếp"
          className={styles.dropdown}
        >
          <div className={styles.dropdownBody}>
            {loading && !result && (
              <div className={styles.loadingRows} aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={styles.skeletonRow}>
                    <div className={`${styles.skeleton} h-9 w-9 rounded-full`} />
                    <div className="flex-1 space-y-1.5">
                      <div className={`${styles.skeleton} h-3.5 w-2/3`} />
                      <div className={`${styles.skeleton} h-2.5 w-1/2`} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p role="alert" className={`${styles.emptyState} text-danger`}>
                {error}
              </p>
            )}

            {isEmpty && (
              <div className={styles.emptyState}>
                Không tìm thấy thành viên hay bài viết phù hợp cho{" "}
                <strong>“{trimmed}”</strong>.
              </div>
            )}

            {hasMembers && result && (
              <section className={styles.section} aria-label="Thành viên">
                <div className={styles.sectionTitle}>
                  <span>Thành viên</span>
                  <span>{result.totalMembers}</span>
                </div>
                {result.members.map((m) => (
                  <Link
                    key={m.id}
                    href={m.profileUrl}
                    onClick={() => setDropdownOpen(false)}
                    className={styles.hit}
                  >
                    <Avatar name={m.displayName} url={m.avatarUrl} size={36} />
                    <span className={styles.hitBody}>
                      <span className={styles.hitTitle}>{m.displayName}</span>
                      <span className={styles.hitMeta}>
                        {m.cyberIp && <span className={styles.ipBadge}>{m.cyberIp}</span>}
                        <span className={styles.idChip}>ID: {m.id.slice(0, 8)}…</span>
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            )}

            {hasPosts && result && (
              <section className={styles.section} aria-label="Bài viết">
                <div className={styles.sectionTitle}>
                  <span>Bài viết</span>
                  <span>{result.posts.length}</span>
                </div>
                {result.posts.map((p) => (
                  <Link
                    key={p.id}
                    href={p.href}
                    onClick={() => setDropdownOpen(false)}
                    className={styles.hit}
                  >
                    <Avatar name={p.authorName} url={p.authorAvatar} size={34} />
                    <span className={styles.hitBody}>
                      <span className={styles.hitTitle}>{p.title}</span>
                      {p.excerpt && <span className={styles.hitExcerpt}>{p.excerpt}</span>}
                      <span className={styles.hitMeta}>
                        <span className={styles.kindBadge}>{p.kindLabel}</span>
                        <span className="truncate">{p.authorName}</span>
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            )}
          </div>

          <Link
            href={`/search?q=${encodeURIComponent(trimmed)}`}
            onClick={() => setDropdownOpen(false)}
            className={styles.dropdownFooter}
          >
            <span className="truncate">Xem tất cả kết quả cho “{trimmed}”</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}

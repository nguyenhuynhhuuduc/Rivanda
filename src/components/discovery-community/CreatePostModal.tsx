"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/kit";
import type { Topic } from "@/lib/discovery-community/model";
import type { SavedPostResult } from "@/app/(light)/discovery/community-actions";
import { Composer } from "./Composer";
import { DiscoveryIcon } from "./DiscoveryUI";
import { StorageMeterView, type StorageUsageData } from "./StorageMeterView";
import styles from "./Discovery.module.css";

type Viewer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

function savedNotice(saved: SavedPostResult): { text: string; href: string; linkLabel: string } {
  if (saved.status === "draft") {
    return {
      text: "Đã lưu bản nháp thành công. Bạn có thể tiếp tục chỉnh sửa bất cứ lúc nào.",
      href: `/discovery/posts/${saved.id}/edit`,
      linkLabel: "Mở bản nháp",
    };
  }
  if (saved.status === "pending") {
    return {
      text: "Bài viết đã được gửi và đang chờ Admin kiểm duyệt trước khi hiển thị công khai.",
      href: "/account/discovery",
      linkLabel: "Xem trong Bài của tôi",
    };
  }
  if (saved.visibility === "private") {
    return {
      text: "Đã đăng bài ở chế độ riêng tư (Chỉ mình tôi).",
      href: `/discovery/posts/${saved.id}`,
      linkLabel: "Xem bài viết",
    };
  }
  return {
    text: "Đã đăng bài thành công! Bảng tin Discovery đã được cập nhật.",
    href: `/discovery/posts/${saved.id}`,
    linkLabel: "Xem bài viết",
  };
}

export function CreatePostModal({
  user,
  loginHref,
  topics,
  initialUsage,
}: {
  user: Viewer | null;
  loginHref: string;
  topics: Topic[];
  initialUsage: StorageUsageData | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [usage, setUsage] = useState<StorageUsageData | null>(initialUsage);
  const [sessionKey, setSessionKey] = useState(0);
  const [lastSaved, setLastSaved] = useState<SavedPostResult | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialUsage) setUsage(initialUsage);
  }, [initialUsage]);

  const finishClose = useCallback(() => {
    setConfirmDiscard(false);
    setClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setIsDirty(false);
      setSessionKey((k) => k + 1);
      triggerRef.current?.focus({ preventScroll: true });
    }, 170);
  }, []);

  const requestClose = useCallback(() => {
    if (isPending) return;
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    finishClose();
  }, [isPending, isDirty, finishClose]);

  // Khóa cuộn nền khi mở Modal (giữ nguyên vị trí cuộn của trang Discovery) + lắng nghe ESC
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, requestClose]);

  const handleOpen = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setClosing(false);
    setConfirmDiscard(false);
    setOpen(true);
  }, []);

  const handleSaved = useCallback(
    (saved: SavedPostResult) => {
      if (saved.usage) setUsage(saved.usage);
      setLastSaved(saved);
      setIsDirty(false);
      setIsPending(false);
      finishClose();
      router.refresh();
    },
    [finishClose, router]
  );

  const notice = lastSaved ? savedNotice(lastSaved) : null;

  return (
    <>
      <div className={`${styles.panel} ${styles.compose}`}>
        {user ? (
          <>
            <button
              ref={triggerRef}
              type="button"
              onClick={handleOpen}
              className={`${styles.composePrompt} w-full text-left`}
            >
              <Avatar name={user.displayName} url={user.avatarUrl} size={42} />
              <span className={styles.composeInput}>Bạn muốn chia sẻ điều gì hôm nay?</span>
            </button>
            <div className={styles.composeBottom}>
              <span className={styles.composeHint}>
                <DiscoveryIcon name="image" />
                Status, bài viết &amp; khoảnh khắc
              </span>
              <button type="button" onClick={handleOpen} className={styles.primary}>
                <DiscoveryIcon name="edit" />
                Tạo bài viết
              </button>
            </div>
          </>
        ) : (
          <>
            <Link href={loginHref} className={styles.composePrompt}>
              <Avatar name="Discovery" url={null} size={42} />
              <span className={styles.composeInput}>Câu chuyện của bạn bắt đầu từ đây…</span>
            </Link>
            <div className={styles.composeBottom}>
              <span className={styles.composeHint}>
                <DiscoveryIcon name="image" />
                Status, bài viết &amp; khoảnh khắc
              </span>
              <Link href={loginHref} className={styles.primary}>
                <DiscoveryIcon name="edit" />
                Tạo bài viết
              </Link>
            </div>
            <p className={`${styles.small} mt-3`}>
              Bạn có thể đọc bài công khai.{" "}
              <Link className="text-link underline underline-offset-4" href={loginHref}>
                Đăng nhập
              </Link>{" "}
              để thích, bình luận và lưu bài.
            </p>
          </>
        )}
      </div>

      {notice && (
        <div role="status" className={styles.savedBanner}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{notice.text}</p>
            <Link href={notice.href} className={`${styles.readMore} !mt-1.5`}>
              {notice.linkLabel} <DiscoveryIcon name="arrow" />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setLastSaved(null)}
            aria-label="Đóng thông báo"
            className={styles.modalCloseBtn}
          >
            ×
          </button>
        </div>
      )}

      {user && mounted && open
        ? createPortal(
            <div
              className={`${styles.scope} ${styles.modalBackdrop} ${
                closing ? styles.modalBackdropClosing : ""
              }`}
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) requestClose();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="discovery-create-modal-title"
                className={`${styles.modalDialog} ${closing ? styles.modalDialogClosing : ""}`}
              >
                <header className={styles.modalHeader}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`${styles.emptyIcon} !m-0 !h-10 !w-10 shrink-0`}>
                      <DiscoveryIcon name="edit" />
                    </div>
                    <div className="min-w-0">
                      <h2
                        id="discovery-create-modal-title"
                        className="font-display text-xl font-bold leading-tight sm:text-2xl"
                      >
                        Chia sẻ với cộng đồng
                      </h2>
                      <p className={styles.small}>
                        Viết một status, kể câu chuyện hoặc thêm những khoảnh khắc.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={requestClose}
                    aria-label="Đóng cửa sổ tạo bài viết"
                    className={styles.modalCloseBtn}
                  >
                    ×
                  </button>
                </header>

                {confirmDiscard && !isPending && (
                  <div role="alertdialog" aria-label="Xác nhận hủy nội dung chưa lưu" className={styles.discardBar}>
                    <p className="text-xs font-medium sm:text-sm">
                      Bạn có nội dung hoặc ảnh chưa lưu. Bạn muốn hủy và đóng cửa sổ?
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDiscard(false)}
                        className={styles.discardKeepBtn}
                      >
                        Tiếp tục soạn
                      </button>
                      <button
                        type="button"
                        onClick={finishClose}
                        className={styles.discardDropBtn}
                      >
                        Đóng &amp; hủy
                      </button>
                    </div>
                  </div>
                )}

                <Composer
                  key={sessionKey}
                  topics={topics}
                  variant="modal"
                  usage={usage ?? undefined}
                  topSlot={usage ? <StorageMeterView usage={usage} compact /> : null}
                  onDirtyChange={setIsDirty}
                  onPendingChange={setIsPending}
                  onSaved={handleSaved}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

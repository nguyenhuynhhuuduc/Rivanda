"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  savePostAction,
  type ActionState,
  type SavedPostResult,
} from "@/app/(light)/discovery/community-actions";
import { btnOutline, btnPrimary, inputCls } from "@/components/ui/kit";
import { ImageDropZone } from "@/components/upload/ImageDropZone";
import uploadStyles from "@/components/upload/ImageUpload.module.css";
import type { Kind, Post, Topic } from "@/lib/discovery-community/model";
import type { StorageUsageData } from "./StorageMeterView";
import { DiscoveryIcon, PostStateNotice } from "./DiscoveryUI";
import styles from "./Discovery.module.css";

const MAX_IMAGES = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BATCH_BYTES = 40 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

function syncFilesToInput(input: HTMLInputElement | null, items: SelectedPhoto[]) {
  if (!input || typeof DataTransfer === "undefined") return;
  try {
    const dt = new DataTransfer();
    for (const item of items) dt.items.add(item.file);
    input.files = dt.files;
  } catch {
    // Một số môi trường kiểm thử/trình duyệt cũ không cho gán DataTransfer
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function Composer({
  topics,
  post,
  variant = "page",
  usage,
  topSlot,
  onDirtyChange,
  onPendingChange,
  onSaved,
}: {
  topics: Topic[];
  post?: Post;
  variant?: "page" | "modal";
  usage?: StorageUsageData;
  topSlot?: React.ReactNode;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onSaved?: (saved: SavedPostResult) => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePostAction, {});
  const [kind, setKind] = useState<Kind>(post?.kind ?? "status");
  const [topicId, setTopicId] = useState<string>(post?.topic?.id ?? "");
  const [title, setTitle] = useState<string>(post?.title ?? "");
  const [body, setBody] = useState<string>(post?.body ?? "");
  const [tags, setTags] = useState<string>(post?.tags.join(" ") ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(
    post?.visibility ?? "public"
  );
  const [keptIds, setKeptIds] = useState<string[]>(() => post?.media.map((m) => m.id) ?? []);
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [clientImageError, setClientImageError] = useState<string>("");
  const [activeIntent, setActiveIntent] = useState<"publish" | "draft" | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<SelectedPhoto | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const selectedPhotosRef = useRef<SelectedPhoto[]>([]);
  const handledSavedIdRef = useRef<string | null>(null);

  selectedPhotosRef.current = selectedPhotos;

  // Dọn dẹp object URL khi unmount
  useEffect(() => {
    return () => {
      for (const item of selectedPhotosRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  // Đóng lightbox xem phóng to bằng phím ESC (chặn lan ra Modal cha)
  useEffect(() => {
    if (!lightboxPhoto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setLightboxPhoto(null);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightboxPhoto]);

  // Giữ nguyên ảnh đã chọn trong <input type="file"> sau khi action trả lỗi (tránh React reset input file)
  useEffect(() => {
    if (!pending) {
      setActiveIntent(null);
      if (state.error && selectedPhotosRef.current.length > 0) {
        syncFilesToInput(fileInputRef.current, selectedPhotosRef.current);
      }
    }
  }, [pending, state.error]);

  // Thông báo trạng thái đang tải cho Modal (chặn đóng khi đang upload/gửi bài)
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  // Báo thành công về Modal khi lưu/đăng thành công ở chế độ modal
  useEffect(() => {
    if (variant === "modal" && state.saved && handledSavedIdRef.current !== state.saved.id) {
      handledSavedIdRef.current = state.saved.id;
      onSaved?.(state.saved);
    }
  }, [variant, state.saved, onSaved]);

  const parsedTags = useMemo(
    () =>
      tags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, "").trim())
        .filter(Boolean),
    [tags]
  );

  const hasOverlongTag = parsedTags.some((t) => t.length > 30);
  const tooManyTags = parsedTags.length > 8;

  const isDirty = useMemo(() => {
    const initialKind = post?.kind ?? "status";
    const initialTopic = post?.topic?.id ?? "";
    const initialTitle = post?.title ?? "";
    const initialBody = post?.body ?? "";
    const initialTags = post?.tags.join(" ") ?? "";
    const initialVis = post?.visibility ?? "public";
    const initialKeepCount = post?.media.length ?? 0;

    return (
      kind !== initialKind ||
      topicId !== initialTopic ||
      title.trim() !== initialTitle.trim() ||
      body.trim() !== initialBody.trim() ||
      tags.trim() !== initialTags.trim() ||
      visibility !== initialVis ||
      keptIds.length !== initialKeepCount ||
      selectedPhotos.length > 0
    );
  }, [kind, topicId, title, body, tags, visibility, keptIds.length, selectedPhotos.length, post]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const maxNewAllowed = Math.max(0, MAX_IMAGES - keptIds.length);
  const selectedTotalBytes = selectedPhotos.reduce((sum, item) => sum + item.file.size, 0);
  const remainingQuotaBytes = usage ? Math.max(0, usage.limit - usage.used) : null;
  const likelyOverQuota =
    remainingQuotaBytes !== null && selectedTotalBytes > remainingQuotaBytes;

  function handleIncomingImages(incoming: File[]) {
    if (!incoming.length) return;

    const errors: string[] = [];
    const next = [...selectedPhotos];

    for (const file of incoming) {
      if (next.length >= maxNewAllowed) {
        errors.push(`Tối đa ${MAX_IMAGES} ảnh cho một bài viết.`);
        break;
      }
      if (!ALLOWED_MIME.has(file.type)) {
        errors.push(`${file.name}: chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.`);
        continue;
      }
      if (file.size < 1 || file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: mỗi ảnh tối đa 5MB.`);
        continue;
      }
      const nextBytes = next.reduce((s, p) => s + p.file.size, 0) + file.size;
      if (nextBytes > MAX_BATCH_BYTES) {
        errors.push("Tổng dung lượng ảnh mỗi lần gửi tối đa 40MB.");
        break;
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setSelectedPhotos(next);
    setClientImageError(errors.join(" "));
    syncFilesToInput(fileInputRef.current, next);
  }

  function handleReplacePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    const targetId = replaceTargetId;
    setReplaceTargetId(null);
    if (!file || !targetId) return;

    if (!ALLOWED_MIME.has(file.type)) {
      setClientImageError(`${file.name}: chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.`);
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_BYTES) {
      setClientImageError(`${file.name}: mỗi ảnh tối đa 5MB.`);
      return;
    }
    const othersBytes = selectedPhotos
      .filter((p) => p.id !== targetId)
      .reduce((sum, p) => sum + p.file.size, 0);
    if (othersBytes + file.size > MAX_BATCH_BYTES) {
      setClientImageError("Tổng dung lượng ảnh mỗi lần gửi tối đa 40MB.");
      return;
    }

    const old = selectedPhotos.find((p) => p.id === targetId);
    if (old) URL.revokeObjectURL(old.previewUrl);

    const next = selectedPhotos.map((p) =>
      p.id === targetId
        ? { id: targetId, file, previewUrl: URL.createObjectURL(file) }
        : p
    );
    setSelectedPhotos(next);
    setClientImageError("");
    syncFilesToInput(fileInputRef.current, next);
  }

  function handleRemoveSelectedPhoto(photoId: string) {
    const target = selectedPhotos.find((p) => p.id === photoId);
    if (target) {
      URL.revokeObjectURL(target.previewUrl);
      if (lightboxPhoto?.id === photoId) setLightboxPhoto(null);
    }
    const next = selectedPhotos.filter((p) => p.id !== photoId);
    setSelectedPhotos(next);
    setClientImageError("");
    syncFilesToInput(fileInputRef.current, next);
  }

  function handleClearAllSelectedPhotos() {
    for (const p of selectedPhotos) URL.revokeObjectURL(p.previewUrl);
    setSelectedPhotos([]);
    setLightboxPhoto(null);
    setClientImageError("");
    syncFilesToInput(fileInputRef.current, []);
  }

  function toggleKeepExisting(mediaId: string, checked: boolean) {
    setKeptIds((prev) =>
      checked ? (prev.includes(mediaId) ? prev : [...prev, mediaId]) : prev.filter((id) => id !== mediaId)
    );
  }

  const fieldsContent = (
    <>
      {variant === "page" && (
        <div className={styles.editorIntro}>
          <div className={`${styles.emptyIcon} !m-0 !h-11 !w-11`}>
            <DiscoveryIcon name="edit" />
          </div>
          <div>
            <p className="text-sm font-semibold">Chia sẻ theo cách của bạn</p>
            <p className={styles.small}>
              Viết một status, kể câu chuyện hoặc thêm những khoảnh khắc.
            </p>
          </div>
        </div>
      )}

      {topSlot}

      {variant === "modal" && <input type="hidden" name="mode" value="modal" />}
      {post && (
        <>
          <input type="hidden" name="id" value={post.id} />
          <input type="hidden" name="revision" value={post.revision} />
        </>
      )}

      <fieldset disabled={pending} className="space-y-5 disabled:opacity-65">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`composer-kind-${variant}`} className={styles.fieldLabel}>
              Loại chia sẻ
            </label>
            <select
              id={`composer-kind-${variant}`}
              name="kind"
              className={styles.searchSelect}
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              <option value="status">Status · tối đa 1.000 ký tự</option>
              <option value="article">Bài viết</option>
              <option value="photos">Bộ ảnh</option>
            </select>
          </div>

          <div>
            <label htmlFor={`composer-topic-${variant}`} className={styles.fieldLabel}>
              Chủ đề
            </label>
            <select
              id={`composer-topic-${variant}`}
              name="topicId"
              className={styles.searchSelect}
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">Không chọn chủ đề</option>
              {topics.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={`composer-title-${variant}`} className={styles.fieldLabel}>
            Tiêu đề {kind === "article" ? "(cần có khi đăng bài)" : "(tùy chọn)"}
          </label>
          <input
            id={`composer-title-${variant}`}
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className={inputCls}
            placeholder={
              kind === "article" ? "Nhập tiêu đề bài viết…" : "Đặt tiêu đề ngắn nếu muốn…"
            }
          />
        </div>

        <div>
          <label htmlFor={`composer-body-${variant}`} className={styles.fieldLabel}>
            Nội dung
          </label>
          <textarea
            id={`composer-body-${variant}`}
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={kind === "status" ? 1000 : 100000}
            rows={kind === "article" ? (variant === "modal" ? 9 : 14) : variant === "modal" ? 5 : 7}
            className={`${inputCls} resize-y`}
            placeholder="Chia sẻ một điều bạn quan tâm…"
          />
          <span className="mt-1.5 block text-xs text-muted">
            {body.length.toLocaleString("vi-VN")} ký tự
            {kind === "status" ? " / 1.000" : ""} · Bài viết hỗ trợ Markdown an toàn, không hỗ trợ
            HTML.
          </span>
        </div>

        <div>
          <label htmlFor={`composer-tags-${variant}`} className={styles.fieldLabel}>
            Hashtag
          </label>
          <input
            id={`composer-tags-${variant}`}
            name="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            maxLength={255}
            className={inputCls}
            placeholder="dulich cuocsong"
          />
          <span
            className={`mt-1.5 block text-xs ${
              tooManyTags || hasOverlongTag ? "text-danger" : "text-muted"
            }`}
          >
            {parsedTags.length > 0 ? `${parsedTags.length}/8 hashtag · ` : ""}
            Tối đa 8 hashtag, mỗi tag 30 ký tự; cách nhau bằng dấu cách hoặc dấu phẩy.
          </span>
        </div>

        {post && post.media.length > 0 && (
          <fieldset>
            <legend className="mb-3 text-sm font-medium">
              Ảnh hiện có · bỏ chọn để gỡ khỏi bài
            </legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {post.media.map((m) => (
                <label className="min-w-0" key={m.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/discovery/media/${m.id}?size=thumb`}
                    alt="Ảnh hiện có"
                    className="mb-2 aspect-square w-full rounded-lg object-cover"
                  />
                  <span className="flex items-center gap-2 text-sm">
                    <input
                      name="keep"
                      value={m.id}
                      type="checkbox"
                      checked={keptIds.includes(m.id)}
                      onChange={(e) => toggleKeepExisting(m.id, e.target.checked)}
                    />
                    Giữ ảnh
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`composer-images-${variant}`} className={`${styles.fieldLabel} !mb-0`}>
              Hình ảnh ({keptIds.length + selectedPhotos.length}/{MAX_IMAGES})
            </label>
            {selectedPhotos.length > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={handleClearAllSelectedPhotos}
                className="text-xs font-medium text-danger hover:underline"
              >
                Xóa tất cả ảnh mới ({selectedPhotos.length})
              </button>
            )}
          </div>

          {/* Input thật gửi lên Server Action savePostAction */}
          <input
            ref={fileInputRef}
            name="images"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={handleReplacePhoto}
            className="sr-only"
          />

          <ImageDropZone
            id={`composer-images-${variant}`}
            multiple
            compact={selectedPhotos.length > 0}
            disabled={pending || selectedPhotos.length >= maxNewAllowed}
            title={
              selectedPhotos.length >= maxNewAllowed
                ? `Đã đạt tối đa ${MAX_IMAGES} ảnh cho bài viết`
                : selectedPhotos.length > 0
                  ? `Kéo thả hoặc chọn thêm ảnh (còn ${maxNewAllowed - selectedPhotos.length} chỗ)`
                  : `Kéo thả nhiều ảnh vào đây (tối đa ${MAX_IMAGES} ảnh/bài)`
            }
            subtitle="JPG, PNG, WebP tĩnh · mỗi ảnh ≤5MB và ≤16 triệu pixel."
            buttonLabel={selectedPhotos.length > 0 ? "Thêm ảnh khác" : "Chọn ảnh từ thiết bị"}
            onFiles={handleIncomingImages}
          />

          {selectedPhotos.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Đã chọn {selectedPhotos.length} ảnh mới ({formatFileSize(selectedTotalBytes)}). Nhấn
              vào ảnh để xem lớn, hoặc dùng nút thay thế / xóa trên từng ảnh.
            </p>
          )}

          {clientImageError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {clientImageError}
            </p>
          )}
          {likelyOverQuota && (
            <p role="alert" className="mt-2 text-xs text-warning">
              Dung lượng ảnh vừa chọn ({formatFileSize(selectedTotalBytes)}) lớn hơn dung lượng còn
              lại — hệ thống sẽ kiểm tra lại sau khi nén WebP trên server.
            </p>
          )}

          {selectedPhotos.length > 0 && (
            <div className={styles.previewGrid} aria-label="Ảnh xem trước">
              {selectedPhotos.map((item) => (
                <div key={item.id} className={styles.previewItem}>
                  <button
                    type="button"
                    onClick={() => setLightboxPhoto(item)}
                    aria-label={`Xem lớn ảnh ${item.file.name}`}
                    className="block h-full w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt={item.file.name} />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setReplaceTargetId(item.id);
                      replaceInputRef.current?.click();
                    }}
                    title="Thay thế ảnh này"
                    aria-label={`Thay thế ảnh ${item.file.name}`}
                    className={styles.previewReplace}
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleRemoveSelectedPhoto(item.id)}
                    title="Xóa ảnh này"
                    aria-label={`Xóa ảnh ${item.file.name}`}
                    className={styles.previewRemove}
                  >
                    ×
                  </button>
                  <span className={styles.previewMeta}>{formatFileSize(item.file.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor={`composer-visibility-${variant}`} className={styles.fieldLabel}>
            Ai có thể xem khi bài được xuất bản?
          </label>
          <select
            id={`composer-visibility-${variant}`}
            name="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "public" | "private")}
            className={styles.searchSelect}
          >
            <option value="public">Công khai · Mọi người</option>
            <option value="private">Riêng tư · Chỉ mình tôi</option>
          </select>
          <span className="mt-1.5 block text-xs leading-6 text-muted">
            Bản nháp và bài chờ duyệt chưa xuất hiện công khai, kể cả khi chọn Công khai. Admin có
            thể xem nội dung để kiểm duyệt.
          </span>
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      {post && <PostStateNotice status={post.status} visibility={post.visibility} />}
      <p className="text-xs leading-6 text-muted">
        Nội dung có thể được Admin ẩn hoặc yêu cầu duyệt lại. Không đăng thông tin nhạy cảm hay nội
        dung vi phạm.
      </p>
    </>
  );

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        name="intent"
        value="publish"
        disabled={pending}
        onClick={() => setActiveIntent("publish")}
        className={btnPrimary}
      >
        {pending && activeIntent === "publish" ? (
          <>
            <span className={styles.btnSpinner} aria-hidden="true" />
            Đang đăng bài…
          </>
        ) : (
          "Đăng bài"
        )}
      </button>
      <button
        type="submit"
        name="intent"
        value="draft"
        disabled={pending}
        onClick={() => setActiveIntent("draft")}
        className={btnOutline}
      >
        {pending && activeIntent === "draft" ? (
          <>
            <span className={styles.btnSpinner} aria-hidden="true" />
            Đang lưu nháp…
          </>
        ) : (
          "Lưu nháp"
        )}
      </button>
      {pending && (
        <span className="text-xs text-muted" aria-live="polite">
          Đang tải lên và xử lý, vui lòng không đóng cửa sổ…
        </span>
      )}
    </div>
  );

  const lightbox =
    lightboxPhoto && typeof document !== "undefined"
      ? createPortal(
          <div
            className={uploadStyles.lightboxBackdrop}
            role="dialog"
            aria-modal="true"
            aria-label={`Xem trước ảnh ${lightboxPhoto.file.name}`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setLightboxPhoto(null);
            }}
          >
            <div className={uploadStyles.lightboxInner}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxPhoto.previewUrl}
                alt={lightboxPhoto.file.name}
                className={uploadStyles.lightboxImg}
              />
              <div className="flex items-center gap-3 text-xs text-white/90">
                <span className="max-w-[260px] truncate">{lightboxPhoto.file.name}</span>
                <span>· {formatFileSize(lightboxPhoto.file.size)}</span>
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(null)}
                  className={uploadStyles.coverOverlayBtn}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  if (variant === "modal") {
    return (
      <>
        <form action={action} className={styles.modalForm}>
          <div className={styles.modalBody}>{fieldsContent}</div>
          <div className={styles.modalFooter}>{actionButtons}</div>
        </form>
        {lightbox}
      </>
    );
  }

  return (
    <>
      <form action={action} className={`${styles.scope} ${styles.editor} space-y-6 sm:p-8`}>
        {fieldsContent}
        {actionButtons}
      </form>
      {lightbox}
    </>
  );
}

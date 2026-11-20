"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { btnPrimary } from "@/components/ui/kit";
import { ImageDropZone } from "@/components/upload/ImageDropZone";
import { ImageCropModal, type CropSpec } from "@/components/upload/ImageCropModal";
import styles from "@/components/upload/ImageUpload.module.css";

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const COVER_CROP_SPEC: CropSpec = {
  title: "Cắt ảnh bìa hồ sơ (3:1)",
  shape: "rect",
  aspect: 3,
  outputWidth: 1800,
  outputHeight: 600,
  maxBytes: MAX_OUTPUT_BYTES,
  fileNamePrefix: "cover",
};

function assignSingleFile(input: HTMLInputElement | null, file: File | null) {
  if (!input) return;
  if (!file) {
    input.value = "";
    return;
  }
  if (typeof DataTransfer === "undefined") return;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch {
    // Bỏ qua nếu môi trường không hỗ trợ gán DataTransfer
  }
}

export function CoverPicker({
  currentUrl,
  enabled,
}: {
  currentUrl: string | null;
  enabled: boolean;
}) {
  const id = useId();
  const formInputRef = useRef<HTMLInputElement>(null);
  const replacePickerRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [lastSourceFile, setLastSourceFile] = useState<File | null>(null);
  const [pendingSource, setPendingSource] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [bannerDragging, setBannerDragging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!croppedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(croppedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [croppedFile]);

  function handleIncomingFiles(files: File[]) {
    if (!enabled) return;
    const selected = files[0];
    setError("");
    if (!selected) return;
    if (!ALLOWED_TYPES.has(selected.type)) {
      setError("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (selected.size < 1 || selected.size > MAX_SOURCE_BYTES) {
      setError("Ảnh nguồn quá lớn (tối đa 20MB trước khi cắt).");
      return;
    }
    setPendingSource(selected);
  }

  function handleConfirmCrop(file: File) {
    setCroppedFile(file);
    setLastSourceFile(pendingSource);
    setPendingSource(null);
    setRemove(false);
    setError("");
    assignSingleFile(formInputRef.current, file);
  }

  function clearSelection() {
    setCroppedFile(null);
    setLastSourceFile(null);
    setPendingSource(null);
    setError("");
    assignSingleFile(formInputRef.current, null);
  }

  const displayedBannerUrl = previewUrl ?? (!remove ? currentUrl : null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          Ảnh bìa hồ sơ (banner 3:1 · JPG, PNG, WebP · tối đa 5MB)
        </label>
        {croppedFile && <span className={styles.avatarBadge}>Ảnh bìa mới · chưa lưu</span>}
      </div>

      {/* Input thật gắn với FormData của form hồ sơ */}
      <input
        ref={formInputRef}
        type="file"
        name="cover"
        accept="image/jpeg,image/png,image/webp"
        disabled={!enabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
      <input
        ref={replacePickerRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={!enabled}
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          if (picked.length) handleIncomingFiles(picked);
        }}
      />

      {displayedBannerUrl ? (
        <div
          className={`${styles.coverBanner} ${bannerDragging ? styles.coverBannerDragging : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            if (!enabled) return;
            dragDepthRef.current += 1;
            setBannerDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (enabled) e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setBannerDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepthRef.current = 0;
            setBannerDragging(false);
            if (!enabled) return;
            const dropped = Array.from(e.dataTransfer.files ?? []);
            if (dropped.length) handleIncomingFiles([dropped[0]]);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayedBannerUrl}
            alt={previewUrl ? "Ảnh bìa mới xem trước" : "Ảnh bìa hiện tại"}
            width={1800}
            height={600}
            onError={() => {
              if (croppedFile) {
                clearSelection();
                setError("Không đọc được ảnh này. Hãy chọn ảnh hợp lệ.");
              }
            }}
          />
          {enabled && (
            <div className={styles.coverOverlay}>
              <div className="flex flex-wrap gap-2">
                {lastSourceFile && (
                  <button
                    type="button"
                    onClick={() => setPendingSource(lastSourceFile)}
                    className={styles.coverOverlayBtn}
                  >
                    Căn chỉnh lại
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => replacePickerRef.current?.click()}
                  className={styles.coverOverlayBtn}
                >
                  Thay ảnh bìa
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ImageDropZone
          id={id}
          disabled={!enabled}
          title={
            enabled
              ? "Kéo thả ảnh bìa vào đây"
              : "Ảnh bìa chưa được kích hoạt trên môi trường này"
          }
          subtitle={
            enabled
              ? "Hiển thị dạng banner ngang 3:1 trên hồ sơ công khai. JPG, PNG, WebP tối đa 5MB."
              : "Bạn vẫn có thể cập nhật avatar và thông tin cá nhân."
          }
          buttonLabel="Chọn ảnh bìa từ thiết bị"
          onFiles={handleIncomingFiles}
        />
      )}

      {displayedBannerUrl && enabled && (
        <div className={styles.actionRow}>
          <button
            type="button"
            onClick={() => replacePickerRef.current?.click()}
            className={styles.actionBtn}
          >
            Thay thế ảnh bìa
          </button>
          {lastSourceFile && (
            <button
              type="button"
              onClick={() => setPendingSource(lastSourceFile)}
              className={styles.actionBtn}
            >
              Căn chỉnh vùng cắt
            </button>
          )}
          {croppedFile && (
            <button
              type="button"
              onClick={clearSelection}
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
            >
              Hủy ảnh mới
            </button>
          )}
        </div>
      )}

      <p className="text-xs leading-6 text-muted">
        {!enabled
          ? "Ảnh bìa chưa được kích hoạt trên môi trường này. Bạn vẫn có thể cập nhật avatar và thông tin cá nhân."
          : croppedFile
            ? "Ảnh bìa mới chưa được lưu. Bấm Lưu hồ sơ để áp dụng (bạn cũng có thể kéo thả ảnh khác trực tiếp lên banner)."
            : "JPG, PNG, WebP tối đa 5MB. Kéo thả trực tiếp vào khung ảnh hoặc bấm chọn ảnh để cắt theo tỷ lệ banner 3:1."}
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {currentUrl && enabled && (
        <label className="flex min-h-10 items-center gap-2 text-sm text-muted">
          <input
            name="removeCover"
            type="checkbox"
            checked={remove}
            onChange={(e) => {
              clearSelection();
              setRemove(e.currentTarget.checked);
            }}
          />
          Gỡ ảnh bìa khi lưu
        </label>
      )}

      <ImageCropModal
        sourceFile={pendingSource}
        spec={COVER_CROP_SPEC}
        onCancel={() => setPendingSource(null)}
        onConfirm={handleConfirmCrop}
      />
    </div>
  );
}

export function ProfileSaveButton() {
  const { pending } = useFormStatus();
  return (
    <div>
      <button className={btnPrimary} disabled={pending}>
        {pending ? "Đang lưu…" : "Lưu hồ sơ"}
      </button>
      {pending && (
        <p role="status" className="mt-2 text-sm text-muted">
          Đang lưu thông tin hồ sơ…
        </p>
      )}
    </div>
  );
}

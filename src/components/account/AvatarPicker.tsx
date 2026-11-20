"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/kit";
import { ImageDropZone } from "@/components/upload/ImageDropZone";
import { ImageCropModal, type CropSpec } from "@/components/upload/ImageCropModal";
import styles from "@/components/upload/ImageUpload.module.css";

const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const AVATAR_CROP_SPEC: CropSpec = {
  title: "Cắt ảnh đại diện (1:1)",
  shape: "circle",
  aspect: 1,
  outputWidth: 640,
  outputHeight: 640,
  maxBytes: MAX_OUTPUT_BYTES,
  fileNamePrefix: "avatar",
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
    // Bỏ qua trên môi trường không hỗ trợ gán DataTransfer
  }
}

export function AvatarPicker({ name, currentUrl }: { name: string; currentUrl: string | null }) {
  const id = useId();
  const formInputRef = useRef<HTMLInputElement>(null);
  const replacePickerRef = useRef<HTMLInputElement>(null);

  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [lastSourceFile, setLastSourceFile] = useState<File | null>(null);
  const [pendingSource, setPendingSource] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
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
    const selected = files[0];
    setError("");
    if (!selected) return;
    if (!ALLOWED_TYPES.has(selected.type)) {
      setError("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (selected.size < 1 || selected.size > MAX_SOURCE_BYTES) {
      setError("Ảnh nguồn quá lớn (tối đa 15MB trước khi cắt).");
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          Ảnh đại diện (tỷ lệ 1:1 · JPG, PNG, WebP · tối đa 3MB)
        </label>
        {croppedFile && <span className={styles.avatarBadge}>Đã cắt · chưa lưu</span>}
      </div>

      {/* Input thật gắn với FormData của form hồ sơ — chỉ chứa file sau khi người dùng xác nhận Crop */}
      <input
        ref={formInputRef}
        type="file"
        name="avatar"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
      <input
        ref={replacePickerRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const picked = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          if (picked.length) handleIncomingFiles(picked);
        }}
      />

      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={`${styles.avatarFrame} ${croppedFile ? styles.avatarFramePending : ""}`}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Ảnh đại diện mới xem trước"
              width={88}
              height={88}
              className="h-full w-full object-cover"
              onError={() => {
                clearSelection();
                setError("Không đọc được ảnh này. Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ.");
              }}
            />
          ) : (
            <Avatar name={name} url={remove ? null : currentUrl} size={88} />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <ImageDropZone
            id={id}
            compact
            title="Kéo thả ảnh đại diện vào đây"
            subtitle="Hỗ trợ JPG, PNG, WebP. Sau khi chọn sẽ mở khung cắt tròn 1:1."
            buttonLabel={croppedFile || currentUrl ? "Chọn ảnh khác" : "Chọn ảnh từ thiết bị"}
            onFiles={handleIncomingFiles}
          />

          {croppedFile && (
            <div className={styles.actionRow}>
              {lastSourceFile && (
                <button
                  type="button"
                  onClick={() => setPendingSource(lastSourceFile)}
                  className={styles.actionBtn}
                >
                  Chỉnh sửa vùng cắt
                </button>
              )}
              <button
                type="button"
                onClick={() => replacePickerRef.current?.click()}
                className={styles.actionBtn}
              >
                Thay thế ảnh
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              >
                Hủy ảnh mới
              </button>
            </div>
          )}

          <p className="text-xs text-muted">
            {croppedFile
              ? "Ảnh đại diện mới chỉ được tải lên khi bạn bấm Lưu hồ sơ bên dưới."
              : "Ảnh đại diện hiện tại được giữ nguyên cho đến khi bạn xác nhận lưu."}
          </p>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {currentUrl && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                name="removeAvatar"
                checked={remove}
                onChange={(event) => {
                  clearSelection();
                  setRemove(event.currentTarget.checked);
                }}
              />
              Xóa ảnh đại diện khi lưu
            </label>
          )}
        </div>
      </div>

      <ImageCropModal
        sourceFile={pendingSource}
        spec={AVATAR_CROP_SPEC}
        onCancel={() => setPendingSource(null)}
        onConfirm={handleConfirmCrop}
      />
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import styles from "./ImageUpload.module.css";

export function ImageDropZone({
  id,
  disabled = false,
  multiple = false,
  accept = "image/jpeg,image/png,image/webp",
  title,
  subtitle,
  buttonLabel = "Chọn ảnh từ thiết bị",
  compact = false,
  onFiles,
}: {
  id?: string;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  title: string;
  subtitle?: string;
  buttonLabel?: string;
  compact?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  function triggerPick() {
    if (disabled) return;
    pickerRef.current?.click();
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepthRef.current += 1;
    setDragging(true);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragging(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length) {
      onFiles(multiple ? dropped : [dropped[0]]);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (picked.length) {
      onFiles(multiple ? picked : [picked[0]]);
    }
  }

  return (
    <div
      role="region"
      aria-label={title}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`${styles.dropZone} ${compact ? styles.dropZoneCompact : ""} ${
        dragging ? styles.dropZoneDragging : ""
      } ${disabled ? styles.dropZoneDisabled : ""}`}
    >
      <input
        ref={pickerRef}
        id={id}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={handleInputChange}
        className="sr-only"
      />
      <span className={styles.dropIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4m0 0-4 4m4-4 4 4" />
          <path d="M20 16.5A3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5" />
        </svg>
      </span>
      <p className={styles.dropTitle}>
        {dragging ? "Thả ảnh vào đây để tải lên" : title}
      </p>
      {subtitle && <p className={styles.dropSub}>{subtitle}</p>}
      <button
        type="button"
        disabled={disabled}
        onClick={triggerPick}
        className={styles.dropBtn}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

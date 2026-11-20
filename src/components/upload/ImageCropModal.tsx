"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { btnOutline, btnPrimary } from "@/components/ui/kit";
import styles from "./ImageUpload.module.css";

export type CropSpec = {
  title: string;
  shape: "circle" | "rect";
  aspect: number; // 1 cho Avatar 1:1, 3 cho Cover 3:1
  outputWidth: number;
  outputHeight: number;
  maxBytes: number;
  fileNamePrefix: string;
};

type NaturalSize = { width: number; height: number };

function clampOffset(
  x: number,
  y: number,
  nat: NaturalSize,
  rot: number,
  zoom: number,
  frameW: number,
  frameH: number
): { x: number; y: number } {
  const effW = rot % 180 === 0 ? nat.width : nat.height;
  const effH = rot % 180 === 0 ? nat.height : nat.width;
  const baseScale = Math.max(frameW / effW, frameH / effH);
  const scale = baseScale * zoom;
  const maxX = Math.max(0, (effW * scale - frameW) / 2);
  const maxY = Math.max(0, (effH * scale - frameH) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

export function ImageCropModal({
  sourceFile,
  spec,
  onCancel,
  onConfirm,
}: {
  sourceFile: File | null;
  spec: CropSpec;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({
    w: spec.aspect === 1 ? 300 : 560,
    h: spec.aspect === 1 ? 300 : Math.round(560 / spec.aspect),
  });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tính kích thước khung crop responsive cho desktop & mobile
  useEffect(() => {
    if (!sourceFile) return;
    function measure() {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
      if (spec.aspect === 1) {
        const size = Math.min(320, Math.max(220, vw - 56));
        setFrameSize({ w: size, h: size });
      } else {
        const w = Math.min(600, Math.max(260, vw - 48));
        setFrameSize({ w, h: Math.round(w / spec.aspect) });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [sourceFile, spec.aspect]);

  // Tạo và thu hồi object URL tạm thời cho ảnh nguồn
  useEffect(() => {
    if (!sourceFile) {
      setSourceUrl(null);
      setNatural(null);
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourceUrl(url);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setError("");
    setProcessing(false);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  // Khóa cuộn nền & hỗ trợ phím ESC
  useEffect(() => {
    if (!sourceFile) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !processing) {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sourceFile, processing, onCancel]);

  // Luôn kẹp vị trí khi đổi zoom, rotation hoặc kích thước khung
  useEffect(() => {
    if (!natural) return;
    setOffset((cur) => clampOffset(cur.x, cur.y, natural, rotation, zoom, frameSize.w, frameSize.h));
  }, [natural, rotation, zoom, frameSize.w, frameSize.h]);

  const adjustZoom = useCallback((nextZoom: number) => {
    const clamped = Math.min(3, Math.max(1, Math.round(nextZoom * 100) / 100));
    setZoom(clamped);
  }, []);

  function handleReset() {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setError("");
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!natural || processing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setGrabbing(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId || !natural) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(
      clampOffset(
        dragRef.current.originX + dx,
        dragRef.current.originY + dy,
        natural,
        rotation,
        zoom,
        frameSize.w,
        frameSize.h
      )
    );
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setGrabbing(false);
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!natural || processing) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    adjustZoom(zoom + delta);
  }

  async function handleConfirm() {
    if (!imgRef.current || !natural || !sourceFile || processing) return;
    setProcessing(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = spec.outputWidth;
      canvas.height = spec.outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");

      const effW = rotation % 180 === 0 ? natural.width : natural.height;
      const effH = rotation % 180 === 0 ? natural.height : natural.width;
      const baseScale = Math.max(frameSize.w / effW, frameSize.h / effH);
      const scale = baseScale * zoom;
      const ratio = spec.outputWidth / frameSize.w;
      const clamped = clampOffset(
        offset.x,
        offset.y,
        natural,
        rotation,
        zoom,
        frameSize.w,
        frameSize.h
      );

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.save();
      ctx.translate(
        spec.outputWidth / 2 + clamped.x * ratio,
        spec.outputHeight / 2 + clamped.y * ratio
      );
      ctx.rotate((rotation * Math.PI) / 180);
      const drawW = natural.width * scale * ratio;
      const drawH = natural.height * scale * ratio;
      ctx.drawImage(imgRef.current, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      const qualities = [0.9, 0.82, 0.72];
      let blob: Blob | null = null;
      let ext = "webp";

      for (const q of qualities) {
        const candidate = await canvasToBlob(canvas, "image/webp", q);
        if (candidate && candidate.type === "image/webp" && candidate.size <= spec.maxBytes) {
          blob = candidate;
          ext = "webp";
          break;
        }
      }
      if (!blob) {
        for (const q of qualities) {
          const candidate = await canvasToBlob(canvas, "image/jpeg", q);
          if (candidate && candidate.size <= spec.maxBytes) {
            blob = candidate;
            ext = "jpg";
            break;
          }
        }
      }

      if (!blob) {
        throw new Error(
          `Ảnh sau khi cắt vẫn vượt quá ${Math.round(spec.maxBytes / 1048576)}MB. Hãy thử ảnh khác.`
        );
      }

      const file = new File([blob], `${spec.fileNamePrefix}.${ext}`, {
        type: blob.type || (ext === "webp" ? "image/webp" : "image/jpeg"),
      });
      onConfirm(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cắt ảnh. Vui lòng thử lại.");
    } finally {
      setProcessing(false);
    }
  }

  if (!mounted || !sourceFile || !sourceUrl) return null;

  const effW = natural ? (rotation % 180 === 0 ? natural.width : natural.height) : 1;
  const effH = natural ? (rotation % 180 === 0 ? natural.height : natural.width) : 1;
  const baseScale = natural ? Math.max(frameSize.w / effW, frameSize.h / effH) : 1;
  const scale = baseScale * zoom;

  return createPortal(
    <div
      className={styles.cropBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !processing) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-modal-title"
        className={styles.cropDialog}
      >
        <header className={styles.cropHeader}>
          <div>
            <h3 id="image-crop-modal-title" className="font-display text-lg font-bold">
              {spec.title}
            </h3>
            <p className="text-xs text-muted">
              Kéo ảnh để căn chỉnh vị trí, phóng to/thu nhỏ hoặc xoay trước khi xác nhận.
            </p>
          </div>
          <button
            type="button"
            disabled={processing}
            onClick={onCancel}
            aria-label="Đóng cửa sổ cắt ảnh"
            className={styles.cropClose}
          >
            ×
          </button>
        </header>

        <div className={styles.cropBody}>
          <div
            className={`${styles.cropStage} ${grabbing ? styles.cropStageGrabbing : ""}`}
            style={{ width: frameSize.w, height: frameSize.h }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={sourceUrl}
              alt="Ảnh đang cắt"
              draggable={false}
              className={styles.cropImage}
              style={
                natural
                  ? {
                      width: `${natural.width * scale}px`,
                      height: `${natural.height * scale}px`,
                      transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg)`,
                    }
                  : { opacity: 0 }
              }
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                  setNatural({ width: el.naturalWidth, height: el.naturalHeight });
                } else {
                  setError("Không đọc được kích thước ảnh này.");
                }
              }}
              onError={() => setError("Không đọc được tệp ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ.")}
            />
            <div
              className={spec.shape === "circle" ? styles.cropMaskCircle : styles.cropMaskRect}
              aria-hidden="true"
            />
          </div>

          <div className={styles.cropControls}>
            <div className={styles.zoomRow}>
              <button
                type="button"
                disabled={processing || zoom <= 1}
                onClick={() => adjustZoom(zoom - 0.15)}
                aria-label="Thu nhỏ"
                className={styles.actionBtn}
              >
                −
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.02}
                value={zoom}
                disabled={processing || !natural}
                onChange={(e) => adjustZoom(Number(e.target.value))}
                aria-label="Mức phóng to"
                className={styles.zoomRange}
              />
              <button
                type="button"
                disabled={processing || zoom >= 3}
                onClick={() => adjustZoom(zoom + 0.15)}
                aria-label="Phóng to"
                className={styles.actionBtn}
              >
                +
              </button>
              <span className="w-12 text-right font-mono text-xs text-muted">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <div className={styles.cropTools}>
              <button
                type="button"
                disabled={processing || !natural}
                onClick={() => setRotation((r) => (r + 270) % 360)}
                className={styles.actionBtn}
              >
                ↺ Xoay trái 90°
              </button>
              <button
                type="button"
                disabled={processing || !natural}
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className={styles.actionBtn}
              >
                ↻ Xoay phải 90°
              </button>
              <button
                type="button"
                disabled={processing || !natural}
                onClick={handleReset}
                className={styles.actionBtn}
              >
                Đặt lại
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="w-full text-center text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <footer className={styles.cropFooter}>
          <button
            type="button"
            disabled={processing}
            onClick={onCancel}
            className={btnOutline}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={processing || !natural}
            onClick={handleConfirm}
            className={btnPrimary}
          >
            {processing ? "Đang xử lý…" : "Xác nhận"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

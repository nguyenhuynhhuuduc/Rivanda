"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/kit";

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function AvatarPicker({ name, currentUrl }: { name: string; currentUrl: string | null }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearSelection() {
    if (input.current) input.current.value = "";
    setFile(null);
    setError("");
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
      {preview ? (
        // Blob chỉ tồn tại trong trình duyệt; file chỉ gửi khi submit form hồ sơ.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Ảnh đại diện mới xem trước" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full object-cover"
          onError={() => { clearSelection(); setError("Không đọc được ảnh này. Hãy chọn ảnh JPG, PNG hoặc WebP hợp lệ."); }} />
      ) : <Avatar name={name} url={remove ? null : currentUrl} size={64} />}
      <div className="min-w-0 flex-1 text-sm">
        <label htmlFor={id} className="mb-1 block font-medium">Ảnh đại diện (JPG, PNG, WebP, tối đa 3MB)</label>
        <input ref={input} id={id} type="file" name="avatar" accept={TYPES.join(",")} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          className="block w-full min-w-0 max-w-full text-sm"
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            setError("");
            if (!selected) { setFile(null); return; }
            if (!TYPES.includes(selected.type) || selected.size > MAX_BYTES) {
              clearSelection();
              setError(selected.size > MAX_BYTES ? "Ảnh quá lớn, tối đa 3MB." : "Chỉ nhận ảnh JPG, PNG hoặc WebP.");
              return;
            }
            setFile(selected);
            setRemove(false);
          }} />
        <p id={`${id}-hint`} className="mt-2 text-xs text-muted">{file ? "Ảnh mới chưa được lưu. Bấm Lưu hồ sơ để áp dụng." : "Chọn ảnh để xem trước trước khi lưu."}</p>
        {file && <button type="button" className="mt-2 rounded-md border border-line px-3 py-1.5 hover:bg-card" onClick={clearSelection}>Hủy lựa chọn ảnh</button>}
        {error && <p id={`${id}-error`} role="alert" className="mt-2 text-danger">{error}</p>}
        {currentUrl && <label className="mt-3 flex items-center gap-2 text-muted"><input type="checkbox" name="removeAvatar" checked={remove}
          onChange={(event) => { clearSelection(); setRemove(event.currentTarget.checked); }} /> Xóa ảnh đại diện khi lưu</label>}
      </div>
    </div>
  );
}

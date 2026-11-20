"use client";
import { useEffect, useId, useRef, useState } from "react";
import { HOME_DEFAULT_BACKGROUND } from "@/lib/home-background";

export function HomeBackgroundPicker({ currentFile }: { currentFile: string | null }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null), [remove, setRemove] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (!file) { setPreview(null); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function clear() { if (input.current) input.current.value = ""; setFile(null); setPreview(null); setError(""); }
  const source = preview || (!remove && currentFile ? `/uploads/${currentFile}` : null);
  return <>
    <p className="text-sm leading-relaxed text-muted">Home ưu tiên ảnh bìa hành trình đang chọn → ảnh nền dự phòng bên dưới → nền mặc định. Ảnh Admin này hiện cũng được dùng trong khung đăng nhập.</p>
    <div className="aspect-video overflow-hidden rounded-xl" style={{ background: HOME_DEFAULT_BACKGROUND }} aria-label="Xem trước nền dự phòng">
      {source && <img src={source} alt={preview ? "Ảnh nền mới chưa lưu" : "Ảnh nền dự phòng hiện tại"} className="h-full w-full object-cover" />}
    </div>
    <label htmlFor={id} className="block text-sm font-medium">Chọn ảnh nền dự phòng mới (JPG, PNG hoặc WebP, tối đa 5MB)</label>
    <input ref={input} id={id} type="file" name="heroImage" accept="image/jpeg,image/png,image/webp" aria-describedby={`${id}-status`} className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white hover:file:bg-navy-deep" onChange={event => {
      const next = event.currentTarget.files?.[0]; setFile(null); setPreview(null); setError("");
      if (!next) return;
      if (next.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(next.type)) { if (input.current) input.current.value = ""; setError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 5MB."); return; }
      setRemove(false); setFile(next);
    }} />
    {file && <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={clear}>Hủy chọn ảnh mới</button>}
    {currentFile && <label className="flex items-start gap-2 text-sm">
      <input className="mt-1" type="checkbox" name="removeImage" checked={remove} aria-describedby={`${id}-remove-hint`} onChange={event => { clear(); setRemove(event.currentTarget.checked); }} />
      <span>Xóa ảnh nền dự phòng khi lưu<span id={`${id}-remove-hint`} className="mt-1 block text-xs leading-relaxed text-muted">Chỉ gỡ ảnh Admin; Home vẫn ưu tiên ảnh bìa hành trình đang chọn. Không xóa ảnh JourneyStory.</span></span>
    </label>}
    <p id={`${id}-status`} role="status" className="text-xs leading-relaxed text-muted">{file ? "Ảnh mới chỉ đang xem trước. Bấm Lưu thay đổi để áp dụng." : remove ? "Đang xem trước nền mặc định. Bấm Lưu thay đổi để gỡ ảnh dự phòng." : currentFile ? "Đây là ảnh dự phòng đã lưu, không phải ảnh bìa hành trình." : "Chưa có ảnh nền dự phòng; Home dùng ảnh hành trình hoặc nền mặc định."}</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </>;
}

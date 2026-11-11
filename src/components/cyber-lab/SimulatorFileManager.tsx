"use client";

import { useState, useSyncExternalStore } from "react";
import { resolveVirtualPath, SIMULATOR_HOME, VirtualFsError, type VirtualFileSystem, type VirtualLocation } from "@/lib/simulator-filesystem";
import styles from "./KaliDesktop.module.css";

export function SimulatorFileManager({ fs }: { fs: VirtualFileSystem }) {
  useSyncExternalStore(fs.subscribe, fs.getRevision, fs.getRevision);
  const [cwd, setCwd] = useState<VirtualLocation>({ path: SIMULATOR_HOME }), [name, setName] = useState("");
  const [selected, setSelected] = useState<VirtualLocation | null>(null), [draft, setDraft] = useState(""), [base, setBase] = useState("");
  const [error, setError] = useState("");
  let entries: ReturnType<VirtualFileSystem["list"]> = [], current = cwd.path, accessError = "";
  try { entries = fs.list(current); } catch (reason) {
    if (reason instanceof VirtualFsError && reason.code === "ENOENT") {
      current = SIMULATOR_HOME;
      try { entries = fs.list(current); } catch (fallback) { accessError = fallback instanceof Error ? fallback.message : "Không thể đọc thư mục."; }
    } else accessError = reason instanceof Error ? reason.message : "Không thể đọc thư mục.";
  }
  let contents: string | null = null;
  if (selected) { try { contents = fs.read(selected.path); } catch (reason) { accessError ||= reason instanceof Error ? reason.message : "Không thể đọc tệp."; } }
  const attempt = (fn: () => void) => { try { fn(); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể thao tác filesystem ảo."); } };
  const create = (directory: boolean) => attempt(() => {
    const value = name.trim();
    if (!value || value === "." || value === ".." || value.includes("/")) throw Error("Nhập tên một mục, không chứa dấu /.");
    const path = resolveVirtualPath(value, current);
    try { fs.stat(path); throw Error("Mục đã tồn tại."); } catch (reason) { if (!(reason instanceof VirtualFsError) || reason.code !== "ENOENT") throw reason; }
    if (directory) fs.mkdir(path); else fs.write(path, "");
    setName("");
  });
  return <div className={styles.fileManager}>
    <div className={styles.fileToolbar}>
      <button type="button" aria-label="Thư mục cha" onClick={() => attempt(() => { setCwd(fs.stat(current + "/..").location); setSelected(null); })}>↑</button>
      <button type="button" onClick={() => { setCwd({ path: SIMULATOR_HOME }); setSelected(null); }}>Home</button>
      <span className={styles.breadcrumb} title={current}>{current}</span>
    </div>
    <div className={styles.fileCreate}>
      <input aria-label="Tên mục mới" placeholder="Tên tệp hoặc thư mục" maxLength={80} value={name} onChange={event => setName(event.target.value)} />
      <button type="button" onClick={() => create(false)}>Tệp mới</button>
      <button type="button" onClick={() => create(true)}>Thư mục mới</button>
    </div>
    {(error || accessError) && <p role="alert" className={styles.fileError}>{error || accessError}</p>}
    <div className={styles.fileList} aria-label="Nội dung thư mục">
      {entries.map(entry => <button key={entry.path} type="button" aria-label={`Mở ${entry.name}`} className={selected?.path === entry.path ? styles.selectedFile : ""} onClick={() => attempt(() => {
        if (entry.directory) { fs.stat(entry.path + "/."); setCwd(entry.location); setSelected(null); }
        else { const text = fs.read(entry.path); setSelected(entry.location); setDraft(text); setBase(text); }
      })}><span aria-hidden="true">{entry.directory ? "📁" : "📄"}</span><span>{entry.name}</span></button>)}
      {!entries.length && !accessError && <p>Thư mục trống.</p>}
    </div>
    {selected && contents !== null && <div className={styles.editor}>
      <label htmlFor="simulator-file-content">{selected.path}</label>
      <textarea id="simulator-file-content" aria-label="Nội dung tệp" maxLength={32768} value={draft} onChange={event => setDraft(event.target.value)} />
      {contents !== base && <p role="status">Tệp đã thay đổi trong Terminal. Nạp lại trước khi lưu.</p>}
      <div className={styles.editorActions}>
        <button type="button" onClick={() => attempt(() => { if (fs.read(selected.path) !== base) throw Error("Tệp đã thay đổi; hãy nạp lại để tránh ghi đè."); fs.write(selected.path, draft); setBase(draft); })}>Lưu tệp</button>
        <button type="button" onClick={() => attempt(() => { const text = fs.read(selected.path); setDraft(text); setBase(text); })}>Nạp lại tệp</button>
        <button type="button" onClick={() => attempt(() => { fs.remove(selected.path); setSelected(null); })}>Xóa tệp</button>
      </div>
    </div>}
    <p className={styles.fileFooter}>RAM · {entries.length} mục · Dùng chung với Terminal, không lưu trên máy chủ.</p>
  </div>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./JourneyStory.module.css";
export function JourneyImage({ file, title }: { file: string | null; title: string }) {
  const [failedFile, setFailedFile] = useState<string | null>(null), image = useRef<HTMLImageElement>(null);
  useEffect(() => { if (file && image.current?.complete && image.current.naturalWidth === 0) setFailedFile(file); }, [file]);
  return file && failedFile !== file ? <img ref={image} src={`/uploads/${file}`} alt={title} loading="lazy" width={800} height={600} onError={() => setFailedFile(file)} />
    : <div className={styles.coverFallback}><span aria-hidden="true">↗</span><span>Chưa có ảnh bìa khả dụng</span></div>;
}

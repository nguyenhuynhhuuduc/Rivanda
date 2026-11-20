"use client";

import { useState } from "react";
import { Markdown } from "@/components/Markdown";

type Mode = "edit" | "preview" | "split";

export function MarkdownEditorField({
  name = "content",
  defaultValue = "",
  required = false,
  maxLength,
  rows = 24,
  textareaClassName,
  hint,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  textareaClassName: string;
  hint?: React.ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<Mode>("edit");

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "bg-accent text-accent-fg shadow-sm"
        : "border border-line bg-surface text-muted hover:bg-card hover:text-fg"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hint ? <div className="text-sm text-muted">{hint}</div> : <span />}
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Chế độ xem nội dung">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "edit"}
            onClick={() => setMode("edit")}
            className={tabCls(mode === "edit")}
          >
            Soạn thảo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "split"}
            onClick={() => setMode("split")}
            className={tabCls(mode === "split")}
          >
            Chia đôi
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
            className={tabCls(mode === "preview")}
          >
            Xem trước
          </button>
        </div>
      </div>

      <div className={mode === "split" ? "grid gap-4 lg:grid-cols-2" : ""}>
        <div className={mode === "preview" ? "hidden" : "min-w-0"}>
          <textarea
            name={name}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required={required}
            maxLength={maxLength}
            rows={rows}
            className={`${textareaClassName} font-mono leading-relaxed`}
          />
        </div>

        {mode !== "edit" && (
          <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-bg p-4 sm:p-6">
            <p className="mb-4 border-b border-line pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Xem trước giống trang xuất bản
            </p>
            {value.trim() ? (
              <Markdown>{value}</Markdown>
            ) : (
              <p className="text-sm text-muted">Nhập nội dung Markdown để xem trước bố cục.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

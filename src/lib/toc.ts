import { createHeadingIdAllocator, normalizeMarkdown } from "./markdown";

export type TocItem = { id: string; text: string; level: 2 | 3 };

function stripInlineMarkdown(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/** Lấy mục lục từ các tiêu đề ## và ### trong Markdown sau chuẩn hóa (bỏ qua khối mã). */
export function extractToc(markdown: string): TocItem[] {
  const out: TocItem[] = [];
  const nextId = createHeadingIdAllocator();
  const normalized = normalizeMarkdown(markdown);
  let fenceMarker: string | null = null;

  for (const line of normalized.split("\n")) {
    if (fenceMarker) {
      const ch = fenceMarker[0];
      if (new RegExp(`^\\s*${ch}{${fenceMarker.length},}\\s*$`).test(line)) {
        fenceMarker = null;
      }
      continue;
    }
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (open) {
      fenceMarker = open[1];
      continue;
    }
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = stripInlineMarkdown(m[2]);
      if (text) {
        out.push({ id: nextId(text), text, level: m[1].length as 2 | 3 });
      }
    }
  }
  return out;
}

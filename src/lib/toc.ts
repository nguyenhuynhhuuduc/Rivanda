import { slugify } from "./slug";

export type TocItem = { id: string; text: string; level: 2 | 3 };

/** Lấy mục lục từ các tiêu đề ## và ### trong Markdown (bỏ qua khối mã). */
export function extractToc(markdown: string): TocItem[] {
  const out: TocItem[] = [];
  let inCode = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = m[2].replace(/[*_`[\]()]/g, "").trim();
      out.push({ id: slugify(text, "muc"), text, level: m[1].length as 2 | 3 });
    }
  }
  return out;
}

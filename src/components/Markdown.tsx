import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CODE_LANGUAGE_LABELS,
  createHeadingIdAllocator,
  normalizeMarkdown,
  remarkSoftBreaks,
} from "@/lib/markdown";

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

function detectCodeLanguage(children: React.ReactNode): string | null {
  const child = React.Children.toArray(children)[0];
  if (!React.isValidElement<{ className?: string }>(child)) return null;
  const cls = child.props.className ?? "";
  const match = /\blanguage-([a-z0-9_-]+)\b/i.exec(cls);
  return match ? match[1].toLowerCase() : null;
}

// react-markdown không chạy HTML thô trong nội dung, nên an toàn trước XSS.
export function Markdown({ children }: { children: string }) {
  const content = normalizeMarkdown(children ?? "");
  const nextId = createHeadingIdAllocator();

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkSoftBreaks]}
        components={{
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2 id={nextId(textOf(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={nextId(textOf(children))}>{children}</h3>,
          h4: ({ children }) => <h4>{children}</h4>,
          a: ({ href, children }) => {
            const external = typeof href === "string" && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              loading="lazy"
            />
          ),
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table>{children}</table>
            </div>
          ),
          pre: ({ children }) => {
            const lang = detectCodeLanguage(children);
            const isCompact = lang === "cli";
            const label =
              lang && !isCompact
                ? (CODE_LANGUAGE_LABELS[lang] ?? lang.toUpperCase())
                : null;
            return (
              <div
                className={isCompact ? "md-code-block md-code-compact" : "md-code-block"}
                data-lang={lang ?? undefined}
              >
                {label && (
                  <div className="md-code-header">
                    <span>{label}</span>
                  </div>
                )}
                <pre>{children}</pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

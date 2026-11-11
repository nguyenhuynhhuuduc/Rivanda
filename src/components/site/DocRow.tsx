import Link from "next/link";
import { FileIcon } from "@/components/icons";
import { ACCESS_LABEL, KIND_LABEL, type DocumentItem } from "@/lib/documents";
import { formatBytes, formatDate } from "@/lib/format";

export function DocRow({ doc, linked = true }: { doc: DocumentItem; linked?: boolean }) {
  const content = (
    <>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-card text-link"><FileIcon className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold leading-snug group-hover:text-link">{doc.title}</h3>
          {doc.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{doc.description}</p>}
          <p className="mt-2 text-xs text-muted">
            {KIND_LABEL[doc.kind]} · {doc.fileExt.toUpperCase()} · {formatBytes(doc.fileSize)} · {formatDate(doc.createdAt)}
            {doc.access !== "public" ? ` · ${ACCESS_LABEL[doc.access]}` : ""}
          </p>
        </div>
    </>
  );
  return (
    <li>
      {linked ? (
        <Link href={`/resources/${doc.id}`} className="group flex items-center gap-5 rounded-md border border-line p-5 transition hover:border-fg/30">{content}</Link>
      ) : (
        <div className="flex items-center gap-5 rounded-md border border-line p-5">{content}</div>
      )}
    </li>
  );
}

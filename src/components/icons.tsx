type P = { className?: string; filled?: boolean };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const HeartIcon = ({ className = "h-5 w-5", filled }: P) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} className={className}>
    <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 5 6.6 5c1.8 0 3.2.9 4 2.2l1.4 1.9 1.4-1.9c.8-1.3 2.2-2.2 4-2.2 3 0 4.9 3 3.8 6.2-1.7 4.7-9.2 9.3-9.2 9.3z" />
  </svg>
);
export const BookmarkIcon = ({ className = "h-5 w-5", filled }: P) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} className={className}><path d="M6 3.5h12v17l-6-4.2-6 4.2z" /></svg>
);
export const CommentIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><path d="M4 5h16v11H9l-5 4z" /></svg>
);
export const DownloadIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
);
export const FileIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>
);
export const ShareIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></svg>
);
export const FlagIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><path d="M6 21V4M6 5h11l-2 4 2 4H6" /></svg>
);
export const FolderIcon = ({ className = "h-5 w-5" }: P) => (
  <svg {...base} className={className}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" /></svg>
);

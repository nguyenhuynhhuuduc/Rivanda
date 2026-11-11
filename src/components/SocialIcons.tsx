type Props = { instagramUrl: string; xUrl: string; facebookUrl: string };

const linkClass = "grid h-9 w-9 place-items-center rounded-full transition hover:bg-fg/10";

// Chỉ hiện biểu tượng nào đã được admin điền link. Màu chữ lấy theo khối chứa nó.
export function SocialIcons({ instagramUrl, xUrl, facebookUrl }: Props) {
  return (
    <div className="flex items-center gap-1">
      {instagramUrl && (
        <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={linkClass}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" />
            <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
          </svg>
        </a>
      )}
      {xUrl && (
        <a href={xUrl} target="_blank" rel="noopener noreferrer" aria-label="X" className={linkClass}>
          <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      )}
      {facebookUrl && (
        <a href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={linkClass}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </a>
      )}
    </div>
  );
}

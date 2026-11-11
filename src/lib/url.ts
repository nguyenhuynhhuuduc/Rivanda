// Chỉ cho chuyển hướng tới đường dẫn nội bộ, chặn dạng //evil.com hoặc https://...
export function safeNext(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  try {
    const base = "https://local.invalid";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch { return "/"; }
}

/** Giữ bộ lọc/phân trang khi đăng nhập từ một khu vực cần bảo vệ. */
export function returnPath(path: string, values: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  return safeNext(`${path}${query.size ? `?${query}` : ""}`);
}

// Hàm dùng chung cho các Server Action của khu quản trị.
export function str(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export function strOrNull(fd: FormData, key: string, max: number): string | null {
  return str(fd, key, max) || null;
}

export function dateOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function flag(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

export function uuidOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key, 36);
  return /^[a-f0-9-]{36}$/.test(v) ? v : null;
}

export function files(fd: FormData, key: string): File[] {
  return fd.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);
}

export function qs(key: "saved" | "error", value: string): string {
  return `?${key}=${encodeURIComponent(value)}`;
}

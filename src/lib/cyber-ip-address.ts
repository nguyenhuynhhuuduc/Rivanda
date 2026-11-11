// Mạng học tập mô phỏng. Dự trữ /24 đầu, /24 cuối và .0–.9/.255 của mỗi /24.
export const CYBER_IP_CAPACITY = 254 * 245;
export const CYBER_IP_BASE = 168427520; // 10.10.0.0

export function slotToIpNumber(slot: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= CYBER_IP_CAPACITY) throw new Error("CYBER_IP_POOL_EXHAUSTED");
  return CYBER_IP_BASE + (Math.floor(slot / 245) + 1) * 256 + slot % 245 + 10;
}

export function ipNumberToString(value: number): string {
  const host = value - CYBER_IP_BASE;
  const third = Math.floor(host / 256), fourth = host % 256;
  if (!Number.isInteger(value) || third < 1 || third > 254 || fourth < 10 || fourth > 254) throw new Error("CYBER_IP_INVALID");
  return `10.10.${third}.${fourth}`;
}

export function isVirtualIp(value: string): boolean {
  const parts = /^10\.10\.([1-9]\d{0,2})\.([1-9]\d{0,2})$/.exec(value);
  return !!parts && Number(parts[1]) <= 254 && Number(parts[2]) >= 10 && Number(parts[2]) <= 254;
}

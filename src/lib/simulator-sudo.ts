import type { SessionMemory } from "./practice-session";
import type { ShellResult } from "./simulator-shell";

/** Mật khẩu bài học công khai, không phải secret hoặc mật khẩu tài khoản website. */
export const SIMULATOR_SUDO_PASSWORD = "kali-sim";
export const SUDO_TTL_MS = 5 * 60 * 1000;
const KEY = "simulator-sudo-auth";
type Stamp = { ownerId: string; sessionId: string; authenticatedAt: number; expiresAt: number };
export type SimulatorSudoOptions = { sudoAllowed?: boolean; now?: () => number };

export function createSimulatorSudo(memory: SessionMemory, isActive: () => boolean, options: SimulatorSudoOptions = {}) {
  const now = options.now ?? (() => Date.now());
  let pending: { run: () => ShellResult; attempts: number } | null = null;
  const prompt = "[sudo mô phỏng] password for kali (kali-sim): ";
  const ended = (): ShellResult => ({ output: "Phiên đã kết thúc." });
  const invalidate = () => { pending = null; memory.temporary.delete(KEY); };
  const permitted = () => options.sudoAllowed !== false;
  const denied = (): ShellResult => { invalidate(); return { output: "sudo: kali is not in the sudoers file (không có quyền sudo mô phỏng)." }; };
  function cached() {
    const value = memory.temporary.get(KEY) as Stamp | undefined, time = now();
    const valid = value && value.ownerId === memory.ownerId && value.sessionId === memory.sessionId && Number.isFinite(time) && time >= value.authenticatedAt && time < value.expiresAt;
    if (!valid) memory.temporary.delete(KEY);
    return !!valid;
  }
  function request(run: () => ShellResult): ShellResult {
    if (!isActive()) { invalidate(); return ended(); }
    if (!permitted()) return denied();
    if (pending) return { output: "sudo: đang chờ mật khẩu mô phỏng; dùng Ctrl+C để hủy.", passwordPrompt: prompt };
    if (cached()) return run();
    pending = { run, attempts: 0 };
    return { output: "Chỉ nhập mật khẩu học tập công khai kali-sim; KHÔNG nhập mật khẩu website. Ký tự nhập sẽ không hiển thị.", passwordPrompt: prompt };
  }
  function submitPassword(value: string): ShellResult {
    if (!isActive()) { invalidate(); return ended(); }
    if (!pending) return { output: "sudo: không có yêu cầu xác thực đang chờ." };
    if (!permitted()) return denied();
    // Không tokenize, lưu history/transcript, hash hoặc persist giá trị người dùng nhập.
    if (value.length > 128 || value !== SIMULATOR_SUDO_PASSWORD) {
      pending.attempts++;
      if (pending.attempts >= 3) { pending = null; return { output: "sudo: 3 incorrect password attempts (mật khẩu mô phỏng không đúng)." }; }
      return { output: "Sorry, try again. Chỉ dùng mật khẩu mô phỏng kali-sim.", passwordPrompt: prompt };
    }
    const run = pending.run; pending = null;
    const time = now();
    if (!Number.isFinite(time)) return { output: "sudo: đồng hồ phiên không hợp lệ; chưa cấp quyền." };
    memory.temporary.set(KEY, { ownerId: memory.ownerId, sessionId: memory.sessionId, authenticatedAt: time, expiresAt: time + SUDO_TTL_MS } satisfies Stamp);
    return run();
  }
  return {
    request, submitPassword, invalidate,
    isAwaitingPassword: () => { if (!isActive()) { invalidate(); return false; } return pending !== null; },
    cancelPassword: (): ShellResult => { pending = null; return { output: "sudo: đã hủy xác thực mô phỏng." }; },
  };
}

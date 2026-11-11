import { isVirtualIp } from "./cyber-ip-address";
import type { PracticeIdentity } from "@/app/(dark)/cyber-lab/practice/actions";

export type MachineStatus = "Stopped" | "Starting" | "Running";
export type SessionSnapshot = Readonly<{ ownerId: string; status: MachineStatus; ip: string | null; sessionId: string | null; startedAt: number | null; pending: boolean; error: string | null }>;
export type SessionMemory = { ownerId: string; sessionId: string; virtualIp: string; filesystem: Map<string, string>; directories: Set<string>; history: string[]; temporary: Map<string, unknown> };

/** Mỗi provider/tab có một instance. Không persistence, transport hoặc lệnh terminal. */
export function createPracticeSessionStore(ownerId: string, clock = { now: () => Date.now(), id: () => crypto.randomUUID(), schedule: (fn: () => void) => setTimeout(fn, 350), cancel: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer) }) {
  let snapshot: SessionSnapshot = { ownerId, status: "Stopped", ip: null, sessionId: null, startedAt: null, pending: false, error: null };
  let memory: SessionMemory | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<SessionSnapshot>) => { snapshot = { ...snapshot, ...next }; listeners.forEach(fn => fn()); };
  const erase = () => {
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
    memory?.filesystem.clear(); memory?.directories.clear(); memory?.history.splice(0); memory?.temporary.clear(); memory = null;
  };
  const stop = () => { generation++; erase(); publish({ status: "Stopped", sessionId: null, startedAt: null, pending: false }); };
  const clear = () => { stop(); publish({ ip: null, error: null }); };
  const accept = (identity: PracticeIdentity) => {
    if (!identity.ok) { if (identity.signedOut) clear(); publish({ error: identity.error }); return false; }
    if (identity.userId !== snapshot.ownerId || !isVirtualIp(identity.ip)) {
      clear(); publish({ error: "Tài khoản/IP đã thay đổi. Hãy tải lại trang trước khi thực hành." }); return false;
    }
    if (snapshot.ip && snapshot.ip !== identity.ip) { clear(); publish({ error: "IP tài khoản không nhất quán. Hãy tải lại trang." }); return false; }
    publish({ ip: identity.ip, error: null }); return true;
  };
  async function loadIdentity(load: () => Promise<PracticeIdentity>, start: boolean) {
    if (snapshot.pending || (start && snapshot.status !== "Stopped")) return;
    const request = generation;
    publish({ pending: true, error: null });
    try {
      const identity = await load();
      if (request !== generation) return;
      if (!accept(identity) || !start) return;
      const sessionId = clock.id();
      memory = { ownerId: snapshot.ownerId, sessionId, virtualIp: snapshot.ip!, filesystem: new Map(), directories: new Set(["/", "/home", "/home/kali", "/home/kali/Desktop", "/home/kali/Documents"]), history: [], temporary: new Map() };
      publish({ status: "Starting", sessionId, startedAt: null });
      timer = clock.schedule(() => {
        if (request !== generation || snapshot.status !== "Starting") return;
        timer = undefined; publish({ status: "Running", startedAt: clock.now() });
      });
    } catch { if (request === generation) publish({ error: "Không xác minh được tài khoản/IP. Hãy thử lại." }); }
    finally { if (request === generation) publish({ pending: false }); }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    loadIdentity: (load: () => Promise<PracticeIdentity>) => loadIdentity(load, false),
    start: (load: () => Promise<PracticeIdentity>) => snapshot.ip ? loadIdentity(load, true) : Promise.resolve(),
    stop, clear,
    changeOwner(next: string) { if (next !== snapshot.ownerId) { clear(); publish({ ownerId: next }); } },
    // Dành cho giai đoạn simulator sau; caller phải khớp owner, không chia sẻ giữa tài khoản.
    getMemory(expectedOwner: string) { return expectedOwner === snapshot.ownerId ? memory : null; },
  };
}

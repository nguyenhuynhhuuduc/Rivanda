"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { getPracticeIdentityAction, verifyPracticeOwnerAction } from "@/app/(dark)/cyber-lab/practice/actions";
import { createPracticeSessionStore } from "@/lib/practice-session";

const Context = createContext<ReturnType<typeof createPracticeSessionStore> | null>(null);
export const CLEAR_PRACTICE_EVENT = "personal-site-clear-practice";

export function PracticeSessionProvider({ ownerId, children }: { ownerId: string; children: React.ReactNode }) {
  const ref = useRef<ReturnType<typeof createPracticeSessionStore> | null>(null);
  if (!ref.current) ref.current = createPracticeSessionStore(ownerId);
  const store = ref.current;
  useEffect(() => {
    const clear = () => store.clear();
    const verify = async () => {
      const before = store.getSnapshot();
      try {
        const owner = await verifyPracticeOwnerAction();
        const current = store.getSnapshot();
        if (current.ownerId === before.ownerId && current.sessionId === before.sessionId && owner !== current.ownerId) store.clear();
      } catch {
        const current = store.getSnapshot();
        if (current.ownerId === before.ownerId && current.sessionId === before.sessionId) store.clear();
      }
    };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CLEAR_PRACTICE_EVENT) : null;
    channel?.addEventListener("message", clear);
    window.addEventListener(CLEAR_PRACTICE_EVENT, clear);
    window.addEventListener("pagehide", clear); // Bao gồm BFCache; quay lại không khôi phục phiên.
    window.addEventListener("focus", verify);
    return () => {
      window.removeEventListener(CLEAR_PRACTICE_EVENT, clear);
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("focus", verify);
      channel?.close(); store.clear();
    };
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function usePracticeSession(ownerId: string, loadIdentity = true) {
  const store = useContext(Context);
  if (!store) throw new Error("PracticeSessionProvider is required");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.changeOwner(ownerId); if (loadIdentity) void store.loadIdentity(getPracticeIdentityAction); }, [ownerId, loadIdentity, store]);
  return { store, snapshot, matchesOwner: snapshot.ownerId === ownerId, retry: () => store.loadIdentity(getPracticeIdentityAction), start: () => store.start(getPracticeIdentityAction) };
}

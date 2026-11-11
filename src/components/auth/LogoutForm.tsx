"use client";

import { logoutAction } from "@/app/(auth)/actions";

export function LogoutForm({ children }: { children: React.ReactNode }) {
  return <form action={logoutAction} onSubmit={() => {
    const event = "personal-site-clear-practice";
    window.dispatchEvent(new Event(event));
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(event); channel.postMessage("logout"); channel.close();
    }
  }}>{children}</form>;
}

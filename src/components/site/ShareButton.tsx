"use client";

import { useState } from "react";
import { ShareIcon } from "@/components/icons";

// Chia sẻ: dùng hộp chia sẻ của thiết bị nếu có, không thì sao chép liên kết.
export function ShareButton({ title, className }: { title: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // người dùng đóng hộp chia sẻ: bỏ qua
    }
  }
  return (
    <button type="button" onClick={share} className={className}>
      <ShareIcon className="h-5 w-5" />
      {done ? "Đã chép liên kết" : "Chia sẻ"}
    </button>
  );
}

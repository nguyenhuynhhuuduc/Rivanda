"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { btnOutline, btnPrimary } from "@/components/ui/kit";
import { LAB_NOTICE } from "@/lib/cyber-lab";
import { usePracticeSession } from "./PracticeSessionProvider";

function useSessionTime(startedAt: number | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (startedAt === null) return "Chưa bắt đầu";
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
}

function DesktopIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 21h8m-4-5v5M7 9l2 2-2 2m5 0h4" />
    </svg>
  );
}

export function PracticeWorkspace({ ownerId }: { ownerId: string }) {
  const { store, snapshot, matchesOwner, start, retry } = usePracticeSession(ownerId);
  const running = matchesOwner && snapshot.status === "Running";
  const active = matchesOwner && snapshot.status !== "Stopped";
  const elapsed = useSessionTime(matchesOwner ? snapshot.startedAt : null);
  const status = matchesOwner ? snapshot.status : "Stopped";
  return (
    <div className="min-w-0">
      <section aria-labelledby="practice-machine-title" className="glass-panel min-w-0 overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-8 sm:py-6">
          <button type="button" disabled={!active && (!matchesOwner || !snapshot.ip || snapshot.pending)} onClick={() => active ? store.stop() : void start()} aria-describedby="practice-unavailable" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#9FEF00] px-6 py-3 text-sm font-medium tracking-wide text-[#111111] transition-colors enabled:hover:bg-[#AEFF1A] disabled:cursor-not-allowed motion-reduce:transition-none sm:w-auto">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 3v9M7 5.5a8 8 0 1 0 10 0" /></svg>
            {active ? "Stop Machine" : snapshot.pending ? "Đang xác minh IP…" : "Start Machine"}
          </button>
          <a href="#practice-help" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">Thông tin kết nối <span aria-hidden="true">↗</span></a>
        </div>

        <div className="p-5 sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 id="practice-machine-title" className="text-lg font-semibold sm:text-xl">Kết nối môi trường thực hành</h2>
            <span role="status" className="inline-flex items-center gap-2 text-xs text-muted">
              <span className={`h-2 w-2 shrink-0 rounded-full ${running ? "bg-success" : "bg-warning"}`} aria-hidden="true" /> {status} · Simulator
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-5 rounded-xl border border-line bg-card p-5 md:flex-row md:items-center md:gap-6 md:px-6 md:py-7">
            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-surface text-muted"><DesktopIcon className="h-8 w-8" /></div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">Kali Simulator · phiên trong RAM</h3>
                <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                  {[
                    ["Trạng thái", status],
                    ["IP ảo", matchesOwner ? snapshot.ip ?? "Chưa được cấp" : "Chưa được cấp"],
                    ["Phiên", elapsed],
                  ].map(([label, value]) => (
                    <div key={label} className="flex flex-wrap gap-x-1"><dt>{label}:</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="shrink-0 border-t border-line pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
              {running ? <Link href="/cyber-lab/desktop" prefetch={false} className={`${btnOutline} w-full md:w-auto`}>Open Desktop <span aria-hidden="true">↗</span></Link> : <button type="button" disabled aria-describedby="practice-desktop-rule" className={`${btnOutline} w-full disabled:opacity-60 md:w-auto`}>
                Open Desktop
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7m0-7L11 13M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" /></svg>
              </button>}
            </div>
          </div>

          <div id="practice-help" className="mt-6 scroll-mt-28 rounded-xl border border-line bg-bg p-4 text-sm leading-relaxed text-muted">
            <p id="practice-unavailable" className="font-medium text-fg">IP ảo cố định theo tài khoản, chỉ là định danh trong mạng học tập mô phỏng; không phải IP mạng thật.</p>
            <p id="practice-desktop-rule" className="mt-2">Start/Stop chỉ quản lý phiên trong RAM của tab. Refresh, đóng tab hoặc đăng xuất sẽ xóa dữ liệu thực hành; IP tài khoản vẫn giữ nguyên. Open Desktop mở giao diện mô phỏng, không kết nối Linux thật.</p>
            {matchesOwner && snapshot.error && <div className="mt-3" role="alert"><p className="text-danger">{snapshot.error}</p><button type="button" disabled={snapshot.pending} onClick={() => void retry()} className="mt-2 text-link underline underline-offset-4 disabled:opacity-60">Thử nhận IP lại</button></div>}
          </div>
          <ol aria-label="Các bước thực hành" className="mt-6 flex flex-col gap-3 text-xs text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            {["Start Machine", "Kiểm tra trạng thái / IP ảo / phiên", "Open Desktop"].map((step, index) => (
              <li key={step} className="flex items-center gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line" aria-hidden="true">{index + 1}</span>{step}</li>
            ))}
          </ol>
        </div>
      </section>
      <p className="mt-6 text-xs leading-relaxed text-muted">{LAB_NOTICE}</p>
      <Link href="/cyber-lab" className="mt-4 inline-flex text-sm text-link underline underline-offset-4">Tiếp tục học tại Cyber Lab <span aria-hidden="true" className="ml-1">→</span></Link>
    </div>
  );
}

export function DesktopUnavailable({ ownerId }: { ownerId: string }) {
  const { snapshot, matchesOwner } = usePracticeSession(ownerId, false);
  const running = matchesOwner && snapshot.status === "Running";
  return (
    <section className="glass-panel mx-auto max-w-3xl rounded-2xl px-5 py-10 text-center sm:p-12" aria-labelledby="desktop-unavailable-title">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border border-line bg-card text-muted"><DesktopIcon className="h-10 w-10" /></div>
      <p role="status" className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-warning">{running ? "Running · Simulator" : "Chưa có phiên mô phỏng đang chạy"}</p>
      <h2 id="desktop-unavailable-title" className="mt-3 font-display text-2xl font-bold">Desktop Simulator chưa sẵn sàng</h2>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted">{running ? `Phiên RAM vẫn đang chạy với IP ảo ${snapshot.ip}. Quay lại Practice để quản lý hoặc dừng phiên.` : "Hãy về Practice, nhận IP ảo từ server và Start Machine. Refresh trang không khôi phục phiên cũ."}</p>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">Chỉ mở Desktop khi phiên Running. Đây là môi trường mô phỏng, không có Linux hoặc kết nối mạng thực tế.</p>
      <Link href="/cyber-lab/practice" className={`${btnPrimary} mt-7`}>Quay lại Practice</Link>
    </section>
  );
}

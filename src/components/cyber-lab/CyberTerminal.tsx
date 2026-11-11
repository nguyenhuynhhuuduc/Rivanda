"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import styles from "./CyberTerminal.module.css";

type TerminalState = "loading" | "unavailable" | "error";

export function CyberTerminal() {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TerminalState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let terminal: Terminal | undefined;
    let resize: ResizeObserver | undefined;
    let theme: MutationObserver | undefined;
    let frame = 0;

    const cleanup = () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      theme?.disconnect();
      terminal?.dispose();
      terminal = undefined;
      element.replaceChildren();
    };

    async function initialize() {
      setState("loading");
      try {
        // Chỉ nạp trong browser; không import runtime xterm khi server render.
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed) return;
        terminal = new Terminal({
          disableStdin: true,
          cursorBlink: false,
          cursorInactiveStyle: "none",
          fontSize: 13,
          lineHeight: 1.5,
          scrollback: 200,
          screenReaderMode: true,
          minimumContrastRatio: 4.5,
          convertEol: true,
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);

        const syncAppearance = () => {
          if (!terminal) return;
          const css = getComputedStyle(element!);
          const color = (name: string) => css.getPropertyValue(name).trim();
          terminal.options.fontFamily = css.fontFamily;
          terminal.options.theme = {
            background: color("--surface"),
            foreground: color("--fg"),
            cursor: color("--surface"),
            selectionBackground: color("--line"),
            selectionForeground: color("--fg"),
          };
        };
        const scheduleFit = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            if (!disposed && terminal && element!.clientWidth > 0 && element!.clientHeight > 0) fit.fit();
          });
        };
        syncAppearance();
        terminal.open(element!);
        // Khi chưa có transport, để browser xử lý phím (đặc biệt Tab thoát khỏi terminal).
        terminal.attachCustomKeyEventHandler(() => false);
        if (terminal.textarea) {
          terminal.textarea.readOnly = true;
          terminal.textarea.setAttribute("aria-label", "Terminal chưa kết nối, chỉ đọc");
          terminal.textarea.setAttribute("aria-describedby", `${id}-notice`);
        }
        // Thông báo thật về UI; không có prompt, local echo hay kết quả lệnh giả.
        terminal.writeln("Cyber Lab | Terminal");
        terminal.writeln("");
        terminal.writeln("Chưa kết nối tới Linux sandbox.");
        terminal.writeln("Backend thực hành chưa sẵn sàng.");
        terminal.writeln("Nhập lệnh đang tắt. Chưa có phiên Linux được tạo.");

        resize = new ResizeObserver(scheduleFit);
        resize.observe(element!);
        theme = new MutationObserver(() => {
          syncAppearance();
          scheduleFit();
        });
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        scheduleFit();
        void document.fonts.ready.then(() => { if (!disposed) scheduleFit(); });
        setState("unavailable");
      } catch {
        if (!disposed) {
          cleanup();
          setState("error");
        }
      }
    }

    void initialize();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [attempt, id]);

  return (
    <section className="mb-16 min-w-0" aria-labelledby={`${id}-title`}>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-link">Không gian thực hành</p>
        <h2 id={`${id}-title`} className="mt-2 font-display text-3xl font-bold tracking-tight">Linux Terminal</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Giao diện terminal cho Cyber Lab. Kết nối đến môi trường Linux riêng sẽ được mở khi backend sẵn sàng.
        </p>
      </div>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 6 5 6-5 6m8 0h6" /></svg>
            Cyber Lab
          </span>
          <span role="status" aria-live="polite" className={styles.status}>
            <span className={styles.dot} aria-hidden="true" />
            {state === "loading" ? "Đang khởi tạo terminal" : state === "error" ? "Lỗi giao diện terminal" : "Chưa kết nối"}
          </span>
        </div>
        <div className={styles.viewport} aria-busy={state === "loading"}>
          <div ref={host} className={styles.host} />
          {state !== "unavailable" && (
            <div className={styles.fallback}>
              <p>{state === "loading" ? "Đang nạp giao diện terminal…" : "Không thể nạp terminal. Bạn có thể thử nạp lại giao diện."}</p>
              {state === "error" && <button type="button" className="mt-4 rounded-md border border-line px-4 py-2 text-fg hover:bg-card" onClick={() => setAttempt(value => value + 1)}>Nạp lại terminal</button>}
            </div>
          )}
        </div>
        <p id={`${id}-notice`} className={styles.notice}>
          <strong className="font-medium text-fg">Backend chưa sẵn sàng.</strong>{" "}
          Terminal hiện chỉ đọc; chưa tạo phiên Linux và chưa thực thi lệnh. Các bài viết và chuyên mục Cyber Lab bên dưới vẫn hoạt động bình thường.
        </p>
      </div>
    </section>
  );
}

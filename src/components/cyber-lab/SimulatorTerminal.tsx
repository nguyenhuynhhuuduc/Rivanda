"use client";

import { useEffect, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import type { SessionMemory } from "@/lib/practice-session";
import type { VirtualFileSystem } from "@/lib/simulator-filesystem";
import { createSimulatorShell, terminalText } from "@/lib/simulator-shell";
import "@xterm/xterm/css/xterm.css";
import styles from "./KaliDesktop.module.css";

export function SimulatorTerminal({ memory, fs, onExit }: { memory: SessionMemory; fs: VirtualFileSystem; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null), instance = useRef<Terminal | null>(null);
  const exitRef = useRef(onExit); exitRef.current = onExit;
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, term: Terminal | undefined, frame = 0;
    let resize: ResizeObserver | undefined, theme: MutationObserver | undefined;
    let cancelPassword: (() => void) | undefined;
    const cleanup = () => { cancelPassword?.(); cancelAnimationFrame(frame); resize?.disconnect(); theme?.disconnect(); term?.dispose(); instance.current = null; element.replaceChildren(); };
    setFailed(false);
    void (async () => {
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
        if (disposed || !fs.isActive()) return;
        term = new Terminal({ fontSize: 13, lineHeight: 1.35, cursorBlink: false, scrollback: 500, screenReaderMode: true, convertEol: true, minimumContrastRatio: 4.5 });
        instance.current = term;
        const fit = new FitAddon(); term.loadAddon(fit);
        const appearance = () => {
          if (!term) return;
          const css = getComputedStyle(element);
          term.options.fontFamily = css.fontFamily;
          const color = (key: string) => css.getPropertyValue(key).trim();
          term.options.theme = { background: color("--surface"), foreground: color("--fg"), cursor: color("--fg"), selectionBackground: color("--line"), selectionForeground: color("--fg") };
        };
        const scheduleFit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!disposed && fs.isActive() && element.clientWidth && element.clientHeight) fit.fit(); }); };
        appearance(); term.open(element);
        term.attachCustomKeyEventHandler(event => event.key !== "Tab");
        term.textarea?.setAttribute("aria-label", "Terminal Simulator");
        const shell = createSimulatorShell(memory, fs);
        let input = "", historyIndex = memory.history.length;
        cancelPassword = () => { input = ""; shell.cancelPassword(); };
        const prompt = () => `kali@simulator:${shell.getCwd()}$ `;
        const welcome = "Kali Desktop Simulator — lệnh chạy trong RAM của browser.\nKhông có Linux thật hoặc mạng. Gõ help để xem lệnh.\n\n";
        term.write(String(memory.temporary.get("terminal-transcript") ?? welcome));
        term.write(prompt());
        const record = (text: string) => { if (fs.isActive()) memory.temporary.set("terminal-transcript", (String(memory.temporary.get("terminal-transcript") ?? welcome) + text).slice(-48000)); };
        const replaceInput = (value: string) => { input = value; term?.write("\r\x1b[2K" + prompt() + input); };
        term.onData(data => {
          if (disposed || !fs.isActive() || !term) return;
          if (data === "\x1b[A" || data === "\x1b[B") {
            if (shell.isAwaitingPassword()) return;
            historyIndex = Math.max(0, Math.min(memory.history.length, historyIndex + (data === "\x1b[A" ? -1 : 1)));
            replaceInput(memory.history[historyIndex] ?? ""); return;
          }
          if (data.startsWith("\x1b")) return; // Không nhận escape/OSC từ paste.
          const chunk = data.slice(0, 4096).replace(/\r\n/g, "\r");
          for (const char of chunk) {
            if (char === "\r" || char === "\n") {
              term.write("\r\n");
              const hidden = shell.isAwaitingPassword(), submitted = input, printedPrompt = prompt(); input = "";
              const result = hidden ? shell.submitPassword(submitted) : shell.execute(submitted), output = terminalText(result.output);
              if (result.clear) { term.clear(); memory.temporary.set("terminal-transcript", ""); }
              else {
                const printed = output ? output + (result.rawOutput ? "" : "\n") : "";
                if (printed) term.write(printed);
                record(hidden ? printed : printedPrompt + submitted + "\n" + printed);
              }
              historyIndex = memory.history.length;
              if (result.exit) { exitRef.current(); return; }
              term.write(result.passwordPrompt ? terminalText(result.passwordPrompt) : prompt());
              // Paste khi nhập mật khẩu chỉ nộp một câu trả lời, không chạy phần còn lại.
              if (hidden) return;
            } else if (char === "\x03" || (char === "\x04" && shell.isAwaitingPassword())) {
              const hidden = shell.isAwaitingPassword(); shell.cancelPassword(); input = ""; term.write("^C\r\n" + prompt()); if (hidden) return;
            }
            else if (char === "\x7f" || char === "\b") { if (input) { input = [...input].slice(0, -1).join(""); if (!shell.isAwaitingPassword()) term.write("\b \b"); } }
            else if (char >= " " && !/[\x7f-\x9f]/.test(char) && input.length < (shell.isAwaitingPassword() ? 128 : 2048)) { input += char; if (!shell.isAwaitingPassword()) term.write(char); }
          }
        });
        resize = new ResizeObserver(scheduleFit); resize.observe(element);
        theme = new MutationObserver(() => { appearance(); scheduleFit(); });
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        scheduleFit(); void document.fonts.ready.then(() => { if (!disposed) scheduleFit(); });
      } catch { if (!disposed) { cleanup(); setFailed(true); } }
    })();
    return () => { disposed = true; cleanup(); };
  }, [fs, memory, retry]);
  return <div className={styles.terminalBody}>
    <div ref={host} className={styles.terminalHost} onPointerDown={() => instance.current?.focus()} />
    {failed && <div role="alert" className={styles.terminalError}>Không thể nạp xterm.js. Dữ liệu phiên vẫn trong RAM.<button type="button" onClick={() => setRetry(value => value + 1)}>Nạp lại Terminal</button></div>}
  </div>;
}

"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { SessionMemory } from "@/lib/practice-session";
import { createVirtualFileSystem } from "@/lib/simulator-filesystem";
import { APP_TITLES, clampWindow, openDesktopWindow, type DesktopApp, type DesktopWindow } from "@/lib/simulator-windows";
import { usePracticeSession } from "./PracticeSessionProvider";
import { DesktopUnavailable } from "./PracticeWorkspace";
import { SimulatorTerminal } from "./SimulatorTerminal";
import { SimulatorFileManager } from "./SimulatorFileManager";
import styles from "./KaliDesktop.module.css";

const appIcons: Record<DesktopApp, string> = { terminal: ">_", files: "▰", about: "i" };

export function KaliDesktop({ ownerId }: { ownerId: string }) {
  const { store, snapshot, matchesOwner } = usePracticeSession(ownerId, false);
  const memory = matchesOwner && snapshot.status === "Running" ? store.getMemory(ownerId) : null;
  if (!memory || snapshot.sessionId !== memory.sessionId) return <DesktopUnavailable ownerId={ownerId} />;
  return <RunningDesktop key={memory.sessionId} memory={memory} store={store} />;
}

function RunningDesktop({ memory, store }: { memory: SessionMemory; store: ReturnType<typeof usePracticeSession>["store"] }) {
  const stage = useRef<HTMLDivElement>(null);
  const fs = useMemo(() => createVirtualFileSystem(memory, () => store.getSnapshot().status === "Running" && store.getMemory(memory.ownerId) === memory), [memory, store]);
  const [windows, setWindows] = useState<DesktopWindow[]>(() => (memory.temporary.get("desktop-windows") as DesktopWindow[] | undefined) ?? []);
  const [menu, setMenu] = useState(false), [now, setNow] = useState<Date | null>(null);
  const drag = useRef<{ app: DesktopApp; pointer: number; originX: number; originY: number; x: number; y: number; width: number; height: number } | null>(null);
  const change = (update: (current: DesktopWindow[]) => DesktopWindow[]) => setWindows(current => {
    const next = update(current);
    if (fs.isActive()) memory.temporary.set("desktop-windows", next);
    return next;
  });
  const focus = (app: DesktopApp) => change(current => current.map(w => w.app === app ? { ...w, z: Math.max(0, ...current.map(item => item.z)) + 1 } : w));
  const open = (app: DesktopApp) => { change(current => openDesktopWindow(current, app)); setMenu(false); };
  const close = (app: DesktopApp) => change(current => current.filter(w => w.app !== app));
  const toggleMax = (app: DesktopApp) => change(current => current.map(w => w.app === app ? { ...w, maximized: !w.maximized, minimized: false } : w));
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth, height = element.clientHeight;
      setWindows(current => {
        const next = current.map(w => ({ ...w, ...clampWindow(w.x, w.y, width, height, Math.min(640, width), Math.min(410, height)) }));
        if (fs.isActive()) memory.temporary.set("desktop-windows", next);
        return next;
      });
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, [fs, memory]);

  function beginDrag(event: PointerEvent<HTMLElement>, win: DesktopWindow) {
    if (event.button !== 0 || win.maximized || (event.target as HTMLElement).closest("[data-window-control]")) return;
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = { app: win.app, pointer: event.pointerId, originX: event.clientX, originY: event.clientY, x: win.x, y: win.y, width: bounds.width, height: bounds.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    const active = drag.current, area = stage.current;
    if (!active || !area || active.pointer !== event.pointerId) return;
    const point = clampWindow(active.x + event.clientX - active.originX, active.y + event.clientY - active.originY, area.clientWidth, area.clientHeight, active.width, active.height);
    change(current => current.map(w => w.app === active.app ? { ...w, ...point } : w));
  }

  return <section className={styles.desktop} aria-label="Kali Linux Desktop Simulator" onKeyDown={event => { if (event.key === "Escape") setMenu(false); }}>
    <div className={styles.desktopTop}>
      <span><strong>Kali</strong> <span className={styles.topDetail}>Desktop Simulator · IP ảo {memory.virtualIp}</span></span>
      <button type="button" onClick={() => store.stop()} className={styles.stop}>Stop Machine</button>
    </div>
    <div ref={stage} className={styles.stage}>
      <div className={styles.wallpaper} aria-hidden="true">
        <svg viewBox="0 0 520 300" fill="none"><path d="M440 95 351 58l-70 25-62-45 27 62-94 26 70 18-65 58 109-28 58 42 88-33-109-8 32-44-60-17 82-23z" /><path d="m351 58 37-33-15 61 67 9-30 29M281 83l-52 61 37 30m37 1 21 41-59 51-100-8-67-41 92 20 75-35" /></svg>
        <span>KALI</span><small>CYBER LAB · BROWSER SIMULATOR</small>
      </div>
      <div className={styles.desktopIcons}>
        {(["terminal", "files", "about"] as DesktopApp[]).map(app => <button type="button" key={app} onClick={() => open(app)} aria-label={`Mở ${APP_TITLES[app]}`}><span aria-hidden="true">{appIcons[app]}</span>{APP_TITLES[app]}</button>)}
      </div>
      {windows.map(win => <section key={win.app} className={`${styles.window} ${win.maximized ? styles.maximized : ""} ${win.minimized ? styles.minimized : ""}`} style={{ left: win.x, top: win.y, zIndex: win.z }} aria-label={`Cửa sổ ${APP_TITLES[win.app]}`} onPointerDown={() => focus(win.app)}>
        <header className={styles.titlebar} onPointerDown={event => beginDrag(event, win)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onDoubleClick={event => { if (!(event.target as HTMLElement).closest("[data-window-control]")) toggleMax(win.app); }}>
          <span role="button" tabIndex={0} aria-label={`Di chuyển cửa sổ ${APP_TITLES[win.app]}`} className={styles.windowTitle} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || win.maximized || !stage.current) return;
            event.preventDefault();
            const rect = event.currentTarget.closest("section")!.getBoundingClientRect();
            const point = clampWindow(win.x + (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0), win.y + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0), stage.current.clientWidth, stage.current.clientHeight, rect.width, rect.height);
            change(current => current.map(w => w.app === win.app ? { ...w, ...point } : w));
          }}><span aria-hidden="true">{appIcons[win.app]}</span> {APP_TITLES[win.app]}</span>
          <div className={styles.windowControls} data-window-control>
            <button type="button" aria-label={`Thu nhỏ ${APP_TITLES[win.app]}`} onClick={() => change(current => current.map(w => w.app === win.app ? { ...w, minimized: true } : w))}>−</button>
            <button type="button" aria-label={`${win.maximized ? "Khôi phục" : "Phóng to"} ${APP_TITLES[win.app]}`} onClick={() => toggleMax(win.app)}>{win.maximized ? "❐" : "□"}</button>
            <button type="button" aria-label={`Đóng ${APP_TITLES[win.app]}`} onClick={() => close(win.app)}>×</button>
          </div>
        </header>
        <div className={styles.windowContent}>
          {win.app === "terminal" && <SimulatorTerminal memory={memory} fs={fs} onExit={() => close("terminal")} />}
          {win.app === "files" && <SimulatorFileManager fs={fs} />}
          {win.app === "about" && <div className={styles.about}><h2>Kali Desktop Simulator</h2><p>Đây là desktop mô phỏng phía browser, không phải máy Kali Linux thật.</p><p>Terminal hỗ trợ một tập lệnh học tập; File Manager dùng cùng filesystem trong RAM. sudo chỉ mô phỏng quyền root; apt chỉ hướng dẫn, không có mạng, cài package thật hoặc shell server.</p><p>IP {memory.virtualIp} là định danh ảo của tài khoản. Stop, refresh và logout sẽ xóa dữ liệu phiên.</p><p>Gõ <code>help</code> trong Terminal để xem các lệnh hỗ trợ. Kéo thanh tiêu đề để di chuyển cửa sổ, hoặc dùng phím mũi tên khi thanh tiêu đề được focus.</p></div>}
        </div>
      </section>)}
      {menu && <div className={styles.appMenu} role="menu" aria-label="Menu ứng dụng" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setMenu(false); }}>
        <p>Kali Simulator</p>
        {(["terminal", "files", "about"] as DesktopApp[]).map(app => <button key={app} role="menuitem" type="button" onClick={() => open(app)}><span aria-hidden="true">{appIcons[app]}</span>{APP_TITLES[app]}</button>)}
      </div>}
    </div>
    <div className={styles.taskbar}>
      <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(value => !value)} className={styles.launcher}>☰ <span>Ứng dụng</span></button>
      <div className={styles.tasks}>
        {windows.map(win => <button type="button" key={win.app} onClick={() => open(win.app)} className={win.minimized ? "" : styles.activeTask} aria-label={`Hiện ${APP_TITLES[win.app]}`}><span aria-hidden="true">{appIcons[win.app]}</span><span>{APP_TITLES[win.app]}</span></button>)}
      </div>
      <time className={styles.clock} title={now?.toLocaleString("vi-VN")}>{now ? now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</time>
    </div>
  </section>;
}

export type DesktopApp = "terminal" | "files" | "about";
export type DesktopWindow = { app: DesktopApp; x: number; y: number; z: number; minimized: boolean; maximized: boolean };
export const APP_TITLES: Record<DesktopApp, string> = { terminal: "Terminal", files: "File Manager", about: "Giới thiệu Simulator" };
export function clampWindow(x: number, y: number, stageWidth: number, stageHeight: number, width: number, height: number) {
  return { x: Math.max(0, Math.min(x, Math.max(0, stageWidth - width))), y: Math.max(0, Math.min(y, Math.max(0, stageHeight - height))) };
}
export function openDesktopWindow(windows: DesktopWindow[], app: DesktopApp): DesktopWindow[] {
  const top = Math.max(0, ...windows.map(w => w.z)) + 1;
  if (windows.some(w => w.app === app)) return windows.map(w => w.app === app ? { ...w, minimized: false, z: top } : w);
  return [...windows, { app, x: 24 + windows.length * 32, y: 24 + windows.length * 24, z: top, minimized: false, maximized: false }];
}

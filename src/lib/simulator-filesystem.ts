import type { SessionMemory } from "./practice-session";

export const SIMULATOR_HOME = "/home/kali";
export type VirtualLocation = Readonly<{ path: string }>;
type Metadata = { mode: number; owner: string; group: string; modifiedAt: number; location: { path: string } };
export type VirtualEntry = Metadata & { path: string; name: string; directory: boolean; size: number };
export type SimulatorUser = "kali" | "root";
type Notifications = { revision: number; listeners: Set<() => void> };
export interface VirtualFileSystem {
  stat(input: string, cwd?: string): VirtualEntry;
  read(input: string, cwd?: string): string;
  write(input: string, content: string, cwd?: string): void;
  append(input: string, content: string, cwd?: string): void;
  mkdir(input: string, cwd?: string): void;
  mkdirParents(input: string, cwd?: string): void;
  touch(input: string, cwd?: string): void;
  list(input?: string, cwd?: string): VirtualEntry[];
  remove(input: string, recursive?: boolean, cwd?: string): void;
  move(input: string, target: string, cwd?: string): void;
  copy(input: string, target: string, recursive?: boolean, cwd?: string): void;
  chmod(input: string, mode: string, cwd?: string): void;
  isActive(): boolean;
  subscribe(fn: () => void): () => void;
  getRevision(): number;
  asUser(user: SimulatorUser): VirtualFileSystem;
}
const protectedPaths = new Set(["/", "/home", SIMULATOR_HOME]);
export class VirtualFsError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const fail = (code: string, message: string): never => { throw new VirtualFsError(code, message); };
const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const expandHome = (input: string) => input === "~" ? SIMULATOR_HOME : input.startsWith("~/") ? SIMULATOR_HOME + input.slice(1) : input;
function validatePath(input: string) {
  if (!input || input.length > 512 || /[\x00-\x1f\x7f]/.test(input)) fail("EINVAL", "Tên đường dẫn không hợp lệ.");
}

/** Chuẩn hóa tên cho UI; thao tác filesystem kiểm tra từng thành phần/quyền. */
export function resolveVirtualPath(input: string, cwd = SIMULATOR_HOME): string {
  validatePath(input);
  const value = expandHome(input), parts: string[] = [];
  for (const part of (value.startsWith("/") ? value : `${cwd}/${value}`).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else { if (part.length > 128 || parts.length >= 32) fail("ENAMETOOLONG", "Đường dẫn quá dài."); parts.push(part); }
  }
  const path = "/" + parts.join("/"); validatePath(path); return path;
}

export function createVirtualFileSystem(memory: SessionMemory, isActive: () => boolean, user: SimulatorUser = "kali", notifications?: Notifications): VirtualFileSystem {
  if (user !== "kali" && user !== "root") throw Error("User mô phỏng không hợp lệ.");
  let batching = false, dirty = false;
  const events = notifications ?? { revision: 0, listeners: new Set<() => void>() };
  // Metadata dùng chính RAM phiên; temporary được xóa khi Stop/logout/refresh.
  const metadata = (memory.temporary.get("filesystem-metadata") as Map<string, Metadata> | undefined) ?? new Map<string, Metadata>();
  if (isActive()) memory.temporary.set("filesystem-metadata", metadata);
  const exists = (path: string) => memory.directories.has(path) || memory.filesystem.has(path);
  const active = () => { if (!isActive()) throw Error("Phiên thực hành đã kết thúc."); };
  const newMetadata = (path: string, directory: boolean, owner: SimulatorUser): Metadata => ({ mode: directory ? 0o755 : 0o644, owner, group: owner, modifiedAt: Date.now(), location: { path } });
  const meta = (path: string): Metadata => {
    let value = metadata.get(path);
    if (!value) {
      const system = path === "/" || path === "/home";
      value = { mode: memory.directories.has(path) ? 0o755 : 0o644, owner: system ? "root" : "kali", group: system ? "root" : "kali", modifiedAt: Date.now(), location: { path } };
      metadata.set(path, value);
    }
    if (!value.location) { value = { ...value, location: { path } }; metadata.set(path, value); }
    return value;
  };
  const requireDirectory = (path: string) => {
    if (!exists(path)) fail("ENOENT", "Không tìm thấy: " + path);
    if (!memory.directories.has(path)) fail("ENOTDIR", "Không phải thư mục (Not a directory): " + path);
  };
  const permitted = (path: string, bits: number) => {
    const item = meta(path);
    if (user === "root") {
      // Root ảo vượt DAC; file vẫn cần ít nhất một x-bit nếu kiểm tra execute.
      if ((bits & 1) && !memory.directories.has(path) && !(item.mode & 0o111)) fail("EACCES", "Permission denied: " + path);
      return;
    }
    const effective = item.owner === user ? item.mode >> 6 : item.group === user ? item.mode >> 3 : item.mode;
    if ((effective & bits) !== bits) fail("EACCES", "Từ chối quyền truy cập (Permission denied): " + path);
  };
  function resolve(input: string, cwd = SIMULATOR_HOME, creatingDirectory = false) {
    active(); validatePath(input);
    const value = expandHome(input), parts: string[] = [];
    // Không rút gọn file/.. hoặc missing/.. trước khi kiểm tra các thành phần.
    for (const part of (value.startsWith("/") ? value : `${cwd}/${value}`).split("/")) {
      if (!part) continue;
      const current = "/" + parts.join("/");
      requireDirectory(current); permitted(current, 1);
      if (part === ".") continue;
      if (part === "..") parts.pop();
      else { if (part.length > 128 || parts.length >= 32) fail("ENAMETOOLONG", "Đường dẫn quá dài."); parts.push(part); }
    }
    const path = "/" + parts.join("/"); validatePath(path);
    if (input.endsWith("/") && (!creatingDirectory || exists(path))) requireDirectory(path);
    return path;
  }
  const notify = () => { events.revision++; events.listeners.forEach(fn => fn()); };
  const changed = () => { if (batching) dirty = true; else notify(); };
  const timestamp = (path: string) => { metadata.set(path, { ...meta(path), modifiedAt: Date.now() }); };
  function transaction(fn: () => void) {
    active();
    const files = new Map(memory.filesystem), dirs = new Set(memory.directories), modes = new Map(metadata);
    batching = true; dirty = false;
    try { fn(); }
    catch (error) {
      memory.filesystem.clear(); files.forEach((value, key) => memory.filesystem.set(key, value));
      memory.directories.clear(); dirs.forEach(value => memory.directories.add(value));
      metadata.clear(); modes.forEach((value, key) => metadata.set(key, value));
      dirty = false; throw error;
    } finally { batching = false; if (dirty) { dirty = false; notify(); } }
  }
  function destination(path: string, adding = true) {
    const directory = parent(path); requireDirectory(directory); permitted(directory, 3);
    if (adding && memory.filesystem.size + memory.directories.size >= 256 && !exists(path)) fail("ENOSPC", "Phiên đạt giới hạn 256 mục.");
  }
  function stat(input: string, cwd?: string): VirtualEntry {
    const path = resolve(input, cwd);
    if (!exists(path)) fail("ENOENT", "Không tìm thấy: " + path);
    let size = 0;
    for (const char of memory.filesystem.get(path) ?? "") { const code = char.codePointAt(0)!; size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
    return { ...meta(path), path, name: path.split("/").pop() || "/", directory: memory.directories.has(path), size };
  }
  function read(input: string, cwd?: string) {
    const entry = stat(input, cwd);
    if (entry.directory) fail("EISDIR", "Đây là thư mục (Is a directory): " + entry.path);
    permitted(entry.path, 4); return memory.filesystem.get(entry.path)!;
  }
  function write(input: string, content: string, cwd?: string) {
    const path = resolve(input, cwd);
    if (memory.directories.has(path)) fail("EISDIR", "Không thể ghi đè thư mục: " + path);
    if (exists(path)) permitted(path, 2); else destination(path);
    // Quota UTF-16 trong RAM; size hiển thị là byte UTF-8, không phải disk thật.
    const total = [...memory.filesystem.entries()].reduce((sum, [key, value]) => sum + (key === path ? 0 : value.length), 0);
    if (content.length > 32768 || total + content.length > 524288) fail("ENOSPC", "Vượt giới hạn RAM: 32K ký tự/tệp, 512K ký tự/phiên.");
    const creating = !exists(path);
    memory.filesystem.set(path, content);
    if (creating) metadata.set(path, newMetadata(path, false, user)); else timestamp(path);
    if (creating) timestamp(parent(path)); changed();
  }
  function append(input: string, content: string, cwd?: string) {
    const path = resolve(input, cwd);
    // O_APPEND chỉ đòi quyền ghi, không đòi quyền đọc nội dung cũ.
    write(path, (memory.filesystem.get(path) ?? "") + content);
  }
  function mkdir(input: string, cwd?: string) {
    const path = resolve(input, cwd, true);
    if (exists(path)) fail("EEXIST", "Mục đã tồn tại: " + path);
    destination(path); memory.directories.add(path); metadata.set(path, newMetadata(path, true, user)); timestamp(parent(path)); changed();
  }
  function mkdirParents(input: string, cwd = SIMULATOR_HOME) {
    validatePath(input);
    transaction(() => {
      const value = expandHome(input); let path = value.startsWith("/") ? "/" : cwd;
      for (const part of value.split("/")) {
        if (!part) continue;
        path = resolve(path + "/" + part, cwd, true);
        if (exists(path)) requireDirectory(path); else mkdir(path);
      }
    });
  }
  function touch(input: string, cwd?: string) {
    const path = resolve(input, cwd);
    if (!exists(path)) { write(input, "", cwd); return; }
    if (meta(path).owner !== user) permitted(path, 2);
    timestamp(path); changed();
  }
  function list(input = ".", cwd?: string): VirtualEntry[] {
    const entry = stat(input, cwd);
    if (!entry.directory) return [entry];
    permitted(entry.path, 5);
    const paths = [...memory.directories, ...memory.filesystem.keys()].filter(path => path !== entry.path && parent(path) === entry.path);
    return paths.map(path => stat(path)).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  }
  function remove(input: string, recursive = false, cwd?: string) {
    const entry = stat(input, cwd);
    if (protectedPaths.has(entry.path)) fail("EPERM", "Không thể xóa thư mục hệ thống mô phỏng.");
    const last = input.replace(/\/+$/, "").split("/").pop();
    if (last === "." || last === "..") fail("EINVAL", "Không thể xóa trực tiếp . hoặc ..");
    if (entry.directory && !recursive) fail("EISDIR", "Đây là thư mục; dùng rm -r để xóa thư mục ảo.");
    const descendants = [...memory.directories, ...memory.filesystem.keys()].filter(path => path.startsWith(entry.path + "/"));
    destination(entry.path, false);
    // Kiểm tra trước để lỗi quyền không xóa một phần cây RAM.
    for (const path of [entry.path, ...descendants]) if (memory.directories.has(path)) permitted(path, 5);
    for (const path of descendants) permitted(parent(path), 3);
    for (const path of [entry.path, ...descendants]) { memory.filesystem.delete(path); memory.directories.delete(path); metadata.delete(path); }
    timestamp(parent(entry.path)); changed();
  }
  const targetPath = (source: VirtualEntry, target: string, cwd?: string) => {
    let path = resolve(target, cwd);
    if (memory.directories.has(path)) path = resolve(path + "/" + source.name);
    if (path === source.path || (source.directory && path.startsWith(source.path + "/"))) fail("EINVAL", "Nguồn và đích trùng nhau hoặc di chuyển/copy không hợp lệ.");
    return path;
  };
  function move(input: string, target: string, cwd?: string) {
    const source = stat(input, cwd), path = targetPath(source, target, cwd);
    if (protectedPaths.has(source.path)) fail("EPERM", "Không thể di chuyển thư mục hệ thống mô phỏng.");
    destination(source.path, false); destination(path, false);
    if (exists(path)) {
      if (source.directory !== memory.directories.has(path)) fail("EINVAL", "Nguồn và đích khác loại tệp/thư mục.");
      if (source.directory && [...memory.directories, ...memory.filesystem.keys()].some(p => parent(p) === path && p !== path)) fail("ENOTEMPTY", "Thư mục đích chưa rỗng.");
    }
    const dirs = [...memory.directories].filter(p => p === source.path || p.startsWith(source.path + "/"));
    const files = [...memory.filesystem].filter(([p]) => p === source.path || p.startsWith(source.path + "/"));
    const modes = [...dirs, ...files.map(([p]) => p)].map(p => [p, { ...meta(p) }] as const);
    for (const [item] of modes) resolveVirtualPath(path + item.slice(source.path.length));
    memory.filesystem.delete(path); memory.directories.delete(path); metadata.delete(path);
    for (const [item] of modes) { memory.filesystem.delete(item); memory.directories.delete(item); metadata.delete(item); }
    for (const dir of dirs) memory.directories.add(path + dir.slice(source.path.length));
    for (const [file, content] of files) memory.filesystem.set(path + file.slice(source.path.length), content);
    for (const [item, value] of modes) {
      const nextPath = path + item.slice(source.path.length);
      value.location.path = nextPath; metadata.set(nextPath, value);
    }
    const shellCwd = memory.temporary.get("shell-cwd");
    if (source.directory && typeof shellCwd === "string" && (shellCwd === source.path || shellCwd.startsWith(source.path + "/"))) {
      memory.temporary.set("shell-cwd", path + shellCwd.slice(source.path.length));
    }
    timestamp(parent(source.path)); timestamp(parent(path)); changed();
  }
  function copy(input: string, target: string, recursive = false, cwd?: string) {
    const source = stat(input, cwd), path = targetPath(source, target, cwd);
    if (source.directory && !recursive) fail("EISDIR", "Bỏ qua thư mục; dùng cp -r: " + source.path);
    function node(entry: VirtualEntry, output: string) {
      if (entry.directory) {
        const children = list(entry.path), creating = !exists(output);
        if (creating) mkdir(output); else requireDirectory(output);
        for (const child of children) node(child, output + "/" + child.name);
        if (creating) metadata.set(output, { ...meta(output), mode: entry.mode & ~0o022 });
      } else {
        const creating = !exists(output); write(output, read(entry.path));
        if (creating) metadata.set(output, { ...meta(output), mode: entry.mode & ~0o022 });
      }
    }
    transaction(() => node(source, path));
  }
  function chmod(input: string, mode: string, cwd?: string) {
    const entry = stat(input, cwd);
    if (user !== "root" && entry.owner !== user) fail("EPERM", "Không có quyền đổi mode (Operation not permitted): " + entry.path);
    let value = entry.mode;
    if (/^[0-7]{3,4}$/.test(mode) && parseInt(mode, 8) <= 0o777) value = parseInt(mode, 8);
    else {
      for (const clause of mode.split(",")) {
        const match = /^([ugoa]*)([+=-])([rwx]*)$/.exec(clause);
        if (!match) fail("EINVAL", "Mode không hợp lệ; hỗ trợ 000–777 hoặc [ugoa][+-=][rwx]. Không có setuid/sticky/ACL.");
        const [, who, operator, rights] = match!;
        const classes = !who || who.includes("a") ? "ugo" : who;
        let mask = 0;
        for (const group of new Set(classes)) mask |= 7 << (group === "u" ? 6 : group === "g" ? 3 : 0);
        if (!who) mask &= ~0o022;
        const bits = (rights.includes("r") ? 4 : 0) | (rights.includes("w") ? 2 : 0) | (rights.includes("x") ? 1 : 0);
        const requested = ((bits << 6) | (bits << 3) | bits) & mask;
        value = operator === "+" ? value | requested : operator === "-" ? value & ~requested : (value & ~mask) | requested;
      }
    }
    metadata.set(entry.path, { ...meta(entry.path), mode: value }); changed();
  }
  return { stat, read, write, append, mkdir, mkdirParents, touch, list, remove, move, copy, chmod, isActive,
    subscribe: (fn: () => void) => { events.listeners.add(fn); return () => { events.listeners.delete(fn); }; },
    getRevision: () => events.revision,
    // View riêng: sudo không đổi principal của File Manager hoặc callback subscribe.
    asUser: (actor: SimulatorUser) => { active(); return createVirtualFileSystem(memory, isActive, actor, events); },
  };
}

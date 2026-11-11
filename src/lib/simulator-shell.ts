import type { SessionMemory } from "./practice-session";
import { SIMULATOR_HOME, VirtualFsError, type VirtualEntry, type VirtualFileSystem } from "./simulator-filesystem";
import { createNameMatcher, createTextMatcher } from "./simulator-match";
import { createSimulatorSudo, type SimulatorSudoOptions } from "./simulator-sudo";

export type ShellResult = { output: string; clear?: boolean; exit?: boolean; rawOutput?: boolean; passwordPrompt?: string };
type Word = { value: string; operator?: boolean };
function parseCommand(line: string): Word[] {
  if (line.length > 2048 || /[\x00-\x08\x0a-\x1f\x7f]/.test(line)) throw Error("Lệnh quá dài hoặc chứa ký tự điều khiển.");
  const tokens: Word[] = []; let word = "", quote = "", started = false;
  const flush = () => { if (started) tokens.push({ value: word }); word = ""; started = false; };
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\\" && quote !== "'") {
      const next = line[i + 1];
      if (next === undefined) throw Error("Thiếu ký tự sau dấu backslash.");
      if (!quote || ['$', '`', '"', '\\'].includes(next)) { word += next; i++; }
      else word += char;
      started = true;
    } else if (quote) { if (char === quote) quote = ""; else word += char; started = true; }
    else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) flush();
    else if (char === ">") { flush(); tokens.push({ value: line[i + 1] === ">" ? (i++, ">>") : ">", operator: true }); }
    else if (";|&`<".includes(char) || (char === "$" && line[i + 1] === "(")) throw Error("Simulator chưa hỗ trợ pipe, script hoặc command substitution.");
    else { word += char; started = true; }
  }
  if (quote) throw Error("Thiếu dấu đóng chuỗi.");
  flush(); return tokens;
}
export const tokenizeCommand = (line: string): string[] => parseCommand(line).map(token => token.value);

function options(args: string[], allowed: string) {
  const flags = new Set<string>(), operands: string[] = []; let parsing = true;
  for (const arg of args) {
    if (parsing && arg === "--") { parsing = false; continue; }
    if (parsing && arg.startsWith("-") && arg !== "-") {
      for (const flag of arg.slice(1)) { if (!allowed.includes(flag)) throw Error("Tùy chọn chưa hỗ trợ: " + arg); flags.add(flag); }
    } else operands.push(arg);
  }
  return { flags, operands };
}
const integer = (value: string, label: string) => {
  if (!/^\d+$/.test(value) || Number(value) > 100000) throw Error(label + " phải là số nguyên từ 0 đến 100000.");
  return Number(value);
};
const raw = (output: string): ShellResult => ({ output, rawOutput: true });
const linesOf = (content: string) => content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const modeText = (entry: VirtualEntry) => (entry.directory ? "d" : "-") + [..."rwxrwxrwx"].map((char, i) => entry.mode & (1 << (8 - i)) ? char : "-").join("");
const longEntry = (entry: VirtualEntry) => `${modeText(entry)} 1 ${entry.owner} ${entry.group} ${entry.size} ${new Date(entry.modifiedAt).toISOString().slice(0, 16).replace("T", " ")} ${entry.name}`;
const HELP = `Kali Simulator — lệnh mô phỏng trong RAM, không chạy Linux thật hoặc mạng.
pwd; cd [path]; ls [-la] [path...]; mkdir [-p] path...; touch path...; cat file...
echo [-n] [text] [> file | >> file]; cp [-r] source target; mv source target; rm [-rf] path...
grep [-Finvclr] [-e pattern] pattern file...; find [path] [-name '*.txt'] [-type f|d] [-maxdepth N] [-mindepth N]
head/tail [-n N] file...; chmod MODE path...; history [N|-c]; whoami; hostname; ip; uname; date; clear; exit
sudo <lệnh>; sudo -l; sudo -k. Mật khẩu mô phỏng công khai kali-sim, KHÔNG dùng mật khẩu website. Cache RAM 5 phút, tối đa 3 lần thử.
Quyền r/w/x theo user kali/root ảo, umask 022; chmod 000–777 hoặc u/g/o/a +/-/= rwx. Không ACL, setuid, symlink hoặc thực thi file.
apt chỉ hướng dẫn mô phỏng: help/list/search; update/install/remove/upgrade cần sudo, không cài gói hoặc kết nối mạng. sudo không nâng quyền cho dấu > hoặc >> của shell.
grep BRE giới hạn: ^ $ . * [a-z]; -F tìm chữ nguyên văn. find -name hỗ trợ * và ?.
Chưa có pipe, stdin, biến shell, glob mở rộng đối số hoặc command substitution. File Manager và Terminal dùng chung RAM; Stop/refresh/logout xóa dữ liệu.`;

export function createSimulatorShell(memory: SessionMemory, baseFs: VirtualFileSystem, sudoOptions: SimulatorSudoOptions = {}) {
  let fs = baseFs, actor: "kali" | "root" = "kali";
  const sudo = createSimulatorSudo(memory, baseFs.isActive, sudoOptions);
  const sudoCommands = new Set(["pwd", "ls", "mkdir", "touch", "cat", "echo", "rm", "mv", "cp", "chmod", "grep", "find", "head", "tail", "whoami", "hostname", "ip", "uname", "date", "clear", "apt"]);
  let cwd = String(memory.temporary.get("shell-cwd") ?? SIMULATOR_HOME);
  const setCwd = (path: string) => { if (!fs.isActive()) throw Error("Phiên đã kết thúc."); cwd = path; memory.temporary.set("shell-cwd", path); };
  const validCwd = () => {
    const stored = memory.temporary.get("shell-cwd"); if (typeof stored === "string") cwd = stored;
    try { if (!fs.stat(cwd).directory) setCwd(SIMULATOR_HOME); }
    catch (error) { if (error instanceof VirtualFsError && error.code === "ENOENT") setCwd(SIMULATOR_HOME); else throw error; }
  };
  function walk(input: string, visit: (entry: VirtualEntry, display: string, depth: number) => void, maxDepth = 32) {
    function node(entry: VirtualEntry, display: string, depth: number) {
      visit(entry, display, depth);
      if (entry.directory && depth < maxDepth) for (const child of fs.list(entry.path)) node(child, (display === "/" ? "" : display.replace(/\/+$/, "")) + "/" + child.name, depth + 1);
    }
    node(fs.stat(input, cwd), input, 0);
  }
  function grep(args: string[]): ShellResult {
    const flags = new Set<string>(), operands: string[] = [];
    let pattern: string | undefined, parsing = true;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (parsing && arg === "--") { parsing = false; continue; }
      if (parsing && arg === "-e") { if (pattern !== undefined || args[i + 1] === undefined) throw Error("grep: cần đúng một mẫu sau -e."); pattern = args[++i]; }
      else if (parsing && arg.startsWith("-") && arg !== "-") {
        for (const flag of arg.slice(1)) { if (!"Finvclr".includes(flag)) throw Error("grep: tùy chọn chưa hỗ trợ: " + arg); flags.add(flag); }
      } else operands.push(arg);
    }
    if (pattern === undefined) pattern = operands.shift();
    if (pattern === undefined || !operands.length) throw Error("Cách dùng: grep [-Finvclr] [-e mẫu] mẫu tệp...; chưa hỗ trợ stdin.");
    const matches = createTextMatcher(pattern, flags.has("F"), flags.has("i"));
    const files: { path: string; display: string }[] = [];
    for (const input of operands) {
      const entry = fs.stat(input, cwd);
      if (entry.directory && !flags.has("r")) throw Error("grep: đây là thư mục; dùng -r: " + input);
      if (entry.directory) walk(input, (item, display) => { if (!item.directory) files.push({ path: item.path, display }); });
      else files.push({ path: entry.path, display: input });
    }
    const prefix = files.length > 1 || operands.length > 1 || flags.has("r"), output: string[] = [];
    for (const file of files) {
      const lines = linesOf(fs.read(file.path)); let count = 0;
      for (let index = 0; index < lines.length; index++) {
        const text = lines[index].replace(/\n$/, "");
        if (matches(text) === flags.has("v")) continue;
        count++;
        if (!flags.has("c") && !flags.has("l")) output.push((prefix ? file.display + ":" : "") + (flags.has("n") ? `${index + 1}:` : "") + text);
      }
      if (flags.has("l") && count) output.push(file.display);
      else if (!flags.has("l") && flags.has("c")) output.push((prefix ? file.display + ":" : "") + count);
    }
    return raw(output.length ? output.join("\n") + "\n" : "");
  }
  function headTail(command: string, args: string[]): ShellResult {
    let count = 10, parsing = true; const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (parsing && arg === "--") { parsing = false; continue; }
      if (parsing && arg === "-n") { if (args[i + 1] === undefined) throw Error("Thiếu số dòng sau -n."); count = integer(args[++i], "Số dòng"); }
      else if (parsing && /^-\d+$/.test(arg)) count = integer(arg.slice(1), "Số dòng");
      else if (parsing && /^-n\d+$/.test(arg)) count = integer(arg.slice(2), "Số dòng");
      else if (parsing && arg.startsWith("-")) throw Error("Tùy chọn chưa hỗ trợ: " + arg);
      else files.push(arg);
    }
    if (!files.length) throw Error(`Cách dùng: ${command} [-n N] tệp...; chưa hỗ trợ stdin.`);
    return raw(files.map(file => {
      const lines = linesOf(fs.read(file, cwd));
      const text = (command === "head" ? lines.slice(0, count) : count ? lines.slice(-count) : []).join("");
      return (files.length > 1 ? `==> ${file} <==\n` : "") + text;
    }).join("\n"));
  }
  function execute(line: string): ShellResult {
    if (!baseFs.isActive()) { sudo.invalidate(); return { output: "Phiên đã kết thúc." }; }
    if (sudo.isAwaitingPassword()) return { output: "sudo: đang chờ mật khẩu mô phỏng; dùng Ctrl+C để hủy." };
    let command = "";
    try {
      const words = parseCommand(line), first = words.shift();
      if (!first) return { output: "" };
      if (first.operator) throw Error("Thiếu tên lệnh trước dấu chuyển hướng.");
      command = first.value;
      const stored = memory.temporary.get("shell-cwd"); if (typeof stored === "string") cwd = stored;
      const historyCount = Number(memory.temporary.get("history-count") ?? memory.history.length);
      memory.history.push(line); if (memory.history.length > 100) memory.history.splice(0, memory.history.length - 100);
      memory.temporary.set("history-count", historyCount + 1);
      if (command === "sudo") {
        if (words.length === 1 && !words[0].operator && words[0].value === "-k") { sudo.invalidate(); return { output: "" }; }
        if (words.length === 1 && !words[0].operator && words[0].value === "-l") return sudo.request(() => ({ output: "User kali may run supported Simulator commands as root:\n    (root) " + [...sudoCommands].join(", ") + "\nChỉ trong RAM; không có shell/root/network thật." }));
        if (words[0]?.value === "--") words.shift();
        const target = words.shift();
        if (!target || target.operator || target.value.startsWith("-")) throw Error("Cách dùng: sudo [-l|-k] hoặc sudo <lệnh>. Không hỗ trợ -i/-s/-u/-S hoặc shell root tương tác.");
        if (!sudoCommands.has(target.value)) return { output: `sudo: ${target.value}: command not found trong Simulator; không chạy shell hoặc executable thật.` };
        return sudo.request(() => runCommand(target.value, words, true));
      }
      return runCommand(command, words);
    } catch (error) { return { output: (command ? command + ": " : "") + (error instanceof Error ? error.message : "Không thể xử lý lệnh mô phỏng.") }; }
  }
  function runCommand(command: string, words: Word[], elevated = false): ShellResult {
    if (!baseFs.isActive()) return { output: "Phiên đã kết thúc." };
    const previousFs = fs, previousActor = actor;
    try {
      fs = elevated ? baseFs.asUser("root") : baseFs; actor = elevated ? "root" : "kali";
      const redirect = words.findIndex(word => word.operator);
      let target: string | undefined, append = false;
      if (redirect !== -1) {
        if (command !== "echo" || redirect !== words.length - 2 || words.at(-1)!.operator) throw Error("Chỉ hỗ trợ echo ... > tệp hoặc >> tệp; tên chứa > cần đặt trong dấu nháy.");
        target = words.at(-1)!.value; append = words[redirect].value === ">>"; words.splice(redirect);
      }
      const args = words.map(word => word.value);
      switch (command) {
        case "help": if (args.length) throw Error("Cách dùng: help"); return { output: HELP };
        case "pwd": if (args.length) throw Error("Cách dùng: pwd"); return { output: cwd };
        case "ls": {
          const { flags, operands } = options(args, "al");
          const targets = operands.length ? operands : ["."];
          return { output: targets.map(input => {
            const item = fs.stat(input, cwd); let entries = fs.list(input, cwd);
            if (item.directory) {
              entries = entries.filter(entry => flags.has("a") || !entry.name.startsWith("."));
              entries.sort((a, b) => a.name.localeCompare(b.name));
              if (flags.has("a")) entries.unshift({ ...fs.stat(item.path), name: "." }, { ...fs.stat(item.path + "/.."), name: ".." });
            }
            const text = entries.map(entry => flags.has("l") ? longEntry(entry) : entry.name).join(flags.has("l") ? "\n" : "  ");
            return (targets.length > 1 ? input + ":\n" : "") + text;
          }).join("\n\n") };
        }
        case "cd": {
          const { operands } = options(args, ""); if (operands.length > 1) throw Error("cd: quá nhiều đối số.");
          const entry = fs.stat(operands[0] ?? "~", cwd);
          if (!entry.directory) throw Error("Không phải thư mục: " + entry.path);
          // Kiểm tra search bit bằng việc truy cập dấu .; không đòi quyền đọc danh sách.
          fs.stat(entry.path + "/."); setCwd(entry.path); return { output: "" };
        }
        case "mkdir": {
          const { flags, operands } = options(args, "p"); if (!operands.length) throw Error("Cách dùng: mkdir [-p] đường-dẫn...");
          for (const path of operands) { if (flags.has("p")) fs.mkdirParents(path, cwd); else fs.mkdir(path, cwd); }
          return { output: "" };
        }
        case "touch": {
          const { operands } = options(args, ""); if (!operands.length) throw Error("Cách dùng: touch tên-tệp...");
          for (const path of operands) fs.touch(path, cwd); return { output: "" };
        }
        case "cat": {
          const { operands } = options(args, ""); if (!operands.length) throw Error("Cách dùng: cat tệp...; chưa hỗ trợ stdin.");
          return raw(operands.map(path => fs.read(path, cwd)).join(""));
        }
        case "echo": {
          let newline = true; while (args[0] === "-n") { args.shift(); newline = false; }
          const content = args.join(" ") + (newline ? "\n" : "");
          if (target !== undefined) {
            // Redirection thuộc shell user thường, không thuộc process sudo.
            if (append) baseFs.append(target, content, cwd); else baseFs.write(target, content, cwd);
            return { output: "" };
          }
          return raw(content);
        }
        case "rm": {
          const { flags, operands } = options(args, "rfR"); if (!operands.length && !flags.has("f")) throw Error("Cách dùng: rm [-rf] đường-dẫn...");
          for (const path of operands) {
            try { fs.remove(path, flags.has("r") || flags.has("R"), cwd); }
            catch (error) { if (!flags.has("f") || !(error instanceof VirtualFsError) || error.code !== "ENOENT") throw error; }
          }
          validCwd(); return { output: "" };
        }
        case "mv": case "cp": {
          const { flags, operands } = options(args, command === "cp" ? "rR" : "");
          if (operands.length < 2) throw Error(`Cách dùng: ${command} ${command === "cp" ? "[-r] " : ""}nguồn... đích`);
          const target = operands.pop()!;
          if (operands.length > 1 && !fs.stat(target, cwd).directory) throw Error("Đích phải là thư mục khi có nhiều nguồn.");
          for (const source of operands) { if (command === "cp") fs.copy(source, target, flags.has("r") || flags.has("R"), cwd); else fs.move(source, target, cwd); }
          validCwd(); return { output: "" };
        }
        case "chmod": {
          const mode = args.shift(); if (!mode || !args.length) throw Error("Cách dùng: chmod MODE đường-dẫn...");
          if (args[0] === "--") args.shift(); if (!args.length) throw Error("chmod: thiếu đường dẫn.");
          for (const path of args) fs.chmod(path, mode, cwd); return { output: "" };
        }
        case "grep": return grep(args);
        case "find": {
          const paths: string[] = []; let index = 0, pattern: string | undefined, type: string | undefined, max = 32, min = 0;
          while (index < args.length && !args[index].startsWith("-")) paths.push(args[index++]);
          while (index < args.length) {
            const option = args[index++], value = args[index++]; if (value === undefined) throw Error("find: thiếu giá trị sau " + option);
            if (option === "-name") pattern = value;
            else if (option === "-type" && (value === "f" || value === "d")) type = value;
            else if (option === "-maxdepth") max = Math.min(32, integer(value, "Độ sâu"));
            else if (option === "-mindepth") min = integer(value, "Độ sâu");
            else throw Error("find: tùy chọn chưa hỗ trợ: " + option);
          }
          const matches = pattern === undefined ? () => true : createNameMatcher(pattern), output: string[] = [];
          for (const path of paths.length ? paths : ["."]) walk(path, (entry, display, depth) => {
            const name = display.replace(/\/+$/, "").split("/").pop() || "/";
            if (depth >= min && matches(name) && (!type || entry.directory === (type === "d"))) output.push(display);
          }, max);
          return { output: output.join("\n") };
        }
        case "head": case "tail": return headTail(command, args);
        case "whoami": if (args.length) throw Error("Cách dùng: whoami"); return { output: actor };
        case "apt": {
          const [operation, ...packages] = args;
          const notice = "apt Simulator chỉ hướng dẫn trong RAM: không có repository, mạng, cài phần mềm hoặc thực thi package thật.";
          if (!operation || operation === "help" || operation === "--help") return { output: notice + "\napt list; apt search <tên>; sudo apt update; sudo apt install/remove <gói>; sudo apt upgrade. Chưa có package ảo cài được." };
          if (operation === "list") { if (packages.length && (packages.length !== 1 || packages[0] !== "--installed")) throw Error("Cách dùng: apt list [--installed]"); return { output: "Không có package ảo được cài.\n" + notice }; }
          if (operation === "search") { if (packages.length !== 1) throw Error("Cách dùng: apt search <tên>"); return { output: "Chưa có catalog package ảo.\n" + notice }; }
          if (!["update", "install", "remove", "upgrade"].includes(operation)) throw Error("Tác vụ apt chưa được hỗ trợ; dùng apt help.");
          if (actor !== "root") throw Error("Permission denied: thao tác này cần root mô phỏng; dùng sudo apt " + operation + ".");
          if (operation === "install" || operation === "remove") {
            if (!packages.length || packages.length > 16 || packages.some(name => !/^[a-z0-9][a-z0-9+.-]{0,63}$/.test(name))) throw Error("Cần 1–16 tên package hợp lệ; không nhận URL, file hoặc script.");
          } else if (packages.length) throw Error("Cách dùng: apt " + operation);
          return { output: "Hướng dẫn mô phỏng: apt " + operation + (packages.length ? " " + packages.join(" ") : "") + ". Không có package nào được cài, cập nhật hoặc xóa.\n" + notice };
        }
        case "hostname": if (args.length) throw Error("Simulator chỉ hỗ trợ hostname để xem tên máy."); return { output: "kali-simulator" };
        case "ip": return { output: `IP ảo học tập: ${memory.virtualIp}\nKhông có interface hoặc kết nối mạng thật.` };
        case "uname": return { output: "Kali Desktop Simulator — browser/RAM, không có kernel Linux." };
        case "date": if (args.length) throw Error("Simulator chỉ hỗ trợ date không đối số."); return { output: new Date().toLocaleString("vi-VN") };
        case "history": {
          if (args.length > 1) throw Error("Cách dùng: history [N|-c]");
          if (args[0] === "-c") { memory.history.splice(0); memory.temporary.set("history-count", 0); return { output: "" }; }
          const count = args.length ? integer(args[0], "Số lệnh") : memory.history.length;
          const first = Number(memory.temporary.get("history-count")) - memory.history.length + 1;
          const entries = memory.history.map((entry, i) => `${first + i}  ${entry}`);
          return { output: count ? entries.slice(-count).join("\n") : "" };
        }
        case "clear": if (args.length) throw Error("Cách dùng: clear"); return { output: "", clear: true };
        case "exit": if (args.length) throw Error("Cách dùng: exit"); return { output: "", exit: true };
        default: return { output: `${command}: chưa được hỗ trợ trong Simulator. Gõ help để xem lệnh. Không có shell hoặc mạng thật.` };
      }
    } catch (error) { return { output: command + ": " + (error instanceof Error ? error.message : "Không thể xử lý lệnh mô phỏng.") }; }
    finally { fs = previousFs; actor = previousActor; }
  }
  return { execute, submitPassword: sudo.submitPassword, isAwaitingPassword: sudo.isAwaitingPassword, cancelPassword: sudo.cancelPassword,
    getCwd: () => { if (!baseFs.isActive()) return SIMULATOR_HOME; try { validCwd(); } catch { /* cwd mất quyền vẫn giữ tên, pwd không cần đọc thư mục */ } return cwd; } };
}

/** Nội dung tệp là dữ liệu, không cho escape/OSC điều khiển terminal. */
export const terminalText = (value: string) => value.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");

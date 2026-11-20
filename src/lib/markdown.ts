import { visit } from "unist-util-visit";
import { slugify } from "./slug";

const BORDER_LINE_RE = /^\s*([=-])\1{3,}\s*$/;
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;
const MISSING_SPACE_HEADING_RE = /^(#{1,4})([^\s#].*)$/;
const LIST_ITEM_COLON_RE = /^(\s*)(\d+[.)]|[-*+])\s+([^:\n]+?):\s+(.+)$/;
const ROMAN_HEADING_RE = /^([IVXLCDM]+)\.\s+(.+)$/;
const STRONGLY_ALIGNED_CMD_RE = /^\S.*(?:\s{2,}|\t)(?::|#|->|=>)(?:\s+.*|\s*)$/;
const SINGLE_LINE_ALIGNED_CMD_RE = /^\S.*(?:\s{3,}|\t)(?::|#|->|=>)\s+\S/;
const CMD_OR_ANNOTATION_RE = /^\S.*(?:\s+|\t)(?::|#|->|=>)(?:\s+.*|\s*)$/;
const SHELL_COMMENT_RE = /^\s*#\s+\S/;
const INDENTED_CONTINUATION_RE = /^\s{2,}\S/;
const TERMINAL_PROMPT_RE = /^\$\s+\S/;
const MARKDOWN_HEADING_RE = /^\s*#{1,6}\s/;
const MARKDOWN_QUOTE_RE = /^\s*>/;
const MARKDOWN_LIST_RE = /^\s*(?:[-*+]\s|\d+[.)]\s)/;
const GFM_TABLE_SEP_RE = /^\s*\|?[\s:-]+\|[\s|:-]*$/;

const CLI_FLAG_RE = /(?:^|\s)--?[a-zA-Z0-9][a-zA-Z0-9_-]*/;
const CLI_PIPE_OR_CHAIN_RE = /(?:\s(?:\||&&|\|\||>|>>|<)\s|2>\/dev\/null)/;
const CLI_START_RE = /^(?:\$\s+)?(?:\.{0,2}\/)?[a-z][a-z0-9._+-]*(?:\s|$)/;
const KNOWN_CLI_BINS = new Set([
  "sudo", "su", "ssh", "scp", "sftp", "curl", "wget", "http", "httpx", "katana", "gau",
  "waybackurls", "subfinder", "amass", "assetfinder", "nuclei", "ffuf", "gobuster",
  "feroxbuster", "dirsearch", "nmap", "masscan", "sqlmap", "nikto", "wpscan", "hydra",
  "john", "hashcat", "msfconsole", "msfvenom", "nc", "ncat", "netcat", "socat", "dig",
  "whois", "nslookup", "host", "ping", "traceroute", "tcpdump", "tshark", "openssl",
  "grep", "egrep", "fgrep", "rg", "ripgrep", "awk", "sed", "cut", "sort", "uniq", "tr",
  "xargs", "find", "fd", "cat", "head", "tail", "less", "more", "wc", "tee", "jq", "yq",
  "ls", "cd", "cp", "mv", "rm", "mkdir", "chmod", "chown", "ln", "tar", "zip", "unzip",
  "gzip", "gunzip", "ps", "top", "htop", "kill", "killall", "systemctl", "service",
  "journalctl", "crontab", "useradd", "usermod", "userdel", "passwd", "groupadd", "id",
  "whoami", "uname", "ip", "ifconfig", "ss", "netstat", "iptables", "ufw", "git",
  "docker", "kubectl", "helm", "python", "python3", "pip", "pip3", "node", "npm", "npx",
  "go", "rustscan", "bash", "sh", "zsh", "env", "export", "echo", "printf", "base64",
  "xxd", "strings", "file", "ldd", "strace", "ltrace", "gdb", "arjun", "dalfox", "gf",
  "anew", "uro", "qsreplace", "hakrawler", "gospider", "linkfinder", "secretfinder",
  "trufflehog", "gitleaks", "semgrep", "apt", "apt-get", "yum", "dnf", "pacman", "brew",
]);

function normalizeMissingSpaceHeading(line: string): string | null {
  const m = MISSING_SPACE_HEADING_RE.exec(line);
  if (!m) return null;
  const hashes = m[1];
  const rest = m[2].trim();
  if (!rest) return null;
  if (hashes.length >= 2) return `${hashes} ${rest}`;
  // Với 1 dấu `#`, yêu cầu bắt đầu bằng chữ/số và có ít nhất 2 từ để tránh biến #hashtag thành H1.
  if (/^[\p{L}\d]/u.test(rest) && /\s+\S/.test(rest)) {
    return `# ${rest}`;
  }
  return null;
}

function isLikelyCliCommand(rawCmd: string): boolean {
  const cmd = rawCmd.trim();
  if (!cmd || cmd.length < 3) return false;
  if (cmd.includes("`") || cmd.includes("](") || cmd.includes("**")) return false;
  if (/^https?:\/\/\S+$/i.test(cmd)) return false;
  if (!CLI_START_RE.test(cmd)) return false;

  const withoutPrompt = cmd.replace(/^\$\s+/, "");
  const tokens = withoutPrompt.split(/\s+/);
  const bin = tokens[0].replace(/^\.{0,2}\//, "").split("/").pop() ?? "";
  const firstTwo = tokens.slice(0, 2).join(" ");
  if (/[À-ỹ]/u.test(firstTwo)) return false;

  const hasCliSyntax = CLI_FLAG_RE.test(withoutPrompt) || CLI_PIPE_OR_CHAIN_RE.test(withoutPrompt);
  if (hasCliSyntax) return true;
  if (KNOWN_CLI_BINS.has(bin) && tokens.length >= 2) return true;
  return false;
}

function formatListCommandLines(block: string[]): string[] {
  const result: string[] = [];
  for (const line of block) {
    const m = LIST_ITEM_COLON_RE.exec(line);
    if (m && isLikelyCliCommand(m[4])) {
      const indent = m[1];
      const marker = m[2];
      const desc = m[3].trim();
      const cmd = m[4].trim();
      const childIndent = `${indent}${" ".repeat(marker.length + 1)}`;
      const fence = safeFenceFor([cmd]);
      result.push(`${indent}${marker} **${desc}**`);
      result.push(`${childIndent}${fence}cli`);
      result.push(`${childIndent}${cmd}`);
      result.push(`${childIndent}${fence}`);
    } else {
      result.push(line);
    }
  }
  return result;
}

function isFenceClose(line: string, marker: string): boolean {
  const ch = marker[0];
  const re = new RegExp(`^\\s*${ch}{${marker.length},}\\s*$`);
  return re.test(line);
}

function safeFenceFor(lines: string[]): string {
  let maxTicks = 2;
  for (const line of lines) {
    const matches = line.match(/`+/g);
    if (matches) {
      for (const m of matches) {
        if (m.length > maxTicks) maxTicks = m.length;
      }
    }
  }
  return "`".repeat(maxTicks + 1);
}

function isStandaloneRomanHeading(line: string): boolean {
  const trimmed = line.trim();
  const m = ROMAN_HEADING_RE.exec(trimmed);
  if (!m) return false;
  const title = m[2].trim();
  if (title.length < 3 || title.length > 140) return false;
  // Chỉ nâng cấp tiêu đề IN HOA (kể cả tiếng Việt có dấu), tránh nhầm câu thường.
  return /\p{Lu}/u.test(title) && !/\p{Ll}/u.test(title);
}

function isMarkdownTable(block: string[]): boolean {
  return block.length >= 2 && block[0].includes("|") && GFM_TABLE_SEP_RE.test(block[1]);
}

function isAlignedCommandBlock(block: string[]): boolean {
  if (block.length === 0) return false;
  if (isMarkdownTable(block)) return false;

  const first = block[0];
  if (
    MARKDOWN_HEADING_RE.test(first) ||
    MARKDOWN_QUOTE_RE.test(first) ||
    MARKDOWN_LIST_RE.test(first)
  ) {
    return false;
  }

  if (block.length === 1) {
    return SINGLE_LINE_ALIGNED_CMD_RE.test(first);
  }

  let strongCount = 0;
  let matchingCount = 0;

  for (const line of block) {
    if (STRONGLY_ALIGNED_CMD_RE.test(line)) {
      strongCount++;
      matchingCount++;
    } else if (
      CMD_OR_ANNOTATION_RE.test(line) ||
      SHELL_COMMENT_RE.test(line) ||
      INDENTED_CONTINUATION_RE.test(line)
    ) {
      matchingCount++;
    }
  }

  if (strongCount >= 2 && matchingCount === block.length) return true;
  if (block.length >= 3 && strongCount >= 2 && matchingCount / block.length >= 0.75) {
    return true;
  }
  return false;
}

function isTerminalPromptBlock(block: string[]): boolean {
  if (block.length === 0) return false;
  let promptCount = 0;
  for (const line of block) {
    if (TERMINAL_PROMPT_RE.test(line)) {
      promptCount++;
    } else if (!SHELL_COMMENT_RE.test(line) && !INDENTED_CONTINUATION_RE.test(line)) {
      return false;
    }
  }
  return promptCount > 0;
}

function isAsciiBannerAt(lines: string[], idx: number): { level: 2 | 3; title: string } | null {
  if (idx + 2 >= lines.length) return null;
  const top = BORDER_LINE_RE.exec(lines[idx]);
  if (!top) return null;
  const bottom = BORDER_LINE_RE.exec(lines[idx + 2]);
  if (!bottom || bottom[1] !== top[1]) return null;
  const title = lines[idx + 1].trim();
  if (!title || BORDER_LINE_RE.test(title) || FENCE_OPEN_RE.test(title)) return null;
  return { level: top[1] === "=" ? 2 : 3, title };
}

/**
 * Chuẩn hóa Markdown trước khi parse:
 * - Giữ nguyên tuyệt đối mọi nội dung trong code fence có sẵn.
 * - Nhận diện tiêu đề dạng khung ASCII (`===` / `---`) để không bị CommonMark nuốt thành Setext heading lỗi.
 * - Nhận diện tiêu đề mục con chữ La Mã in hoa đứng độc lập (`I. ...`, `II. ...`).
 * - Nhận diện khối lệnh Linux/Terminal căn cột bằng khoảng trắng (`lệnh    : chú thích` hoặc `$ lệnh`)
 *   và bọc thành code block chuyên dụng để bảo toàn từng dòng, khoảng trắng và căn chỉnh cột.
 */
export function normalizeMarkdown(raw: string): string {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];

  let i = 0;
  let fenceMarker: string | null = null;

  while (i < lines.length) {
    const line = lines[i];

    // Giữ nguyên tuyệt đối nội dung bên trong fenced code block
    if (fenceMarker) {
      out.push(line);
      if (isFenceClose(line, fenceMarker)) {
        fenceMarker = null;
      }
      i++;
      continue;
    }

    const fenceOpen = FENCE_OPEN_RE.exec(line);
    if (fenceOpen) {
      fenceMarker = fenceOpen[1];
      out.push(line);
      i++;
      continue;
    }

    // Dòng trống
    if (line.trim() === "") {
      out.push("");
      i++;
      continue;
    }

    // Khung tiêu đề ASCII 3 dòng (=== / Tiêu đề / ===)
    const banner = isAsciiBannerAt(lines, i);
    if (banner) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(`${"#".repeat(banner.level)} ${banner.title}`);
      out.push("");
      i += 3;
      continue;
    }

    // Dòng kẻ toàn dấu `====` đứng độc lập
    if (/^\s*={4,}\s*$/.test(line) && (i === 0 || lines[i - 1].trim() === "")) {
      out.push("---");
      i++;
      continue;
    }

    // Tiêu đề thiếu khoảng trắng sau `#` (ví dụ: `#Thu thập thông tin...`, `##Mục 2`)
    const fixedHeading = normalizeMissingSpaceHeading(line);
    if (fixedHeading) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(fixedHeading);
      out.push("");
      i++;
      continue;
    }

    // Gom một khối dòng liên tiếp (dừng khi gặp dòng trống, code fence, ASCII banner hoặc heading thiếu khoảng trắng)
    const blockStart = i;
    const block: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (cur.trim() === "") break;
      if (FENCE_OPEN_RE.test(cur)) break;
      if (isAsciiBannerAt(lines, i)) break;
      if (normalizeMissingSpaceHeading(cur)) break;
      block.push(cur);
      i++;
    }

    const prevBlank = blockStart === 0 || lines[blockStart - 1].trim() === "";
    const nextBlank = i >= lines.length || lines[i].trim() === "";

    if (block.length === 1 && prevBlank && nextBlank && isStandaloneRomanHeading(block[0])) {
      out.push(`### ${block[0].trim()}`);
      continue;
    }

    if (isAlignedCommandBlock(block)) {
      const fence = safeFenceFor(block);
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(`${fence}commands`);
      out.push(...block);
      out.push(fence);
      if (!nextBlank) out.push("");
      continue;
    }

    if (isTerminalPromptBlock(block)) {
      const fence = safeFenceFor(block);
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(`${fence}terminal`);
      out.push(...block);
      out.push(fence);
      if (!nextBlank) out.push("");
      continue;
    }

    out.push(...formatListCommandLines(block));
  }

  return out.join("\n");
}

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

/**
 * Remark plugin: chuyển xuống dòng đơn (`\n`) trong đoạn văn/trích dẫn/mục danh sách
 * thành thẻ `<br />` chuẩn HTML, không áp dụng `white-space: pre-wrap` toàn cục.
 */
export function remarkSoftBreaks() {
  return (tree: MdastNode) => {
    visit(tree, "text", (node: MdastNode, index: number | undefined, parent: MdastNode | undefined) => {
      if (
        !parent ||
        !Array.isArray(parent.children) ||
        typeof index !== "number" ||
        typeof node.value !== "string" ||
        !node.value.includes("\n")
      ) {
        return;
      }
      if (parent.type === "heading" || parent.type === "tableCell") return;

      const parts = node.value.split(/\r?\n/);
      if (parts.length <= 1) return;

      const replacement: MdastNode[] = [];
      parts.forEach((part, idx) => {
        if (part.length > 0) {
          replacement.push({ type: "text", value: part });
        }
        if (idx < parts.length - 1) {
          replacement.push({ type: "break" });
        }
      });

      parent.children.splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}

/** Cấp phát ID tiêu đề nhất quán và không trùng nhau giữa mục lục (TOC) và bài viết. */
export function createHeadingIdAllocator() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugify(text, "muc");
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

export const CODE_LANGUAGE_LABELS: Record<string, string> = {
  commands: "Lệnh & Chú thích",
  terminal: "Terminal",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Zsh",
  linux: "Linux",
  powershell: "PowerShell",
  ps1: "PowerShell",
  cmd: "CMD",
  sql: "SQL",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  html: "HTML",
  css: "CSS",
  http: "HTTP",
  nginx: "Nginx",
  dockerfile: "Dockerfile",
  text: "Văn bản",
  txt: "Văn bản",
};

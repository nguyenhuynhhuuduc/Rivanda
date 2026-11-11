/** Bộ matcher giới hạn cho grep/find; không dùng RegExp do người dùng cung cấp hoặc backtracking. */
type Token = { accepts: (char: string) => boolean; repeat: boolean };
function machine(tokens: Token[], anchoredStart: boolean, anchoredEnd: boolean) {
  let work = 0;
  return (text: string) => {
    const chars = [...text];
    let states = new Set([0]);
    for (let position = 0; position <= chars.length; position++) {
      if (!anchoredStart) states.add(0);
      for (let index = 0; index < tokens.length; index++) {
        if (++work > 4000000) throw Error("Mẫu tìm kiếm vượt giới hạn xử lý của Simulator; hãy dùng mẫu ngắn hơn hoặc grep -F.");
        if (states.has(index) && tokens[index].repeat) states.add(index + 1);
      }
      if (states.has(tokens.length) && (!anchoredEnd || position === chars.length)) return true;
      if (position === chars.length) return false;
      const next = new Set<number>();
      for (const index of states) {
        const token = tokens[index];
        if (token?.accepts(chars[position])) next.add(token.repeat ? index : index + 1);
      }
      states = next;
    }
    return false;
  };
}

export function createTextMatcher(pattern: string, fixed = false, insensitive = false) {
  if (pattern.length > 128) throw Error("Mẫu grep tối đa 128 ký tự.");
  const normalize = (value: string) => insensitive ? value.toLowerCase() : value;
  pattern = normalize(pattern);
  if (fixed) return (text: string) => normalize(text).includes(pattern);
  const chars = [...pattern], tokens: Token[] = [];
  let start = false, end = false;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === "^" && i === 0) { start = true; continue; }
    if (char === "$" && i === chars.length - 1) { end = true; continue; }
    if (char === "*") {
      if (!tokens.length || tokens.at(-1)!.repeat) throw Error("Mẫu grep không hợp lệ: dấu * cần ký tự phía trước.");
      tokens.at(-1)!.repeat = true; continue;
    }
    if (char === "\\") {
      const literal = chars[++i];
      if (!literal) throw Error("Mẫu grep thiếu ký tự sau dấu backslash.");
      if (/[1-9+?(){}|]/.test(literal)) throw Error("grep chỉ hỗ trợ BRE cơ bản: ^ $ . * [a-z], escape literal; chưa có group/backreference/interval.");
      tokens.push({ accepts: value => value === literal, repeat: false }); continue;
    }
    if (char === "[") {
      const negated = chars[i + 1] === "^"; if (negated) i++;
      const members: string[] = [];
      if (chars[i + 1] === "]") members.push(chars[++i]);
      while (++i < chars.length && chars[i] !== "]") members.push(chars[i]);
      if (i === chars.length || !members.length || members.includes("[")) throw Error("Lớp ký tự grep không hợp lệ hoặc chưa hỗ trợ POSIX class.");
      const ranges: [string, string][] = [];
      for (let j = 0; j < members.length; j++) {
        const first = members[j];
        if (j + 2 < members.length && members[j + 1] === "-") {
          const last = members[j + 2]; if (first > last) throw Error("Khoảng ký tự grep không hợp lệ.");
          ranges.push([first, last]); j += 2;
        } else ranges.push([first, first]);
      }
      tokens.push({ accepts: value => ranges.some(([a, b]) => value >= a && value <= b) !== negated, repeat: false });
    } else tokens.push({ accepts: char === "." ? () => true : value => value === char, repeat: false });
  }
  const matches = machine(tokens, start, end);
  return (text: string) => matches(normalize(text));
}

export function createNameMatcher(pattern: string) {
  if (pattern.length > 128) throw Error("Mẫu find -name tối đa 128 ký tự.");
  const tokens: Token[] = [];
  for (const char of pattern) {
    if (char === "*" && tokens.at(-1)?.repeat) continue;
    tokens.push({ accepts: char === "*" || char === "?" ? () => true : value => value === char, repeat: char === "*" });
  }
  return machine(tokens, true, true);
}

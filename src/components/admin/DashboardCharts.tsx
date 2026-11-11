import type { MonthlyActivity } from "@/lib/admin-stats";
import { PHOTO_STATUS_LABEL, type PhotoStatus } from "@/lib/discovery";

const series = [
  { key: "users", label: "Tài khoản mới", color: "var(--chart-1)" },
  { key: "photos", label: "Ảnh mới", color: "var(--chart-2)" },
  { key: "posts", label: "Bài viết mới", color: "var(--chart-3)" },
  { key: "documents", label: "Tài liệu mới", color: "var(--muted)" },
] as const;

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-60 place-items-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-muted">{children}</div>;
}

export function ActivityChart({ months }: { months: MonthlyActivity[] }) {
  const maximum = Math.max(0, ...months.flatMap((m) => series.map((s) => m[s.key])));
  if (!maximum) return <ChartEmpty>Chưa có hoạt động mới trong 6 tháng gần đây. Biểu đồ sẽ xuất hiện khi có dữ liệu.</ChartEmpty>;
  const top = Math.max(4, Math.ceil(maximum / 4) * 4);
  const x = (i: number) => 45 + i * (550 / Math.max(1, months.length - 1));
  const y = (n: number) => 205 - (n / top) * 175;
  return <div>
    <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">{series.map((s) => <span key={s.key} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>)}</div>
    <svg viewBox="0 0 640 245" className="h-auto w-full" role="img" aria-label="Số tài khoản, ảnh, bài viết và tài liệu tạo mới theo tháng">
      {[0, 1, 2, 3, 4].map((i) => <g key={i}><line x1="45" y1={y(top * i / 4)} x2="605" y2={y(top * i / 4)} stroke="var(--line)" strokeDasharray="4 5" /><text x="30" y={y(top * i / 4) + 4} textAnchor="end" fill="var(--muted)" fontSize="10">{top * i / 4}</text></g>)}
      {months.map((m, i) => <text key={m.month} x={x(i)} y="230" textAnchor="middle" fill="var(--muted)" fontSize="10">{m.label}</text>)}
      {series.map((s) => <g key={s.key}><polyline points={months.map((m, i) => `${x(i)},${y(m[s.key])}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />{months.map((m, i) => <circle key={m.month} cx={x(i)} cy={y(m[s.key])} r="4" fill="var(--surface)" stroke={s.color} strokeWidth="2"><title>{`${s.label}, ${m.label}: ${m[s.key]}`}</title></circle>)}</g>)}
    </svg>
    <details className="mt-4 text-xs text-muted"><summary className="hover:text-fg">Xem bảng số liệu</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-left"><caption className="sr-only">Hoạt động tạo mới trong sáu tháng</caption><thead><tr><th className="py-2">Tháng</th>{series.map((s) => <th key={s.key} className="p-2">{s.label}</th>)}</tr></thead><tbody>{months.map((m) => <tr key={m.month} className="border-t border-line"><th className="py-2 font-normal">{m.label}</th>{series.map((s) => <td key={s.key} className="p-2 tabular-nums">{m[s.key]}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

export function PhotoStatusChart({ states }: { states: { status: string; count: number }[] }) {
  const total = states.reduce((n, s) => n + s.count, 0);
  if (!total) return <ChartEmpty>Thư viện chưa có ảnh. Chưa có dữ liệu để phân loại trạng thái.</ChartEmpty>;
  const colors: Record<string, string> = { published: "var(--chart-3)", pending: "var(--chart-2)", draft: "var(--chart-1)", rejected: "var(--danger)", archived: "var(--muted)" };
  let offset = 0;
  const circumference = 2 * Math.PI * 65;
  return <div>
    <svg viewBox="0 0 210 190" className="mx-auto h-52 w-56" role="img" aria-label={`Phân loại trạng thái ${total} ảnh`}>
      {states.filter((s) => s.count > 0).map((s) => {
        const size = s.count / total * circumference, start = offset;
        offset += size;
        return <circle key={s.status} cx="105" cy="95" r="65" fill="none" stroke={colors[s.status] ?? "var(--muted)"} strokeWidth="18" strokeDasharray={`${size} ${circumference - size}`} strokeDashoffset={-start} transform="rotate(-90 105 95)"><title>{`${PHOTO_STATUS_LABEL[s.status as PhotoStatus] ?? s.status}: ${s.count}`}</title></circle>;
      })}
      <text x="105" y="94" textAnchor="middle" fill="var(--fg)" fontSize="29" fontWeight="700">{total}</text><text x="105" y="116" textAnchor="middle" fill="var(--muted)" fontSize="11">ảnh trong thư viện</text>
    </svg>
    <ul className="space-y-2 text-sm">{states.map((s) => <li key={s.status} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: colors[s.status] ?? "var(--muted)" }} /><span className="text-muted">{PHOTO_STATUS_LABEL[s.status as PhotoStatus] ?? s.status}</span><strong className="ml-auto tabular-nums">{s.count}</strong></li>)}</ul>
  </div>;
}

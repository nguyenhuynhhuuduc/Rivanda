// Liveness tối thiểu, không lộ cấu hình hoặc dữ liệu; startup có kiểm tra schema read-only.
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

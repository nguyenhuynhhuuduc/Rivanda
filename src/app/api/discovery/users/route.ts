import { NextResponse, type NextRequest } from "next/server";
import {
  normalizeMemberLimit,
  normalizeMemberPage,
  normalizeMemberQuery,
  searchPublicMembers,
} from "@/lib/discovery-community/members";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = normalizeMemberQuery(sp.get("q") ?? "");
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: HEADERS });
  }

  const page = normalizeMemberPage(sp.get("page"));
  const limit = normalizeMemberLimit(sp.get("limit"));

  if (!parsed.value) {
    return NextResponse.json(
      { query: "", items: [], total: 0, page: 1, limit, hasMore: false },
      { status: 200, headers: HEADERS }
    );
  }

  try {
    const result = await searchPublicMembers({ q: parsed.value, page, limit });
    return NextResponse.json(result, { status: 200, headers: HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Chưa thể tìm kiếm thành viên lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: HEADERS }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { normalizeMemberQuery } from "@/lib/discovery-community/members";
import { searchQuick } from "@/lib/search";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: NextRequest) {
  const parsed = normalizeMemberQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: HEADERS });
  }
  if (!parsed.value) {
    return NextResponse.json(
      { query: "", members: [], totalMembers: 0, posts: [] },
      { status: 200, headers: HEADERS }
    );
  }

  try {
    const result = await searchQuick(parsed.value);
    return NextResponse.json(result, { status: 200, headers: HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Chưa thể tìm kiếm lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: HEADERS }
    );
  }
}

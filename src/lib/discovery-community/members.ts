import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { COVER_FILE, profileCoverReady } from "../profile";
import { displayName, type Role } from "../users";
import { CYBER_IP_BASE, ipNumberToString, isVirtualIp } from "../cyber-ip-address";
import { UUID } from "./model";

export const MEMBER_SEARCH_MAX_QUERY = 80;
export const MEMBER_SEARCH_DEFAULT_LIMIT = 8;
export const MEMBER_SEARCH_MAX_LIMIT = 20;

export type PublicMemberHit = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  role: Role;
  cyberIp: string | null;
  followersCount: number;
  profileUrl: string;
};

export type MemberSearchResult = {
  query: string;
  items: PublicMemberHit[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type NormalizedMemberQuery =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function normalizeMemberQuery(raw: unknown): NormalizedMemberQuery {
  if (raw === undefined || raw === null) return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, error: "Từ khóa tìm kiếm không hợp lệ." };
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (cleaned.length > MEMBER_SEARCH_MAX_QUERY) {
    return {
      ok: false,
      error: `Từ khóa tìm kiếm tối đa ${MEMBER_SEARCH_MAX_QUERY} ký tự.`,
    };
  }
  return { ok: true, value: cleaned };
}

export function normalizeMemberPage(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(100, Math.floor(n));
}

export function normalizeMemberLimit(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseInt(String(raw ?? MEMBER_SEARCH_DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n) || n < 1) return MEMBER_SEARCH_DEFAULT_LIMIT;
  return Math.min(MEMBER_SEARCH_MAX_LIMIT, Math.floor(n));
}

export function stripVietnameseDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

export function virtualIpToNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!isVirtualIp(trimmed)) return null;
  const parts = trimmed.split(".").map(Number);
  return CYBER_IP_BASE + parts[2] * 256 + parts[3];
}

function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

const cyberIpTableReady = cache(async (): Promise<boolean> => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cyber_virtual_ips' LIMIT 1"
    );
    return rows.length > 0;
  } catch {
    return false;
  }
});

type MemberRow = RowDataPacket & {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: Role;
  profile_cover_file?: string | null;
  ip_number?: number | null;
  followers_count: number;
};

const FULL_NAME_LF = "TRIM(CONCAT_WS(' ', NULLIF(u.last_name, ''), NULLIF(u.first_name, '')))";
const FULL_NAME_FL = "TRIM(CONCAT_WS(' ', NULLIF(u.first_name, ''), NULLIF(u.last_name, '')))";
const NORM_LF = `REPLACE(REPLACE(LOWER(${FULL_NAME_LF}), 'đ', 'd'), 'Đ', 'd')`;
const NORM_FL = `REPLACE(REPLACE(LOWER(${FULL_NAME_FL}), 'đ', 'd'), 'Đ', 'd')`;
const IP_TEXT_EXPR = `CONCAT('10.10.', FLOOR((v.ip_number - ${CYBER_IP_BASE}) / 256), '.', MOD(v.ip_number - ${CYBER_IP_BASE}, 256))`;

/**
 * Tìm kiếm thành viên công khai từ bảng `users` (và `cyber_virtual_ips` nếu đã kích hoạt).
 * - Chỉ trả về dữ liệu công khai (tuyệt đối không truy vấn email/mật khẩu/phiên).
 * - Ưu tiên khớp chính xác ID-User / CyberLab IP ID, tiếp theo tiền tố ID/IP, rồi tên (có dấu & không dấu).
 */
export async function searchPublicMembers(input: {
  q?: string | null;
  page?: number | string;
  limit?: number | string;
}): Promise<MemberSearchResult> {
  const parsed = normalizeMemberQuery(input.q ?? "");
  const page = normalizeMemberPage(input.page);
  const limit = normalizeMemberLimit(input.limit);

  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const query = parsed.value;
  if (!query) {
    return { query: "", items: [], total: 0, page: 1, limit, hasMore: false };
  }

  const [coverSupported, ipSupported] = await Promise.all([
    profileCoverReady().catch(() => false),
    cyberIpTableReady().catch(() => false),
  ]);

  const lowerQ = query.toLowerCase();
  const asciiQ = stripVietnameseDiacritics(query);
  const likeRaw = `%${escapeLike(query)}%`;
  const likeAscii = `%${escapeLike(asciiQ)}%`;
  const prefixRaw = `${escapeLike(query)}%`;
  const prefixAscii = `${escapeLike(asciiQ)}%`;
  const isUuid = UUID.test(query);
  const isIdFragment = /^[a-f0-9-]{4,36}$/i.test(query);
  const idPrefix = `${escapeLike(lowerQ)}%`;
  const exactIpNum = ipSupported ? virtualIpToNumber(query) : null;
  const isIpFragment = ipSupported && /^10(?:\.\d{0,3}){1,3}$/.test(query);
  const ipPrefix = `${escapeLike(query)}%`;

  const whereParts = [
    "LOWER(u.id) = ?",
    `${FULL_NAME_LF} LIKE ?`,
    `${FULL_NAME_FL} LIKE ?`,
    `${NORM_LF} LIKE ?`,
    `${NORM_FL} LIKE ?`,
  ];
  const whereParams: unknown[] = [lowerQ, likeRaw, likeRaw, likeAscii, likeAscii];

  if (isIdFragment && !isUuid) {
    whereParts.push("LOWER(u.id) LIKE ?");
    whereParams.push(idPrefix);
  }
  if (exactIpNum !== null) {
    whereParts.push("v.ip_number = ?");
    whereParams.push(exactIpNum);
  } else if (isIpFragment) {
    whereParts.push(`(v.ip_number IS NOT NULL AND ${IP_TEXT_EXPR} LIKE ?)`);
    whereParams.push(ipPrefix);
  }

  const ipJoin = ipSupported ? "LEFT JOIN cyber_virtual_ips v ON v.user_id = u.id" : "";
  const whereSql = `u.is_active = 1 AND (${whereParts.join(" OR ")})`;
  const coverCol = coverSupported ? ", u.profile_cover_file" : "";
  const ipCol = ipSupported ? ", v.ip_number" : "";
  const offset = (page - 1) * limit;

  const [[countRow]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM users u ${ipJoin} WHERE ${whereSql}`,
    whereParams
  );
  const total = Number(countRow?.total ?? 0);
  if (total === 0) {
    return { query, items: [], total: 0, page, limit, hasMore: false };
  }

  const rankBranches: string[] = [];
  const rankParams: unknown[] = [];

  if (exactIpNum !== null) {
    rankBranches.push("WHEN LOWER(u.id) = ? OR v.ip_number = ? THEN 0");
    rankParams.push(lowerQ, exactIpNum);
  } else {
    rankBranches.push("WHEN LOWER(u.id) = ? THEN 0");
    rankParams.push(lowerQ);
  }

  if (isIdFragment) {
    rankBranches.push("WHEN LOWER(u.id) LIKE ? THEN 1");
    rankParams.push(idPrefix);
  }
  if (isIpFragment && exactIpNum === null) {
    rankBranches.push(`WHEN v.ip_number IS NOT NULL AND ${IP_TEXT_EXPR} LIKE ? THEN 1`);
    rankParams.push(ipPrefix);
  }

  rankBranches.push(`WHEN LOWER(${FULL_NAME_LF}) = ? OR ${NORM_LF} = ? THEN 2`);
  rankParams.push(lowerQ, asciiQ);

  rankBranches.push(
    `WHEN ${FULL_NAME_LF} LIKE ? OR ${NORM_LF} LIKE ? OR ${FULL_NAME_FL} LIKE ? OR ${NORM_FL} LIKE ? THEN 3`
  );
  rankParams.push(prefixRaw, prefixAscii, prefixRaw, prefixAscii);

  const rankCase = `CASE ${rankBranches.join(" ")} ELSE 4 END`;

  const [rows] = await pool.query<MemberRow[]>(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.bio, u.role${coverCol}${ipCol},
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS followers_count,
            ${rankCase} AS match_rank
       FROM users u
       ${ipJoin}
      WHERE ${whereSql}
      ORDER BY match_rank ASC, followers_count DESC, u.created_at DESC, u.id ASC
      LIMIT ? OFFSET ?`,
    [...rankParams, ...whereParams, limit, offset]
  );

  const items: PublicMemberHit[] = rows.map((r) => {
    const coverFile =
      coverSupported &&
      typeof r.profile_cover_file === "string" &&
      COVER_FILE.test(r.profile_cover_file)
        ? r.profile_cover_file
        : null;
    let cyberIp: string | null = null;
    if (ipSupported && r.ip_number !== null && r.ip_number !== undefined) {
      try {
        cyberIp = ipNumberToString(Number(r.ip_number));
      } catch {
        cyberIp = null;
      }
    }
    return {
      id: r.id,
      displayName:
        displayName({ firstName: r.first_name, lastName: r.last_name }) || "Thành viên",
      avatarUrl: r.avatar_url ?? null,
      coverUrl: coverFile ? `/api/profile/${r.id}/cover` : null,
      bio: r.bio ?? null,
      role: r.role,
      cyberIp,
      followersCount: Number(r.followers_count ?? 0),
      profileUrl: `/profile/${r.id}`,
    };
  });

  return {
    query,
    items,
    total,
    page,
    limit,
    hasMore: offset + items.length < total,
  };
}

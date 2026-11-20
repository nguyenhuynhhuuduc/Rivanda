import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { listPhotos, PUBLIC, type Photo } from "./discovery";
import { getCurrentUser } from "./auth";
import { displayName } from "./users";
import { communityReady } from "./discovery-community/read";
import {
  normalizeMemberQuery,
  searchPublicMembers,
  type PublicMemberHit,
} from "./discovery-community/members";

export type QuickPostHit = {
  id: string;
  title: string;
  excerpt: string | null;
  href: string;
  kindLabel: "Discovery" | "Blog" | "Cyber Lab";
  authorName: string;
  authorAvatar: string | null;
};

export type QuickSearchResult = {
  query: string;
  members: PublicMemberHit[];
  totalMembers: number;
  posts: QuickPostHit[];
};

export type SearchResults = {
  photos: Photo[];
  posts: { id: string; type: "hacking" | "blog"; slug: string; title: string; summary: string | null }[];
  docs: { id: string; title: string; description: string | null; kind: string }[];
  members: PublicMemberHit[];
  communityPosts: QuickPostHit[];
};

function escapeLike(q: string): string {
  return `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

function makeExcerpt(raw: string | null | undefined, max = 110): string | null {
  if (!raw) return null;
  const compact = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return null;
  return compact.length > max ? `${compact.slice(0, max).trimEnd()}…` : compact;
}

async function searchPublicCommunityPosts(q: string, limit: number): Promise<QuickPostHit[]> {
  if (!(await communityReady().catch(() => false))) return [];
  const l = escapeLike(q);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, p.title, LEFT(p.body, 220) AS body, u.first_name, u.last_name, u.avatar_url
       FROM community_posts p
       JOIN users u ON u.id = p.author_id
      WHERE p.status = 'published'
        AND p.visibility = 'public'
        AND p.deleted_at IS NULL
        AND p.published_at <= NOW(6)
        AND (
          p.title LIKE ?
          OR p.body LIKE ?
          OR EXISTS (
            SELECT 1 FROM community_post_tags pt
            JOIN tags t ON t.id = pt.tag_id
            WHERE pt.post_id = p.id AND t.name LIKE ?
          )
        )
      ORDER BY p.published_at DESC, p.id DESC
      LIMIT ?`,
    [l, l, l, limit]
  );

  return rows.map((r) => {
    const rawTitle = (r.title as string | null)?.trim() || "";
    const excerpt = makeExcerpt(r.body as string | null, 110);
    return {
      id: `community-${r.id as string}`,
      title: rawTitle || excerpt || "Bài chia sẻ Discovery",
      excerpt: rawTitle ? excerpt : null,
      href: `/discovery/posts/${r.id as string}`,
      kindLabel: "Discovery" as const,
      authorName:
        displayName({
          firstName: (r.first_name as string) ?? "",
          lastName: (r.last_name as string) ?? "",
        }) || "Thành viên",
      authorAvatar: (r.avatar_url as string | null) ?? null,
    };
  });
}

async function searchPublishedArticles(
  q: string,
  includeCyberLab: boolean,
  limit: number
): Promise<QuickPostHit[]> {
  const l = escapeLike(q);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, p.type, p.slug, p.title, p.summary, u.first_name, u.last_name, u.avatar_url
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
      WHERE p.status = 'published'
        AND (p.type = 'blog' OR ? = 1)
        AND (p.title LIKE ? OR p.summary LIKE ?)
      ORDER BY COALESCE(p.published_at, p.created_at) DESC
      LIMIT ?`,
    [includeCyberLab ? 1 : 0, l, l, limit]
  );

  return rows.map((r) => {
    const type = r.type as "hacking" | "blog";
    return {
      id: `post-${r.id as string}`,
      title: r.title as string,
      excerpt: makeExcerpt(r.summary as string | null, 110),
      href:
        type === "hacking"
          ? `/cyber-lab/articles/${r.slug as string}`
          : `/documents/blog/${r.slug as string}`,
      kindLabel: type === "hacking" ? "Cyber Lab" : "Blog",
      authorName:
        displayName({
          firstName: (r.first_name as string) ?? "",
          lastName: (r.last_name as string) ?? "",
        }) || "Tác giả",
      authorAvatar: (r.avatar_url as string | null) ?? null,
    };
  });
}

/** Tìm kiếm trực tiếp cho thanh Navbar (phân nhóm Thành viên & Bài viết theo quyền người xem). */
export async function searchQuick(rawQuery: string): Promise<QuickSearchResult> {
  const parsed = normalizeMemberQuery(rawQuery);
  if (!parsed.ok) throw new Error(parsed.error);
  const query = parsed.value;
  if (!query) {
    return { query: "", members: [], totalMembers: 0, posts: [] };
  }

  const user = await getCurrentUser();
  const [memberRes, communityPosts, articles] = await Promise.all([
    searchPublicMembers({ q: query, page: 1, limit: 5 }).catch(() => ({
      query,
      items: [],
      total: 0,
      page: 1,
      limit: 5,
      hasMore: false,
    })),
    searchPublicCommunityPosts(query, 4).catch(() => []),
    searchPublishedArticles(query, !!user, 4).catch(() => []),
  ]);

  const posts = [...communityPosts, ...articles].slice(0, 6);
  return {
    query,
    members: memberRes.items,
    totalMembers: memberRes.total,
    posts,
  };
}

export async function searchAll(q: string): Promise<SearchResults> {
  const user = await getCurrentUser();
  const l = escapeLike(q);
  const [{ photos }, [postRows], [docRows], memberRes, communityPosts] = await Promise.all([
    listPhotos({ statuses: PUBLIC, q, limit: 12 }),
    pool.query<RowDataPacket[]>(
      `SELECT id, type, slug, title, summary FROM posts
        WHERE status = 'published' AND (type = 'blog' OR ? = 1) AND (title LIKE ? OR summary LIKE ?) ORDER BY published_at DESC LIMIT 12`,
      [user ? 1 : 0, l, l]
    ),
    pool.query<RowDataPacket[]>(
      `SELECT id, title, description, kind FROM documents
        WHERE is_published = 1 AND access <> 'private' AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT 12`,
      [l, l]
    ),
    searchPublicMembers({ q, page: 1, limit: 12 }).catch(() => ({
      query: q,
      items: [],
      total: 0,
      page: 1,
      limit: 12,
      hasMore: false,
    })),
    searchPublicCommunityPosts(q, 12).catch(() => []),
  ]);
  return {
    photos,
    posts: postRows.map((r) => ({
      id: r.id as string,
      type: r.type as "hacking" | "blog",
      slug: r.slug as string,
      title: r.title as string,
      summary: (r.summary as string | null) ?? null,
    })),
    docs: docRows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      kind: r.kind as string,
    })),
    members: memberRes.items,
    communityPosts,
  };
}

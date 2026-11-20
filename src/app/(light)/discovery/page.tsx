import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import { BookmarkIcon } from "@/components/icons";
import { PostCard } from "@/components/discovery-community/PostCard";
import { FeedFilters } from "@/components/discovery-community/FeedFilters";
import { MemberSearchResults } from "@/components/discovery-community/MemberSearchResults";
import { CreatePostModal } from "@/components/discovery-community/CreatePostModal";
import { OnlineFriendsPanel } from "@/components/discovery-community/OnlineFriendsPanel";
import { DiscoveryIcon, discoveryLoginHref } from "@/components/discovery-community/DiscoveryUI";
import styles from "@/components/discovery-community/Discovery.module.css";
import { getCurrentUser } from "@/lib/auth";
import { returnPath } from "@/lib/url";
import { communityFeed, communityReady, communityTopics } from "@/lib/discovery-community/read";
import { CommunityError } from "@/lib/discovery-community/model";
import { storageUsage } from "@/lib/discovery-community/storage";
import {
  listMutualFollowPresence,
  recordHeartbeat,
  type MutualPresenceList,
} from "@/lib/discovery-community/presence";
import {
  searchPublicMembers,
  type MemberSearchResult,
} from "@/lib/discovery-community/members";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discovery · Cộng đồng",
  description: "Chia sẻ câu chuyện, góc nhìn và những khoảnh khắc cùng cộng đồng.",
  alternates: { canonical: "/discovery" },
};

type Query = {
  tab?: string;
  order?: string;
  q?: string;
  topic?: string;
  cursor?: string;
  author?: string;
  page?: string;
};

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const user = await getCurrentUser();
  const tab: "posts" | "users" = q.tab === "users" ? "users" : "posts";
  const order = q.order === "popular" ? "popular" : q.order === "following" ? "following" : "newest";

  const fullReturn = returnPath("/discovery", {
    tab: tab === "users" ? "users" : undefined,
    order: tab === "posts" ? q.order : undefined,
    q: q.q,
    topic: tab === "posts" ? q.topic : undefined,
    author: tab === "posts" ? q.author : undefined,
    cursor: tab === "posts" ? q.cursor : undefined,
    page: tab === "users" ? q.page : undefined,
  });
  // Large signed popular cursors can exceed safeNext's limit. Keep the Discovery
  // filters and restart pagination rather than sending a successful login Home.
  const returnTo =
    fullReturn === "/"
      ? returnPath("/discovery", {
          tab: tab === "users" ? "users" : undefined,
          order: tab === "posts" ? order : undefined,
          q: q.q,
          topic: tab === "posts" ? q.topic : undefined,
          author: tab === "posts" ? q.author : undefined,
        })
      : fullReturn;
  const login = discoveryLoginHref(returnTo === "/" ? "/discovery" : returnTo);

  let ready = false;
  let error = "";
  let topics: Awaited<ReturnType<typeof communityTopics>> = [];
  let feed: Awaited<ReturnType<typeof communityFeed>> = { posts: [], next: null };
  let memberResult: MemberSearchResult | null = null;
  let memberError = "";
  let initialUsage: { used: number; limit: number } | null = null;
  let initialPresence: MutualPresenceList | null = null;

  try {
    ready = await communityReady();
    if (ready) {
      topics = await communityTopics();
      if (user) {
        recordHeartbeat(user.id);
        [initialUsage, initialPresence] = await Promise.all([
          storageUsage(user).catch(() => null),
          listMutualFollowPresence(user.id).catch(() => null),
        ]);
      }
      if (tab === "posts" && (order !== "following" || user)) {
        feed = await communityFeed({
          order,
          q: q.q,
          topic: q.topic,
          cursor: q.cursor,
          authorId: q.author,
          viewer: user,
        });
      }
    }
  } catch (e) {
    error = e instanceof CommunityError ? e.message : "Chưa thể tải Discovery. Vui lòng thử lại sau.";
  }

  if (ready && tab === "users") {
    try {
      if ((q.q ?? "").trim()) {
        memberResult = await searchPublicMembers({ q: q.q, page: q.page, limit: 8 });
      }
    } catch (e) {
      memberError = e instanceof Error ? e.message : "Chưa thể tìm kiếm thành viên lúc này.";
    }
  }

  function href(extra: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      order,
      q: q.q,
      topic: q.topic,
      author: q.author,
      ...extra,
    })) {
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `/discovery?${qs}` : "/discovery";
  }

  function switchTabHref(target: "posts" | "users") {
    const p = new URLSearchParams();
    if (target === "users") {
      p.set("tab", "users");
      if (q.q) p.set("q", q.q);
    } else {
      if (order !== "newest") p.set("order", order);
      if (q.q) p.set("q", q.q);
      if (q.topic) p.set("topic", q.topic);
      if (q.author) p.set("author", q.author);
    }
    const qs = p.toString();
    return qs ? `/discovery?${qs}` : "/discovery";
  }

  const createHref = user ? "/discovery/new" : discoveryLoginHref("/discovery/new");

  return (
    <div className={`${styles.shell} ${styles.shellCompact} ${styles.scope}`}>
      <h1 className="sr-only">Discovery · Cộng đồng</h1>

      {!ready && !error && (
        <div role="status" className={styles.empty}>
          <div className={styles.emptyIcon}>
            <DiscoveryIcon name="people" />
          </div>
          <h2>Discovery chưa khả dụng trên môi trường này</h2>
          <p>
            Cơ sở dữ liệu cộng đồng chưa được kích hoạt. Nội dung sẽ xuất hiện sau khi môi trường sẵn
            sàng.
          </p>
        </div>
      )}

      {ready && (
        <div className={styles.layout}>
          <aside className={styles.left} aria-label="Không gian Discovery">
            <div className={styles.panel}>
              <div className={styles.identity}>
                {user ? (
                  <>
                    <Avatar name={user.displayName} url={user.avatarUrl} size={46} />
                    <p className={styles.identityName}>{user.displayName}</p>
                    <Link href={`/profile/${user.id}`} className={styles.readMore}>
                      Xem hồ sơ <DiscoveryIcon name="arrow" />
                    </Link>
                  </>
                ) : (
                  <>
                    <div className={styles.emptyIcon} style={{ margin: "0 0 .8rem" }}>
                      <DiscoveryIcon name="people" />
                    </div>
                    <p className={styles.panelHeading}>Chào bạn,</p>
                    <p className={`${styles.small} mt-2`}>
                      Mỗi góc nhìn đều có một câu chuyện đáng chia sẻ.
                    </p>
                    <Link className={styles.readMore} href={login}>
                      Đăng nhập để kết nối <DiscoveryIcon name="arrow" />
                    </Link>
                  </>
                )}
              </div>
              <nav aria-label="Điều hướng Discovery" className={styles.nav}>
                <Link
                  href="/discovery"
                  aria-current={
                    tab === "posts" && order === "newest" && !q.q && !q.topic && !q.author
                      ? "page"
                      : undefined
                  }
                  className={styles.navLink}
                >
                  <DiscoveryIcon name="feed" />
                  Bảng tin
                </Link>
                <Link
                  href="/discovery?order=popular"
                  aria-current={tab === "posts" && order === "popular" ? "page" : undefined}
                  className={styles.navLink}
                >
                  <DiscoveryIcon name="spark" />
                  Phổ biến
                </Link>
                <Link
                  href="/discovery?tab=users"
                  aria-current={tab === "users" ? "page" : undefined}
                  className={styles.navLink}
                >
                  <DiscoveryIcon name="people" />
                  Thành viên
                </Link>
                <Link
                  href={
                    user
                      ? "/account/discovery?view=saved"
                      : discoveryLoginHref("/account/discovery?view=saved")
                  }
                  className={styles.navLink}
                >
                  <BookmarkIcon className={styles.icon} />
                  Bài đã lưu
                </Link>
                <Link
                  href={user ? "/account/discovery" : discoveryLoginHref("/account/discovery")}
                  className={styles.navLink}
                >
                  <DiscoveryIcon name="edit" />
                  Bài của tôi
                </Link>
              </nav>
            </div>
            <p className={`${styles.desktopOnly} ${styles.small} px-3 pt-5`}>
              Tôn trọng khác biệt.
              <br />
              Chia sẻ có trách nhiệm.
            </p>
          </aside>

          <section className={styles.feed} aria-label="Newsfeed Discovery">
            <FeedFilters
              key={JSON.stringify([tab, order, q.q, q.topic, q.author])}
              topics={topics}
              order={order}
              q={q.q}
              topic={q.topic}
              author={q.author}
              loggedIn={!!user}
              activeTab={tab}
              variant="top"
            />

            {!error && tab === "posts" && (
              <CreatePostModal
                user={
                  user
                    ? { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }
                    : null
                }
                loginHref={login}
                topics={topics}
                initialUsage={initialUsage}
              />
            )}

            <div className={styles.feedLabel}>
              <h2>
                {tab === "users"
                  ? "Tìm kiếm thành viên"
                  : q.q || q.topic || q.author
                    ? "Kết quả khám phá"
                    : "Dành cho cộng đồng"}
              </h2>
              <nav aria-label="Nhóm kết quả Discovery" className={styles.scopeSwitch}>
                <Link
                  href={switchTabHref("posts")}
                  aria-current={tab === "posts" ? "page" : undefined}
                  className={styles.scopeSwitchLink}
                >
                  <DiscoveryIcon name="feed" />
                  Bài viết
                </Link>
                <Link
                  href={switchTabHref("users")}
                  aria-current={tab === "users" ? "page" : undefined}
                  className={styles.scopeSwitchLink}
                >
                  <DiscoveryIcon name="people" />
                  Thành viên
                </Link>
              </nav>
            </div>

            {tab === "users" ? (
              <MemberSearchResults
                initialQuery={q.q ?? ""}
                initialResult={memberResult}
                initialError={memberError}
              />
            ) : (
              <>
                <nav aria-label="Thứ tự Newsfeed" className={styles.tabs}>
                  <Link
                    aria-current={order === "newest" ? "page" : undefined}
                    href={href({ order: "newest", cursor: undefined })}
                    className={styles.tab}
                  >
                    <DiscoveryIcon name="feed" />
                    Mới nhất
                  </Link>
                  <Link
                    aria-current={order === "popular" ? "page" : undefined}
                    href={href({ order: "popular", cursor: undefined })}
                    className={styles.tab}
                  >
                    <DiscoveryIcon name="spark" />
                    Phổ biến 7 ngày
                  </Link>
                  <Link
                    aria-current={order === "following" ? "page" : undefined}
                    href={href({ order: "following", cursor: undefined })}
                    className={styles.tab}
                  >
                    <DiscoveryIcon name="people" />
                    Đang theo dõi
                  </Link>
                </nav>
                <p className={styles.small}>
                  {order === "popular"
                    ? "Bài công khai trong 7 ngày, xếp theo lượt thích, bình luận và lưu."
                    : order === "following"
                      ? "Bài công khai mới nhất từ thành viên bạn đang theo dõi."
                      : "Những chia sẻ công khai mới nhất từ cộng đồng."}
                  {q.author && " Đang lọc theo tác giả."}
                </p>
                {error ? (
                  <div role="alert" className={styles.error}>
                    <p>{error}</p>
                    <Link href="/discovery" className={styles.readMore}>
                      Tải lại Newsfeed từ đầu <DiscoveryIcon name="arrow" />
                    </Link>
                  </div>
                ) : (
                  <>
                    {feed.posts.map((p) => (
                      <PostCard
                        key={p.id}
                        post={p}
                        viewer={user}
                        manage={user?.id === p.authorId}
                        returnTo={returnTo}
                      />
                    ))}
                    {!feed.posts.length && order === "following" && (
                      <div className={styles.empty}>
                        <h3>
                          {user
                            ? "Chưa có bài từ người bạn theo dõi"
                            : "Bảng tin của những người bạn quan tâm"}
                        </h3>
                        <p>
                          {user
                            ? "Theo dõi thành viên từ hồ sơ hoặc bài viết. Bài nháp, riêng tư, đã ẩn và đã xóa không xuất hiện ở đây."
                            : "Đăng nhập để xem bài công khai từ những người bạn theo dõi."}
                        </p>
                        <Link className={styles.primary} href={user ? "/discovery" : login}>
                          {user ? "Khám phá cộng đồng" : "Đăng nhập"}
                        </Link>
                      </div>
                    )}
                    {!feed.posts.length && order !== "following" && (
                      <div className={styles.empty}>
                        <div className={styles.emptyIcon}>
                          <DiscoveryIcon name={q.q || q.topic ? "search" : "people"} />
                        </div>
                        <h3>
                          {q.q || q.topic
                            ? "Chưa tìm thấy câu chuyện phù hợp"
                            : "Cộng đồng đang chờ câu chuyện đầu tiên"}
                        </h3>
                        <p>
                          {q.q || q.topic
                            ? "Thử một từ khóa hoặc chủ đề khác để tiếp tục khám phá."
                            : "Một trải nghiệm, một câu hỏi hay một khoảnh khắc. Bạn muốn chia sẻ điều gì?"}
                        </p>
                        <Link className={styles.primary} href={q.q || q.topic ? "/discovery" : createHref}>
                          {q.q || q.topic ? "Xóa bộ lọc" : "Viết chia sẻ đầu tiên"}
                        </Link>
                      </div>
                    )}
                    {feed.next && (
                      <Link className={`${styles.tab} ${styles.panel}`} href={href({ cursor: feed.next })}>
                        Xem trang tiếp theo ↓
                      </Link>
                    )}
                    {q.cursor && (
                      <Link className="text-center text-sm text-link" href={href({ cursor: undefined })}>
                        Về bài mới nhất
                      </Link>
                    )}
                  </>
                )}
              </>
            )}
          </section>

          <aside className={styles.right} aria-label="Người dùng đang hoạt động">
            <OnlineFriendsPanel
              loggedIn={!!user}
              loginHref={login}
              initialData={initialPresence}
            />
          </aside>
        </div>
      )}

      {!ready && error && (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <Link href="/discovery" className="text-link underline">
            Tải lại
          </Link>
        </div>
      )}
    </div>
  );
}

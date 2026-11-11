import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import { BookmarkIcon } from "@/components/icons";
import { PostCard } from "@/components/discovery-community/PostCard";
import { FeedFilters } from "@/components/discovery-community/FeedFilters";
import { DiscoveryIcon, discoveryLoginHref } from "@/components/discovery-community/DiscoveryUI";
import styles from "@/components/discovery-community/Discovery.module.css";
import { getCurrentUser } from "@/lib/auth";
import { returnPath } from "@/lib/url";
import { communityFeed, communityReady, communityTopics } from "@/lib/discovery-community/read";
import { CommunityError } from "@/lib/discovery-community/model";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Discovery · Cộng đồng", description: "Chia sẻ câu chuyện, góc nhìn và những khoảnh khắc cùng cộng đồng.", alternates: { canonical: "/discovery" } };
type Query = { order?: string; q?: string; topic?: string; cursor?: string; author?: string };
export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams, user = await getCurrentUser(), order = q.order === "popular" ? "popular" : "newest";
  const fullReturn = returnPath("/discovery", {order:q.order,q:q.q,topic:q.topic,author:q.author,cursor:q.cursor});
  // Large signed popular cursors can exceed safeNext's limit. Keep the Discovery
  // filters and restart pagination rather than sending a successful login Home.
  const returnTo = fullReturn === "/" ? returnPath("/discovery", {order,q:q.q,topic:q.topic,author:q.author}) : fullReturn;
  const login = discoveryLoginHref(returnTo === "/" ? "/discovery" : returnTo);
  let ready = false, error = "", suggestionError = false, topics: Awaited<ReturnType<typeof communityTopics>> = [], feed: Awaited<ReturnType<typeof communityFeed>> = { posts: [], next: null }, suggestions: typeof feed.posts = [];
  try { ready = await communityReady(); if (ready) { topics = await communityTopics(); feed = await communityFeed({ order, q: q.q, topic: q.topic, cursor: q.cursor, authorId: q.author, viewer: user }); } }
  catch (e) { error = e instanceof CommunityError ? e.message : "Chưa thể tải Discovery. Vui lòng thử lại sau."; }
  // Reuse the existing public popular feed; a recommendation failure must not hide the main feed.
  if (ready && !error) {
    try { suggestions = (order === "popular" && !q.q && !q.topic && !q.author && !q.cursor ? feed.posts : (await communityFeed({ order: "popular", viewer: user })).posts).slice(0, 3); }
    catch { suggestionError = true; }
  }
  function href(extra: Record<string, string | undefined>) { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ order, q: q.q, topic: q.topic, author: q.author, ...extra })) if (v) p.set(k, v); return `/discovery?${p}`; }
  const createHref = user ? "/discovery/new" : discoveryLoginHref("/discovery/new");
  return <div className={`${styles.shell} ${styles.scope}`}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>Cộng đồng · Kết nối mỗi ngày</p><h1 className={`${styles.title} font-display`}>Discovery<span className="text-link">.</span></h1><p className={styles.subtitle}>Những câu chuyện nhỏ. Những góc nhìn mới.<br className="hidden sm:block"/> Một nơi để chia sẻ và tìm thấy sự đồng điệu.</p></div><p className={styles.headingNote}><DiscoveryIcon name="people"/>Không gian của những câu chuyện</p></header>
    {!ready && !error && <div role="status" className={styles.empty}><div className={styles.emptyIcon}><DiscoveryIcon name="people"/></div><h2>Discovery chưa khả dụng trên môi trường này</h2><p>Cơ sở dữ liệu cộng đồng chưa được kích hoạt. Nội dung sẽ xuất hiện sau khi môi trường sẵn sàng.</p></div>}
    {ready && <div className={styles.layout}>
      <aside className={styles.left} aria-label="Không gian Discovery"><div className={styles.panel}><div className={styles.identity}>{user?<><Avatar name={user.displayName} url={user.avatarUrl} size={46}/><p className={styles.identityName}>{user.displayName}</p><Link href={`/profile/${user.id}`} className={styles.readMore}>Xem hồ sơ <DiscoveryIcon name="arrow"/></Link></>:<><div className={styles.emptyIcon} style={{margin:"0 0 .8rem"}}><DiscoveryIcon name="people"/></div><p className={styles.panelHeading}>Chào bạn,</p><p className={`${styles.small} mt-2`}>Mỗi góc nhìn đều có một câu chuyện đáng chia sẻ.</p><Link className={styles.readMore} href={login}>Đăng nhập để kết nối <DiscoveryIcon name="arrow"/></Link></>}</div>
      <nav aria-label="Điều hướng Discovery" className={styles.nav}>
        <Link href="/discovery" aria-current={order==="newest"&&!q.q&&!q.topic&&!q.author?"page":undefined} className={styles.navLink}><DiscoveryIcon name="feed"/>Bảng tin</Link>
        <Link href="/discovery?order=popular" aria-current={order==="popular"?"page":undefined} className={styles.navLink}><DiscoveryIcon name="spark"/>Phổ biến</Link>
        <Link href={user?"/account/discovery?view=saved":discoveryLoginHref("/account/discovery?view=saved")} className={styles.navLink}><BookmarkIcon className={styles.icon}/>Bài đã lưu</Link>
        <Link href={user?"/account/discovery":discoveryLoginHref("/account/discovery")} className={styles.navLink}><DiscoveryIcon name="edit"/>Bài của tôi</Link>
      </nav></div><p className={`${styles.desktopOnly} ${styles.small} px-3 pt-5`}>Tôn trọng khác biệt.<br/>Chia sẻ có trách nhiệm.</p></aside>
      <section className={styles.feed} aria-label="Newsfeed Discovery">
        {!error&&<div className={`${styles.panel} ${styles.compose}`}><Link href={createHref} className={styles.composePrompt}><Avatar name={user?.displayName??"Discovery"} url={user?.avatarUrl} size={42}/><span className={styles.composeInput}>{user?"Bạn muốn chia sẻ điều gì hôm nay?":"Câu chuyện của bạn bắt đầu từ đây…"}</span></Link><div className={styles.composeBottom}><span className={styles.composeHint}><DiscoveryIcon name="image"/>Status, bài viết & khoảnh khắc</span><Link href={createHref} className={styles.primary}><DiscoveryIcon name="edit"/>Tạo bài viết</Link></div>{!user&&<p className={`${styles.small} mt-3`}>Bạn có thể đọc bài công khai. <Link className="text-link underline underline-offset-4" href={login}>Đăng nhập</Link> để thích, bình luận và lưu bài.</p>}</div>}
        <div className={styles.feedLabel}><h2>{q.q||q.topic||q.author?"Kết quả khám phá":"Dành cho cộng đồng"}</h2><DiscoveryIcon name="feed" className="text-muted"/></div>
        <nav aria-label="Thứ tự Newsfeed" className={styles.tabs}><Link aria-current={order==="newest"?"page":undefined} href={href({order:"newest",cursor:undefined})} className={styles.tab}><DiscoveryIcon name="feed"/>Mới nhất</Link><Link aria-current={order==="popular"?"page":undefined} href={href({order:"popular",cursor:undefined})} className={styles.tab}><DiscoveryIcon name="spark"/>Phổ biến 7 ngày</Link></nav>
        <p className={styles.small}>{order==="popular"?"Bài công khai trong 7 ngày, xếp theo lượt thích, bình luận và lưu.":"Những chia sẻ công khai mới nhất từ cộng đồng."}{q.author&&" Đang lọc theo tác giả."}</p>
        {error?<div role="alert" className={styles.error}><p>{error}</p><Link href="/discovery" className={styles.readMore}>Tải lại Newsfeed từ đầu <DiscoveryIcon name="arrow"/></Link></div>:<>{feed.posts.map(p=><PostCard key={p.id} post={p} viewer={user} manage={user?.id===p.authorId} returnTo={returnTo}/>)}{!feed.posts.length&&<div className={styles.empty}><div className={styles.emptyIcon}><DiscoveryIcon name={q.q||q.topic?"search":"people"}/></div><h3>{q.q||q.topic?"Chưa tìm thấy câu chuyện phù hợp":"Cộng đồng đang chờ câu chuyện đầu tiên"}</h3><p>{q.q||q.topic?"Thử một từ khóa hoặc chủ đề khác để tiếp tục khám phá.":"Một trải nghiệm, một câu hỏi hay một khoảnh khắc. Bạn muốn chia sẻ điều gì?"}</p><Link className={styles.primary} href={q.q||q.topic?"/discovery":createHref}>{q.q||q.topic?"Xóa bộ lọc":"Viết chia sẻ đầu tiên"}</Link></div>}{feed.next&&<Link className={`${styles.tab} ${styles.panel}`} href={href({cursor:feed.next})}>Xem trang tiếp theo ↓</Link>}{q.cursor&&<Link className="text-center text-sm text-link" href={href({cursor:undefined})}>Về bài mới nhất</Link>}</>}
      </section>
      <aside className={styles.right} aria-label="Khám phá thêm">
        <FeedFilters key={JSON.stringify([order,q.q,q.topic,q.author])} topics={topics} order={order} q={q.q} topic={q.topic} author={q.author} loggedIn={!!user}/>
        <section className={`${styles.panel} ${styles.panelBody} ${styles.desktopOnly}`}><h2 className={styles.panelHeading}>Chủ đề cộng đồng</h2><p className={`${styles.small} mt-1`}>Tìm góc nhìn bạn quan tâm</p><div className={styles.topicList}>{topics.map(t=><Link key={t.id} href={`/discovery?topic=${encodeURIComponent(t.slug)}`} className={styles.topicLink}><span className={styles.topicMark} aria-hidden="true">#</span>{t.name}</Link>)}</div>{!topics.length&&<p className={`${styles.small} mt-3`}>Chưa có chủ đề để khám phá.</p>}</section>
        <section className={`${styles.panel} ${styles.panelBody} ${styles.desktopOnly}`}><h2 className={styles.panelHeading}>Đáng chú ý trong tuần</h2><p className={`${styles.small} mt-1`}>Từ bảng tin Phổ biến 7 ngày</p>{suggestions.map(p=><Link key={p.id} href={`/discovery/posts/${p.id}`} className={styles.suggestion}><span className={styles.small}>{p.authorName}</span><strong>{p.title||p.body.slice(0,95)||"Bài chia sẻ ảnh"}</strong><span className={styles.small}>{p.likes} thích · {p.comments} bình luận</span></Link>)}{!suggestions.length&&<p className={`${styles.small} mt-4`}>{error?"Gợi ý tạm chưa khả dụng. Hãy tải lại bảng tin.":suggestionError?"Chưa tải được gợi ý. Bạn vẫn có thể khám phá Newsfeed.":"Chưa có bài công khai trong tuần để gợi ý."}</p>}</section>
      </aside>
    </div>}
    {!ready&&error&&<div role="alert" className={styles.error}>{error} <Link href="/discovery" className="text-link underline">Tải lại</Link></div>}
  </div>;
}

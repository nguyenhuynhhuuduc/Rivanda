import Link from "next/link";
import { communityFeed, communityReady } from "@/lib/discovery-community/read";
import { CommunityError } from "@/lib/discovery-community/model";
import { PostCard } from "./PostCard";
import { DiscoveryIcon } from "./DiscoveryUI";
import styles from "./Discovery.module.css";
import { getCurrentUser } from "@/lib/auth";
export async function ProfilePosts({ id, own, cursor }: { id: string; own: boolean; cursor?:string }) {
  const viewer=await getCurrentUser();
  let feed:Awaited<ReturnType<typeof communityFeed>>={posts:[],next:null},error="";
  try { if (!await communityReady()) return <p role="status" className={styles.empty}>Bài viết Discovery chưa khả dụng trên môi trường này.</p>; feed=await communityFeed({authorId:id,viewer,cursor}); }
  catch(e) { error=e instanceof CommunityError?e.message:"Chưa tải được bài Discovery."; }
  return <section className={`${styles.scope}`}><div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Câu chuyện & góc nhìn</p><h2 className={`${styles.sectionTitle} mt-2`}>Bài Discovery</h2></div>{own&&<Link href="/account/discovery" className={styles.readMore}>Quản lý bài của tôi <DiscoveryIcon name="arrow"/></Link>}</div><div className={styles.stack}>{error?<p role="alert" className={styles.error}>{error} <Link href={`/profile/${id}`} className="text-link underline">Tải lại</Link></p>:<>{feed.posts.map(p=><PostCard key={p.id} post={p} viewer={viewer} manage={own} returnTo={`/profile/${id}${cursor?`?cursor=${encodeURIComponent(cursor)}`:""}`}/>)}{!feed.posts.length&&<div className={styles.empty}><div className={styles.emptyIcon}><DiscoveryIcon name="edit"/></div><h3>Chưa có câu chuyện công khai</h3><p>{own?"Những bài công khai đã xuất bản của bạn sẽ xuất hiện ở đây. Bản nháp và bài riêng tư được giữ trong khu vực quản lý.":"Các chia sẻ công khai của thành viên này sẽ xuất hiện ở đây."}</p>{own&&<Link href="/discovery/new" className={styles.primary}>Chia sẻ câu chuyện đầu tiên</Link>}</div>}{feed.next&&<Link className={styles.tab} href={`/profile/${id}?cursor=${encodeURIComponent(feed.next)}`}>Xem thêm bài Discovery <DiscoveryIcon name="arrow"/></Link>}</>}</div></section>;
}

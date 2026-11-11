import Link from "next/link";
import { PostCard } from "@/components/discovery-community/PostCard";
import { DiscoveryIcon } from "@/components/discovery-community/DiscoveryUI";
import styles from "@/components/discovery-community/Discovery.module.css";
import { requireUser } from "@/lib/auth";
import { communityReady, ownCommunityPage, savedCommunityPage } from "@/lib/discovery-community/read";
import { StorageMeter } from "@/components/discovery-community/StorageMeter";
import { TrashList } from "@/components/discovery-community/RetentionViews";
import { CommunityError } from "@/lib/discovery-community/model";
export const metadata = { title: "Bài Discovery của tôi", robots: { index: false, follow: false } };
export default async function MyPosts({ searchParams }: { searchParams: Promise<{ cursor?: string; deleted?: string;view?:string }> }) {
  const user=await requireUser("/account/discovery"),q=await searchParams,saved=q.view==="saved",trash=q.view==="trash";
  let feed:Awaited<ReturnType<typeof ownCommunityPage>>={posts:[],next:null},error="",ready=false;
  try { ready=await communityReady(); if(ready&&!trash)feed=saved?await savedCommunityPage(user,q.cursor):await ownCommunityPage(user,false,q.cursor); }
  catch(e){error=e instanceof CommunityError?e.message:"Chưa thể tải bài viết.";}
  return <div className={`${styles.scope} ${styles.stack}`}>
    <div className={styles.sectionHeader}><div><Link className={styles.eyebrow} href="/discovery">← Về Discovery</Link><h2 className={`${styles.sectionTitle} mt-3`}>{trash?"Thùng rác Discovery":saved?"Những câu chuyện đã lưu":"Bài Discovery của tôi"}</h2><p className={`${styles.small} mt-2`}>{saved?"Góc riêng để quay lại những chia sẻ bạn muốn đọc thêm.":trash?"Khôi phục bài về nháp trong thời hạn lưu giữ.":"Quản lý câu chuyện, bản nháp và những chia sẻ riêng tư của bạn."}</p></div>{ready&&<Link className={styles.primary} href="/discovery/new"><DiscoveryIcon name="edit"/>Tạo bài viết</Link>}</div>
    <nav aria-label="Bài Discovery cá nhân" className={styles.tabs}><Link href="/account/discovery" aria-current={!saved&&!trash?"page":undefined} className={styles.tab}>Bài của tôi</Link><Link href="/account/discovery?view=saved" aria-current={saved?"page":undefined} className={styles.tab}>Bài đã lưu</Link><Link href="/account/discovery?view=trash" aria-current={trash?"page":undefined} className={styles.tab}>Thùng rác</Link></nav>
    {ready&&!error&&<StorageMeter actor={user}/>}
    {q.deleted&&<p role="status" className={`${styles.panel} ${styles.panelBody} text-sm`}>Đã chuyển bài vào thùng rác, giữ ảnh trong thời hạn khôi phục.</p>}
    {!ready&&!error&&<p role="status" className={styles.error}>Discovery chưa khả dụng trên môi trường này.</p>}
    {error&&<p role="alert" className={styles.error}>{error} <Link className="text-link underline" href={saved?"/account/discovery?view=saved":"/account/discovery"}>Tải lại từ đầu</Link></p>}
    {ready&&!error&&trash?<TrashList actor={user} cursor={q.cursor}/>:<>
      {feed.posts.map(p=><PostCard key={p.id} post={p} viewer={user} manage={p.authorId===user.id}/>)}
      {ready&&!error&&!feed.posts.length&&<div className={styles.empty}><div className={styles.emptyIcon}><DiscoveryIcon name={saved?"feed":"edit"}/></div><h3>{saved?"Chưa có câu chuyện nào được lưu":"Câu chuyện của bạn bắt đầu ở đây"}</h3><p>{saved?"Lưu bài bạn thích trên Newsfeed để dễ dàng tìm lại. Bài chuyển riêng tư, nháp hoặc bị ẩn sẽ tạm không hiển thị ở đây.":"Viết một chia sẻ mới hoặc lưu nháp để hoàn thiện sau."}</p><Link className={styles.primary} href={saved?"/discovery":"/discovery/new"}>{saved?"Khám phá Newsfeed":"Tạo bài viết đầu tiên"}</Link></div>}
      {feed.next&&<Link className={styles.tab} href={`/account/discovery?${saved?"view=saved&":""}cursor=${encodeURIComponent(feed.next)}`}>Trang tiếp theo <DiscoveryIcon name="arrow"/></Link>}
    </>}
  </div>;
}

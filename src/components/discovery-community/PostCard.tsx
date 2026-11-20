import { FollowButton } from "@/components/discovery-community/FollowButton";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import type { Actor, Post } from "@/lib/discovery-community/model";
import { SocialBar } from "./Interactions";
import { DiscoveryIcon, PostStateBadge, PostStateNotice } from "./DiscoveryUI";
import styles from "./Discovery.module.css";
export function PostCard({post:p,manage=false,viewer=null,returnTo}:{post:Post;manage?:boolean;viewer?:Actor|null;returnTo?:string}){
  const href=`/discovery/posts/${p.id}`;
  return <article className={`${styles.card} ${styles.scope}`}>
    <header className={styles.author}><Link href={`/profile/${p.authorId}`} aria-label={`Hồ sơ ${p.authorName}`} className={styles.avatarLink}><Avatar name={p.authorName} url={p.avatar} size={42}/></Link><div className={styles.authorInfo}><Link href={`/profile/${p.authorId}`} className={styles.authorName}>{p.authorName}</Link><div className={styles.meta}><time dateTime={new Date(p.publishedAt??p.createdAt).toISOString()}>{new Date(p.publishedAt??p.createdAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"medium",timeStyle:"short"})}</time><span aria-hidden="true">·</span><PostStateBadge status={p.status} visibility={p.visibility}/></div></div><FollowButton key={viewer?.id??"guest"} targetId={p.authorId} name={p.authorName} viewerId={viewer?.id} following={p.following} followsViewer={p.followsViewer} returnTo={returnTo??href}/></header>
    <div className={styles.content}>{p.topic&&<Link href={`/discovery?topic=${encodeURIComponent(p.topic.slug)}`} className={styles.topic}># {p.topic.name}</Link>}{p.title&&<h2 className={styles.postTitle}><Link href={href}>{p.title}</Link></h2>}<p className={styles.body}>{p.body.length>500?p.body.slice(0,500)+"…":p.body}</p><Link href={href} className={styles.readMore}>Xem bài viết <DiscoveryIcon name="arrow"/></Link>{p.status&&p.status!=="published"&&<div className="mt-3"><PostStateNotice status={p.status} visibility={p.visibility}/></div>}</div>
    {p.media.length>0&&<Link href={href} aria-label={`Xem ${p.media.length} ảnh trong bài`} className={`${styles.gallery} ${p.media.length===1?styles.gallerySingle:styles.galleryMultiple} ${p.media.length===3?styles.galleryThree:""}`}>{p.media.slice(0,4).map((m,i)=>{const extra=i===3&&p.media.length>4?p.media.length-4:0;return <span key={m.id} className={styles.galleryTile}><img src={`/api/discovery/media/${m.id}?size=thumb`} alt={`Ảnh ${i+1} trong bài`} loading="lazy" width={m.width} height={m.height}/>{extra>0&&<span className={styles.galleryMore} aria-hidden="true">+{extra}</span>}</span>;})}</Link>}
    {p.tags.length>0&&<div className={styles.tags}>{p.tags.map(tag=><Link key={tag} href={`/discovery?q=${encodeURIComponent(tag)}`}>#{tag}</Link>)}</div>}
    {manage&&p.reviewNote&&<p className={styles.reviewNote}>Ghi chú kiểm duyệt: {p.reviewNote}</p>}
    <footer className={styles.cardFooter}><SocialBar postId={p.id} likes={p.likes} saves={p.saves} comments={p.comments} liked={p.liked} saved={p.saved} loggedIn={!!viewer} active={p.status==="published"&&p.visibility==="public"} returnTo={returnTo}/>{manage&&<Link href={`${href}/edit`} className={styles.readMore}><DiscoveryIcon name="edit"/>Chỉnh sửa bài của bạn</Link>}</footer>
  </article>;
}

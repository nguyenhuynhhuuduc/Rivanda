import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/kit";
import { FollowButton } from "@/components/discovery-community/FollowButton";
import { ProfileTabs } from "@/components/discovery-community/ProfileTabs";
import styles from "@/components/discovery-community/Profile.module.css";
import { getCurrentUser } from "@/lib/auth";
import { getPublicProfile } from "@/lib/users";
import { getProfileSettings } from "@/lib/profile";
import { followCounts,isFollowing } from "@/lib/community";
import { publicCommunityPostCount } from "@/lib/discovery-community/read";
import { UUID } from "@/lib/discovery-community/model";
export const dynamic="force-dynamic";
export default async function ProfileLayout({params,children}:{params:Promise<{id:string}>;children:React.ReactNode}){
  const{id}=await params;if(!UUID.test(id))notFound();const profile=await getPublicProfile(id);if(!profile)notFound();const me=await getCurrentUser(),own=me?.id===id;
  const[counts,following,followsViewer,media,postCount]=await Promise.all([followCounts(id),me&&!own?isFollowing(me.id,id):false,me&&!own?isFollowing(id,me.id):false,getProfileSettings(id),publicCommunityPostCount(id).catch(()=>null)]);
  return <div className={styles.shell}><section className={styles.hero} aria-label={`Hồ sơ ${profile.displayName}`}><div className={styles.cover}>{media?.coverUrl&&<img src={media.coverUrl} alt={`Ảnh bìa của ${profile.displayName}`} width={1800} height={600}/>}</div><div className={styles.identity}><div className={styles.identityTop}><div className={styles.avatar}><Avatar name={profile.displayName} url={profile.avatarUrl} size={128}/></div><div className={styles.actions}>{own?<><Link href="/account" className={`${styles.button} ${styles.primary}`}>Chỉnh sửa hồ sơ</Link><Link href="/account/discovery" className={styles.button}>Quản lý bài viết</Link></>:<FollowButton key={me?.id??"guest"} targetId={id} name={profile.displayName} viewerId={me?.id} following={following} followsViewer={followsViewer} returnTo={`/profile/${id}`}/>}</div></div><h1 className={`${styles.name} font-display`}>{profile.displayName}</h1><p className={styles.bio}>{profile.bio||"Thành viên chưa thêm giới thiệu."}</p><div className={styles.stats}><Link href={`/profile/${id}`}><strong>{postCount??"—"}</strong> bài viết công khai</Link><Link href={`/profile/${id}/followers`}><strong>{counts.followers}</strong> người theo dõi</Link><Link href={`/profile/${id}/following`}><strong>{counts.following}</strong> đang theo dõi</Link>{own&&<span>Hồ sơ của bạn</span>}</div></div><ProfileTabs id={id}/></section><div className={styles.content}>{children}</div></div>;
}

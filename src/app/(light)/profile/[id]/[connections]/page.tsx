import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/kit";
import { FollowButton } from "@/components/discovery-community/FollowButton";
import styles from "@/components/discovery-community/Profile.module.css";
import { getCurrentUser } from "@/lib/auth";
import { followPage } from "@/lib/community";
import { CommunityError, UUID } from "@/lib/discovery-community/model";
import { getPublicProfile } from "@/lib/users";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
export const dynamic="force-dynamic";
export const metadata={title:"Hồ sơ thành viên",robots:{index:false,follow:false}};
export default async function ConnectionsPage({params,searchParams}:{params:Promise<{id:string;connections:string}>;searchParams:Promise<{cursor?:string}>}) {
 const{id,connections}=await params;if(!UUID.test(id)||!["about","followers","following"].includes(connections))notFound();const profile=await getPublicProfile(id);if(!profile)notFound();
 if(connections==="about")return <section className={styles.section}><h2 className={styles.sectionTitle}>Giới thiệu</h2><p className={`${styles.bio} mt-5`}>{profile.bio||"Thành viên chưa thêm giới thiệu."}</p><dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className={styles.eyebrow}>Tên hiển thị</dt><dd className="mt-2 break-words">{profile.displayName}</dd></div><div><dt className={styles.eyebrow}>Tham gia</dt><dd className="mt-2">{formatDate(profile.createdAt)}</dd></div><div><dt className={styles.eyebrow}>Vai trò</dt><dd className="mt-2">{ROLE_LABEL[profile.role]}</dd></div></dl></section>;
 const viewer=await getCurrentUser(),{cursor}=await searchParams,path=`/profile/${id}/${connections}`;let page:Awaited<ReturnType<typeof followPage>>={members:[],next:null},error="";
 try{page=await followPage(id,connections as "followers"|"following",viewer?.id??null,cursor);}catch(e){error=e instanceof CommunityError?e.message:"Chưa tải được danh sách. Hãy thử lại.";}
 return <section className={styles.section}><h2 className={styles.sectionTitle}>{connections==="followers"?"Người theo dõi":"Đang theo dõi"}</h2><p className={`${styles.meta} mt-2`}>Những kết nối của {profile.displayName}.</p>{error?<p role="alert" className={styles.notice}>{error} <Link href={path} className="text-link">Tải lại từ đầu</Link></p>:<><ul className={styles.members}>{page.members.map(member=><li key={member.id} className={styles.member}><Link href={`/profile/${member.id}`} aria-label={`Hồ sơ ${member.name}`}><Avatar name={member.name} url={member.avatar} size={44}/></Link><Link href={`/profile/${member.id}`} className={styles.memberName}>{member.name}</Link><FollowButton key={viewer?.id??"guest"} targetId={member.id} name={member.name} viewerId={viewer?.id} following={member.following} followsViewer={member.followsViewer} returnTo={path}/></li>)}</ul>{!page.members.length&&<p className={styles.notice}>Chưa có thành viên trong danh sách này.</p>}<div className="mt-5 flex flex-wrap gap-3">{page.next&&<Link className={styles.button} href={`${path}?cursor=${encodeURIComponent(page.next)}`}>Xem thêm thành viên ↓</Link>}{cursor&&<Link className={styles.button} href={path}>Về đầu danh sách</Link>}</div></>}</section>;
}

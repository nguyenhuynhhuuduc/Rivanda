import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Container } from "@/components/ui/kit";
import { FollowButton } from "@/components/discovery-community/FollowButton";
import styles from "@/components/discovery-community/Discovery.module.css";
import { getCurrentUser } from "@/lib/auth";
import { followCounts, followPage } from "@/lib/community";
import { CommunityError, UUID } from "@/lib/discovery-community/model";
import { getPublicProfile } from "@/lib/users";
export const dynamic="force-dynamic";
export const metadata={title:"Kết nối thành viên",robots:{index:false,follow:false}};
export default async function ConnectionsPage({params,searchParams}:{params:Promise<{id:string;connections:string}>;searchParams:Promise<{cursor?:string}>}) {
  const {id,connections}=await params;
  if(!UUID.test(id)||(connections!=="followers"&&connections!=="following"))notFound();
  const profile=await getPublicProfile(id);if(!profile)notFound();
  const viewer=await getCurrentUser(),counts=await followCounts(id),{cursor}=await searchParams,path=`/profile/${id}/${connections}`;
  let page:Awaited<ReturnType<typeof followPage>>={members:[],next:null},error="";
  try{page=await followPage(id,connections,viewer?.id??null,cursor);}catch(e){error=e instanceof CommunityError?e.message:"Chưa tải được danh sách. Hãy thử lại.";}
  return <Container className={`${styles.scope} max-w-3xl py-10`}><Link href={`/profile/${id}`} className="text-link">← Hồ sơ {profile.displayName}</Link><h1 className="my-6 text-2xl font-bold">Kết nối của {profile.displayName}</h1><nav aria-label="Kết nối thành viên" className={styles.tabs}>{(["followers","following"] as const).map(d=><Link key={d} href={`/profile/${id}/${d}`} className={styles.tab} aria-current={connections===d?"page":undefined}>{d==="followers"?`${counts.followers} người theo dõi`:`${counts.following} đang theo dõi`}</Link>)}</nav>{error?<p role="alert" className="my-6">{error} <Link href={path} className="text-link">Tải lại từ đầu</Link></p>:<><ul className="my-6 space-y-3">{page.members.map(member=><li key={member.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-4"><Link href={`/profile/${member.id}`} aria-label={`Hồ sơ ${member.name}`}><Avatar name={member.name} url={member.avatar} size={44}/></Link><Link href={`/profile/${member.id}`} className="min-w-0 flex-1 break-words font-semibold">{member.name}</Link><FollowButton key={viewer?.id??"guest"} targetId={member.id} name={member.name} viewerId={viewer?.id} following={member.following} returnTo={path}/></li>)}</ul>{!page.members.length&&<p className="my-6 text-muted">Chưa có thành viên trong danh sách này.</p>}{page.next&&<Link href={`${path}?cursor=${encodeURIComponent(page.next)}`} className={styles.tab}>Xem thêm thành viên ↓</Link>}{cursor&&<Link href={path} className="my-4 block text-link">Về đầu danh sách</Link>}</>}</Container>;
}

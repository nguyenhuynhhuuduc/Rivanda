import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { Empty,SectionHeading } from "@/components/ui/kit";
import { ProfilePosts } from "@/components/discovery-community/ProfilePosts";
import styles from "@/components/discovery-community/Profile.module.css";
import { getCurrentUser } from "@/lib/auth";
import { getPublicProfile } from "@/lib/users";
import { listPhotos,PUBLIC } from "@/lib/discovery";
import { UUID } from "@/lib/discovery-community/model";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const{id}=await params,p=UUID.test(id)?await getPublicProfile(id):null;return{title:p?.displayName??"Thành viên"};}
export default async function ProfilePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{cursor?:string}>}){
 const{id}=await params;if(!UUID.test(id))notFound();const profile=await getPublicProfile(id);if(!profile)notFound();const me=await getCurrentUser(),{cursor}=await searchParams,{photos}=await listPhotos({statuses:PUBLIC,uploaderId:id,limit:48});
 return <><div className={styles.columns}><ProfilePosts id={id} own={me?.id===id} cursor={cursor}/><aside className={styles.intro} aria-label="Giới thiệu thành viên"><h2>Đôi nét về {profile.firstName}</h2><p className={styles.meta}>{profile.bio||"Thành viên chưa thêm giới thiệu."}</p><p className={`${styles.meta} mt-3`}>{ROLE_LABEL[profile.role]}<br/>Tham gia {formatDate(profile.createdAt)}</p><Link href={`/profile/${id}/about`} className={styles.introLink}>Xem giới thiệu →</Link></aside></div><section className="mt-10"><SectionHeading eyebrow="Khoảnh khắc" title="Ảnh đã chia sẻ"/>{photos.length?<PhotoGrid photos={photos}/>:<Empty>Thành viên này chưa đăng ảnh nào.</Empty>}</section></>;
}

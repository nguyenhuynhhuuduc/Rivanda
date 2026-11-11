"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Profile.module.css";
export function ProfileTabs({id}:{id:string}){
  const path=usePathname(),base=`/profile/${id}`;
  return <nav aria-label="Hồ sơ thành viên" className={styles.tabs}>{[[base,"Bài viết"],[base+"/about","Giới thiệu"],[base+"/followers","Người theo dõi"],[base+"/following","Đang theo dõi"]].map(([href,label])=><Link key={href} href={href} className={styles.tab} aria-current={path===href?"page":undefined}>{label}</Link>)}</nav>;
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { inputCls } from "@/components/ui/kit";
import type { Topic } from "@/lib/discovery-community/model";
import { DiscoveryIcon } from "./DiscoveryUI";
import styles from "./Discovery.module.css";
export function FeedFilters({topics,order,q,topic,author}:{topics:Topic[];order:string;q?:string;topic?:string;author?:string;loggedIn:boolean}) {
  const [open,setOpen]=useState(false);
  return <section className={`${styles.panel} ${styles.panelBody}`}>
    <button type="button" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="discovery-filters" className="flex min-h-10 w-full items-center justify-between gap-3 text-left text-sm font-semibold min-[1100px]:hidden"><span className="flex items-center gap-2"><DiscoveryIcon name="search"/>Tìm kiếm & chủ đề{q||topic?" · Đang lọc":""}</span><span aria-hidden="true">{open?"−":"＋"}</span></button>
    <h2 className={`${styles.panelHeading} hidden min-[1100px]:block`}>Khám phá cộng đồng</h2>
    <div id="discovery-filters" className={`${open?"mt-4 block":"hidden"} min-[1100px]:mt-4 min-[1100px]:block`}>
      <form action="/discovery" className="space-y-4"><input type="hidden" name="order" value={order}/>{author&&<input name="author" type="hidden" value={author}/>}<label className="block space-y-2 text-xs font-medium"><span>Nội dung hoặc hashtag</span><input name="q" maxLength={80} defaultValue={q} className={`${inputCls} min-w-0 rounded-xl`} placeholder="Tìm câu chuyện, hashtag…"/></label><label className="block space-y-2 text-xs font-medium"><span>Chủ đề</span><select name="topic" defaultValue={topic??""} className={`${inputCls} min-w-0 rounded-xl`}><option value="">Tất cả chủ đề</option>{topics.map(t=><option key={t.id} value={t.slug}>{t.name}</option>)}</select></label><button className={`${styles.primary} w-full`}><DiscoveryIcon name="search"/>Tìm kiếm</button>{(q||topic||author)&&<Link href="/discovery" className="block py-1 text-center text-xs text-link underline underline-offset-4">Xóa bộ lọc</Link>}</form>
    </div>
  </section>;
}

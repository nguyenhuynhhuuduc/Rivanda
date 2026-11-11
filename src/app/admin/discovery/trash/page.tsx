import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {communityReady} from "@/lib/discovery-community/read";
import {TrashList} from "@/components/discovery-community/RetentionViews";
export const dynamic="force-dynamic";
export default async function AdminTrash({searchParams}:{searchParams:Promise<{cursor?:string}>}){const user=await requireUser("/admin/discovery/trash");if(user.role!=="admin")notFound();const q=await searchParams;return <div className="space-y-5"><Link className="text-link" href="/admin/discovery">← Quản lý Discovery</Link><h1 className="font-display text-3xl font-bold">Thùng rác Discovery</h1>{await communityReady()?<TrashList actor={user} admin cursor={q.cursor}/>:<p>Discovery chưa khả dụng: cần planned 007 revision 3.</p>}</div>;}

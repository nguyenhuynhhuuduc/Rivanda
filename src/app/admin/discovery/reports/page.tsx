import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import { reportQueue } from "@/lib/discovery-community/discussion-read";
import { communityReady } from "@/lib/discovery-community/read";
import { btnOutline } from "@/components/ui/kit";
import { ReportReview } from "@/components/discovery-community/ReportReview";
export const dynamic="force-dynamic";
const LABEL:Record<string,string>={dismiss:"Đóng báo cáo — không vi phạm",hide_comment:"Ẩn bình luận",hide_post:"Ẩn bài viết",remove_post:"Gỡ bài viết"};
export default async function Reports({searchParams}:{searchParams:Promise<{history?:string;cursor?:string;handled?:string}>}){
  const user=await requireUser("/admin/discovery/reports");if(user.role!=="admin")notFound();const q=await searchParams,history=q.history==="1";
  let queue:Awaited<ReturnType<typeof reportQueue>>={reports:[],next:null},error="";
  try{if(await communityReady())queue=await reportQueue(user,history,q.cursor);else error="Discovery chưa khả dụng: cần SQL 007 revision 2.";}catch(e){error=e instanceof CommunityError?e.message:"Không tải được báo cáo.";}
  return <div className="space-y-5"><Link href="/admin/discovery" className="text-sm text-link">← Kiểm duyệt bài Discovery</Link><h1 className="font-display text-3xl font-bold">Báo cáo Discovery</h1>{q.handled==="1"&&<p role="status" className="rounded-xl border border-line p-4 text-sm">Đã ghi nhận quyết định xử lý báo cáo.</p>}<nav aria-label="Báo cáo cộng đồng" className="flex flex-wrap gap-3"><Link className={btnOutline} aria-current={!history?"page":undefined} href="/admin/discovery/reports">Chờ xử lý</Link><Link className={btnOutline} aria-current={history?"page":undefined} href="/admin/discovery/reports?history=1">Đã xử lý</Link></nav>{error&&<p role="alert">{error}</p>}{queue.reports.map(r=><section key={r.id} className="min-w-0 rounded-2xl border border-line bg-surface p-5"><p className="text-xs text-muted">{r.isComment?"Bình luận":"Bài viết"} · {r.reporter} · {new Date(r.createdAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</p><Link href={`/discovery/posts/${r.postId}#comments`} className="mt-3 block break-words font-semibold text-link">{r.title??"Xem bài viết"}</Link><p className="mt-3 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{r.preview}</p><p className="mt-3 break-words text-sm"><strong>Lý do báo cáo:</strong> {r.reason}</p>{r.status==="open"?<ReportReview id={r.id} revision={r.revision} isComment={r.isComment}/>:<p className="mt-4 break-words text-sm"><strong>Quyết định:</strong> {LABEL[r.decision??""]??"Đã xử lý"} · {r.note} · {r.handler??"Admin"}{r.handledAt?` · ${new Date(r.handledAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`:""}</p>}</section>)}{!error&&!queue.reports.length&&<p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Không có báo cáo ở trang này.</p>}{queue.next&&<Link href={`/admin/discovery/reports?${history?"history=1&":""}cursor=${encodeURIComponent(queue.next)}`} className={btnOutline}>Trang tiếp theo</Link>}</div>;
}

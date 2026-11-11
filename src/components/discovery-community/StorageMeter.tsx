import { storageUsage } from "@/lib/discovery-community/storage";
import type { Actor } from "@/lib/discovery-community/model";
export async function StorageMeter({actor}:{actor:Actor}){
  const usage=await storageUsage(actor),format=(n:number)=>n.toLocaleString("vi-VN",{maximumFractionDigits:2});
  const size=usage.used<1024?`${usage.used} B`:usage.used<1048576?`${format(usage.used/1024)} KiB`:`${format(usage.used/1048576)} MiB`;
  return <div className="my-5 rounded-xl border border-line bg-card/40 p-4"><p className="mb-2 text-sm">Ảnh Discovery: {size} / 100 MiB đã dùng hoặc giữ chỗ</p><progress aria-label="Dung lượng ảnh Discovery" max={usage.limit} value={usage.used} className="h-2 w-full accent-gold"/><p className="mt-2 text-xs leading-6 text-muted">Quota gồm ảnh chính và thumbnail. Ảnh đã gỡ/xóa mềm được giữ 30 ngày; dung lượng chỉ hoàn sau khi dọn tệp thành công.</p></div>;
}

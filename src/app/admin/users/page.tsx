import { adminBtn, adminBtnGhost, Card, PageTitle } from "@/components/admin/ui";
import { getCurrentUser, requirePermission } from "@/lib/auth";
import { listUsers } from "@/lib/admin-stats";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL, ROLES } from "@/lib/permissions";
import { setUserActiveAction, setUserRoleAction } from "../user-actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requirePermission("users.manage");
  const [me, users] = await Promise.all([getCurrentUser(), listUsers()]);
  return (
    <div>
      <PageTitle title="Người dùng" hint={`${users.length} tài khoản. Cộng tác viên được gửi ảnh để chờ duyệt; kiểm duyệt viên được duyệt ảnh, xử lý báo cáo và bình luận nhưng không đổi được cấu hình.`} />
      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr><th className="px-4 py-3 font-medium">Tên</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Vai trò</th><th className="px-4 py-3 font-medium">Đăng ký</th><th className="px-4 py-3 font-medium">Đăng nhập gần nhất</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{u.name}{!u.isActive && <span className="ml-2 rounded bg-danger/10 px-2 py-0.5 text-xs text-danger">Đã khóa</span>}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  {u.id === me?.id ? ROLE_LABEL[u.role] : (
                    <form action={setUserRoleAction.bind(null, u.id)} className="flex gap-2">
                      <select name="role" defaultValue={u.role} aria-label="Vai trò" className="rounded-lg border border-line px-2 py-1.5 text-sm">
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button className={adminBtn}>Lưu</button>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">{formatDate(u.lastLoginAt) || "Chưa"}</td>
                <td className="px-4 py-3 text-right">
                  {u.id === me?.id ? <span className="text-muted/70">Bạn</span> : (
                    <form action={setUserActiveAction.bind(null, u.id, !u.isActive)}><button className={adminBtnGhost}>{u.isActive ? "Khóa" : "Mở khóa"}</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

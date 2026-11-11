"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { setUserActive } from "@/lib/admin-stats";
import { requirePermission } from "@/lib/auth";
import { ROLES, type Role } from "@/lib/permissions";
import { setUserRole } from "@/lib/users";

export async function setUserActiveAction(id: string, active: boolean): Promise<void> {
  const me = await requirePermission("users.manage");
  if (me.id === id) return; // không tự khóa chính mình
  await setUserActive(id, active);
  await logActivity({ userId: me.id, action: active ? "user.unlock" : "user.lock", targetType: "user", targetId: id });
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(id: string, fd: FormData): Promise<void> {
  const me = await requirePermission("users.manage");
  const role = String(fd.get("role") ?? "") as Role;
  if (me.id === id || !ROLES.includes(role)) return; // không tự đổi quyền của mình (tránh mất quyền admin)
  await setUserRole(id, role);
  await logActivity({ userId: me.id, action: "user.role", targetType: "user", targetId: id, detail: role });
  revalidatePath("/admin/users");
}

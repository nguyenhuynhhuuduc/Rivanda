import { btnPrimary, inputCls } from "@/components/ui/kit";
import { AvatarPicker } from "@/components/account/AvatarPicker";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { getAvatarAndBio } from "@/lib/users";
import { updateProfileAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser("/account");
  const [sp, extra] = await Promise.all([searchParams, getAvatarAndBio(user.id)]);
  return (
    <div className="max-w-xl">
      <h2 className="font-display text-2xl font-bold">Hồ sơ</h2>
      <p className="mt-1 text-sm text-muted">{user.email} · {ROLE_LABEL[user.role]}</p>
      {sp.ok && <p role="status" className="mt-4 rounded-md bg-card px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.error && <p role="alert" className="mt-4 rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">{sp.error}</p>}

      <form action={updateProfileAction} className="mt-6 space-y-5">
        <AvatarPicker key={extra.avatarUrl ?? "default-avatar"} name={user.displayName} currentUrl={extra.avatarUrl} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="lastName" className="mb-1.5 block text-sm font-medium">Họ</label><input id="lastName" name="lastName" defaultValue={user.lastName} maxLength={60} className={inputCls} /></div>
          <div><label htmlFor="firstName" className="mb-1.5 block text-sm font-medium">Tên</label><input id="firstName" name="firstName" defaultValue={user.firstName} required maxLength={60} className={inputCls} /></div>
        </div>
        <div><label htmlFor="bio" className="mb-1.5 block text-sm font-medium">Giới thiệu ngắn</label><textarea id="bio" name="bio" defaultValue={extra.bio ?? ""} rows={3} maxLength={500} className={inputCls} /></div>
        <button className={btnPrimary}>Lưu hồ sơ</button>
      </form>
    </div>
  );
}

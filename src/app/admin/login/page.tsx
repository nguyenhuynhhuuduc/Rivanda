import { redirect } from "next/navigation";

// Trang đăng nhập admin cũ: giờ dùng chung trang đăng nhập của website.
export default function AdminLoginPage() {
  redirect("/login?next=/admin");
}

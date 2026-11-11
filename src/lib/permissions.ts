// Phân quyền theo vai trò. Luôn kiểm tra ở phía server, không chỉ ẩn nút trên giao diện.
export type Role = "member" | "contributor" | "moderator" | "admin";

export const ROLES: Role[] = ["member", "contributor", "moderator", "admin"];

export const ROLE_LABEL: Record<Role, string> = {
  member: "Thành viên",
  contributor: "Cộng tác viên",
  moderator: "Kiểm duyệt viên",
  admin: "Quản trị viên",
};

export type Permission =
  | "content.submit" // gửi ảnh để chờ duyệt
  | "admin.access" // vào khu quản trị
  | "moderation.review" // duyệt / từ chối nội dung
  | "comment.moderate" // ẩn / xóa bình luận
  | "report.handle" // xử lý báo cáo vi phạm
  | "content.manage" // quản lý nội dung, tài liệu, bài viết
  | "users.manage" // đổi vai trò, khóa tài khoản
  | "settings.manage" // cấu hình trang chủ và hệ thống
  | "logs.view"; // xem nhật ký hoạt động

const ALL: Permission[] = [
  "content.submit", "admin.access", "moderation.review", "comment.moderate",
  "report.handle", "content.manage", "users.manage", "settings.manage", "logs.view",
];

// Kiểm duyệt viên chỉ được kiểm duyệt, không mặc nhiên có quyền cấu hình hệ thống.
const MAP: Record<Role, Permission[]> = {
  member: [],
  contributor: ["content.submit"],
  moderator: ["content.submit", "admin.access", "moderation.review", "comment.moderate", "report.handle"],
  admin: ALL,
};

export function can(role: Role | null | undefined, p: Permission): boolean {
  return !!role && MAP[role].includes(p);
}

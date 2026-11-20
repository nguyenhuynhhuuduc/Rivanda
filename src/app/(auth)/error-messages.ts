// Mã lỗi từ đường dẫn (?error=...) sang câu hiển thị cho người dùng.
const MESSAGES: Record<string, string> = {
  provider_unavailable: "Cách đăng nhập này chưa được bật. Hãy dùng email và mật khẩu.",
  oauth_cancelled: "Bạn đã hủy đăng nhập. Hãy thử lại nếu muốn tiếp tục.",
  oauth_expired: "Phiên xác thực đã hết hạn hoặc không hợp lệ. Vui lòng thử đăng nhập lại.",
  oauth_failed: "Không thể hoàn tất xác thực. Hãy thử lại sau ít phút.",
  email_exists:
    "Email này đã có tài khoản. Hãy đăng nhập tài khoản cũ bằng phương thức ban đầu, sau đó vào Tài khoản → Bảo mật để chủ động liên kết Google/Facebook. Chúng tôi không tự gộp theo email.",
  identity_in_use: "Google/Facebook này đã liên kết với hồ sơ khác. Không thể chuyển liên kết sang tài khoản hiện tại.",
  provider_linked: "Hồ sơ đã liên kết một tài khoản của nhà cung cấp này. Liên kết hiện tại được giữ nguyên.",
  link_session_changed: "Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại và bắt đầu liên kết từ Tài khoản → Bảo mật.",
  unverified_email: "Google chưa xác minh email này. Hãy xác minh email hoặc dùng phương thức khác.",
  no_email: "Tài khoản này không chia sẻ email nên không thể tạo tài khoản. Hãy dùng cách khác.",
  disabled: "Tài khoản này đang bị khóa.",
};

export function errorMessage(code: string | undefined): string | undefined {
  return code ? MESSAGES[code] : undefined;
}

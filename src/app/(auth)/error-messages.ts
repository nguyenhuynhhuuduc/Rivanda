// Mã lỗi từ đường dẫn (?error=...) sang câu hiển thị cho người dùng.
const MESSAGES: Record<string, string> = {
  provider_unavailable: "Cách đăng nhập này chưa được bật. Hãy dùng email và mật khẩu.",
  oauth_cancelled: "Bạn đã hủy đăng nhập. Hãy thử lại nếu muốn tiếp tục.",
  oauth_failed: "Không đăng nhập được. Hãy thử lại sau ít phút.",
  email_exists:
    "Email này đã có tài khoản. Để bảo vệ tài khoản, chúng tôi không tự liên kết. Hãy dùng cách đăng nhập ban đầu hoặc đặt lại mật khẩu bằng email.",
  unverified_email: "Google chưa xác minh email này. Hãy xác minh email hoặc dùng phương thức khác.",
  no_email: "Tài khoản này không chia sẻ email nên không thể tạo tài khoản. Hãy dùng cách khác.",
  disabled: "Tài khoản này đang bị khóa.",
};

export function errorMessage(code: string | undefined): string | undefined {
  return code ? MESSAGES[code] : undefined;
}

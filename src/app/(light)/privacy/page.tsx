import { LegalPage } from "@/components/site/LegalPage";

export const metadata = { title: "Quyền riêng tư" };

// Bản mẫu: chủ website nên đọc lại, chỉnh cho đúng thực tế và (nếu cần) hỏi ý kiến người am hiểu pháp lý.
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Chính sách quyền riêng tư"
      updated="11/2026"
      sections={[
        { heading: "Thông tin chúng tôi thu thập", body: [
          "Khi đăng ký, website lưu họ tên, email và mật khẩu (mật khẩu được mã hóa một chiều, chúng tôi không đọc được).",
          "Nếu bạn đăng nhập bằng Google hoặc Facebook, website nhận tên và email từ tài khoản đó và không đăng gì lên tài khoản mạng xã hội của bạn.",
          "Website cũng lưu những gì bạn tạo ra khi sử dụng: ảnh bạn lưu, lượt thích, bình luận, bộ sưu tập, danh sách theo dõi, ảnh bạn gửi lên (nếu là cộng tác viên). Email để lại ở trang Shop được dùng để báo khi cửa hàng mở.",
        ] },
        { heading: "Cách sử dụng thông tin", body: [
          "Thông tin chỉ dùng để cho bạn đăng nhập, lưu ảnh, bình luận, nhận thông báo và để vận hành, bảo vệ website khỏi lạm dụng. Chúng tôi không bán hay chia sẻ thông tin cá nhân của bạn cho bên thứ ba.",
          "Các thao tác quản trị quan trọng được ghi vào nhật ký hoạt động để bảo đảm an toàn.",
        ] },
        { heading: "Cookie", body: ["Website dùng một cookie để giữ trạng thái đăng nhập. Cookie này không dùng để theo dõi quảng cáo."] },
        { heading: "Quyền của bạn", body: [
          "Bạn có thể xem và sửa hồ sơ trong trang Tài khoản, xóa bình luận, ảnh và bộ sưu tập của mình. Muốn xóa hẳn tài khoản hoặc rút email khỏi danh sách chờ Shop, hãy liên hệ chủ website qua trang Liên hệ.",
        ] },
        { heading: "Thay đổi chính sách", body: ["Chính sách này có thể được cập nhật. Ngày cập nhật gần nhất luôn ghi ở đầu trang."] },
      ]}
    />
  );
}

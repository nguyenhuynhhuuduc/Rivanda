import { LegalPage } from "@/components/site/LegalPage";

export const metadata = { title: "Điều khoản sử dụng" };

// Bản mẫu: chủ website nên đọc lại và chỉnh cho đúng thực tế.
export default function TermsPage() {
  return (
    <LegalPage
      title="Điều khoản sử dụng"
      updated="11/2026"
      sections={[
        { heading: "Sử dụng website", body: ["Khi tạo tài khoản và sử dụng website, bạn đồng ý với các điều khoản này. Bạn chịu trách nhiệm giữ bí mật mật khẩu của mình."] },
        { heading: "Bình luận và nội dung bạn gửi", body: [
          "Bạn chịu trách nhiệm về bình luận và nội dung (ảnh, mô tả) bạn gửi. Không đăng nội dung xúc phạm, quấy rối, spam, vi phạm pháp luật hoặc quyền của người khác; chỉ gửi ảnh do chính bạn chụp hoặc bạn có quyền sử dụng.",
          "Nội dung gửi lên sẽ được kiểm duyệt trước khi hiển thị. Chủ website và người kiểm duyệt có quyền từ chối, ẩn hoặc xóa nội dung, và khóa tài khoản vi phạm.",
        ] },
        { heading: "Bản quyền", body: ["Ảnh, bài viết và tài liệu thuộc về chủ website, trừ khi có ghi chú khác. Bạn được xem và lưu cho mục đích cá nhân. Muốn đăng lại hoặc dùng cho mục đích thương mại, hãy xin phép trước."] },
        { heading: "Nội dung về bảo mật (Cyber Lab)", body: ["Các bài trong Cyber Lab chỉ nhằm học tập và bảo mật hợp pháp. Bạn chỉ được thực hành trên hệ thống của chính mình hoặc hệ thống đã được cho phép rõ ràng bằng văn bản. Chủ website không chịu trách nhiệm về việc sử dụng sai mục đích."] },
        { heading: "Miễn trừ và thay đổi", body: ["Nội dung được cung cấp trên tinh thần chia sẻ, không bảo đảm tuyệt đối về độ chính xác. Điều khoản có thể thay đổi; việc tiếp tục sử dụng website nghĩa là bạn chấp nhận bản mới."] },
      ]}
    />
  );
}

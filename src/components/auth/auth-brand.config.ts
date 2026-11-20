import authEditorial from "../../../picture-title/auth-editorial.jpg";

/**
 * Cấu hình nhận diện thương hiệu dùng chung cho khu vực bên trái của trang Đăng nhập & Đăng ký.
 * Để thay ảnh nền:
 *  - Cách 1 (khuyến nghị): thay file `picture-title/auth-editorial.jpg` hoặc import ảnh mới trong dự án.
 *  - Cách 2: đặt ảnh trong thư mục `public/` và cập nhật `imageSrc: "/ten-anh.jpg"`.
 */
export const AUTH_BRAND_CONFIG = {
  imageSrc: authEditorial.src,
  imageAlt: "Khung vòm đá mở ra cảnh quan núi non phủ sương và con đường hành trình",
  objectPosition: "50% 42%",
  kicker: "Rivanda",
  sloganLine1: "Mỗi hành trình,",
  sloganLine2: "một câu chuyện.",
  description: "Khám phá thế giới qua góc nhìn của riêng bạn.",
} as const;

# Website cá nhân

Next.js 16 + TypeScript + MySQL + Tailwind CSS 4. Giao diện theo Design System: Navy `#172D46`, kem `#F4F1EA`, vàng `#B58B57`; Playfair Display, DM Serif Display, Inter, JetBrains Mono.

## Railway staging

Đọc [checklist staging](STAGING_DEPLOY_CHECKLIST.md) trước khi deploy. Source đã có Dockerfile, cổng Basic auth staging, healthcheck và preflight read-only. Chưa deploy; không dùng startup/pre-deploy để chạy migration. `npm start` mới yêu cầu runtime env đầy đủ, storage và minimum schema đã có sẵn; `npm run dev` giữ cách chạy development.

## Cài đặt

1. `npm install`
2. Sao chép `.env.example` thành `.env.local`, điền thông tin MySQL, đặt `SESSION_SECRET` (từ 32 ký tự).
3. Đối chiếu schema/backup với người quản trị. Chỉ khởi tạo/migrate DB hoặc tạo admin khi được phê duyệt riêng; không dùng các script này làm bước kiểm tra mặc định. Runner migration hiện bị khóa mặc định để tránh chạy nhầm.
4. Chuẩn bị tài khoản phát triển/kiểm thử được cấp phép; không dùng tài khoản/dữ liệu production để thử.
5. `npm run dev`, mở http://localhost:3000

## Các khu vực

**Công khai (nền sáng):** `/` Home (các khu vực bật/tắt và đổi thứ tự được), `/discovery` (Explore, Trending, Hành trình, Album, Địa điểm, Thẻ, chi tiết ảnh), `/documents` (Blog, Tài nguyên, Dự án), `/shop` (Sắp ra mắt), `/about`, `/contact`, `/search`, `/privacy`, `/terms`.
**Cyber Lab (nền tối):** `/cyber-lab`, `/cyber-lab/tutorials|tools|labs|research`, `/cyber-lab/articles/[slug]` (có mục lục).
**Thành viên:** `/login`, `/register`, `/forgot-password`, `/account` (hồ sơ, đã lưu, bộ sưu tập, bình luận, thông báo, bảo mật, nội dung của tôi), `/profile/[id]` (theo dõi).
**Quản trị:** `/admin` (menu hiện theo vai trò).

Đường dẫn cũ (`/hacking`, `/document`, `/shopping`, `/discovery/[id]`) tự chuyển sang đường dẫn mới.

## Vai trò

| Vai trò | Quyền |
|---|---|
| Thành viên | Xem, thích, lưu, bình luận, bộ sưu tập, theo dõi, báo cáo |
| Cộng tác viên | Thêm: gửi ảnh, ảnh luôn ở trạng thái chờ duyệt |
| Kiểm duyệt viên | Thêm: duyệt/từ chối ảnh, xử lý báo cáo, ẩn/xóa bình luận |
| Quản trị viên | Toàn quyền: nội dung, tài liệu, người dùng, cấu hình, nhật ký hoạt động |

Đổi vai trò ở `/admin/users`.

## Thư mục lưu file

Ảnh (kèm bản thu nhỏ WebP nếu cài được `sharp`) nằm trong `uploads/`; tài liệu nằm trong `uploads/documents/`
(không truy cập trực tiếp, chỉ tải qua trang web và có kiểm tra quyền). Hãy sao lưu định kỳ.

## Quên mật khẩu

Điền `SMTP_*` để gửi email qua nhà cung cấp được phép. Chưa cấu hình SMTP thì không tạo/gửi reset link và không log nội dung email. Staging cần mailbox kiểm thử và plan Railway hỗ trợ SMTP; xem checklist.

## Đăng nhập Google / Facebook (không bắt buộc)

Điền `GOOGLE_*` hoặc `FACEBOOK_*`. Địa chỉ chuyển hướng khai báo ở nhà cung cấp:
`http://localhost:3000/api/auth/google/callback` và `http://localhost:3000/api/auth/facebook/callback` (đổi theo tên miền khi đưa lên mạng, và đổi `APP_URL`).

## Chưa làm

Thanh toán và đơn hàng của Shop (để sau theo yêu cầu), bản đồ địa điểm, phiên bản và đánh giá tài liệu, cho thành viên gửi tài liệu, bình luận cho bài viết. Hai trang `/privacy` và `/terms` là bản mẫu, hãy đọc lại trước khi đưa lên mạng.

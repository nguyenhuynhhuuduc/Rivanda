# Discovery Profile — QA và migration 010 nháp

Ngày kiểm chứng: 11/11/2026. Source nền `6bad88f`. Không áp dụng 010 lên DB chính.

## Phần đã nối vào hệ thống hiện có

- `/profile/[id]` dùng layout chung: ảnh bìa, avatar, tên/bio công khai, số bài **public/published**, follower/following và bốn tab. Giữ URL followers/following; thêm `/profile/[id]/about`.
- Bài viết dùng `communityFeed`/`PostCard`; cursor phân trang tiếp tục ở Profile. Danh sách kết nối dùng `followPage`, FollowButton/action hiện có. Ảnh JourneyStory đã đăng vẫn giữ ở dưới danh sách bài.
- Chủ tài khoản có link tới Account chỉnh hồ sơ và `/account/discovery` quản lý bài, nháp/riêng tư/thùng rác hiện có. Profile công khai không hiện bài private/draft/ẩn/xóa, kể cả khi người xem là chủ bài hoặc Admin.
- Account tái sử dụng AvatarPicker và action hiện có. Thêm xem trước/hủy/gỡ ảnh bìa; trạng thái lưu; tên/bio/avatar/cover được ghi trong transaction, khóa user và kiểm phiên bản nội dung trước khi chuẩn bị ảnh. Guest không được ghi; ID/role/email từ client không có quyền chọn tài khoản đích.
- Chỉ public fields được đưa ra Profile. Email/hash mật khẩu, lịch sử đăng nhập và trường bảo mật không được đưa vào dữ liệu Profile mới.

## Schema và lưu trữ

- `planned/010_discovery_profile.sql` chỉ thêm `users.profile_cover_file` nullable + CHECK tên WebP, và marker `profile_schema_state=10/1`. Không sửa auth/session, không phụ thuộc/chạy 006 hoặc 008, không đổi marker 007/009.
- Không có 010/marker chưa hoàn tất: Profile dùng nền mặc định; ảnh bìa trong Account bị disabled và có thông báo rõ. Avatar/tên/bio vẫn sửa được bằng schema cũ.
- Avatar tối đa 3 MiB; cover 5 MiB. Kiểm magic bytes, decode thật bằng Sharp (25 megapixel), xoay/crop/re-encode WebP, ghi tên UUID mới với `wx`; không ghi đè file cũ. Không nhận URL avatar/cover do client cung cấp.
- Avatar dùng storage/quyền `/uploads` hiện có. Cover nằm riêng `UPLOAD_DIR/profile-covers`; `/api/profile/[id]/cover` chỉ đọc tên file hiện được user active tham chiếu, kiểm UUID/filename, no-store/nosniff. Raw `/uploads/<cover-file>` không được phục vụ.
- Ảnh cũ và file mới nếu transaction lỗi được giữ; không chạy cleanup/xóa file. Chưa có quota tổng hoặc tác vụ retention riêng cho ảnh hồ sơ; cần duyệt riêng nếu muốn bổ sung. Quota ảnh bài Discovery không bị thay đổi.
- DDL auto-commit: trước khi áp dụng thật cần phê duyệt riêng, kiểm tra schema/data, backup mã hóa + restore clone, writer đã dừng. Nếu dở dang thì dừng kiểm kê, không tự rerun/ghi marker hoặc DROP/ALTER ngược.

## Kết quả kiểm thử

- TypeScript PASS; Webpack production build PASS trên bản sao không `.env`/DB thật, DB giả port 9. Không đổi cấu hình build, dependency hoặc Turbopack.
- **92/92** fixture/hồi quy: quyền action theo session, chủ/Guest/Member/Admin khác chủ, XSS/public fields, cursor/link, ảnh bìa thiếu/invalid/path traversal, Account không có 010, decode/upload thật; các luồng Discovery/notifications/navigation cũ.
- **7/7** MySQL Profile QA: 010 giữ các trường user cũ, marker/CHECK, sửa/gỡ media, hai cập nhật đồng thời chỉ một thắng trước file I/O, tài khoản khóa, rollback khi ghi cover lỗi, count/feed công khai và marker thiếu.
- **21/21** MySQL QA hồi quy: 12 notifications và 9 Follow/feed/like/comment được chọn riêng. Không chạy test/worker cleanup.
- MySQL QA loopback 3321, guard datadir và schema mới `discovery010_test_*`, chỉ tài khoản/nội dung tổng hợp `.invalid`. Test không nạp `.env` thật hoặc kết nối DB chính.
- Browser Webpack + MySQL QA, auth thật: Guest chỉ thấy công khai; 13 bài phân trang 12+1, 23 followers phân trang 20+3; tab Giới thiệu/Đang theo dõi/rỗng; Login về Profile; chủ xem trước–hủy–lưu avatar/cover/tên/bio; khu quản lý có nháp/riêng tư; Admin khác chủ không có nút sửa và Follow/Unfollow 23→24→23.
- HTTP QA sau lưu: cover 200, avatar 200; raw cover 404. Ảnh mới hiện đúng trên Profile, không lộ email. Lấy mẫu Account/Profile ở width 1440/768/390/375, dark/light; không tràn ngang trang (nav tab cuộn riêng có chủ đích). Chưa chứng nhận mọi thiết bị/tất cả trạng thái lỗi mạng bằng browser.

Chạy lại với instance QA đã xác minh, không đổi guard để trỏ DB chính:

```powershell
$env:DISCOVERY_QA_ROOT = '<QA root có mysql-data và base-schema.json>'
node --test tests/discovery-profile-qa.test.cjs
node --test tests/discovery-profile.test.cjs
```

Không chạy migration, ghi dữ liệu thật, cleanup, deploy hoặc tự mở phần phát triển tiếp theo trong đợt này. Các action Account bảo mật/bộ sưu tập/JourneyStory ngoài phần cập nhật hồ sơ giữ nguyên byte so với source nền.

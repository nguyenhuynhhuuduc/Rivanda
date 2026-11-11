# Discovery notifications MVP — migration 009 nháp

Ngày kiểm chứng: 11/11/2026. Source nền: `f09fe8eb`. **Chưa áp dụng DB chính.**

## Phạm vi và dữ liệu

- Tái sử dụng bảng `notifications`, trang `/account/notifications`, auth, Follow và các transaction tương tác hiện có.
- `planned/009_discovery_notifications.sql` bổ sung actor/post/comment, khóa chống trùng, index, FK/CHECK và marker riêng `discovery_notification_schema_state = 9/1`. Không đổi marker/history 007, không phụ thuộc Blog/006.
- Các bản ghi cũ giữ nguyên, cột mới NULL. Không backfill thông báo từ tương tác lịch sử.
- Migration có DDL auto-commit. Thiếu marker hoặc thiếu cột/UNIQUE thì chức năng thông báo Discovery mới chưa bật; không tự sửa/rerun DDL. Thông báo cũ và tương tác vẫn hoạt động; Follow giữ fallback thông báo cũ khi 009 chưa sẵn sàng.
- MySQL local chính chỉ được kiểm tra metadata read-only: đủ các cột cũ, chưa có bốn cột mới hoặc marker 009.

## Hành vi MVP

- Follow → người được theo dõi; like/bình luận → tác giả bài; trả lời → tác giả bình luận gốc và tác giả bài nếu là hai người khác nhau. Không thông báo cho chính người tương tác; save không gửi thông báo.
- Thông báo mới ghi trong cùng transaction với Follow/like/comment. Lỗi ghi thông báo rollback tương tác; không gửi thông báo rời rạc sau COMMIT. Nonce comment và UNIQUE chống lặp khi retry.
- Follow/like chỉ tạo một thông báo cho mỗi người gửi/người nhận/đối tượng. Bỏ follow/like ẩn thông báo tương ứng; theo dõi/thích lại không tạo thêm bản trùng hoặc đặt lại trạng thái đã đọc. Comment/reply chống trùng theo ID bình luận.
- Giới hạn 20 thông báo/cặp người gửi–người nhận và 60/tổng người gửi trong 15 phút. Vượt giới hạn chỉ bỏ thông báo mới, tương tác vẫn được lưu; áp dụng cả Admin.
- Không lưu nội dung hoặc tiêu đề bài/bình luận trong thông báo mới. Tên tác giả và URL được dựng từ dữ liệu hiện tại; không dùng URL do client cung cấp.
- List, count và đánh dấu đọc dùng cùng điều kiện server: đúng người nhận; tài khoản còn hoạt động; bài public/published, không moderation hold, xóa hoặc purge; bình luận và nhánh còn hiển thị. Admin không được bỏ qua các điều kiện này. Thông báo không còn hợp lệ được giữ nhưng không xuất hiện/không được đếm hay đánh dấu đọc.
- Phân trang keyset 20 mục, cursor ký và gắn với người nhận. Chỉ mở trang không ghi dữ liệu; đánh dấu từng mục/tất cả qua Server Action có kiểm session/ownership.
- Chuông dùng API chỉ đọc, private/no-store. Poll 90 giây khi tab đang hiển thị, focus tối thiểu cách 30 giây, timeout 10 giây; hủy request/timer khi rời component/đổi tài khoản. Có nút Làm mới, chưa có WebSocket, push hoặc email.

## Kiểm thử đã đạt

- TypeScript PASS; production **Webpack** build PASS trên bản sao không `.env`/DB thật. Không chỉnh cấu hình Turbopack.
- **83/83** fixture/hồi quy: auth/action, input, ownership theo session, XSS, read-only GET, API count, cursor, polling/abort, header/navigation và các luồng Discovery hiện có.
- **12/12** MySQL QA thông báo: migration giữ legacy sentinel, FK/UNIQUE/CHECK, bốn loại sự kiện, đồng thời, không tự thông báo, visibility, tài khoản khóa, quyền đánh dấu đọc, phân trang timestamp trùng, quota cặp/toàn cục, rollback khi lỗi và marker thiếu.
- **9/9** MySQL QA hồi quy Follow/feed/like/comment được chọn riêng; không chạy test/worker cleanup.
- QA dùng MySQL loopback 3321, guard datadir và schema mới `discovery009_test_*`; chỉ tài khoản/nội dung tổng hợp `.invalid`. Test không nạp `.env` hoặc kết nối DB chính.
- Browser production build + MySQL QA, auth thật: Admin tạo Follow/like qua UI; Member nhận đúng bốn loại, không thấy thông báo bài private; đánh dấu một mục 4→3, tất cả 3→0 và badge khớp; mở đúng Profile/nhánh bình luận; Làm mới. Dark/light và width 1440/768/390/375 được lấy mẫu, không tràn ngang trang; chưa chứng nhận mọi thiết bị/dữ liệu.

Chạy lại trong instance QA đã xác minh, không đổi guard để trỏ DB chính:

```powershell
$env:DISCOVERY_QA_ROOT = '<QA root có mysql-data và base-schema.json>'
node --test tests/discovery-notifications-qa.test.cjs
node --test tests/discovery-notifications.test.cjs
```

## Trước khi xin phép áp dụng thật

1. Chuẩn bị một đợt preflight/apply riêng: xác nhận đúng DB, 004/007 revision 3, MySQL phù hợp; 009 chưa có hoặc phải dừng nếu dở dang. Kiểm tra tên cột/index/constraint và loại thông báo cũ không xung đột CHECK.
2. Sao lưu mã hóa, kiểm chứng restore trên clone; ghi checksum SQL và mốc dữ liệu. Dừng app/writer có liên quan trong thời gian ALTER/kiểm chứng; không tự KILL kết nối.
3. Chỉ sau phê duyệt riêng mới áp dụng 009 đúng một lần. Không chạy `init-db`, 006, cài lại 007, cleanup hoặc deploy.
4. Postflight kiểm tra marker 9/1, marker 7/3 không đổi, FK/UNIQUE/CHECK/index, số lượng/hash dữ liệu cũ và smoke test bằng nội dung/tài khoản được phép dùng.
5. Nếu DDL lỗi hoặc COMMIT không rõ: dừng writer, kiểm kê read-only; không rerun, DROP/ALTER ngược hay ghi marker thủ công. Chọn recovery/restore dựa trên backup và dữ liệu phát sinh, xin duyệt riêng trước khi thay đổi DB. Không coi `ROLLBACK` là hoàn tác DDL.

Giới hạn còn lại: chưa preflight/backup/restore/apply 009 trên DB chính; không thử ghi bằng tài khoản thật. Dedupe Follow/like là một lần/đối tượng; không có cơ chế gom nhóm, tùy chọn thông báo hoặc retention/cleanup mới trong MVP này.

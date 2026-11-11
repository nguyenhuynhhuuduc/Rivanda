# Migration 005 — IP ảo theo tài khoản (chưa chạy)

Ngày chuẩn bị: 09/11/2026. MySQL 8.0.16+, InnoDB. Runner riêng:
`scripts/migrate-cyber-ips.mjs`; không đưa vào startup/pre-deploy hoặc runner SQL 001–004.

## Trước khi được phép chạy

1. Sao lưu DB và kiểm chứng restore trên instance cách ly. Ghi lại schema, số user,
   mapping IP/counter và `schema_migrations` hiện có. Không lấy/ghi bí mật vào tài liệu/log.
2. Tạm dừng đăng ký và chức năng cấp IP trên mọi replica. Đối chiếu `users.id` là
   `CHAR(36) utf8mb4_unicode_ci`, InnoDB. Nếu khác, dừng để thiết kế tương thích;
   migration không tự ALTER dữ liệu/bảng cũ.
3. Thử trên bản sao DB. Kiểm unique user/IP, FK, CHECK được enforce, capacity,
   chạy lại không đổi IP và rollback khi lỗi giữa chừng. Mock không thay thử MySQL thật.
4. Khi chủ dự án duyệt riêng việc chạy, cấu hình DB đích bên trong môi trường bảo mật,
   đặt `ALLOW_DATABASE_MIGRATIONS=explicitly-approved`, `CYBER_IP_BACKUP_CONFIRMED=yes`,
   `CYBER_IP_MAINTENANCE_CONFIRMED=yes`, rồi mới chạy
   `node scripts/migrate-cyber-ips.mjs --apply`. Script nạp `.env.local` nếu có;
   không dùng lệnh dump env hay in connection string.

## Quy tắc và khôi phục

- Hai bảng mới: `cyber_virtual_ips` (PK user, UNIQUE IP số nguyên, FK users),
  `cyber_ip_allocator` (counter được khóa trong transaction).
- 62.230 địa chỉ: `10.10.1.10` → `10.10.254.254`. Dự trữ hai /24 đầu/cuối,
  `.0`–`.9` và `.255` ở mỗi /24; không cấp network/broadcast/gateway dự trữ.
- Chỉ mapping IP được lưu DB; không có bảng phiên, filesystem hay lịch sử lệnh.
- DDL MySQL không rollback cùng backfill. Lỗi có thể để lại hai bảng mới rỗng;
  không DROP, không sửa migration history để vượt lỗi. Script kiểm schema trước
  khi tiếp tục; backfill + counter + ghi lịch sử nằm cùng transaction.
- Mapping cũ hợp lệ được giữ nguyên; trùng, sai dải, orphan hoặc thiếu constraint
  làm dừng. IP đã cấp không được tái sử dụng chỉ vì còn lỗ trống dưới counter.
- Khi rollback ứng dụng: giữ hai bảng và mapping, không tự xóa IP đã cấp. Nếu cần
  restore toàn DB, dùng backup đã kiểm chứng và cửa sổ bảo trì được duyệt.
- Cần chạy migration trước khi dùng bản ứng dụng mới: đăng ký email/OAuth mới
  yêu cầu tạo user + IP nguyên tử; trước migration sẽ từ chối tạo, không tạo user dở.
  Đăng nhập tài khoản cũ giữ nguyên; Practice báo lỗi IP và khóa Start nếu schema chưa có.

## Quy trình kiểm thử trên MySQL riêng — chuẩn bị ngày 09/11/2026

**Trạng thái:** chưa có DB thử nghiệm an toàn được xác nhận; chưa chạy migration hoặc
truy vấn vào DB thật trong lần chuẩn bị này. Kiểm thử mock không xác minh MySQL thực
thi UNIQUE/FK/CHECK, khóa đồng thời hay rollback vật lý.

### Điều kiện bắt buộc trước kết nối/ghi

- Có MySQL 8.0.16+ trên instance thử nghiệm tách production, được chủ dự án xác nhận.
  Không coi tên schema có chữ `test` hoặc host localhost là bằng chứng cách ly.
- Dùng user riêng chỉ có quyền trên DB test; không dùng tài khoản ứng dụng, root hoặc
  quyền toàn server. Khai báo riêng `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`,
  `TEST_DB_PASSWORD`, `TEST_DB_NAME` qua kênh cấu hình bảo mật; không ghi giá trị ở đây.
- Xác minh nội bộ database đích, phiên bản, collation, engine InnoDB của `users`,
  `schema_migrations` và các bảng IP nếu có. Kiểm SQL mode/isolation level và grants;
  báo cáo chỉ trạng thái/metadata đã lược bỏ, không dump credentials/grants ra log.
- Tạo fixture tổng hợp bằng UUID và email `.invalid`, bao gồm user active/inactive,
  user chưa có IP và mapping đã cấp hợp lệ. Không sao chép tài khoản/dữ liệu production.
- Chụp snapshot fixture trước mỗi ca, kiểm restore, giữ artifact riêng cho ca thành công
  và lỗi. Tạm dừng các writer ngoài chính harness thử nghiệm.

**Tránh nạp nhầm env:** runner hiện đọc `.env.local` theo working directory. Khi được
phép chạy trên DB test, dùng thư mục tạm rỗng không có `.env*`, gọi script bằng đường
dẫn tuyệt đối và truyền bộ env allowlist với `DB_*` lấy từ cấu hình `TEST_DB_*` đã xác
minh. Không kế thừa `DB_*` của ứng dụng, không chạy runner từ thư mục dự án. Chỉ bật
các guard `--apply`/backup/maintenance sau bước xác nhận DB test; hiện chưa bật.

### Ma trận kiểm thử và tiêu chí đạt

| Ca | Thực hiện chỉ trên DB test | Bằng chứng bắt buộc |
|---|---|---|
| Backfill | Chạy migration cho fixture user cũ có/không có IP, gồm inactive; chạy lại lần hai | Mỗi user đúng một IP; mapping cũ không đổi; lần hai thêm 0 mapping; không đổi hồ sơ/mật khẩu/role/trạng thái user |
| UNIQUE user | Thử INSERT mapping thứ hai cho user đã có IP, dùng IP hợp lệ chưa dùng | MySQL trả `ER_DUP_ENTRY`; rollback, mapping/counter giữ nguyên |
| UNIQUE IP | Thêm user fixture mới rồi thử INSERT IP đã thuộc user khác | `ER_DUP_ENTRY`; không có hai owner chung IP; không ghi nhận migration mới |
| FK/CHECK | Thử owner không tồn tại, IP ngoài dải, `.0`–`.9`, `.255`, hai /24 dự trữ | FK/CHECK thật chặn; không dùng `IGNORE`, không tắt `FOREIGN_KEY_CHECKS` hoặc CHECK để vượt lỗi |
| Đồng thời | Qua nhiều connection độc lập, gọi luồng đăng ký thật cho 128 user khác nhau; thêm 50 lượt cấp IP đồng thời cho cùng một user legacy | 128 user + mapping tạo nguyên tử, IP không trùng; legacy chỉ một mapping; counter tăng đúng số mapping mới; không có user tạo dở |
| Ổn định IP | Gọi lại allocator/đăng nhập fixture đã cấp IP, mô phỏng Stop/Start rồi đọc lại mapping | Tuple `(user_id, ip_number)` không đổi; không có lần cấp lại hoặc counter tăng vô cớ |
| Rollback giữa chừng | Bọc connection thật để ném lỗi tại INSERT backfill thứ hai, sau khi INSERT thứ nhất đã thực thi; gọi `backfill()` | Query từ connection độc lập xác nhận không còn INSERT thứ nhất; counter và lịch sử giữ snapshot trước lỗi; transaction/lock được giải phóng |
| Dữ liệu cũ sai | Dùng DB fixture riêng mô phỏng schema dở dang/thiếu unique/check hoặc data sai; không sửa constraint DB test chính | Migration dừng, không đánh dấu hoàn tất; dữ liệu trước đó giữ nguyên; phân biệt lỗi schema trước DDL và lỗi backfill sau DDL |
| Hết pool | Fixture counter gần 62.230, số user chưa cấp lớn hơn số slot còn lại | Từ chối toàn bộ backfill; không cấp một phần hoặc ghi history |
| DDL không rollback | Gây lỗi backfill trên fixture mới chưa có hai bảng IP | Hai bảng có thể còn tồn tại; mapping/counter/history không bị ghi dở. Đối chiếu trước khi chạy lại, không tự DROP/history-reset |

Harness phải gọi allocator/luồng đăng ký trong code hiện tại, dùng cùng pool và transaction
thật; không thay kết quả bằng IP fixture hay serialize toàn bộ tác vụ ở harness. Chỉ
fault injection tạo lỗi có chủ đích được bọc; ghi riêng số lần deadlock/retry/thành công.
Lỗi không mong đợi phải đánh dấu ca chưa đạt, không tự sửa schema để test qua.

### Đối chiếu sau mỗi ca

Các truy vấn sau chỉ là bước xác minh trên DB test đã xác nhận, **chưa thực thi**:

```sql
SELECT COUNT(*) AS mappings,
       COUNT(DISTINCT user_id) AS owners,
       COUNT(DISTINCT ip_number) AS addresses
FROM cyber_virtual_ips;

SELECT COUNT(*) AS missing
FROM users u LEFT JOIN cyber_virtual_ips v ON v.user_id = u.id
WHERE v.user_id IS NULL;

SELECT COUNT(*) AS orphan
FROM cyber_virtual_ips v LEFT JOIN users u ON u.id = v.user_id
WHERE u.id IS NULL;

SELECT COUNT(*) AS invalid_address
FROM cyber_virtual_ips
WHERE NOT (ip_number BETWEEN 168427786 AND 168492798
           AND MOD(ip_number, 256) BETWEEN 10 AND 254);

SELECT next_slot FROM cyber_ip_allocator WHERE id = 1;
SELECT filename, COUNT(*) AS n FROM schema_migrations
WHERE filename = '005_cyber_virtual_ips.mjs' GROUP BY filename;
```

- Với ca thành công, `mappings = owners = addresses`, missing/orphan/invalid đều 0;
  history có đúng một dòng. Với ca lỗi, so với snapshot riêng của ca, không áp các
  tiêu chí backfill hoàn tất cho ca cố ý thất bại.
- So sánh mapping cũ, counter, history và hash các field fixture user trước/sau;
  chỉ chấp nhận thay đổi đã dự kiến. Không chỉ dựa vào tổng số bảng hoặc exit code.
- Ghi phiên bản MySQL, engine/constraints đã kiểm, mức đồng thời, kết quả từng ca,
  lỗi SQL đã lược bỏ và đường dẫn artifact. Không kết luận DB production đồng bộ.
- Không tự xóa DB test hoặc artifact sau kiểm tra; dừng để chủ dự án duyệt kết quả.

### Kiểm tra an toàn có thể chạy khi chưa có DB test

```powershell
node --check scripts/migrate-cyber-ips.mjs
node --test tests/cyber-ip-migration.test.cjs tests/cyber-ip.test.cjs
```

Hai test file chỉ dùng mock/bộ nhớ và import migration dưới dạng module; không gọi
CLI `--apply`, không nạp `.env.local`, không tạo kết nối MySQL thật. Các kiểm tra
InnoDB/UNIQUE/FK/CHECK và rollback thực tế ở ma trận trên vẫn cần DB test riêng.

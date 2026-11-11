# Discovery 007 — preflight DB local chính

Ngày kiểm tra: **10/11/2026**. **Chỉ preflight, chưa phê duyệt/chưa áp dụng lên DB chính.** Không chạy 006, init-db, cleanup hoặc deploy. Không sửa source ứng dụng/SQL 007 trong đợt này.

**Bước chuẩn bị runner tiếp theo:** xem [APPLY_007_REVIEW.md](./APPLY_007_REVIEW.md). Runner riêng và guard đã được thử trên QA; phần checklist cũ bên dưới phản ánh thời điểm preflight, không phải quyền áp dụng. DB chính vẫn chưa chạy 007.

## Kết quả đã xác minh

| Hạng mục | Kết quả |
|---|---|
| DB đích | `personal_site`, MySQL 8.0.46 local, port 3306; identity server UUID/datadir được đối chiếu trong artifact riêng |
| Trạng thái hiện tại | 30 bảng InnoDB; **0 bảng community**, không có marker 007; không có Blog schema/006 |
| Lịch sử | Giữ 5 record: 001–004 và `005_cyber_virtual_ips.mjs`; không có 006/007 |
| Nhánh migration | **Cài mới**, không phải upgrade/partial; không có dữ liệu Discovery cũ trên DB chính để chuyển |
| Backup/restore | **PASS**; snapshot 30 bảng/17 record, hash từng bảng và metadata cột/DDL khớp restore; 32 FK cũ, 0 dòng vi phạm |
| Migration clone | **PASS**; 44 bảng tổng, thêm 14 community; marker migration 7/application revision 3, đúng 3 chủ đề; 30 bảng cũ giữ nguyên |
| Constraints community | 14 PK, 8 UNIQUE ngoài PK, 26 FK, 21 CHECK đều ENFORCED; toàn clone 58 FK, 0 dòng vi phạm |
| Tính độc lập | Không chạy/tạo schema 006; phụ thuộc bên ngoài chỉ users và tags |
| Hoàn tất | Marker chỉ có sau transaction seed cuối; SQL không tự ghi `schema_migrations` |
| Main postflight | Hash dữ liệu/DDL cũ và lịch sử vẫn khớp backup, 0 community; không có thay đổi nghiệp vụ trên DB chính |

Phụ thuộc thật: `users.id CHAR(36) utf8mb4_unicode_ci`, `tags.id INT UNSIGNED`, engine InnoDB; schema clone đầy đủ đã thử với code thực tế. Không kết luận từ số bảng/lịch sử đơn lẻ.

Lần đối chiếu restore ban đầu bị chặn do SHOW CREATE trên hai instance biểu diễn khác phần `CHARACTER SET utf8mb4` trước cùng COLLATE. Dữ liệu đã khớp. Sau đó kiểm lại **metadata từng cột** (type/default/null/extra/charset/collation/generated expression) và DDL chuẩn hóa đúng phần biểu diễn dư này; cả 30 bảng khớp. Không sửa schema để làm kiểm chứng đạt.

SQL đã thử: `sql/planned/007_discovery_community.sql`, SHA-256:

```text
42ac374c5a8ca28e3073130f464bee921aa64ea7a86563fd45c7c57b7d16c5df
```

## Backup và cách ly

Backup lưu ngoài repo/temp:

```text
C:\Users\ADMIN\AppData\Local\personal-site-backups\discovery-007-20261110-hvKXYo\
  main.sql.gz.aes
  metadata.json
  verified-baseline.json
```

- Mysqldump single-transaction/quick/skip-lock-tables, không ALTER/DDL/DML DB chính. Không dump system users/grants. Không dump dạng `--databases` để tránh CREATE/USE DB chính khi restore.
- Dump đi qua gzip và AES-256-GCM, không ghi SQL plaintext xuống đĩa. Khóa được bọc bằng **Windows DPAPI CurrentUser**, metadata chứa ciphertext của khóa, không có password/env. ACL thư mục chỉ cho tài khoản Windows thực hiện preflight.
- Hash bản sao bền khớp bản đã restore; kiểm giải mã/gzip và từ chối ciphertext bị sửa **PASS**. Khôi phục đã được thử từ backup trên instance khác. DPAPI phụ thuộc profile/máy Windows này: **chưa chứng minh recovery trên máy khác**, cần lưu giữ profile/khóa hoặc phương án khóa phục hồi riêng trước yêu cầu disaster recovery ngoài máy.
- Instance restore hoàn toàn riêng: loopback **3331**, datadir riêng trong artifact bên dưới, root QA ngẫu nhiên được DPAPI bảo vệ; mysqlx/binlog/local-infile/events bị tắt. Không có app công khai kết nối clone, không dùng tài khoản/mật khẩu website thật để thử đăng nhập. Clone có dữ liệu thật từ backup nên cũng cần giữ kín; không đưa lên repo/dịch vụ ngoài.
- Backup này chỉ sao lưu **database**, không phải bản sao toàn uploads. DB chính chưa có Discovery/file registry; ảnh/file thật không bị di chuyển, đổi tên, ghi hoặc dọn trong preflight. Backup DB + Volume nhất quán sẽ bắt buộc cho recovery sau khi Discovery nhận upload.

## Kiểm thử clone và recovery

- **10/10 ca clone PASS, 0 skip:** ready/độc lập 006; schema chưa cài thì reads/writes fail-closed và media handler 404; tạo/sửa/feed/search/chủ đề/ownership; FK/UNIQUE/CHECK từ chối dữ liệu sai; like/save đồng thời idempotent/count chính xác; bình luận hai cấp và xử lý report Admin; Sharp ghi ảnh chính/thumbnail QA và quota byte thực; handler ảnh private main/thumb guest 404/owner 200/no-store; xóa mềm/khôi phục giữ quota và chỉ về draft; tất cả record cũ/lịch sử vẫn nguyên vẹn và không có orphan FK.
- **61/61 fixture/action/render/hồi quy PASS**, dùng các bộ Discovery Foundation/interactions/lifecycle và content routes hiện có. Không gửi HTTP tới nội dung thật để tăng view hoặc tải file thật.
- Lỗi sau DDL thứ 5: dừng ngay, rollback phần transaction nếu có, 5 bảng partial còn lại, **không marker**, source `communityReady=false`; 30 bảng cũ không đổi.
- Lỗi sau seed topics nhưng trước marker: rollback seed, 14 bảng DDL còn lại, **không marker**, source vẫn fail-closed; dữ liệu cũ không đổi.
- Recovery bằng **restore vào schema QA mới**, so sánh lại 30 bảng/17 record/32 FK **PASS**. Không DROP partial tables hoặc sửa lịch sử để chạy lại. MySQL DDL không thể rollback cả migration bằng ROLLBACK.
- Chưa bật/chạy worker cleanup, kể cả trên clone đợt này. Không chạy browser E2E mới; kiểm route bằng source, fixture và gọi handler thật với pool clone/auth fixture. Typecheck/build đã PASS ở đợt lifecycle trước; không chạy lại vì đợt này chỉ thêm tài liệu/công cụ tạm ngoài source.

## Guard bảo trì còn phải đạt trước khi xin apply

Tại lần đọc cuối: quyền PROCESS đủ nhìn toàn bộ kết nối; **12 kết nối Sleep tới DB chính, 0 đang thực thi**, **0 transaction khác**, **0 metadata lock pending**. Đây là ảnh chụp tại thời điểm kiểm tra, **không chứng minh writer đã tạm dừng**. Không kill hoặc dừng ứng dụng/Navicat trong preflight.

1. Xin phê duyệt áp dụng riêng. Thông báo cửa sổ bảo trì; dự trù 5–10 phút cho kiểm guard/backup/postflight, không coi đây là downtime đã đo. Dừng app/dev server, tác vụ nền và ngắt client DB có thể ghi; owner các kết nối cần được xác nhận. Kiểm lại processlist/transactions/metadata locks, không chỉ dựa vào COMMAND=Sleep. Không tự kill kết nối không rõ nguồn.
2. Đối chiếu lại server UUID/datadir/schema/port, 30 bảng nền, absence community và 006, checksum SQL, dependency/index/check. Nếu xuất hiện 007 revision cũ/partial hoặc history xung đột, **dừng cài mới**. So hash DB với backup; nếu thay đổi, tạo backup mới và thử restore trước khi tiếp tục.
3. Chỉ dùng runner **riêng 007**, khóa migration theo DB, stop-on-first-error; không `init-db`, không --force, không tự chạy lại. Công cụ thử nghiệm trong artifact chỉ chấp nhận port/datadir/prefix QA, **không phải runner áp dụng DB chính**. Cần chuẩn bị/duyệt runner chính thức trước bước apply.
4. Source hiện **không có feature flag bật sau postflight**: `communityReady` kiểm các cột + marker revision 3, không kiểm toàn bộ index/FK/CHECK. Marker cuối SQL commit là đủ để app tự coi ready. Vì vậy **giữ app/writer dừng xuyên suốt SQL và postflight**, không mở traffic khi chỉ thấy marker.
5. Postflight bắt buộc: đúng 14 bảng/constraints/index/types, 3 topics, marker duy nhất 7/3, empty community content (không seed user/bài); hash record và schema 30 bảng cũ, FK toàn DB và history 001–005 không đổi. Runner chính thức chỉ thêm **record 007 mới sau khi mọi postflight đạt**, không sửa/xóa lịch sử cũ. Không ghi hoàn tất khi DDL/seed lỗi.
6. `UPLOAD_DIR` phải đúng, riêng tư và bền vững. Read-only OS permission check hiện cho phép ghi vào root; `discovery` namespace thật **chưa tồn tại**. App sẽ khởi tạo marker gắn DB/root ở upload đầu tiên. Không public-static namespace hoặc copy marker QA. Chưa thử ghi file trên storage thật. Worker giữ tắt.
7. Nếu lỗi: giữ bảo trì, không chạy lại/dọn bảng. Lưu lỗi đã lược bí mật và kiểm kê phần DDL đã commit. Dùng backup đã kiểm chứng để restore **sang DB mới cách ly**, kiểm hash/FK rồi xin duyệt hướng recovery; không overwrite DB chính tự động. Trước khi mở writer, smoke test app/upload/quyền bằng tài khoản tổng hợp đã được duyệt; dừng nếu guard không đạt.

### Nếu lần kiểm tra sau phát hiện 007 cũ

Hiện không cần script upgrade vì DB chính chưa có community. Không dùng draft CREATE hiện tại để nâng cấp revision 1/2. Phải lập upgrade có version/checksum/lịch sử riêng theo schema thực tế: backup DB và file, giữ nguyên ID/bài/comment/like/save/report; thêm cột/bảng additive; kiểm kê owner/reference và byte **main + thumbnail** từ disk để lập inventory/hash, giữ quota bảo thủ cho file thiếu/unknown, không tự refund; copy/verify namespace dưới bảo trì trước chuyển đọc; chỉ tăng marker sau đối chiếu dữ liệu/constraints. Không giả inventory_complete hoặc sửa record migration cũ. Nhánh này cần QA và phê duyệt riêng, chưa thực hiện.

## Artifacts và phạm vi

```text
C:\Users\ADMIN\AppData\Local\Temp\personal-site-discovery-preflight-hvKXYo\
```

Gồm `main-readonly.json`, `main-final-readonly.json`, `backup-fingerprints.json`, `verified-baseline.json`, `clone-result.json`, `recovery-result.json`, `clone-tests.cjs`, `clone-tests.log`, `archive-storage-check.json`, snapshot hash và manifest. `preflight.cjs` là công cụ kiểm thử tạm có guard QA, không runner apply thật. Giữ datadir/clone/env/DPAPI artifacts kín, không commit/publish. Không có Git metadata; đối chiếu hash snapshot đầu lượt, không init Git.

Lỗi nhãn hiện hữu: `/admin/discovery/reports` còn thông báo “revision 2” khi chưa sẵn sàng, trong khi guard thực tế yêu cầu revision 3. Chỉ ghi nhận trong preflight; chưa sửa UI ngoài yêu cầu.

Kết thúc: đã xác minh topics/marker của transaction seed lỗi đều bằng 0; dừng MySQL clone có guard port/datadir thành công. Giữ nguyên schema/file QA, không dọn. Snapshot hash xác nhận chỉ thêm tài liệu preflight này và cập nhật link trong tài liệu QA; source, SQL 006/007, AGENTS, PROJECT_CONTEXT và các module được bảo vệ giữ nguyên.

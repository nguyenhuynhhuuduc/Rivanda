# Recovery Discovery 007 revision 3 — chờ phê duyệt riêng

Ngày chuẩn bị: **10/11/2026**. **Chưa chạy recovery trên `personal_site`.** App/writer giữ dừng; không 006, cleanup hoặc deploy. Đây là hoàn tất DML sau DDL đã commit, không phải chạy lại installer.

## Phạm vi và điều kiện chặn

`scripts/recover-discovery-007.cjs` chỉ nhận **44 bảng tổng = 30 bảng cũ + đúng 14 bảng community rỗng**, contract revision 3 khớp toàn bộ; **không marker, không history 007**, giữ đúng 5 history cũ. Bất kỳ bảng/cột/index/FK/UNIQUE/CHECK/engine/view/trigger/routine lạ, dữ liệu mới hoặc drift baseline đều bị từ chối. Không có CREATE/ALTER/DROP hoặc chỉnh sửa lịch sử cũ trong recovery.

- Pin SQL và contract SHA hiện có. Đối chiếu DDL chuẩn hóa + metadata cột, 14 PK, 8 UNIQUE ngoài PK, 26 FK, 21 CHECK ENFORCED; kiểm toàn bộ 58 FK không orphan và hash mọi bản ghi cũ.
- Cần cả **backup gốc 30 bảng** và **backup trạng thái dở dang 44 bảng**. Mỗi archive được kiểm SHA/byte, AES-GCM/gzip/DPAPI; receipt HMAC gắn source identity, archive/baseline/checksum và restore QA thực tế. Hai receipt đều phải còn hạn 24 giờ. Không đổi marker/receipt/checksum để vượt guard.
- `OTHER_TRANSACTIONS` nay ghi `runnerConnectionId`, `phase`, `detectedAtUtc`, cùng `transactionId`, `connectionId`, `state`, `started`, `readOnly`, `rowsModified`. `started` theo múi giờ server; thời điểm phát hiện là UTC. Không log SQL, username, password hoặc token. ID runner được pin và truyền tham số; **mọi transaction khác vẫn chặn**, kể cả read-only, thread 0 hoặc không còn PROCESSLIST. Không tự retry/chờ để bỏ qua một lần phát hiện.
- Dùng cùng migration lock với installer, cùng guard app/process/cổng/cron DB/replication/client/transaction/metadata lock và counter Connections. Client mới rồi ngắt vẫn chặn. Không có allowlist hoặc skip flag.
- Purpose bắt buộc `discovery007-empty-recovery-v1`; gate riêng `ALLOW_DISCOVERY_007_RECOVERY=revision-3-recovery-explicitly-approved`. Gate/approval installer cũ không cho phép recovery. Mặc định chỉ check; không tự nạp `.env`.

## Tính nguyên tử và postflight

Sau kiểm tra lại dưới migration lock, recovery mở **một transaction**, khóa history và các khoảng rỗng community. Hai INSERT seed lấy từ SQL đã pin: 3 topics + marker **7/3**; thêm đúng một history `007_discovery_community.sql` trong cùng transaction.

Postflight trước COMMIT kiểm toàn bộ schema/constraints/core data/history/seed trên **chính transaction đang mở**, không BEGIN/SET isolation/rollback lồng nhau. Sau COMMIT kiểm lại bằng snapshot mới và guard bảo trì, rồi mới tạo report exclusive `recoveryPostflight=PASS`. Các bản ghi lịch sử cũ giữ nguyên; chỉ append 007. App/cleanup không được khởi động tự động.

Lỗi trước COMMIT rollback toàn bộ seed/marker/history, giữ 14 bảng rỗng. Mất phản hồi COMMIT ghi `commitState=unknown`; lỗi sau COMMIT ghi `committed`, không tuyên bố rollback dữ liệu đã commit. Không có report thành công và không tự chạy lại; kiểm kê read-only trước mọi quyết định tiếp theo.

## Backup và review đã chuẩn bị

Backup 44 bảng được tạo bằng mysqldump single-transaction **chỉ đọc DB chính**, mã hóa trực tiếp, không lưu SQL plaintext. Hash trước/sau khớp; restore trên instance QA loopback 3331/datadir khác, kiểm đủ 44 bảng và 58 FK đạt. Backup gốc 30 bảng vẫn giữ nguyên. Khóa DPAPI phụ thuộc profile Windows hiện tại; không đưa archive/datadir/env lên repo.

```text
C:\Users\ADMIN\AppData\Local\personal-site-backups\discovery-007-partial-20261110-BFX9td\
  main.sql.gz.aes
  metadata.json
  verified-baseline.json
  recovery-restore-receipt.json
  recovery-review.pending.json
```

Review mới trỏ đúng hai backup/receipt và report path riêng; **ba xác nhận bảo trì false, expiresAt null**. Không dùng review/attempt của lần installer thất bại. Receipt recovery chỉ được tạo bởi `verifyPartialRestore` sau khi đọc bản restore QA đúng contract/rỗng và khớp cả hai baseline; hàm không tự restore hoặc ghi DB.

## Checklist thực thi thật — chưa được phép

1. **Duyệt riêng recovery này.** Xác nhận app/dev/watchers, Navicat/auto-reconnect, writer/cron và cleanup dừng; đủ cổng trong review. Kiểm hiệu lực hai receipt và backup, source identity/quyền DB; đổi dữ liệu hoặc hết hạn thì dừng để chuẩn bị lại, không lặp QA toàn bộ nếu code/trạng thái không đổi.
2. Sau xác nhận bảo trì thực tế, điền ba cờ true và `expiresAt` ISO trong tối đa 2 giờ vào review mới. Chạy **check-only** dưới đây; yêu cầu PASS. Không tự gia hạn cửa sổ khi đã fail.
3. Chỉ sau phê duyệt và check PASS, dùng **recovery runner** với gate riêng và `--apply` đúng một lần. Không dùng `init-db` hoặc installer 007. Giữ app dừng xuyên transaction và DB postflight.
4. Yêu cầu report PASS: 14 bảng contract khớp, 3 topics, marker duy nhất 7/3, history 007 đúng một lần, 5 history cũ và mọi bản ghi/schema cũ giữ hash. Còn bước smoke tài khoản thật trước khi đánh giá mở lại app; runner không đăng nhập/tạo account hoặc bật app.
5. Nếu lỗi/commit unknown: giữ app dừng, giữ diagnostics/report, **không retry, KILL, DROP, seed hoặc sửa marker/history thủ công**. Kiểm kê read-only rồi xin quyết định recovery tiếp theo; không tự restore DB chính.

Lệnh check (không apply):

```powershell
node --env-file=.env.local scripts/recover-discovery-007.cjs --check --review="C:\Users\ADMIN\AppData\Local\personal-site-backups\discovery-007-partial-20261110-BFX9td\recovery-review.pending.json"
```

Mẫu cho bước đã được phê duyệt riêng: thiết lập `ALLOW_DISCOVERY_007_RECOVERY` đúng giá trị ở trên, dùng cùng lệnh và thay `--check` bằng `--apply`; không lưu gate vào `.env.local` hoặc cấu hình startup. Xóa gate khỏi phiên shell sau thao tác. Không chạy mẫu này trong lượt chuẩn bị.

## Kiểm chứng QA

- **13/13 MySQL recovery QA PASS**, 0 skip: check-only/CLI/gate riêng; commit một lần và từ chối chạy lại; rollback sau topics/marker/history và postflight lỗi; schema/check enforcement sai, dữ liệu mới, drift core/history/marker; client/transaction read-only đồng thời và race sau PROCESSLIST; reconnect giữa transaction; COMMIT mất phản hồi; archive/receipt hỏng, sai binding hoặc hết hạn.
- **10/10 unit PASS** (6 cũ + 4 mới): metadata chẩn đoán được lược bỏ trường nhạy cảm; không miễn read-only/thread 0; helper snapshot không điều khiển transaction; purpose/gate riêng và các guard installer cũ.
- **11/11 MySQL installer regression PASS**, vì dùng chung helper fingerprint/postflight/guard; xem log `install-regression-tests.log`. Tổng **34/34 test PASS, 0 skip**. Không chạy installer hoặc recovery trên DB chính trong lượt này.
- Chỉ CJS/test/docs thay đổi, không sửa TypeScript/dependency/config/UI; kiểm syntax Node và test MySQL theo phạm vi, không build toàn website. Mọi fixture là schema mới trên QA, không xóa dữ liệu hoặc bảng để reset test.
- Artifacts: `C:\Users\ADMIN\AppData\Local\Temp\personal-site-007-recovery-BFX9td` — snapshot/hash trước sửa, backup main read-only, config/log QA, manifest. Giữ dữ liệu clone kín; không commit env/datadir/key. Không có Git metadata, không init repository.
- Postcheck read-only lúc **17:53 ngày 10/11/2026**: DB chính vẫn 44 bảng/14 community rỗng, marker 0, history 5; 30 bảng cũ và backup dở dang khớp, hai receipt hợp lệ; không client/transaction ngoài, app không chạy. Review recovery vẫn false/null, cần cửa sổ bảo trì mới và phê duyệt riêng. QA đã dừng an toàn; không xóa schema/file test.

Giới hạn: đây không phải kết luận nguyên nhân chính của incident connection 77. Guard vẫn bảo thủ với snapshot transaction không đồng bộ; chẩn đoán mới giúp truy nguồn nếu tái diễn. Chưa smoke/login tài khoản thật, chưa chạy recovery chính thức. Mọi thay đổi runner sau QA cần kiểm tra tương ứng trước khi áp dụng.

# Apply 007 revision 3 — runner và checklist chờ duyệt

Ngày chuẩn bị: **10/11/2026**. **CHƯA áp dụng `personal_site`.** Tiếp nối `DISCOVERY_007_PREFLIGHT.md`; không chạy 006, không đổi source ứng dụng/Auth hoặc bật cleanup/deploy.

**Cập nhật sau lần apply đã dừng:** DB chính hiện có 14 bảng community rỗng, đúng contract, chưa marker/history 007. **Không chạy lại installer này.** Phương án chuẩn bị hoàn tất DML, backup trạng thái dở dang và QA ở [RECOVERY_007_REVIEW.md](./RECOVERY_007_REVIEW.md); chưa được phê duyệt chạy recovery trên DB chính. Các bước/số liệu installer bên dưới được giữ làm lịch sử.

## Kết nối cần kiểm soát

Đầu lượt đã đối chiếu **PROCESSLIST + session connect attributes + socket TCP Windows**; không lấy SQL đang chạy, command line hoặc credential vào log:

| Kết nối MySQL | Nguồn xác minh | Thao tác cần trước apply |
|---|---|---|
| 49, 50 | `navicat.exe`, PID 15764; attribute `_pid` và source port cùng khớp | Ngắt kết nối Navicat, tắt auto-reconnect cho cửa sổ bảo trì |
| 51–60 | `node.exe`, PID 17544, command metadata khớp Next.js và project personal-site; source port khớp cả 10 socket | Dừng app/dev server và watcher có thể tự khởi động lại |

Không có kết nối QA hoặc nguồn chưa rõ trong 12 kết nối đó. Các PID/ID trên là **ảnh chụp lịch sử**, không dùng để KILL ở phiên khác. Agent không KILL/dừng các tiến trình này.

Sau gián đoạn, snapshot **10/11/2026 15:16 giờ Bangkok**: **0 client foreground khác**, không phát hiện process Next.js của project/cổng review 3000; DB vẫn 30 bảng, không community, 5 migration cũ, hash dữ liệu/schema khớp backup. Việc các kết nối đã đóng không thay thế xác nhận bảo trì của chủ dự án. Kiểm lại ngay trước apply, không dựa vào số liệu/PID cũ. Cổng thực tế của app cần được kiểm kê và ghi đủ trong review.

## Runner đã chuẩn bị

- `scripts/migrate-discovery-007.cjs`: mặc định check; chỉ CLI `--apply` **và** biến `ALLOW_DISCOVERY_007_APPLY=revision-3-explicitly-approved` mới cho qua cổng ghi. Biến đó không phải sự phê duyệt; chỉ thiết lập sau chỉ dẫn áp dụng riêng của chủ dự án.
- `sql/planned/007_discovery_contract.json`: contract 14 bảng từ clone đã được kiểm chứng. Runner pin SHA-256 của **SQL và contract**, so DDL chuẩn hóa cùng metadata toàn bộ cột. Index/FK/UNIQUE/CHECK được bao hàm trong DDL, có kiểm count/enforcement và orphan FK riêng.
- Chỉ chấp nhận MySQL **8.0.46**, baseline **30 bảng/5 lịch sử 001–005** hiện đã review. Nếu đổi MySQL/schema/SQL phải preflight/QA lại, không sửa checksum để vượt guard.
- Nhánh local chỉ nhận `personal_site:3306`, identity UUID/datadir đúng receipt và review, host loopback. Nhánh QA chỉ nhận instance/UUID/datadir khác nguồn và schema `discovery007_runner_<số>`, không dùng QA flag để trỏ DB chính.
- Backup phải đúng SHA/byte, giải mã AES-GCM/gzip thành công bằng DPAPI; baseline phải khớp DB đang kiểm. Có receipt HMAC ràng buộc archive/baseline/SQL/contract/source identity và một restore QA đã kiểm đủ 30 bảng/32 FK. Receipt tối đa **24 giờ**; đổi backup hoặc receipt quá hạn cần verify restore lại.
- Maintenance phải có 3 xác nhận rõ `applicationStopped`, `externalWritersBlocked`, `cleanupWorkerStopped` và thời hạn còn tối đa **2 giờ**. Runner kiểm PROCESS visibility, **từ chối mọi client khác kể cả Sleep hoặc DB khác**, transaction khác, metadata lock chờ, DB event và replication. OS probe kiểm process Next.js theo project, cổng review và process cleanup Node.
- Lấy advisory lock riêng 007, kiểm lại guard trước **từng statement** và trong/sau postflight. Counter global `Connections` phải giữ nguyên: một client mới kết nối rồi ngắt giữa hai lượt kiểm cũng làm runner dừng. Điều này cố ý bảo thủ: client vào DB khác trên cùng instance cũng chặn migration.
- Gặp lỗi dừng ngay, rollback DML đang mở, giữ phần DDL đã commit; không DROP, KILL, retry, restore hoặc bật app/worker tự động. Không có chức năng upgrade schema 007 cũ/dở dang.
- Postflight đòi 44 bảng tổng/14 community, marker duy nhất **7/3**, 3 seed topics đúng; 14 PK, 8 UNIQUE ngoài PK, 26 FK, 21 CHECK ENFORCED; 58 FK toàn DB không orphan; mọi dữ liệu/schema cũ giữ hash. Nội dung community phải rỗng ngoài marker/topics.
- Chỉ sau DB postflight đạt mới append **một** record `007_discovery_community.sql`; kiểm 5 record cũ giữ nguyên. Report tạo exclusive, không ghi đè file có sẵn. Report ghi `applicationMustRemainStopped=true`, `realAccountSmoke=PENDING_MANUAL_APPROVAL`; **không tuyên bố toàn website đã sẵn sàng**.

Guard là kiểm tra vận hành trên máy local được tin cậy, không phải hàng rào ngăn một admin chủ động vượt công cụ hoặc tiến trình đang chạy SQL không phát sinh kết nối mới. Phải thực sự ngăn auto-restart/client/writer khác trước khi xác nhận; không có tùy chọn allowlist client hoặc bỏ kiểm tra.

## Review, backup và lệnh check

Bản review local chờ duyệt được lưu ngoài repo, các xác nhận đều **false**, `expiresAt=null`. Không tự chuyển true vì thấy snapshot trống. Receipt/baseline chứa hash và metadata, không có password. Backup AES/DPAPI giữ nguyên tại thư mục backup được nêu ở preflight.

```text
C:\Users\ADMIN\AppData\Local\personal-site-backups\runner-007-review-20261110-fkT7Ew\
  local-review.pending.json
  restore-receipt.json
```

Lệnh chỉ kiểm tra, không apply:

```powershell
node --env-file=.env.local scripts/migrate-discovery-007.cjs --check --review="C:\Users\ADMIN\AppData\Local\personal-site-backups\runner-007-review-20261110-fkT7Ew\local-review.pending.json"
```

Không có implicit nạp env trong module; dùng env file đã review khi chạy CLI. Không copy env/credential vào review, source hoặc log. Check với pending review hiện trả **`MAINTENANCE_NOT_CONFIRMED`**; đó là từ chối đúng. Không có lệnh apply được chạy trên DB chính trong đợt chuẩn bị.

Receipt được tạo bằng hàm `verifyRestore` của runner với connection tới **schema restore riêng**; hàm tự kiểm isolation, fingerprint và FK trước khi ký HMAC bằng khóa backup được DPAPI mở trong RAM. Hàm không tự tạo/restore DB. Quy trình backup/restore mới vẫn theo preflight; không tái dùng receipt của archive/identity khác.

## Checklist cho lần xin áp dụng riêng

1. **Phê duyệt phạm vi:** chỉ runner 007/checksum đã QA; không 006/init-db/cleanup/deploy. Xác nhận cửa sổ bảo trì, DB đích và cách liên hệ người kiểm tra. Không coi yêu cầu chuẩn bị này là quyền apply.
2. **Bảo trì:** chủ dự án dừng app/dev/watchers, ngắt Navicat/client/auto-reconnect, tạm dừng tác vụ có thể ghi. Cập nhật đủ `listenPorts`; kiểm processlist/transactions/locks bằng metadata. Không KILL theo ID lịch sử. Nếu nguồn mới xuất hiện, dừng và xác định trước.
3. **Backup:** đối chiếu fingerprint DB với backup hiện có. Nếu đổi dữ liệu/schema, tạo backup mã hóa mới và restore QA; tạo receipt mới nếu đổi backup hoặc quá 24 giờ. Giữ cả `.aes`, metadata và quyền giải mã DPAPI. Review UUID/datadir/source và report path mới chưa tồn tại.
4. **Check:** chỉ sau khi các sự kiện bảo trì thực sự hoàn tất mới cập nhật xác nhận và expiry ISO trong tối đa 2 giờ. Chạy `--check`; yêu cầu PASS. Check không lấy migration lock hoặc thực thi DDL/DML.
5. **Apply (chưa được phép):** sau phê duyệt rõ, thiết lập cổng môi trường và dùng runner riêng với review đã kiểm. Giữ app dừng xuyên DDL, seed, DB postflight và ghi history. Không mở traffic chỉ vì marker đã commit. Không chạy cleanup; không cho ai mở Navicat vào cùng instance trong lúc runner hoạt động.
6. **Nếu lỗi:** giữ app dừng, lưu error code/report đã lược bí mật; không chạy lại. Kiểm kê DDL/marker/history thực tế. Recovery phải qua restore DB mới cách ly và đối chiếu trước; không tự overwrite DB chính hoặc sửa record lịch sử. Lỗi sau commit/history cũng không cho phép suy đoán rollback toàn bộ; giữ bảo trì để kiểm chứng.
7. **Smoke tài khoản thật:** **chưa chạy**. Chọn tài khoản do chủ dự án sở hữu, để chủ dự án tự đăng nhập; không cung cấp/lưu password hoặc token cho runner. Hiện DB chỉ có **1 tài khoản active Admin**, chưa có active member cho test quyền thành viên/khác chủ. Không tự tạo account thật hoặc đổi role; cần chủ dự án chỉ định/bổ sung member hợp lệ trước khi xác nhận nhánh này.
8. **Giữ main app dừng khi smoke:** để tuân thủ yêu cầu giữ app dừng suốt postflight, chuẩn bị một **clone sau apply + bản app loopback cách ly** cho phiên login thật, không mở traffic công khai/SMTP/OAuth ngoài phạm vi. Nếu muốn smoke trực tiếp app/DB chính thì cần duyệt riêng bước chạy app giới hạn truy cập; runner không tự làm. Không thể xác nhận luồng login qua giao diện khi mọi bản app đều dừng.
9. **Ma trận smoke cần ký nhận:** guest thấy public và bị chặn tương tác; member login về đúng route, tạo/sửa/xóa mềm bài mình, bị chặn bài người khác; Admin kiểm duyệt/report; ảnh public/private/draft cả main/thumb đúng quyền/no-store; like/save counts, comment/reply, quota, khôi phục về draft. Không dùng tài khoản Admin để kết luận quyền member đúng. Nội dung/ảnh thử phải được duyệt rõ, không hard-delete hoặc chạy cleanup để xóa dấu test.
10. **Mở lại ứng dụng:** chỉ sau khi DB postflight và smoke tương ứng đạt, không có lỗi chưa đánh giá và có quyết định mở lại. Runner không restart/push/deploy. Giữ cleanup tắt; việc dọn file là công việc riêng.

## Bằng chứng và giới hạn

- **17/17 test (6 unit + 11 MySQL QA), 0 skip**, gồm check-only/approval, Sleep/transient reconnect, identity/backup stale, archive/receipt hỏng hoặc hết hạn/sai binding, apply một lần, DDL/seed lỗi, UNIQUE thiếu trong postflight, không ghi thành công giả, prefix/isolation của receipt. SQL QA chạy trên port 3331/datadir clone; mọi fixture là schema mới, không sửa DB chính.
- Check-only thực tế trên DB chính từ chối đúng vì review chưa xác nhận. Hash 30 bảng/5 history tiếp tục khớp backup; không có 007. Các kiểm tra đã đạt trên clone không thay thế check tại cửa sổ apply.
- Bộ test kiểm OS probe thật khi không có app QA; không tạo credential website thật hoặc chạy browser/login thật trong lượt này. Chưa có smoke tài khoản thật, chưa chạy apply chính thức. Không chạy build/typecheck vì chỉ thêm CJS/JSON/docs, không sửa TypeScript/config/dependency; kiểm syntax CJS và QA theo đúng phạm vi.
- Artifacts: `C:\Users\ADMIN\AppData\Local\Temp\personal-site-007-runner-fkT7Ew` — log QA, PID/socket mappings đã lược command line, receipt, pending review, main read-only snapshot và manifest. Datadir clone/fixture giữ kín, không commit.
- Đã dừng MySQL QA sau khi kiểm port/datadir/UUID khác DB chính; giữ nguyên schema/file test, không dọn. Đối chiếu snapshot: **1 tài liệu sửa + 5 file mới**, không thay đổi source ứng dụng, SQL 006/007, AGENTS, PROJECT_CONTEXT hoặc dependency/config.

Chạy lại test chỉ khi instance QA cách ly và cấu hình guard đã được kiểm chứng:

```powershell
$env:DISCOVERY_007_RUNNER_QA = '<duong-dan-tuyet-doi-qa-config.json>'
node --test tests/discovery-007-runner.test.cjs tests/discovery-007-runner-qa.test.cjs
```

Không bật biến opt-in thì 11 ca SQL sẽ **skip**, không được báo 17 PASS. Không đổi guard port/datadir/UUID hoặc trỏ config test vào DB chính để vượt lỗi kết nối.

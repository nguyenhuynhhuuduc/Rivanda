# Discovery Foundation / SQL 007 — kết quả QA

**Preflight DB local chính 10/11/2026:** xem [DISCOVERY_007_PREFLIGHT.md](./DISCOVERY_007_PREFLIGHT.md). Đã thử backup/restore và migration clone; chưa áp dụng 007 lên DB chính, chưa bật cleanup.

Ngày: **10/11/2026**. Blog và migration 006 tạm dừng theo ưu tiên mới. Đây là kết quả phần nền Discovery; chưa hoàn thành toàn bộ mạng xã hội MVP, chưa triển khai staging/production.

**Cập nhật tương tác MVP:** xem mục “Discovery Interactions — SQL 007 application revision 2” cuối tài liệu. Mục đó ưu tiên cho source hiện tại, số bảng và checklist áp dụng. Các kết quả 15/50 test, 34 tổ hợp và danh sách chức năng còn thiếu ở phần nền bên dưới là lịch sử trước đợt bổ sung tương tác.

## Phần đã nối backend

- `/discovery`: public feed Mới nhất / Phổ biến 7 ngày, search nội dung/hashtag, lọc chủ đề/tác giả và cursor có chữ ký, thời hạn 30 phút. Không OFFSET. Popular giữ thứ tự snapshot tối đa 60 bài trong 7 ngày; số đếm đọc từ bảng thực tế, không sinh số liệu.
- `/discovery/new`, `/discovery/posts/[id]`, `/discovery/posts/[id]/edit`: status, bài Markdown, bộ ảnh; công khai/private, lưu nháp, sửa/xóa mềm đúng chủ sở hữu. Bài public xuất bản trực tiếp; Admin có thể giữ kiểm duyệt. Sau khi bị ẩn/từ chối, cờ giữ duyệt tồn tại qua draft; gửi lại chuyển pending, cần Admin duyệt.
- `/account/discovery`: bài của chủ sở hữu, gồm nháp/private; phân trang cursor. Profile thêm bài Discovery public, giữ ảnh/follow/avatar/bio cũ.
- `/admin/discovery`: Admin ẩn/gỡ hoặc duyệt/từ chối bài pending; bắt buộc lý do khi ẩn/gỡ/từ chối, lưu lịch sử và kiểm revision. Không dùng quyền Moderator của thư viện ảnh cho cộng đồng mới.
- Chia sẻ sao chép URL chính xác của bài. Không hiển thị nút like/comment/save/report chưa có backend.
- `/api/discovery/media/[id]`: kiểm visibility/ownership ở server mỗi lần; trả no-store, nosniff. Không cung cấp tên storage trong HTML/API công khai. Bài bị xóa/ẩn/private không còn phục vụ ảnh cho khách.
- Tối đa 4 ảnh/bài, mỗi ảnh 5MB, tổng 20MB; JPG/PNG/WebP tĩnh, Sharp kiểm decode/16MP, re-encode WebP, bỏ metadata và tạo thumbnail. Dùng storage hiện có, không sửa upload/gallery cũ.
- Server Actions dùng auth hiện có và kiểm Origin/CSRF mặc định của Next; ghi SQL có tham số. Transaction bài–media–tag–lịch sử, khóa tài khoản/bài và revision chống ghi đè. Rate theo cửa sổ 15 phút: 10 thao tác bài, 12 ảnh với thành viên; Admin được miễn rate này.

## SQL 007 độc lập

File `sql/planned/007_discovery_community.sql` yêu cầu **users và tags**, không phụ thuộc 006. Tạo 11 bảng `community_*`, gồm marker `community_schema_state` và rate buckets riêng. Không ALTER/DELETE/UPDATE dữ liệu cũ. Seed ba chủ đề thật, không seed bài hay tài khoản.

Marker version 7 chỉ commit cùng seed cuối migration. Thiếu bảng/cột cần thiết hoặc marker thì ứng dụng khóa chức năng Discovery mới. Marker không thay thế postflight kiểm constraints/index.

MySQL DDL auto-commit: SQL này **không thể rollback toàn bộ DDL bằng ROLLBACK**. Dừng ở lỗi đầu tiên; không dùng `--force`, không tự chạy lại, không dùng `init-db`. Nếu DDL hoàn tất một phần, để tính năng khóa, kiểm kê rồi xin duyệt khôi phục/khắc phục riêng. Không drop bảng để chữa lỗi.

## Bằng chứng kiểm thử

- MySQL **8.0.46**, instance riêng `127.0.0.1:3321`, datadir riêng trong thư mục QA bên dưới. Clone DDL users/tags, chỉ tạo tài khoản và nội dung tổng hợp `.invalid`; không sao chép người dùng, mật khẩu, tệp upload hoặc dữ liệu thật. Không tạo schema Blog/006 trong bộ test 007.
- **15/15** ca MySQL: standalone/schema marker, giữ sentinel cũ, fail-closed khi thiếu marker, CRUD/active account/ownership, private/draft ACL, nháp bài viết chưa có tiêu đề vẫn xóa/ẩn được nhưng không thể xuất bản, concurrent edit chỉ một thắng, chống né moderation hold, rollback transaction khi lỗi tag, CHECK/FK/media owner/reply cùng bài/UNIQUE like-save-report, soft-delete, newest cursor timestamp trùng/microsecond và tamper/filter/expiry, popular snapshot khi số tương tác đổi, upload sai, quota đồng thời, owner/Admin cursor và tìm kiếm topic/hashtag/wildcard/SQL injection.
- **50/50** ca fixture/action/render và hồi quy routes/nội dung: guest, stale/wrong owner trước storage, runtime input, lỗi DB không lộ chi tiết, xác nhận xóa, Admin role, escape nội dung, media path/headers, legacy redirects/private Resources/JourneyStory và navigation. Test fixture CSRF xác nhận dùng Server Actions/cấu hình Origin hiện có; không phải pentest CSRF đầy đủ.
- TypeScript đạt: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`.
- Build production đạt trên bản sao QA, `.env` chỉ trỏ QA, không chép `.env` thật. Build đầu bị chặn Google Fonts bởi sandbox; build có quyền mạng đạt, không sửa dependency/config/font để né lỗi.
- Browser IAB dùng build production + MySQL QA và auth thật với tài khoản tổng hợp: đăng nhập chuyển về form; tạo bài hai ảnh, sửa chủ đề/public/private, ảnh tải thành công, script là text (không có script element trong article), sao chép URL, Profile/Account, Admin bắt lý do/ẩn, tác giả gửi lại pending, Admin approve và bài public trở lại.
- **34 tổ hợp responsive**, không tràn ngang: feed 1440/1024/768/390/375 × light/dark; new/edit/detail/Admin 1440/768/375 × light/dark. Account/Profile kiểm thêm trên mobile. Skeleton biến mất sau tải; bộ lọc thu gọn trên mobile. Không chứng nhận mọi thiết bị/browser/dữ liệu dài.
- HTTP guest trên QA: ảnh private 404; body/metadata bài private không lộ, route tạo/sửa có login guard. Do streaming layout hiện có, HTML có thể HTTP 200 kèm notFound/redirect; không dùng status 200 đơn lẻ để kết luận quyền truy cập.

Nguồn test: `tests/discovery-community-qa.test.cjs`, `tests/discovery-community.test.cjs`, helper `tests/helpers/discovery-loader.cjs`; hai bộ hồi quy `tests/content-restructure.test.cjs`, `tests/content-structure-next.test.cjs`.

Artifacts cục bộ: `C:\Users\ADMIN\AppData\Local\Temp\personal-site-discovery-Eu57mA` — snapshot/hash trước sửa, schema metadata, `browser-responsive.json`, hai screenshot QA, `main-readonly-postflight.json`, manifest thay đổi. Không đưa `.env.local` QA hoặc datadir vào repo/backup công khai. Các schema test được giữ riêng để kiểm tra, không tự dọn.

Chạy lại SQL test chỉ với instance QA đã kiểm chứng và DDL nền riêng:

```powershell
$env:DISCOVERY_QA_ROOT = '<thư mục QA có mysql-data và base-schema.json>'
node --test tests/discovery-community-qa.test.cjs
node --test tests/discovery-community.test.cjs tests/content-restructure.test.cjs tests/content-structure-next.test.cjs
```

Test SQL không nạp `.env`, guard đúng port/datadir và tạo schema `discovery007_test_<timestamp>` mới. `base-schema.json` chỉ chứa SHOW CREATE users/tags, không có dữ liệu. Không dùng test này với datadir chính, không đổi port/guard để trỏ DB thật.

## Còn thiếu và rủi ro liên quan

- Chưa triển khai like/unlike, comment/reply, lưu bài/đọc danh sách đã lưu, gửi/xử lý report hoặc CRUD chủ đề cộng đồng. Bảng/constraints được kiểm thử chưa đồng nghĩa các chức năng này đã hoạt động. Không dựng nút giả.
- Popular đã có truy vấn/snapshot thật; tương tác trong test là fixture SQL tổng hợp. Chưa xác minh xếp hạng bằng tương tác người dùng thật hay load test ở quy mô lớn; LIKE có wildcard đầu chuỗi, cần đánh giá FULLTEXT theo dữ liệu/quy mô sau này.
- Chưa có tổng quota storage/ngày/tài khoản hay housekeeping rate bucket. DB và filesystem không có transaction chung: lỗi sau lưu ảnh có thể để file không tham chiếu. Không tự xóa file cũ/orphan. Cần chốt quota/retention trước mở public rộng rãi.
- Chưa apply 007 trên DB chính; Discovery tại DB chính phải báo chưa khả dụng. SQL 006/Blog và các module được bảo vệ giữ nguyên. Không deploy.

## Trước bước apply riêng sau này (cần chủ dự án duyệt)

1. Xác nhận DB đích, MySQL >=8.0.16, InnoDB/charset/collation và DDL users/tags khớp QA; kiểm bảng community chưa tồn tại. Nếu tồn tại một phần thì dừng.
2. Tạm dừng writer liên quan, kiểm kê số bản ghi/hash nghiệp vụ cũ theo quy trình backup hiện có; tạo backup mã hóa nhất quán và thử restore trên QA riêng. Không ghi bí mật ra log.
3. Runner riêng 007/connection duy nhất, dừng lỗi đầu, rollback DML nếu lỗi. Không gọi init-db, 006, 004 hoặc migration khác. Chỉ chạy sau quyền áp dụng rõ ràng.
4. Postflight 11 bảng, toàn bộ FK/CHECK/UNIQUE/index, 3 topic, marker7; so sánh dữ liệu cũ trước/sau và kiểm auth/private media/CRUD bằng tài khoản thử nghiệm được duyệt. Chưa có dữ liệu cộng đồng thì bài/feed rỗng là hợp lệ.
5. Nếu lỗi, giữ Discovery khóa và bảo toàn dữ liệu/tệp; ưu tiên khôi phục backup vào DB mới để đối chiếu. Không tự drop/truncate hoặc ghi lại lịch sử. Mở writer chỉ khi postflight đạt; deploy vẫn là phê duyệt riêng.

## Discovery Interactions — SQL 007 application revision 2

### Source và chính sách hiện tại

- Like/unlike, lưu/bỏ lưu gửi **trạng thái mong muốn**, không dùng toggle SQL. PK `(user_id,post_id)`, khóa user rồi post và transaction ngăn trùng/race; số đếm đọc trực tiếp từ bảng. Feed, detail, Profile và Account dùng chung SocialBar. Account thêm tab Discovery đã lưu; bài chuyển private/nháp/ẩn/xóa biến mất khỏi danh sách đã lưu cho đến khi được công khai lại.
- Bình luận gốc + trả lời một cấp (hai cấp tổng cộng). DB dùng depth/CHECK và self-FK ba cột có parent depth cố định 1; service cũng kiểm bài/parent. Nonce UNIQUE `(user_id,request_id)` chống gửi trùng khi retry. Sửa/xóa của chủ sở hữu kiểm revision; Admin được ẩn và ghi lịch sử. Nội dung bình luận là text được React escape, không chạy HTML/Markdown.
- Bình luận gốc ẩn kéo theo ẩn nhánh và loại khỏi số đếm. `moderation_hold` tồn tại qua thao tác xóa của tác giả, không thể xóa gốc để đưa trả lời bị giữ ẩn trở lại. Xóa một gốc bình thường giữ tombstone và các trả lời hợp lệ. Body đã ẩn/xóa không được đưa vào props public. Trang bài đọc 10 gốc/trang, 3 preview trả lời/gốc; mở nhánh xem 20 trả lời/trang bằng cursor có chữ ký.
- Báo cáo bài/bình luận: public + published + comment visible; UNIQUE open report và kiểm trùng 24 giờ theo reporter/target. Admin xem hàng đợi/lịch sử, đóng/ẩn/gỡ, bắt buộc ghi chú. Nội dung bị sửa sau khi Admin mở form sẽ bị CAS chặn quyết định ẩn/gỡ cũ. Cập nhật đối tượng, lịch sử và đóng report trong cùng transaction; hai người xử lý đồng thời chỉ một thắng.
- Quyền được đọc lại từ users trong transaction. Cơ chế hạn chế sẵn có là `is_active`; tài khoản khóa không được ghi tương tác, bình luận, báo cáo hoặc giữ chỗ storage, kể cả gửi role Admin giả. Không thêm/chỉnh Auth hoặc tạo cơ chế ban mới.
- Rate 15 phút cho member: 120 thao tác like/save, 20 thao tác bình luận, 5 báo cáo mới; giữ giới hạn bài/upload trước đó. Các lần retry trùng comment/report không tạo bản ghi mới. Admin giữ chính sách miễn rate của Foundation; **không miễn quota storage**.
- Quota **100 MiB/tài khoản, chỉ ảnh Discovery**. Decode/re-encode trước, giữ chỗ đúng tổng byte WebP + thumbnail trước khi ghi đĩa dưới khóa user. Ledger `community_upload_batches` tính cả file giữ lại sau xóa bài, ảnh không tham chiếu và reservation còn dang dở; không tự hoàn quota/xóa file khi lỗi. Manifest phải đúng owner, chưa dùng và khớp bộ ảnh trước khi attach vào bài. Attach rollback cùng post/tag, dung lượng giữ chỗ vẫn bảo toàn. UI thể hiện byte/KiB/MiB, không làm tròn ảnh nhỏ thành 0.
- Private/draft media tiếp tục dùng API có ACL mỗi lần/no-store, không công khai tên storage. SocialBar và Discussion khóa tương tác khi bài không public/published. Không thay route upload/gallery/Auth dùng chung. Server Actions giữ kiểm Origin/CSRF mặc định của Next; không mở allowedOrigins mới.

### SQL nháp và QA

- 007 hiện tạo **13 bảng community**, thêm upload batches và comment events; mở rộng comments/reports. Marker là migration version 7 **và application_revision 2**, chỉ commit cuối script. Schema Foundation cũ thiếu các cột/bảng mới sẽ khóa Discovery, không tự nâng cấp.
- Đây vẫn là draft tạo mới, **không phải script ALTER chạy lại được trên 007 cũ**. QA dùng schema mới từ DDL users/tags, giữ nguyên schema và dữ liệu QA cũ. Nếu một môi trường đã có 007 revision cũ thì phải kiểm kê/backup và thiết kế upgrade riêng; không chạy lại CREATE TABLE, không drop dữ liệu để vượt lỗi.
- Instance test vẫn loopback 3321/datadir `personal-site-discovery-Eu57mA/mysql-data`. Browser build riêng tại `interactions-qa-build`, upload riêng `interactions-uploads`, loopback 3222. Không nạp cấu hình DB chính, không kết nối hoặc ghi DB chính trong đợt này.
- Bước tạo quyền/fixture browser ban đầu bị auto-review từ chối. Sau đó chủ dự án đã phê duyệt rõ: đúng hai tài khoản **website** tổng hợp member/Admin `.invalid` và quyền SELECT/INSERT/UPDATE/DELETE cho **user dịch vụ QA hiện có** chỉ trên schema test mới. Đã thực hiện đúng giới hạn đó; không tạo user MySQL mới, không đổi password của tài khoản có sẵn. Các fixture SQL tự động độc lập tiếp tục dùng dữ liệu tổng hợp của bộ test.

### Kết quả đợt tương tác

- **26/26 MySQL PASS**: gồm 15 ca nền và các ca mới cho flags đồng thời/idempotent/counts, saved/private ACL, nonce, hai cấp được enforce bằng FK/CHECK, comment ownership/CAS/hold, paging replies, report duplicate/Admin/CAS/history/rollback, tài khoản inactive, quota concurrent/thumbnail/replay/foreign owner/retained bytes, Sharp và lỗi disk thật, rollback attachment khi tag lỗi, spam limits.
- **57/57 fixture/action/render/hồi quy PASS**, thêm `tests/discovery-interactions.test.cjs` cho guest, desired state, invalid operation, nonce/confirm, invalidation, lỗi DB được lược bỏ, redirect xác nhận quyết định, XSS comments và không đọc discussion private/draft.
- Lệnh fixture hiện tại: `node --test tests/discovery-interactions.test.cjs tests/discovery-community.test.cjs tests/content-restructure.test.cjs tests/content-structure-next.test.cjs`. Lệnh SQL giữ guard `DISCOVERY_QA_ROOT` ở phần nền, nay chạy 26 ca; mỗi lần tạo schema mới, không nâng cấp/ghi đè schema browser đang dùng.
- TypeScript `--noEmit --incremental false` PASS; production build PASS trên bản sao cô lập bằng dependency hiện có. Không cài/nâng package hoặc đổi cấu hình Next/theme dùng chung.
- Browser dùng auth và MySQL QA thật với hai account được duyệt: tạo bài + ảnh, quota thực tế 2.42 KiB gồm thumbnail; like/unlike/save/unsave và danh sách saved; comment/reply/edit/delete; chuỗi script chỉ là text; whitespace bị server từ chối rồi gửi hợp lệ thành công; báo cáo post/comment và chống gửi trùng; Admin ẩn comment, đóng report, lịch sử có note/handler/time và xác nhận thành công sau khi hàng đợi đổi; Profile cập nhật counts/liked state. Member truy cập trực tiếp `/admin/discovery/reports` nhận trang 404, không thấy dữ liệu hàng đợi.
- **50 tổ hợp responsive PASS**: Feed, detail/discussion, Profile, saved Account và Admin report/history × 1440/1024/768/390/375 × dark/light. DOM không tràn ngang, skeleton không tồn tại sau tải; nav ngang riêng trên Account/Admin là chủ đích. Đây là Chromium/IAB + fixture, không chứng nhận mọi browser/dữ liệu dài/thiết bị.
- HTTP anonymous trên QA: ảnh private và draft 404; title/body/comment private/draft không lộ trong response/feed. Owner xem ảnh private được. Giữ giới hạn streaming HTTP của Foundation; không suy luận quyền chỉ từ status 200.

### Hạn chế và bước áp dụng riêng

- Chưa áp dụng 006/007 lên DB chính, chưa deploy. Trước khi áp dụng phải dùng **13 bảng + marker revision 2** và các constraint/index mới trong postflight, không dùng checklist 11 bảng lịch sử. Vẫn cần duyệt backup mã hóa/restore, bảo trì writer và runner riêng stop-on-first-error; MySQL DDL không rollback toàn bộ.
- Chưa có UI hoàn quota/thu gom file hoặc giải phóng reservation lỗi. Không xóa file/dữ liệu để thử quota; cần quy trình kiểm kê storage được duyệt trước khi hoàn dung lượng. Quota không tính avatar/JourneyStory/Blog vì các module đó giữ nguyên.
- Không thêm khôi phục bình luận đã bị giữ ẩn, kháng nghị, thông báo/email, WebSocket realtime hoặc công cụ chống DDoS. Counts chính xác theo snapshot truy vấn và được tải lại sau thao tác; tab khác cần refresh. Chưa load-test quy mô lớn; giữ các giới hạn feed/search đã nêu ở Foundation.
- Clone browser chỉ có DDL phụ cần cho Discovery/Profile/Auth. Log QA ghi nhận prefetch JourneyStory thiếu `status_updates`; đây là giới hạn dữ liệu/schema của clone QA, chưa tái hiện hay kết luận lỗi trên DB thật. Không sửa/chạy kiểm tra mở rộng JourneyStory để xử lý log này; source JourneyStory giữ hash.
- Evidence mới trong cùng thư mục QA: `interactions-change-manifest.json`, `interactions-baseline-hashes.json`, `interactions-responsive.json` và screenshot tương tác. Snapshot đầu lượt trong temp sandbox không còn truy cập được; manifest đối chiếu source/scripts/package với bản build QA Foundation được giữ từ lượt trước, tài liệu được bảo vệ và 006 với hash lưu trước đó. Mốc so sánh được ghi rõ trong manifest; không suy đoán Git history. Kết quả: **17 file sửa + 11 file mới, không thiếu file hoặc thay đổi source ngoài Discovery**; các module/AGENTS/tài liệu ngoài phạm vi được đối chiếu giữ hash. Không đưa `.env.local`, datadir hay credential fixture vào repo/báo cáo công khai.
- Đã đăng xuất tài khoản browser, khôi phục viewport/theme thử nghiệm và dừng server Next/MySQL QA sau kiểm thử; giữ nguyên các schema/ảnh/fixture để kiểm kê lại, không dọn dữ liệu.

## Vòng đời ảnh và quota — 10/11/2026

Phần này cập nhật trạng thái hiện tại; các số bảng, revision và hạn chế housekeeping ở trên là lịch sử.

### Cơ chế đã triển khai

- SQL 007 planned hiện tạo **14 bảng community**, marker version 7 / **application_revision 3**. Thêm sổ từng file, byte đã hoàn, lease và trạng thái xóa/khôi phục. Đây vẫn là draft CREATE mới, không phải upgrade cho revision 1/2 đã tồn tại; không chạy lại trên schema cũ hoặc DB chính.
- Quota **104857600 byte (100 MiB)** tính ảnh chính WebP đã xử lý và thumbnail; không lưu thêm bản upload thô. Khóa user khi giữ chỗ/hoàn dung lượng; quota tính cả upload lỗi, ảnh gỡ và bài xóa mềm đến khi file đã được xử lý an toàn. Admin không được miễn quota.
- Discovery ghi riêng vào `UPLOAD_DIR/discovery`, không đưa vào public/static. Marker namespace gắn với MySQL server UUID, tên DB và đường dẫn chuẩn của namespace. Không nhận thư mục có sẵn thiếu marker, marker sai DB/root, junction/symlink hoặc tên file không hợp lệ. Không di chuyển hay dọn shared uploads cũ.
- Đăng ký tên UUID, byte và SHA-256 trong MySQL **trước khi ghi file**; ghi exclusive, có lease. Lỗi/rollback không làm mất dấu file; không tự hoàn quota khi trạng thái disk chưa chắc chắn. Batch không có inventory đầy đủ hoặc collision tiếp tục giữ quota và cần kiểm kê riêng.
- Gỡ ảnh khi sửa bài giữ metadata/file **30 ngày**; xóa bài là xóa mềm, giữ file/quota **30 ngày**. Upload không attach có thời gian chờ **48 giờ**. Bài chờ duyệt/ẩn/từ chối, moderation hold hoặc báo cáo mở được giữ lại; không tự xóa ảnh để vượt kiểm duyệt.
- Account có Thùng rác; form sửa bài có danh sách ảnh đã gỡ; Admin có `/admin/discovery/trash`. Khôi phục kiểm ownership/quyền thật, revision, thời hạn và tính toàn vẹn file. Bài khôi phục về **draft**, giữ cờ kiểm duyệt; không tự xuất bản. Admin có thể khôi phục bài quá 30 ngày đang được giữ vì kiểm duyệt/báo cáo, trước khi bắt đầu purge.
- Xóa vĩnh viễn ảnh có fence `purge_started_at`; sau đó không khôi phục. Worker bỏ reference hết hạn trước, chỉ unlink file có inventory và **không còn bất kỳ reference nào**, kể cả thumbnail dùng chung. Chỉ hoàn đúng byte một lần sau unlink thành công hoặc xác nhận ENOENT. Lỗi disk/commit giữ quota để retry sau lease; metadata bài và lịch sử vẫn được giữ, không hard-delete nội dung/audit.
- API main/thumbnail tiếp tục kiểm ACL mỗi request và no-store. Ảnh gỡ, bài deleted/private/draft không phục vụ cho người không có quyền; tên storage không xuất hiện trong UI/API công khai. Namespace riêng không được mở thành static route khi cấu hình reverse proxy/Volume.

### Worker: thủ công, mặc định dry-run

`scripts/discovery-media-cleanup.cjs` không được import từ trang, không có cron hoặc thao tác web tự xóa file. Không chạy trên dữ liệu thật trong đợt này. Ví dụ sau chỉ là mẫu cho môi trường đã được duyệt:

```text
node --env-file=<env-cach-ly-da-kiem-tra> scripts/discovery-media-cleanup.cjs --dry-run --target=<DB_NAME> --storage-root=<UPLOAD_DIR>
node --env-file=<env-cach-ly-da-kiem-tra> scripts/discovery-media-cleanup.cjs --apply --target=<DB_NAME> --storage-root=<UPLOAD_DIR> --limit=50
```

1. Trước apply thật: xin duyệt riêng; kiểm kê revision/DB/Volume/root, backup mã hóa DB và file nhất quán, thử restore trong môi trường cách ly. Không sửa marker để vượt guard. Chuyển DB/Volume/root cần quy trình đối chiếu/rebind được duyệt riêng.
2. Chạy dry-run đúng cấu hình; target phải trùng DB_NAME, storage-root phải trùng UPLOAD_DIR, marker revision 3 đúng DB/root. Limit mặc định 50, tối đa 100. Preview đếm ứng viên **từng pha**; filesReady chưa bao gồm file còn reference sẽ được retire ở pha trước.
3. Rà soát hold/báo cáo và thời hạn trước khi duyệt apply. Worker dùng khóa/lease/fence để phối hợp writer; không tự bỏ hold hoặc rút ngắn retention. Chạy từng batch, xem số lỗi và số byte hoàn; không glob, đệ quy, đổi tên hoặc xóa file không có inventory.
4. Lỗi integrity, collision, file-shaped directory/symlink, batch thiếu inventory hoặc legacy revision cũ: giữ file/quota, kiểm kê và xử lý riêng có phê duyệt. Không đoán rằng file mất reference là được xóa ngay. Không có cron được bật sẵn.

### Bằng chứng kiểm thử đợt này

- **47/47 MySQL + filesystem QA PASS, 0 skip**: quota đồng thời/thumbnail; xóa mềm/Stop cleanup trong retention; khôi phục bài/ảnh và revision/ownership; file dùng chung; rollback post-tag với file thật; upload dang dở/crash; unlink/commit lỗi và retry/idempotent refund; hai worker; báo cáo/kiểm duyệt giữ file; file thiếu/corrupt; junction/symlink; marker sai DB/root/copy marker; CLI dry-run thật; cursor/quyền/nhãn Thùng rác.
- **61/61 fixture/action/render và hồi quy PASS**: gồm kiểm quyền API main/thumb, restore action/redirect/invalidation, dữ liệu private và phân biệt xóa mềm/vĩnh viễn, cùng các hồi quy nội dung/routes sẵn có. Chạy thêm `tests/discovery-lifecycle.test.cjs` bên cạnh các bộ tương tác/Foundation và hai bộ hồi quy đã nêu.
- TypeScript `--noEmit --incremental false` PASS. Production build PASS trên bản sao riêng với cấu hình tổng hợp, DB không kết nối được có chủ đích; không nạp `.env` hoặc upload thật. Build không chứng minh tích hợp với DB chính.
- MySQL 8.0.46 vẫn ở loopback 3321/datadir QA riêng; mỗi lần test tạo schema mới và namespace ảnh riêng. Không kết nối DB chính, không chạy 006/007 trên DB chính, không dọn ảnh thật, không deploy.
- Không chạy lại browser/responsive cho các màn hình khôi phục mới trong đợt này; 50 tổ hợp browser phía trên là bằng chứng của đợt tương tác trước.
- Artifacts: `C:\Users\ADMIN\AppData\Local\Temp\personal-site-discovery-Eu57mA\storage-lifecycle-cpXNil` (snapshot/hash trước sửa, log MySQL/build, manifest thay đổi). Không đưa datadir/env vào repo. Source ngoài Discovery và dependency/config được đối chiếu hash, không lấy Git history làm bằng chứng.
- Manifest đầu lượt đối chiếu 282 file: **17 file sửa + 10 file mới**, không thiếu file hoặc thay đổi ngoài phạm vi. MySQL QA đã dừng an toàn sau khi kiểm lại port/datadir; giữ nguyên fixture/schema/file QA để kiểm kê, không dọn.

### Giới hạn còn lại

- Chưa có migration upgrade từ 007 revision cũ hoặc chuyển file legacy/shared root: cần inventory/backup và kế hoạch riêng, không sửa marker/chạy lại CREATE. Triển khai source revision 3 với schema cũ sẽ fail-closed Discovery.
- Unknown file, reservation thiếu inventory, file corrupt/collision được giữ an toàn, chưa tự giải phóng quota; cần xử lý có kiểm kê. Namespace/marker là guard vận hành, không thay thế phân quyền filesystem/DB và bảo vệ host.
- Chưa bật lịch cleanup, chưa load-test dung lượng lớn hoặc kiểm tra crash mất điện của cả DB/Volume. Quota không tính avatar/Blog/JourneyStory. Các module đó giữ nguyên.

# Blog Foundation / migration 006

Ngày kiểm tra: 09/11/2026. **Chưa áp dụng trên DB chính, chưa deploy.** Quyền chạy migration 005 trước đây không cấp quyền cho 006.

## Trạng thái mã và schema

- SQL: `planned/006_blog_foundation.sql`, MySQL 8.0.16+ / InnoDB / utf8mb4_unicode_ci; không USE, ALTER bảng cũ, DROP hay init-db. Bảng mới: `blog_foundation_state`, `blog_topics`, `blog_post_details`, `blog_review_events`, `content_rate_buckets`.
- Metadata read-only của DB hiện tại khớp PK/FK cần dùng ở users/posts/tags/post_tags; chưa có các bảng Foundation. Tại lần đối chiếu có 0 bài Blog. Không lấy nội dung/tài khoản thật để seed test.
- Backfill chỉ `posts.type='blog'`, giữ draft/published, topic NULL, không sửa ID, slug, tác giả, body, cover, ngày đăng hay tags cũ. Không tạo biên bản duyệt giả cho dữ liệu cũ.
- `blog_foundation_state` có marker `(singleton_id=1,migration_version=6)`, ghi trong cùng transaction với seed/backfill. Runtime kiểm đủ cột và marker: DDL tạo đủ nhưng DML thất bại vẫn không mở chức năng mới.
- Khi chưa sẵn sàng, Blog công khai đọc luồng cũ; Admin vẫn lưu/xuất bản Blog cũ. Chức năng Foundation không có form ghi khả dụng. Xóa Blog ở Admin cũ bị khóa/chuyển sang xác nhận xóa mềm, không hard-delete dữ liệu cũ.

## Luồng đã triển khai

| Khu vực | URL / quy tắc |
|---|---|
| Blog public | `/documents/blog`, `/documents/blog/:slug`; search/q, topic slug, pagination. Chỉ posts.published và workflow published (hoặc bản ghi legacy chưa có sidecar) |
| User | `/account/blog`, `/account/blog/new`, `/account/blog/:id`; yêu cầu đăng nhập, draft/submit và CRUD của chủ sở hữu |
| Admin | `/admin/blog`, `/admin/blog/new`, `/admin/blog/:id`, `/admin/blog/topics`; Admin-only phía server |
| Adapter cũ | `/admin/posts/new?type=blog` và edit Blog chuyển tới editor mới sau 006; action cũ không được bỏ qua revision/workflow. Nhánh Cyber giữ writer gốc |

- User cần chủ đề còn khả dụng khi gửi duyệt. Admin được xuất bản trực tiếp, gồm bài cũ chưa phân loại. Mọi actor được kiểm lại role/is_active trong transaction; không nhận tác giả từ form.
- Sửa bài published đưa posts.status về draft cùng workflow draft/pending; hidden/rejected/deleted cũng không public. Mọi thay đổi nội dung/duyệt/xóa tăng revision; stale revision bị từ chối. Duyệt/từ chối chỉ từ pending; ẩn chỉ từ published. Từ chối cần note.
- Xóa bài/chủ đề là xóa mềm. Topic slug không đổi khi rename và không tái sử dụng sau xóa. FK topic SET NULL bảo vệ bài nếu sau này có thao tác xóa cứng được duyệt riêng. Không tự xóa file hay content.
- Bài, sidecar, tags, quota và review event được ghi cùng transaction. Rate limit 20 lần lưu/gửi và 6 ảnh/User/15 phút; Admin tin cậy không bị quota này. Counter tăng nguyên tử; thao tác vượt ngưỡng rollback.
- Quota lưu/gửi nằm trong transaction bài; quota upload được giữ trong transaction riêng trước giải mã/ghi file để cả lần upload thất bại cũng bị giới hạn. Filesystem không có transaction chung với MySQL; không tự xóa file khi kết quả commit chưa chắc chắn.
- Ảnh tối đa 5MB, JPEG/PNG/WebP thực; Sharp giải mã/giới hạn 24MP, loại ảnh động, xoay và re-encode WebP không metadata trước khi dùng storage UUID hiện có. Không nhận filename từ form. Owner xem được cover draft; người khác/guest không, Admin được kiểm duyệt. Mọi code cấp quyền bổ sung giới hạn `type='blog'`, không nới quyền Cyber/ảnh JourneyStory.

## Bằng chứng MySQL test

- Dùng **mysqld mới** với datadir tạm, bind 127.0.0.1, cổng riêng khác 3306; không dùng DB chính hoặc sao chép dữ liệu thật. Bốn bảng nền tạo từ SHOW CREATE metadata hiện tại; fixture legacy gồm Blog published/draft và một bản ghi kiểu hacking để đối chiếu hash, không chạy Cyber Lab.
- `tests/blog-foundation.mysql.test.cjs` chỉ chạy khi `BLOG_TEST_ISOLATED=1`, port không phải 3306 và @@datadir khớp thư mục Temp được khai báo; tự tạo DB tên `blog006_test_*`. Không load .env, không DROP database/bảng cũ.
- **11/11 đạt trên MySQL 8.0.46**: backfill giữ hash dữ liệu cũ; seed đủ 5; UNIQUE/FK/CHECK; rollback DML; Admin topic CRUD/slug/xóa giữ bài; User ownership/type/role giả; workflow; hai Admin cùng revision chỉ một commit; lỗi tag rollback cả bài/revision; public search/topic/page; 25 lưu đồng thời chỉ 20 commit; marker thiếu khóa ghi; cover ACL.
- Chạy lại trên một instance test mới đã khởi tạo, dùng datadir thực tế của instance đó:

```powershell
$env:BLOG_TEST_ISOLATED='1'
$env:BLOG_TEST_MYSQL_PORT='<cổng test riêng>'
$env:BLOG_TEST_DATADIR='<Temp>/personal-site-blog-foundation-<id>/mysql-data'
# Cùng thư mục cha cần base-schema.json chỉ chứa DDL users/posts/tags/post_tags, không dữ liệu.
node --test tests/blog-foundation.mysql.test.cjs
```

Đây là kiểm thử schema/service thực trên dữ liệu tổng hợp; không chứng minh đã restore backup DB chính, hiệu năng tải lớn hoặc triển khai Railway thành công.

## Trước bước áp dụng DB chính — cần yêu cầu/phê duyệt riêng

1. Xác nhận server/database đích, MySQL version, InnoDB/collation/types/index/FK thực tế, các bảng đích đều chưa tồn tại và không trùng số migration. Nếu có phần 006 dở dang: dừng, không tự chạy lại hoặc sửa lịch sử.
2. Chốt maintenance và dừng writer Blog cũ/mới, kiểm tra không có writer khác tác động dữ liệu cần backfill. FK mới có thể giữ metadata lock trên posts/users dù không ALTER; cần đánh giá cửa sổ bảo trì trước khi thao tác trên hệ thống đang dùng chung.
3. Backup DB + uploads có mã hóa, không log secrets/nội dung; kiểm chứng restore trong MySQL riêng và kiểm tính toàn vẹn. Lấy số bản ghi/fingerprint để so sánh, không in bài viết hay password hash ra log. Chưa thực hiện backup/restore DB chính cho 006 trong lượt này.
4. Chỉ chạy SQL 006 đã duyệt bằng **một connection riêng, stop-on-first-error**; không `init-db`, không `--force`, không bỏ FK checks. DDL auto-commit: lỗi phải dừng, rollback DML còn mở; không hứa ROLLBACK xóa hết schema vừa tạo.
5. Sau apply: đủ 5 chủ đề/slug ổn định, đủ mapping Blog, wrong-type/missing/state mismatch bằng 0; parent rows/slug/cover/body/tags cũ giữ nguyên; đủ FK/UNIQUE/CHECK và marker version 6 đã commit. Thực hiện smoke User/Admin/private-cover trong staging trước mở writer.
6. Chỉ mở writer sau kiểm tra đạt. Không tự deploy. Hoàn tất guard/backup/apply là một bước riêng cần chủ dự án giao tiếp.

## Rollback và giới hạn

- Ưu tiên khóa writer mới/quay về ứng dụng đọc tương thích, **giữ bảng và nội dung mới**. Không DROP/restore đè DB chính để “rollback”; có thể mất bài ghi sau backup. Nếu DDL lỗi, kiểm kê trạng thái rồi xin quyết định xử lý trong phạm vi được duyệt.
- File cover cũ và file mới nếu commit chưa xác định được giữ, không GC tự động. Có thể còn file mồ côi; chưa có quota tổng dung lượng/ngày, autosave, giao diện khôi phục bài xóa mềm hoặc housekeeping counter. Cần yêu cầu riêng trước triển khai công khai quy mô lớn.
- Browser DB test đã chạy Auth thật với tài khoản tổng hợp: draft + cover upload, submit, pending không public/cover guest 404, Admin approve, public detail + cover guest 200, topic create/rename/order/hide giữ slug. Công cụ browser bị treo tại native confirm xóa chủ đề; **không ghi là browser-delete đã pass**. Xóa mềm/không mất bài đã được kiểm bằng service + MySQL thực.
- Không sửa nghiệp vụ Cyber Lab/Simulator/Shop/Discovery/JourneyStory/Auth/Home hoặc dữ liệu thật. `image-access.ts` và adapter Admin chung chỉ có nhánh Blog liên quan, kiểm hồi quy riêng; migration 007/008 chưa chạy hay triển khai.

## Mốc script đã kiểm tra

SHA-256 của `planned/006_blog_foundation.sql`: `7f88d7d633aa598cc2725b53780312815c149d7be0fcd66d58ba8620e4e220de`. Nếu script thay đổi, phải kiểm thử lại trong DB cách ly trước bước áp dụng.

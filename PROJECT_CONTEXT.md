# PERSONAL-SITE — Ngữ cảnh dự án

Ngày lập: **06/11/2026**, múi giờ Asia/Bangkok.

Cập nhật tiến độ gần nhất: **08/11/2026**. Mục 1–9 giữ mốc khảo sát ban đầu; mục 10–11 ghi thay đổi và bằng chứng mới. Mục 11 là trạng thái mới nhất, có ưu tiên khi đối chiếu các ghi nhận lịch sử.

Tài liệu ghi lại khảo sát mã nguồn và đợt kiểm tra chuyên sâu trong chat của chủ dự án. Đây là mốc tham chiếu; phải đọc lại mã liên quan trước mỗi thay đổi. Phiên bản package, schema thực tế và tình trạng lỗi có thể thay đổi sau mốc này.

## 1. Phạm vi và quyết định của chủ dự án

- Dự án là website cá nhân kết hợp chia sẻ ảnh/hành trình, Cyber Lab, blog, tài liệu/dự án, tài khoản cộng đồng và CMS quản trị.
- Chủ dự án sẽ yêu cầu từng bước: **giao diện trước, chức năng sau**. Không tự chọn việc phát triển tiếp theo.
- Lần lập tài liệu này chỉ được tạo `PROJECT_CONTEXT.md` và `AGENTS.md`; không sửa mã ứng dụng, dependency, cấu hình hoặc database; không chạy migration hay sửa các lỗi được liệt kê.
- Trạng thái **OPEN** ở bảng khảo sát là trạng thái lịch sử ngày 06/11/2026; xem mục 10–11 cho các đường lỗi đã được xử lý trong phạm vi nâng cấp sau đó. Ghi nhận lỗi không có nghĩa là được phép tự sửa lỗi đó.
- Đọc [AGENTS.md](AGENTS.md) trước khi thực hiện yêu cầu mới. Chỉ sửa đúng phạm vi yêu cầu, ưu tiên tái sử dụng thành phần hiện có và kiểm tra hồi quy phù hợp.
- Đủ ngữ cảnh để phát triển giao diện trong môi trường phát triển. Chưa có đủ bằng chứng để chứng nhận hệ thống sẵn sàng production; cần giải quyết các rủi ro nghiêm trọng và xác minh database thực tế trước khi công bố các luồng nhạy cảm.

## 2. Công nghệ và cấu hình

Nguồn chính: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `README.md`.

| Thành phần | Trạng thái tại lần kiểm tra |
|---|---|
| Next.js | 15.5.29 đã cài; App Router; khai báo `^15.5.0` |
| React / React DOM | 19.3.1 đã cài; khai báo `^19.0.0` |
| TypeScript | 5.9.3; `strict: true`, `noEmit: true`, `incremental: true`; alias `@/*` → `src/*` |
| CSS | Tailwind CSS 4.3.4; `@tailwindcss/postcss` |
| Database | MySQL qua `mysql2` 3.24.6; SQL yêu cầu MySQL 8.0.16+; không có ORM |
| Session | JWT HS256 qua `jose` 5.10.0 |
| Mật khẩu | Node.js `scrypt`, salt ngẫu nhiên, so sánh `timingSafeEqual` |
| Markdown | `react-markdown` 9.x, `remark-gfm` 4.x |
| Email | Nodemailer 6.10.1 |
| Ảnh | Sharp 0.33.5; đã nạp được thư viện native |
| Môi trường kiểm tra | Windows/PowerShell; Node.js 24.14.1; npm 11.11.0 |

Dependency trực tiếp đã cài khớp lockfile tại thời điểm kiểm tra. Không suy ra từ đó rằng toàn bộ dependency bắc cầu không có lỗ hổng.

Các script hiện có:

| Script | Mục đích | Tác động cần nhớ |
|---|---|---|
| `npm run dev` | Next development server | Ghi output/cache; yêu cầu trang có thể đọc hoặc ghi DB tùy luồng |
| `npm run build` | Next production build | Ghi `.next`; có thể đọc dữ liệu khi prerender; cần tải Google Fonts |
| `npm run start` | Chạy bản build | Phục vụ ứng dụng với các khả năng ghi dữ liệu hiện có |
| `npm run init-db` | Tạo database và áp dụng SQL | **Ghi schema/dữ liệu; không chạy nếu chưa được yêu cầu cụ thể** |
| `npm run create-admin` | Tạo/nâng quyền admin | **Ghi tài khoản/quyền; không dùng làm bước kiểm tra** |

Tại mốc khảo sát chưa có script lint, test hoặc typecheck riêng, chưa thấy bộ test/CI. Sau đó đã bổ sung các test nêu ở mục 10, không đổi package scripts/dependencies. Kiểm tra TypeScript không ghi output bằng:

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

`next.config.mjs` đặt `serverExternalPackages` cho Sharp và Nodemailer; giới hạn tổng request Server Action là `25mb`.

Tên cấu hình môi trường cần biết, **không lưu giá trị**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`, `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Code còn hỗ trợ `UPLOAD_DIR`, `FACEBOOK_API_VERSION`. Không mở/dump `.env.local` để đọc hoặc báo cáo bí mật.

## 3. Kiến trúc và cấu trúc thư mục

```text
personal-site/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx, page.tsx, globals.css
│  │  ├─ robots.ts, sitemap.ts
│  │  ├─ (auth)/       Trang và action xác thực
│  │  ├─ (light)/      Discovery, Documents, tài khoản, trang thông tin
│  │  ├─ (dark)/       Cyber Lab
│  │  ├─ admin/        CMS, kiểm duyệt, người dùng, action quản trị
│  │  ├─ api/          OAuth, xem/tải tài liệu, tải ảnh
│  │  └─ uploads/[file]/route.ts
│  ├─ components/
│  │  ├─ site/         Shell, header/footer, card, article, ảnh, tài liệu
│  │  ├─ home/         Các khu vực trang chủ
│  │  ├─ auth/         Form và khung xác thực
│  │  ├─ admin/        UI và form quản trị
│  │  └─ ui/kit.tsx    Thành phần và class dùng chung
│  └─ lib/             Nghiệp vụ, SQL, auth, upload, tiện ích
├─ sql/                001 → 004: schema mục tiêu và dữ liệu khởi tạo
├─ scripts/            init-db.mjs, create-admin.mjs
├─ uploads/            Ảnh; tài liệu trong documents/
├─ package.json, package-lock.json
├─ next.config.mjs, tsconfig.json, postcss.config.mjs
├─ README.md
├─ PROJECT_CONTEXT.md
└─ AGENTS.md
```

Kiến trúc full-stack trong một ứng dụng Next.js:

1. Browser truy cập App Router.
2. Server Component đọc MySQL qua hàm trong `src/lib` và dựng giao diện.
3. Form gọi Server Action; action kiểm tra user/quyền/đầu vào rồi ghi DB hoặc filesystem.
4. `revalidatePath()` và/hoặc redirect cập nhật giao diện sau thao tác.
5. Route Handler phục vụ OAuth hoặc nội dung file với kiểm tra riêng.

Không có backend độc lập, ORM hoặc REST API bao phủ toàn bộ nghiệp vụ. SQL dùng pool chung trong `src/lib/db.ts`; nhiều hàm `lib` dựa vào caller kiểm tra quyền. Không có Redux/Zustand/global client store; bộ lọc/phân trang dùng URL, auth form dùng `useActionState`, tương tác nhỏ dùng `useState`.

Các route group `(auth)`, `(light)`, `(dark)` không xuất hiện trong URL. Nhiều trang khai báo `force-dynamic`; không suy luận rằng mọi đường cache đều đã được kiểm chứng.

### Bản đồ route và tính năng

| Khu vực | Route chính | Hiện trạng theo code |
|---|---|---|
| Home | `/` | Hero, CTA, social, giới thiệu; bật/tắt và đổi thứ tự 6 khu vực |
| Discovery | `/discovery`, `/explore`, `/trending`, `/journeys`, `/albums`, `/locations`, `/tags/[slug]` dưới `/discovery` | Danh sách, lọc, phân trang một số trang, album/hành trình/status, ảnh liên quan |
| Chi tiết ảnh | `/discovery/photos/[id]` | Thích, lưu, bình luận, báo cáo, chia sẻ, thêm bộ sưu tập, tải nếu được phép |
| Cyber Lab | `/cyber-lab`, `/cyber-lab/[section]`, `/cyber-lab/articles/[slug]` | Markdown, chuyên mục, article/tutorial/tool/lab/research, mục lục, bookmark |
| Documents | `/documents`, `/documents/blog`, `/documents/blog/[slug]`, `/documents/resources`, `/documents/resources/[id]`, `/documents/projects` | Blog; thông tin tài liệu/dự án, lọc, bookmark, tải file, xem PDF |
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password` | Email/mật khẩu, Google/Facebook tùy cấu hình, khôi phục mật khẩu |
| Tài khoản | `/account`, `/account/saved`, `/account/collections`, `/account/collections/[id]`, `/account/comments`, `/account/notifications`, `/account/security`, `/account/content` | Hồ sơ/avatar, nội dung đã lưu, bộ sưu tập, bình luận, thông báo, mật khẩu, gửi/xóa ảnh của mình |
| Hồ sơ công khai | `/profile/[id]` | Thông tin, ảnh đã đăng, số theo dõi và thao tác theo dõi |
| Shop | `/shop` | Coming soon, lưu email waitlist; chưa có giao dịch |
| Thông tin | `/about`, `/contact`, `/search`, `/privacy`, `/terms` | Cấu hình giới thiệu/liên hệ, tìm kiếm tổng hợp, hai trang pháp lý mẫu |
| Quản trị | `/admin`, `/admin/home`, `/admin/photos`, `/admin/trips`, `/admin/albums`, `/admin/status`, `/admin/posts`, `/admin/posts/new`, `/admin/posts/[id]`, `/admin/documents`, `/admin/users`, `/admin/moderation`, `/admin/reports`, `/admin/comments`, `/admin/logs`, `/admin/waitlist` | CMS và công cụ quản trị có kiểm tra quyền theo trang/action |

`/admin/login` chuyển về trang đăng nhập chung. Redirect tương thích cũ trong `next.config.mjs`: `/hacking` → `/cyber-lab`, `/hacking/:slug` → bài Cyber Lab, `/document` → `/documents`, `/document/:slug` → blog, `/shopping` → `/shop`, `/discovery/<UUID>` → chi tiết ảnh mới.

Sáu Route Handler:

- `src/app/api/auth/[provider]/start/route.ts`
- `src/app/api/auth/[provider]/callback/route.ts`
- `src/app/api/documents/[id]/view/route.ts`
- `src/app/api/documents/[id]/download/route.ts`
- `src/app/api/photos/[id]/download/route.ts`
- `src/app/uploads/[file]/route.ts`

Chưa hoàn thiện/chưa có: Shop giao dịch; bản đồ địa điểm; phiên bản/đánh giá tài liệu; thành viên gửi tài liệu; bình luận bài viết; trang xem bộ sưu tập công khai dù đã có `is_public`; nút bookmark cho blog tương đương Cyber Lab. Contact chỉ là email/social, không có form gửi tin. Waitlist mới lưu email và hiển thị cho admin, chưa tự gửi thông báo mở bán.

## 4. Luồng nghiệp vụ và quyền

### Xác thực và session

- `src/app/(auth)/actions.ts`: đăng ký, đăng nhập, đăng xuất, yêu cầu/reset mật khẩu.
- `src/lib/password.ts`: hash `scrypt` có salt; tham số phải đồng bộ với `scripts/create-admin.mjs` nếu một yêu cầu sau này thay đổi thuật toán.
- `src/lib/auth.ts`: `createSession()` ký JWT HS256, subject là user ID, hết hạn 7 ngày; cookie `session` có `HttpOnly`, `SameSite=Lax`, `Secure` ở production.
- `getCurrentUser()` đọc lại user/role/`is_active` từ DB; khóa tài khoản và đổi role có hiệu lực ở lần kiểm tra mới. `React.cache` dùng để tránh đọc lặp trong cùng ngữ cảnh render, không phải kho session thu hồi được.
- `src/lib/ratelimit.ts`: ngưỡng đăng nhập sai 5/email, 20/IP trong 15 phút. IP lấy từ forwarded headers; độ tin cậy phụ thuộc proxy triển khai, chưa kiểm chứng.
- `src/lib/password-reset.ts`: token ngẫu nhiên, DB chỉ giữ SHA-256, hạn một giờ; giới hạn yêu cầu theo tài khoản. Việc tiêu thụ token chưa nguyên tử.
- `src/lib/mail.ts`: SMTP; khi thiếu SMTP sẽ in nội dung email/reset link ra terminal. Không thử luồng này với bí mật thật khi audit.
- Tại mốc khảo sát, `src/lib/oauth.ts` và API auth tạo/check state cookie, đổi code lấy profile, `loginWithOAuth()` tự liên kết Google theo email đã xác minh. Hành vi tự liên kết này đã được thay trong đợt nâng cấp sau; xem mục 10. Email local vẫn chưa có bước xác minh.

### Ma trận quyền hiện có

Nguồn quyết định: `src/lib/permissions.ts`; không mở rộng quyền dựa trên nhãn UI.

| Role | Quyền trong ma trận |
|---|---|
| `member` | Không có quyền quản trị/gửi ảnh trong ma trận; vẫn dùng các thao tác thành viên được action cho phép |
| `contributor` | `content.submit` |
| `moderator` | `content.submit`, `admin.access`, `moderation.review`, `comment.moderate`, `report.handle` |
| `admin` | Tất cả 9 quyền, gồm `content.manage`, `users.manage`, `settings.manage`, `logs.view` |

`requireUser()`, `requirePermission()`, `requireAdmin()` nằm trong `auth.ts`. `requireAdmin()` hiện yêu cầu `content.manage`. Mỗi Server Action nhạy cảm phải tự kiểm tra quyền; layout/ẩn menu không thay thế kiểm tra server.

### Ảnh và cộng đồng

- Form → action Discovery → kiểm tra user và ảnh `published` → SQL thích/lưu/bình luận/report/bộ sưu tập → thông báo nếu có → revalidate.
- `src/app/(light)/account/actions.ts::submitPhotoAction()` yêu cầu `content.submit`, xác nhận quyền sử dụng ảnh; tối đa 10 ảnh, 8 MiB/ảnh, luôn tạo `pending`.
- `src/app/admin/discovery-actions.ts::uploadPhotosAction()` yêu cầu `content.manage`; tối đa 20 ảnh, 8 MiB/ảnh; có thể tạo `published` hoặc `draft`.
- `saveImageSet()` lưu ảnh gốc, tạo WebP thumbnail 640px và medium 1800px nếu Sharp xử lý được. Tên UUID; trạng thái và thông tin nằm trong `photos`, quan hệ nằm trong bảng nối.
- Kiểm duyệt gọi `reviewPhotoAction()` → `setPhotoStatus()` → notification/log. Chưa có điều kiện chuyển trạng thái theo phiên bản hoặc `WHERE status = 'pending'` để ngăn quyết định cũ ghi đè quyết định mới.
- Xóa ảnh của mình kiểm tra `uploaderId`; xóa bình luận kiểm tra chủ sở hữu hoặc staff. Các bảng nối chính dùng FK cascade; xóa file xảy ra ngoài transaction DB.

### Bài viết và tài liệu

- Admin form → action có quyền → ghi `posts`, tags/quan hệ, ảnh bìa → revalidate. Public page chỉ lấy bài published theo type và slug; render Markdown, tăng lượt xem.
- Documents lưu file trong `uploads/documents`, không qua route ảnh công khai. `canAccessDocument()` cho owner/admin, hoặc tài liệu published public, hoặc published members khi đã đăng nhập.
- Download kiểm tra thêm `can_download` (owner/admin được ngoại lệ), đọc file, tăng lượt tải; view chỉ hỗ trợ PDF, có `sandbox` CSP và `private, no-store`.
- Metadata tài liệu chưa dùng cùng kiểm tra quyền cho description; xem phát hiện SEC-06.

**GET không đồng nghĩa read-only:** trang bài viết tăng view, trang thông báo đánh dấu đã đọc, API download tài liệu tăng download count. Không gọi các luồng này trên dữ liệu thật trong đợt audit chỉ đọc.

## 5. Database mục tiêu

### Nguồn schema và tình trạng xác minh

- `sql/001_home_settings.sql`: settings singleton và dữ liệu mặc định.
- `sql/002_users.sql`: user, identity, login attempts.
- `sql/003_content.sql`: ảnh/hành trình/status/tương tác, bài viết/tags, tài liệu, waitlist.
- `sql/004_blueprint.sql`: mở rộng role/hồ sơ/settings; chuyển ảnh sang status; album, cộng đồng, reset token, bookmark; bổ sung trường bài viết/tài liệu.
- `scripts/init-db.mjs`: tự tạo database và bảng `schema_migrations`, chạy file theo tên, ghi lịch sử. **Có lỗi DB-01; không chạy để thử xem DB đã đồng bộ hay chưa.**
- Schema mục tiêu sau đủ 4 file có **27 bảng nghiệp vụ, 177 cột, 31 FK** theo phép đối chiếu tĩnh. `schema_migrations` là bảng bổ sung do script tạo, không nằm trong 27 bảng trên.
- Chưa đọc được schema thực tế: MySQL đã trả `ER_ACCESS_DENIED_ERROR` ở lần thử kết nối. Chưa xác minh các migration đã chạy, index/constraint thực tế, collation, SQL mode, timezone hoặc dữ liệu mồ côi.
- Tên cột/bảng dưới đây là bản đồ; **kiểu, độ dài, NULL/default và DDL chính xác phải đối chiếu các file SQL nguồn** trước khi sửa. Không coi nội dung mô tả này là migration có thể chạy.

### Danh mục đầy đủ các bảng và cột mục tiêu

| Bảng | Cột sau migration 004 | Khóa và quan hệ chính |
|---|---|---|
| `home_settings` | `id`, `site_name`, `badge_text`, `hero_title`, `hero_subtitle`, `cta_label`, `cta_href`, `hero_image`, `instagram_url`, `x_url`, `facebook_url`, `updated_at`, `about_text`, `contact_email` | PK `id`; CHECK `id = 1` |
| `home_sections` | `section_key`, `is_enabled`, `sort_order` | PK `section_key` |
| `users` | `id`, `email`, `password_hash`, `first_name`, `last_name`, `avatar_url`, `bio`, `role`, `is_active`, `created_at`, `last_login_at` | PK `id`; UNIQUE email |
| `user_identities` | `provider`, `provider_user_id`, `user_id`, `created_at` | PK `(provider, provider_user_id)`; FK user CASCADE |
| `login_attempts` | `id`, `email`, `ip`, `created_at` | PK auto-increment `id`; index `(email, created_at)`, `(ip, created_at)` |
| `trips` | `id`, `title`, `slug`, `description`, `location_name`, `start_date`, `end_date`, `created_at`, `is_featured`, `cover_photo_id` | PK `id`; UNIQUE slug; cover → photos SET NULL |
| `photos` | `id`, `trip_id`, `uploader_id`, `image_file`, `title`, `caption`, `location_name`, `taken_at`, `allow_download`, `created_at`, `thumb_file`, `medium_file`, `width`, `height`, `status`, `review_note` | PK `id`; trip SET NULL; uploader → users, mặc định RESTRICT/NO ACTION |
| `status_updates` | `id`, `trip_id`, `author_id`, `content`, `created_at` | PK `id`; trip SET NULL; author → users, mặc định RESTRICT/NO ACTION |
| `photo_likes` | `user_id`, `photo_id`, `created_at` | PK `(user_id, photo_id)`; cả hai FK CASCADE |
| `saved_photos` | `user_id`, `photo_id`, `saved_at` | PK `(user_id, photo_id)`; cả hai FK CASCADE |
| `comments` | `id`, `photo_id`, `user_id`, `content`, `is_hidden`, `created_at` | PK `id`; photo/user CASCADE |
| `posts` | `id`, `type`, `title`, `slug`, `summary`, `content`, `cover_file`, `difficulty`, `read_minutes`, `status`, `author_id`, `view_count`, `published_at`, `created_at`, `updated_at`, `category`, `section` | PK `id`; UNIQUE `(type, slug)`; author → users, mặc định RESTRICT/NO ACTION |
| `tags` | `id`, `name`, `slug` | PK auto-increment `id`; UNIQUE slug; dùng chung cho ảnh và bài viết |
| `post_tags` | `post_id`, `tag_id` | PK `(post_id, tag_id)`; cả hai FK CASCADE |
| `documents` | `id`, `kind`, `title`, `description`, `stored_file`, `original_name`, `file_ext`, `file_size`, `download_count`, `is_published`, `uploader_id`, `created_at`, `access`, `can_download`, `is_featured`, `category` | PK `id`; uploader → users, mặc định RESTRICT/NO ACTION |
| `waitlist` | `id`, `email`, `created_at` | PK auto-increment `id`; UNIQUE email |
| `albums` | `id`, `title`, `slug`, `description`, `trip_id`, `cover_photo_id`, `is_published`, `created_at` | PK `id`; UNIQUE slug; trip/cover SET NULL |
| `album_photos` | `album_id`, `photo_id`, `sort_order` | PK `(album_id, photo_id)`; cả hai FK CASCADE |
| `photo_tags` | `photo_id`, `tag_id` | PK `(photo_id, tag_id)`; cả hai FK CASCADE |
| `collections` | `id`, `user_id`, `name`, `is_public`, `created_at` | PK `id`; owner → users CASCADE |
| `collection_photos` | `collection_id`, `photo_id`, `added_at` | PK `(collection_id, photo_id)`; cả hai FK CASCADE |
| `follows` | `follower_id`, `followed_id`, `created_at` | PK `(follower_id, followed_id)`; cả hai user FK CASCADE |
| `reports` | `id`, `reporter_id`, `target_type`, `target_id`, `reason`, `status`, `handled_by`, `created_at` | PK `id`; reporter → users CASCADE; target và handled_by không có FK |
| `notifications` | `id`, `user_id`, `type`, `message`, `link`, `is_read`, `created_at` | PK `id`; user CASCADE |
| `activity_logs` | `id`, `user_id`, `action`, `target_type`, `target_id`, `detail`, `ip`, `created_at` | PK auto-increment `id`; không có FK để giữ lịch sử độc lập |
| `password_reset_tokens` | `id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at` | PK `id`; UNIQUE token_hash; user CASCADE |
| `bookmarks` | `user_id`, `target_type`, `target_id`, `created_at` | PK `(user_id, target_type, target_id)`; user CASCADE; target không có FK |

Quy ước dữ liệu quan trọng:

- Phần lớn ID nghiệp vụ là `CHAR(36)`; ID tags `INT UNSIGNED`; id attempts/logs `BIGINT UNSIGNED`; một số cờ dùng `TINYINT(1)`. Không giả định TypeScript runtime tự kiểm tra kiểu/UUID/enum.
- `users.password_hash` có thể NULL với tài khoản OAuth; chưa có cột xác minh email local, session version hoặc thời điểm thu hồi phiên.
- `photos.status`: `draft`, `pending`, `published`, `rejected`, `archived`; public list chỉ dùng `published`. `photos.is_published` đã bị DROP ở migration 004; không đưa cột cũ trở lại trong query mới.
- `posts.type`: `hacking` hoặc `blog`; `status`: `draft` hoặc `published`; `difficulty`: `beginner`, `intermediate`, `advanced` hoặc NULL; `section`: `article`, `tutorial`, `tool`, `lab`, `research`. Tên lưu DB `hacking` vẫn dùng dù URL/UI là Cyber Lab.
- `documents.kind`: `document`, `project`, `resource`; `access`: `public`, `members`, `private`. Published và quyền tải là các điều kiện khác nhau.
- `reports.target_type`: `photo`, `comment`; status `open`, `resolved`, `dismissed`. `bookmarks.target_type`: `document`, `post`.
- `trips` và `photos` có quan hệ hai chiều qua `trip_id` và `cover_photo_id`; không tự suy diễn một ảnh bìa bắt buộc thuộc cùng trip từ FK hiện tại.
- File ảnh/file tài liệu nằm trên ổ đĩa, không nằm trong transaction SQL. Cần sao lưu đồng bộ DB và storage khi có yêu cầu vận hành.

Index khai báo ngoài PK/UNIQUE: `user_identities(user_id)`; `login_attempts(email, created_at)` và `(ip, created_at)`; `photos(trip_id)`, `(created_at)`, `(status, created_at)`; `status_updates(created_at)`; `photo_likes(photo_id)`; `saved_photos(photo_id)`; `comments(photo_id, created_at)` và `(user_id, created_at)`; `posts(type, status, published_at)`; `documents(is_published, created_at)`; `album_photos(photo_id)`; `photo_tags(tag_id)`; `collections(user_id)`; `collection_photos(photo_id)`; `follows(followed_id)`; `reports(status, created_at)`; `notifications(user_id, is_read, created_at)`; `activity_logs(created_at)`; `password_reset_tokens(user_id, created_at)`. InnoDB có thể tạo thêm index phục vụ FK; chưa kiểm kê instance thật.

## 6. Giao diện và vùng ảnh hưởng

- Design tokens trong `src/app/globals.css`: navy `#172D46`, navy deep `#0F2033`, cream `#F4F1EA`, gold `#B58B57`; light/dark qua CSS variables và `data-theme`.
- Font khai báo tại `src/app/layout.tsx`: Inter, Playfair Display, DM Serif Display, JetBrains Mono qua `next/font/google`.
- `SiteShell` kết hợp `SiteHeader`, `main`, `SiteFooter` cho light/dark. Home có header/hero riêng nhưng dùng `NAV` chung. Auth có `AuthShell`; admin có layout/sidebar và UI riêng.
- Component dùng chung: `ui/kit.tsx`, `site/PhotoTile.tsx`/`PhotoGrid`, `Cards.tsx`, `DocRow.tsx`, `PostCard.tsx`, `PostArticle.tsx`, `Markdown.tsx`, icon, `ConfirmButton`, `ShareButton`.
- Responsive theo breakpoint Tailwind; menu mobile dùng details, một số sidebar dùng cuộn ngang, ảnh dùng CSS columns. Có label/aria/focus-visible/reduced-motion nhưng chưa audit accessibility bằng trình duyệt.
- Metadata/SEO: root metadata, metadata chi tiết, robots, sitemap; sitemap giới hạn tối đa 500 mục cho một số nhóm.
- Sửa token/font/kit/shell có thể lan tới nhiều trang. Sửa dữ liệu Photo/Post/Document có thể lan tới Home, search, account, admin và sitemap. Phải liệt kê caller liên quan trước khi thay đổi các hợp đồng này.

## 7. Danh sách phát hiện chưa xử lý

Trạng thái chung ngày 06/11/2026: **OPEN**. Mức độ phục vụ ưu tiên, không tự cấp quyền sửa. Không có lỗi Critical đã được xác định trong phạm vi khảo sát; không coi đây là chứng nhận không có lỗi Critical.

Phân biệt bằng chứng:

- **Code:** xác nhận đường xử lý trong mã; chưa chạy end-to-end.
- **Mock/bộ nhớ:** chạy hàm thật với DB/filesystem/provider giả, dữ liệu tổng hợp; không phải khai thác trên hệ thống thật.
- **Có điều kiện:** ảnh hưởng cần thêm điều kiện triển khai hoặc hành vi người dùng.
- **Chưa kiểm tra:** chưa có kết quả để kết luận.

### Bảo mật

| ID | Mức | Phát hiện và bằng chứng | File/hàm |
|---|---|---|---|
| SEC-01 | High | Route ảnh chỉ kiểm tra tên file, không kiểm tra user/status/allowDownload; mock nhận 200 không auth. Biết URL có thể đọc ảnh chưa duyệt hoặc ảnh gốc; public immutable cache một năm làm thu hồi khó hơn. Truy vấn ảnh bìa được chọn trực tiếp cũng thiếu điều kiện published. | `src/app/uploads/[file]/route.ts::GET`, `src/lib/discovery.ts::TRIP_SELECT/ALBUM_SELECT` |
| SEC-02 | High, có điều kiện | Local registration chưa xác minh email. Nếu người khác đăng ký trước email của chủ Google, lần liên kết Google tự động giữ mật khẩu local cũ. Mock xác nhận identity được liên kết và mật khẩu cũ giữ nguyên; chưa chạy provider thật. | `src/app/(auth)/actions.ts::registerAction`, `src/lib/users.ts::loginWithOAuth` |
| SEC-03 | High | Đổi/reset mật khẩu không thu hồi JWT cũ; logout chỉ xóa cookie của caller. Mock xác nhận token vẫn hợp lệ sau đổi hash; khóa tài khoản vẫn chặn phiên như thiết kế. Reset token đã cấp cũng chưa được hủy trong luồng đổi mật khẩu thông thường. | `src/lib/auth.ts`, `src/lib/users.ts::setPasswordHash`, `src/app/(light)/account/actions.ts::changePasswordAction`, `src/lib/password-reset.ts` |
| SEC-04 | Medium | SELECT token → UPDATE password → UPDATE used_at không có transaction/khóa; hai consume đồng thời cùng thành công trong mock. Chưa đo race trên MySQL thật. | `src/lib/password-reset.ts::consumeResetToken` |
| SEC-05 | Medium | `safeNext()` bỏ sót ký tự điều khiển. Đường dẫn chứa tab được chấp nhận nhưng `new URL(next, appUrl())` chuẩn hóa thành origin ngoài. Đã xác minh bằng hàm thật và URL parser; chưa chạy OAuth end-to-end. | `src/lib/url.ts::safeNext`, `src/app/api/auth/[provider]/callback/route.ts` |
| SEC-06 | Medium, cần xác minh HTTP | Hàm metadata che title nhưng vẫn trả description của tài liệu private/unpublished. Đã tái hiện cấp hàm; chưa chứng minh nội dung được xuất qua HTTP khi page gọi notFound. | `src/app/(light)/documents/resources/[id]/page.tsx::generateMetadata` |
| SEC-07 | Medium, rủi ro lạm dụng | Chưa thấy giới hạn tương đương login/comment cho đăng ký, waitlist, report, tạo collection; reset action hash password trước khi kiểm tra token. Chưa load test. | Các action auth/shop/discovery/account, `src/lib/ratelimit.ts` |
| SEC-08 | Medium, có điều kiện | Thiếu SMTP sẽ in nội dung email/reset link, không chỉ giới hạn ở development. Chưa kiểm tra cấu hình/log thật. | `src/lib/mail.ts::sendMail` |
| SEC-09 | Advisory High ở dependency; khai thác trên app chưa xác minh | Nodemailer 6.10.1 thuộc dải bị ảnh hưởng bởi advisory DoS addressparser. Không kết luận ứng dụng khai thác được chỉ từ version; đầu vào và cấu hình thực tế còn cần đối chiếu. Không chạy PoC làm sập tiến trình. | `package-lock.json`, `src/lib/mail.ts`; [advisory của maintainer](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-rcmh-qjqh-p98v) |

### Database, logic và tính ổn định

| ID | Mức | Phát hiện và bằng chứng | File/hàm |
|---|---|---|---|
| DB-01 | High | Gửi nguyên file SQL nhiều statement; gặp lỗi duplicate column/key có thể ghi migration hoàn tất trong khi phần sau chưa chạy. Mock xác nhận SQL lỗi nhưng migration vẫn được ghi nhận. Không biết instance thật có bị lệch hay không. | `scripts/init-db.mjs` |
| DATA-01 | High về toàn vẹn dữ liệu khi lỗi | Thay ảnh hero/cover xóa file cũ trước khi cập nhật DB; ghi DB thất bại có thể làm mất ảnh đang tham chiếu. Upload lưu file trước khi ghi DB có thể để lại file mồ côi. Chưa có giao dịch chung DB/filesystem. | `src/app/admin/actions.ts::saveHomeAction`, `post-actions.ts::savePostAction`, `document-actions.ts`, account/discovery upload actions |
| DATA-02 | Medium | Thay quan hệ album xóa trước thêm sau, không transaction. Mock lỗi FK ở bước thêm xác nhận liên kết cũ mất. Tags và các cập nhật nhiều bước khác cũng cần đánh giá ranh giới giao dịch. | `src/lib/discovery.ts::setPhotoAlbums`, `src/lib/tags.ts::setPhotoTags`, `src/lib/posts.ts::setTags` |
| DATA-03 | Medium, rủi ro đồng thời | Check-then-insert report không có unique cho điều kiện report open; tạo slug/account/identity và toggle nhiều statement có thể đụng nhau. Kiểm duyệt không kiểm tra trạng thái cũ khi UPDATE. Chưa tái hiện trên DB thật. | `src/lib/community.ts`, `src/lib/posts.ts`, `src/lib/users.ts`, `src/lib/discovery.ts::setPhotoStatus`, admin `reviewPhotoAction` |
| DATA-04 | Low/Medium, theo chính sách giữ dữ liệu | Target đa hình của bookmark/report không có FK; report.handled_by không có FK; log giữ tham chiếu mềm. Cần quy định dọn hoặc lưu lịch sử khi đối tượng bị xóa. Đây là thiếu bảo đảm tham chiếu, chưa xác nhận có dữ liệu mồ côi thật. | `sql/004_blueprint.sql`, các hàm delete và bookmark/report |
| LOGIC-01 | Medium | File có magic JPEG nhưng không giải mã được vẫn lưu và trả thành công do bắt lỗi Sharp rồi trả fallback. Đã tái hiện trong bộ nhớ với file giả. | `src/lib/uploads.ts::saveImageSet` |
| LOGIC-02 | Medium | Chỉ lấy 50 thông báo nhưng đánh dấu mọi thông báo chưa đọc; GET trang có side effect. | `src/app/(light)/account/notifications/page.tsx`, `src/lib/notifications.ts::markAllRead` |
| LOGIC-03 | Medium | Tìm kiếm/chuyên mục tại Cyber Lab chuyển tới tutorials nên bỏ sót tool/lab/research/article. | `src/app/(dark)/cyber-lab/page.tsx`, `[section]/page.tsx` |
| LOGIC-04 | Medium | Danh sách kiểm duyệt 50, admin documents mặc định 100, album/journey/collection detail 100, saved photos 60: thiếu phân trang ở các danh sách tương ứng, có thể không tiếp cận được phần vượt giới hạn. | Các page tương ứng, `src/lib/documents.ts::listDocuments` |
| LOGIC-05 | Medium | UI cho admin chọn tối đa 20 ảnh × 8 MiB và contributor 10 ảnh × 8 MiB, nhưng body Server Action tổng chỉ 25mb; có thể bị từ chối trước validation nghiệp vụ. | `next.config.mjs`, admin/account upload actions và forms |
| LOGIC-06 | Low | `saveAvatar()` giữ medium không dùng; thay/xóa avatar chưa dọn file cũ. Mock trước đó xác nhận medium còn lại. | `src/lib/uploads.ts::saveAvatar`, account `updateProfileAction` |
| LOGIC-07 | Low | ID mục lục trùng khi heading trùng; heading có link được slug hóa khác giữa extract và render. Đã tái hiện bằng dữ liệu giả. | `src/lib/toc.ts::extractToc`, `src/components/Markdown.tsx` |
| LOGIC-08 | Low, rủi ro cache | refreshPosts/refreshDocs còn revalidate `/hacking`, `/document`; route mới dùng `/cyber-lab`, `/documents`. Chưa tái hiện stale cache; nhiều trang hiện force-dynamic. | `src/app/admin/post-actions.ts`, `document-actions.ts` |
| LOGIC-09 | Low | Dashboard ghi “Ảnh đã đăng” nhưng đếm mọi trạng thái; số “Thành viên” chỉ tính role member; dashboard moderator vẫn có link tới một số trang không có quyền. Trang đích có guard, chưa thấy bypass quyền từ các link này. | `src/lib/admin-stats.ts::getStats`, `src/app/admin/page.tsx` |
| UI-01 | Chưa xác minh, rủi ro responsive | Header nhiều mục cùng hiện từ md; form admin ảnh hẹp; form từ chối có min-width 260px. Chưa đo trên browser/mobile. | `SiteHeader.tsx`, admin photos/moderation pages |
| PERF-01 | Chưa đo, rủi ro hiệu năng | Correlated count trong listPhotos; truy vấn bổ sung theo item ở admin/saved; pool 10 kết nối mỗi process; search LIKE và lọc/sort theo biểu thức cần đo với dữ liệu thật. | `src/lib/discovery.ts`, admin photos/trips, account saved, `src/lib/db.ts` |
| OPS-01 | Có điều kiện triển khai | Build cần truy cập Google Fonts; uploads cần storage bền vững; catch/fallback một số nơi che lỗi DB; thiếu error/loading boundary riêng. Không xác minh hosting/backup/monitoring thực tế. | root layout, `uploads.ts`, `settings.ts`, home Sections, app route tree |

Ưu tiên khi có yêu cầu sửa riêng: SEC-01/02/03 và DB-01/DATA-01 trước production; sau đó tính nguyên tử reset/cập nhật quan hệ, redirect/validation/dependency, rồi hoàn thiện logic/UI/performance. Không tự chuyển danh sách này thành kế hoạch thi công.

## 8. Kết quả kiểm tra đã có và giới hạn

Kết quả lịch sử của đợt khảo sát ngày 06/11/2026; chưa chạy lại toàn bộ ở lần chỉ tạo tài liệu này.

| Kiểm tra | Kết quả và giới hạn |
|---|---|
| Kiểm kê nguồn | 137 file, khoảng 7.871 dòng, 56 page, 6 route handler; bỏ dependency, cache, output và binary |
| TypeScript | `tsc --noEmit --incremental false --pretty false` thành công |
| Import nội bộ | Không tìm thấy đường dẫn nội bộ bị thiếu |
| Production build | Thành công trên bản sao tạm với dependency sao chép đầy đủ, không nạp env thật, cấu hình DB giả không có kết nối; không chứng minh các query chạy đúng trên DB thật |
| Bảo toàn nguồn khi build | Đối chiếu 143 file nguồn/cấu hình bản gốc và bản sao không có khác biệt |
| Trục trặc môi trường đã xử lý trong audit | Bản sao dùng junction dependency khác ổ đĩa gặp resolve path; build trong sandbox gặp DNS Google Fonts; bản sao đầy đủ ngoài sandbox build thành công. Không ghi nhận hai lỗi môi trường này là lỗi biên dịch của mã ứng dụng |
| Dependency | Trực tiếp khớp lockfile; Sharp native nạp được; kiểm tra một số advisory, chưa audit CVE toàn bộ cây dependency |
| Script | `node --check scripts/init-db.mjs` và `node --check scripts/create-admin.mjs` thành công; không chạy nghiệp vụ của script |
| Guard Server Action | Mock: 42/42 action được kiểm tra chặn anonymous trước nghiệp vụ; không bao gồm endpoint cố ý công khai như auth/waitlist; không phải fuzz toàn bộ role/argument |
| Quyền tài liệu/session | Mock xác nhận private chặn guest/member/moderator và cho admin, members chặn guest; lock user vô hiệu hóa phiên, role mới được đọc lại |
| SQL injection / XSS | Chưa tái hiện với payload thử; mysql2 hiện tại escape string/object đã thử; Markdown không render raw script hoặc URL javascript đã thử. Không khẳng định đã pentest mọi trường hợp/SQL mode |
| Schema tĩnh | Đối chiếu nhận diện 27 bảng/177 cột/31 FK và 137 biểu thức SQL; không thấy đích FK hoặc tên bảng literal bị thiếu; không thay thế thực thi SQL/kiểm tra index trên instance thật |
| MySQL thực tế | Kết nối bị từ chối: `ER_ACCESS_DENIED_ERROR`; chưa đọc được metadata hoặc migration history; không thực hiện DML/DDL |
| Mock tái hiện | Session sau đổi hash, liên kết OAuth giữ password, reset đồng thời, raw-image không auth, private metadata cấp hàm, partial migration, file ảnh hỏng và mất album links khi thêm mới lỗi; một số kiểm tra avatar/TOC ở đợt khảo sát đầu |
| Chưa kiểm tra | Browser/responsive/accessibility thật; SMTP/OAuth thật; upload/download end-to-end; schema/data thật; concurrency/performance thực; triển khai, sao lưu và khôi phục |
| Git | Không thấy `.git` ở workspace/thư mục cha được kiểm tra; git không có trong PATH khi khảo sát, nên không có Git status/commit history để đối chiếu |

Các harness mock chạy trong bộ nhớ, chưa lưu thành test suite trong repository. Không coi chúng là kiểm thử tự động sẵn có cho các phiên sau; tái hiện lại khi một yêu cầu sửa liên quan được thực hiện.

## 9. Điểm bắt đầu cho yêu cầu tiếp theo

| Phạm vi yêu cầu | File cần đọc đầu tiên | Ảnh hưởng cần đối chiếu |
|---|---|---|
| Home | `src/app/page.tsx`, `components/home/Sections.tsx`, `lib/settings.ts`, admin home/actions | Hero, auth image, about/contact, header/footer/metadata |
| Layout, màu, font, header/footer | `app/layout.tsx`, `globals.css`, `components/ui/kit.tsx`, `components/site/SiteShell.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx` | Light/dark, Home riêng, auth và admin riêng; responsive nhiều trang |
| Ảnh/Discovery | `lib/discovery.ts`, `components/site/PhotoTile.tsx`, pages/actions Discovery, upload route | Home, search, profile, saved/collections, admin, sitemap, SEC-01 |
| Cyber Lab/Blog | `lib/posts.ts`, `lib/cyber-lab.ts`, `Markdown.tsx`, `PostArticle.tsx`, admin post actions/form | Type/slug URL, mục lục, bookmark, search, SEO và ảnh bìa |
| Documents | `lib/documents.ts`, document pages/actions, API view/download | Access/published/download, metadata, saved, storage |
| Tài khoản/quyền | `lib/auth.ts`, `permissions.ts`, `users.ts`, auth/account actions | Mọi khu vực dùng guard/session, OAuth/reset và các rủi ro liên quan |
| Schema/storage | `sql/001..004`, `scripts/init-db.mjs`, `lib/db.ts`, `lib/uploads.ts` | Phải xác minh trạng thái thật, sao lưu, tương thích và ranh giới transaction trước khi thiết kế thay đổi |

Sau mỗi yêu cầu được giao: đọc lại ngữ cảnh và file thực tế, giữ phạm vi nhỏ nhất đủ yêu cầu, kiểm thử phù hợp, báo cáo file thay đổi và giới hạn kiểm tra, rồi dừng. Chỉ cập nhật trạng thái phát hiện khi đã có thay đổi và bằng chứng kiểm tra tương ứng trong phạm vi được cho phép.

## 10. Tiến độ nâng cấp và kiểm tra ngày 07–08/11/2026

### Phạm vi đã được giao và công việc hiện tại

Chủ dự án đã cho phép nâng cấp 6 nhóm (theme, Admin, Home, khóa Cyber Lab, tải ảnh Discovery, OAuth), sau đó yêu cầu tiếp tục kiểm tra responsive. Yêu cầu mới ngày 08/11 ưu tiên **logo, xem trước/hủy avatar, cloud loader** và **chỉ lập phương án Linux sandbox thật**. Không triển khai backend lệnh Linux, không migration, không deploy production. Giữ nguyên `AGENTS.md`.

Workspace không có Git để lấy diff lịch sử. Đối chiếu SHA-256 với bản sao khảo sát trước nâng cấp xác nhận **66 file nguồn đã khác/thêm trước yêu cầu logo/avatar/loader**, trong đó có 3 file nguồn mới; vì vậy con số 35 file được báo trong lúc làm là số đếm chưa đầy đủ. Lần logo/avatar/loader thay đổi **19 file** so với snapshot đầu yêu cầu này: 16 file ứng dụng, 1 file test mới, `CYBER_LAB_PLAN.md` và tài liệu ngữ cảnh này. Không suy ra số file toàn đợt bằng cách cộng hai số vì có file được sửa ở cả hai lần.

### Sáu nhóm nâng cấp trước đó: trạng thái thực tế

| Nhóm | Đã có trong mã | Bằng chứng và giới hạn |
|---|---|---|
| Theme toàn website | `ThemeToggle`, root script trước paint, semantic tokens, shell chung; Home/Discovery/Cyber/Documents/Account/Auth/Admin dùng cùng theme lưu localStorage | Test khởi tạo và browser đổi theme/chuyển route. Không chứng nhận mọi trang/detail/modal với mọi dữ liệu thật đã được xem |
| Admin | Layout/sidebar/glass, cards, biểu đồ 6 tháng (user/photo/post/document), donut trạng thái ảnh, bảng; link theo quyền; empty/error state | `getDashboardData()` dùng SELECT vào bảng hiện có. Chart/aggregation/error đã kiểm bằng mock, giao diện dùng fixture. **Chưa xác minh query chạy trên MySQL thật** |
| Home | Hero, visual, CTA và card điều hướng; giữ settings và bật/tắt/thứ tự sections | Browser responsive; section Cyber cho guest chỉ teaser, không đọc nội dung bảo vệ |
| Cyber Lab | Server guard tại root/section/article và article metadata; giữ query khi quay lại; loại nội dung hacking khỏi guest search/sitemap | Test guard trước đọc nội dung; browser login fixture quay đúng `/cyber-lab/tools?q=web&page=2`. Hiện vẫn là khu bài viết, **chưa có môi trường Linux** |
| Discovery | API download bắt đăng nhập và `published + allow_download`; `/uploads` kiểm tra tham chiếu/quyền, raw original chuyển thành preview WebP; cover trip/album chỉ chọn published | Mock route/quyền và Sharp thật trong bộ nhớ. Chưa tải ảnh của dữ liệu người dùng qua DB thật. Người xem vẫn có thể lưu bản preview; cache ảnh gốc cũ ngoài ứng dụng không thể thu hồi tự động |
| OAuth | Google/Facebook UI; state/provider/next; Google PKCE; timeout; không tự gộp email trùng; user + identity tạo trong transaction | Test callback thành công/lỗi bằng provider/DB giả; email/password hồi quy đạt. **Chưa xác minh provider thật**, consent app, SMTP hoặc cấu hình Railway thật |

Tên env cần cấu hình cho OAuth (không lưu giá trị): `APP_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`; `FACEBOOK_API_VERSION` tùy chọn. Callback đăng ký chính xác: `{APP_URL}/api/auth/google/callback` và `{APP_URL}/api/auth/facebook/callback`. DB tiếp tục dùng `DB_*` hiện có; không chạy init/seed để thử. `APP_URL` phải là origin, production dùng HTTPS. Không cần biến môi trường mới cho logo/avatar preview/loader.

### Thay đổi logo/avatar/loader

| File | Thay đổi |
|---|---|
| `src/components/SiteLogo.tsx` (mới) | Static import `picture-title/logo-web.jpg`, dùng Next Image, giữ tỷ lệ ảnh gốc. Thư mục thực tế là `picture-title`, không phải `picture-tile`; không di chuyển/ghi đè ảnh gốc |
| `components/site/SiteHeader.tsx`, `SiteFooter.tsx` | Thay nhãn logo chữ bằng ảnh dùng chung, link và tên truy cập được vẫn về trang chủ |
| `components/auth/AuthShell.tsx`, `app/admin/layout.tsx` | Dùng cùng logo ở Auth desktop/mobile và thay ký hiệu P. của Admin |
| `app/page.tsx`, `app/layout.tsx` | Logo ở badge Home và icon metadata cùng nguồn ảnh; giữ nội dung/settings/CTA |
| `components/account/AvatarPicker.tsx` (mới), `app/(light)/account/page.tsx` | Blob preview cục bộ, hủy khôi phục ảnh cũ và xóa file input, không reset các field khác; kiểm MIME/3MB/lỗi giải mã; phối hợp checkbox removeAvatar; revoke Object URL khi thay/hủy/unmount. Key theo URL avatar đã lưu giúp xóa preview tạm khi Server Action trả về avatar mới. Giữ `name=avatar`, `name=removeAvatar` và Server Action cũ. Bố cục mới sửa tràn ngang upload avatar ở 390/375px; sửa class nền lỗi của chính trang hồ sơ |
| `components/CloudLoader.tsx`, `CloudLoader.module.css` (mới) | Chuyển SVG/CSS tham chiếu sang JSX/module: giữ paths, 21 line, mask/filter, keyframes/timing; ID riêng từng instance, theme và reduced motion, status cho screen reader; giữ attribution andrew-manzyk/Uiverse |
| `app/loading.tsx`, `app/(light)/loading.tsx`, `app/(dark)/loading.tsx`, `app/(auth)/loading.tsx`, `app/admin/loading.tsx` (mới) | Fallback Suspense của App Router; không timer, không delay tối thiểu hoặc overlay sau tải xong. Cache/chuyển trang tức thì có thể không cần hiện loader |
| `tests/cloud-loader.test.cjs` (mới) | Kiểm SVG/đường chuyển động, ID không xung đột, keyframes/timing khớp file mẫu |
| `CYBER_LAB_PLAN.md` (mới) | Phương án xterm + WSS + PTY trong Linux microVM, Railway, quota, mạng, chi phí và các giai đoạn để duyệt; không có backend thực thi |

Các đường dẫn rút gọn ở bảng trên nằm dưới `src/`. Hai file `design-references/cloud-loader.html`, `.css` và `picture-title/logo-web.jpg` được giữ nguyên. Không cài hoặc nâng dependency; không đổi SQL/scripts/schema, bí mật, hay `AGENTS.md`.

### Kết quả kiểm tra có thể tái chạy

| Kiểm tra | Kết quả mới |
|---|---|
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` đạt trên source cuối |
| Tests | `node --test tests/upgrade.test.cjs tests/cloud-loader.test.cjs`: **24/24 đạt** (21 kiểm thử nâng cấp + 3 kiểm thử loader) |
| Production build | Đạt trên bản sao tạm đầy đủ source + logo + node_modules, không `.env`/uploads thật; DB giả `127.0.0.1:9`, không có kết nối thật. Cảnh báo ECONNREFUSED do chủ động vô hiệu DB không được coi là runtime tích hợp đã đạt. Lần đầu bị sandbox EPERM ghi `.next`; chạy lại được cấp quyền đạt |
| Browser sau logo/avatar/loader | **100 tổ hợp**: 10 trang (Home, Account, Discovery, Documents, Cyber root, Admin dashboard/photos/users, Login, Register) × 5 width 1440/1024/768/390/375 × 2 theme. DOM không tràn ngang trang, theme đúng, logo nạp được, không còn loader khi trang sẵn sàng. Bảng/nav có cuộn ngang riêng là có chủ đích. Đây là Chromium/IAB với fixture, không phải kiểm thử mọi thiết bị/browser hoặc dữ liệu thật |
| Avatar | Browser chọn JPEG hiển thị blob và input giữ file; hủy input rỗng/khôi phục avatar cũ; chọn ảnh mới tắt yêu cầu xóa ảnh; quá 3MB/ảnh không giải mã được báo lỗi và bỏ file; field khác giữ nguyên. Không submit lưu profile vào DB thật |
| Loader | Trong bản cách ly, SELECT fixture cố ý chờ 8 giây để quan sát fallback thật trong light/dark; khi promise hoàn thành, loader biến mất. **Delay chỉ ở harness ngoài repo**, không ở source ứng dụng. Browser đang có `prefers-reduced-motion: reduce`, xác nhận không có animation đang chạy và CSS compiled có rule tắt; keyframes/timing bình thường khớp bản mẫu qua test, chưa bật lại thiết lập OS để đo chuyển động thường |
| Console và bảo toàn | Không thấy error/warn ở browser cuối. Đối chiếu hash các file bảo vệ (AGENTS, SQL/scripts, package/lock/config, ảnh và mẫu) giữ nguyên trong yêu cầu này. Server QA tạm đã dừng; không có deploy |

Trước yêu cầu mới, lần tiếp tục còn đo 230 tổ hợp layout của các trang quản trị/public bằng fixture; phát hiện avatar tràn 35–50px ở mobile, đã xử lý trong AvatarPicker. Không coi các dòng danh sách rỗng hoặc số tổng hợp giả lập là xác nhận dữ liệu MySQL đúng. Chưa kiểm chứng toàn bộ trạng thái form chỉnh sửa ảnh có dữ liệu, modal/detail và mọi role trên browser.

### Đối chiếu phát hiện cũ — giữ ID và lịch sử

| ID | Trạng thái mới và giới hạn |
|---|---|
| SEC-01 | Đã xử lý đường truy cập ảnh trong source + mock: quyền theo tham chiếu, preview thay original ở `/uploads`, cover published. Chờ tích hợp storage/DB/cache thực tế; không hứa thu hồi bản cũ đã bị tải/cache |
| SEC-02 | Đã chặn tự liên kết tài khoản mới theo email trùng; Google email mới phải verified. Transaction và duplicate branch đã kiểm mock. Identity đã liên kết trước đây chưa tự rà soát/khắc phục; email local vẫn chưa xác minh |
| SEC-05 | `safeNext` chặn control/backslash/origin ngoài và chuẩn hóa URL; test hồi quy đạt. OAuth thật chưa kiểm |
| LOGIC-09 | Dashboard sửa nhãn/số mọi role và link theo permission trong code; charts dùng SELECT. Chưa đo trên DB thật |
| UI-01 | Header dùng menu dưới xl, form từ chối không min-width cố định; browser kích thước yêu cầu đã kiểm. Avatar mobile đã sửa. Form admin ảnh có dữ liệu đầy đủ vẫn cần kiểm tiếp trước khi chứng nhận toàn bộ responsive |
| Các ID còn lại | Giữ OPEN/chưa xác minh như lịch sử. Không tự sửa SEC-03/04/06/07/08/09, DB-01, DATA-01/02/03/04 hoặc backlog ngoài phạm vi |

Lưu ý còn thấy một số class nền lỗi dạng `bg-danger/100/10` ở các trang account con và chi tiết ảnh từ lần đổi theme; ngoài trang hồ sơ đang sửa, chưa xử lý tiếp ở yêu cầu logo/avatar/loader. Không chứng nhận toàn bộ UI/theme hoặc hệ thống sẵn sàng production.

### Điểm dừng và đề xuất Cyber Lab

Ba yêu cầu giao diện mới đã triển khai và kiểm thử như trên; sẵn sàng để chủ dự án xem/đánh giá trong môi trường phát triển có DB phù hợp. Lưu avatar thật, schema thật, OAuth/SMTP và Railway deployment thật chưa được xác minh lại. Không tạo tài khoản thật hoặc dùng thông tin đăng nhập bí mật để thử.

Cyber Lab Linux thật **chưa triển khai**, chờ duyệt [CYBER_LAB_PLAN.md](CYBER_LAB_PLAN.md). Đề xuất website/gateway trên Railway, guest microVM trên runner cô lập riêng, firewall cưỡng chế ngoài guest, mỗi user một lease, CPU/RAM/disk/TTL/quota cứng và mạng lab riêng. Native Railway Sandbox hiện có VM nhưng mặc định vẫn Internet outbound; chưa chứng minh custom Kali/PTY/firewall đáp ứng yêu cầu. Không gọi template Ubuntu là Kali, không mở shell host. Giai đoạn tiếp theo chỉ thực hiện khi chủ dự án giao cụ thể.

## 11. Chuẩn bị Railway staging và hoàn tất lỗi logo 401 — 08/11/2026

### Phạm vi và điểm dừng

Chủ dự án cho phép xử lý các lỗi High còn tồn tại, chuẩn bị cấu hình/checklist staging và kiểm thử an toàn; **không migration, không thay đổi dữ liệu MySQL, không tự deploy, không triển khai Cyber Lab Linux backend**. Chỉ dẫn kết thúc yêu cầu hoàn tất lỗi 401 của logo, kiểm thử liên quan, cập nhật ngữ cảnh rồi dừng; không mở rộng thêm phạm vi. `AGENTS.md` giữ nguyên.

Đầu đợt này workspace đã có Next.js **16.4.5**, Nodemailer **10.3.1**, Sharp **0.35.5** và lockfile tương ứng. Đây là thay đổi có sẵn, không phải nâng dependency trong đợt chuẩn bị staging. Không có Git để đối chiếu lịch sử; sử dụng snapshot hash trước thay đổi.

### Lỗi logo staging: đã xác minh và xử lý

- Tái hiện trên production server của bản sao cách ly: request optimizer `/_next/image` của logo trả **401** dù request trang đã qua Basic auth. Optimizer không chuyển tiếp header xác thực khi lấy ảnh nguồn.
- `src/components/SiteLogo.tsx` đặt `unoptimized={process.env.APP_ENV === "staging"}`. Staging lấy trực tiếp static asset của `picture-title/logo-web.jpg`; component dùng chung tiếp tục áp dụng cho Header, Footer, Auth, Admin và Home. Production giữ cơ chế tối ưu ảnh hiện có.
- **Không mở ngoại lệ asset trong cổng staging.** Kiểm tra HTTP cuối xác nhận Login **200**, HTML dùng nguồn static của logo, cùng URL logo **401 khi thiếu Basic auth**, **200 khi có Basic auth**, cache `private, no-store`. Server kiểm thử đã dừng.
- Bằng chứng này thuộc bản build cách ly với cấu hình tổng hợp; **chưa xác nhận trên Railway staging thật**. Xem thêm [tài liệu Next Image về nguồn ảnh yêu cầu xác thực](https://nextjs.org/docs/pages/api-reference/components/image).

### Các xử lý bảo mật đã thực hiện trong đợt staging

| ID | Trạng thái mới và giới hạn |
|---|---|
| SEC-03 | `lib/auth.ts` bổ sung HMAC credential stamp ràng buộc JWT với password hash hiện tại, pin HS256, từ chối JWT cũ/thiếu stamp và hash đã thay đổi. Login kiểm tra lại hash trước phát hành phiên. `users.ts::setPasswordHash` đổi mật khẩu và hủy reset token trong transaction. Mock xác nhận phiên cũ bị từ chối sau đổi mật khẩu; **phiên legacy cần đăng nhập lại**. Logout vẫn chỉ xóa cookie, chưa có kho thu hồi từng JWT |
| SEC-04 | Reset khóa user rồi khóa/revalidate token trong transaction, cập nhật mật khẩu và hủy token nguyên tử. Mock kiểm hai consume đồng thời chỉ một thành công và rollback khi lỗi; chưa thử ghi/race trên MySQL thật |
| SEC-08 | Thiếu SMTP không tạo/gửi reset token; mail không log nội dung, địa chỉ hoặc reset link, lỗi gửi được lược bỏ chi tiết. Mock kiểm không truy cập DB/log trong nhánh thiếu SMTP; chưa kiểm SMTP thật |
| SEC-09 | Nodemailer hiện có 10.3.1; `npm audit --omit=dev --json` báo **0 lỗ hổng**. Đây là kết quả advisory tại thời điểm kiểm, không thay thế kiểm thử mọi đầu vào |
| DATA-01 | `saveHomeAction`/`savePostAction` không xóa ảnh hero/cover cũ khi thay hoặc bỏ ảnh. Mock xác nhận lỗi ghi DB không làm mất file cũ. File cũ/mồ côi được giữ lại; chưa có GC hay transaction chung filesystem/DB, các luồng upload khác vẫn cần đánh giá riêng |
| DB-01 | Runner giữ phần tách statement có sẵn; bổ sung cổng `ALLOW_DATABASE_MIGRATIONS=explicitly-approved`, bỏ suy đoán hoàn tất theo số bảng và bỏ nuốt lỗi duplicate. Mock xác nhận lỗi statement dừng, không ghi hoàn tất migration. **Không chạy runner/migration thật**; DDL vẫn có thể áp dụng một phần, lịch sử/schema cũ chưa được tự sửa |
| SEC-01/02 | Các biện pháp ở mục 10 giữ nguyên, bộ kiểm thử hồi quy đạt. Cache ảnh cũ và identity đã liên kết từ trước chưa được xử lý tự động |

Các ID khác giữ trạng thái lịch sử/chưa kiểm tra; không tự sửa backlog ngoài phạm vi. Không tuyên bố mọi High hoặc rủi ro dữ liệu đã được loại bỏ trên môi trường thật.

### Cấu hình và tài liệu staging đã chuẩn bị

- `src/proxy.ts`: Basic auth cho toàn bộ route/asset/API ở staging; thiếu cấu hình trả 503, sai/thiếu xác thực trả 401. Chỉ GET/HEAD chính xác `/api/health` được miễn; không thay thế session, role hay ownership của ứng dụng. Thêm noindex và cache private/no-store; robots staging chặn crawler.
- `src/app/api/health/route.ts`: health không đọc DB, chỉ trả trạng thái. Root layout `force-dynamic` tránh đóng băng settings/metadata từ DB giả lúc build. `next.config.mjs` thêm nosniff, no-referrer và SAMEORIGIN; giữ body limit và redirect hiện có.
- Storage routes/`lib/uploads.ts` đánh dấu đường dẫn Volume runtime không được Turbopack trace vào build; không thay validation/quyền file.
- `scripts/runtime-config.mjs`, `check-schema.mjs`, `check-staging.mjs`, `start.mjs`: preflight kiểm env, quyền truy cập storage và metadata 27 bảng/177 cột bắt buộc; không DML/DDL. `package.json` dùng start mới và thêm `check:staging`; không đổi dependency/lockfile.
- `scripts/container-entrypoint.mjs`: kiểm mount đúng `/app/uploads`, chỉ chỉnh ownership thư mục mount gốc khi khởi động Linux bằng root rồi hạ GID/UID 1000 trước ứng dụng. Không chown đệ quy file hiện có. Đã kiểm bằng VM mock, **chưa chạy container Linux thật**.
- `Dockerfile`, `.dockerignore`, `railway.json`: Node 24, không đưa `.env`/uploads thật vào image, một replica, mount bắt buộc `/app/uploads`, health endpoint, không pre-deploy migration. `.env.example`/README được cập nhật tên biến và quy trình an toàn.
- Checklist thao tác, cấu hình DB/Volume, OAuth/SMTP, kiểm tra quyền và rollback nằm tại [STAGING_DEPLOY_CHECKLIST.md](STAGING_DEPLOY_CHECKLIST.md). Chưa có thao tác Railway thật. Preflight yêu cầu DB host private `.railway.internal` khi chạy trên Railway; chưa hỗ trợ DB public với TLS. Volume cũ cần kiểm ownership trước khi dùng; OAuth và SMTP cần cấu hình/kiểm thử riêng.

### Bằng chứng kiểm tra cuối và giới hạn

| Kiểm tra | Kết quả |
|---|---|
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: đạt trên source cuối |
| Tự động | `node --test tests/upgrade.test.cjs tests/cloud-loader.test.cjs tests/staging-security.test.cjs`: **39/39 đạt**; 15 test staging kiểm session/reset/transaction, bảo toàn ảnh, gate/env/schema và runner/container bằng mock |
| Production build | **Đạt sau sửa logo**, Next 16/Turbopack trên bản sao đủ dependency, không `.env`/uploads thật, DB giả không có dịch vụ. Không có cảnh báo trace toàn project. Không chứng minh các query hay Volume thật hoạt động |
| HTTP production server cách ly | **21 trường hợp đạt**: bảo vệ page/API/static/action/RSC, không bypass qua header giả, health, robots, header, guest bị chuyển Login khi tải ảnh/Cyber Lab. Kiểm riêng logo cuối xác nhận **401 thiếu auth / 200 có auth** và nguồn static trong Login; không dùng tài khoản thật |
| MySQL read-only | Lần này đọc được INFORMATION_SCHEMA: **28 bảng, 179 cột, 31 FK, 67 index**; bảng/cột mục tiêu 27/177 không thiếu (phần thêm là `schema_migrations`). Chỉ metadata SELECT, không đọc dữ liệu người dùng, không DDL/DML. Host đang kiểm **không phải Railway private host** |
| Phạm vi schema | Chưa đối chiếu đầy đủ type/default/constraint/index, nội dung migration history hoặc tính đúng dữ liệu; **không kết luận DB đã đồng bộ toàn diện**. Kết quả access denied ở mục 8 là lịch sử, được bổ sung bằng kiểm tra metadata thành công lần này |
| Chưa kiểm tra | Docker image/Linux bootstrap/Volume và Railway staging thật; OAuth/SMTP thật; đăng nhập/đổi mật khẩu/reset/upload thật và concurrency MySQL. Không tạo tài khoản, gửi email hay ghi số liệu để thử |

**Điểm dừng:** sửa logo và kiểm thử liên quan đã hoàn tất trong môi trường cách ly, ngữ cảnh đã cập nhật. Không deploy, migration, dọn file hay triển khai backend Linux; dừng và chờ yêu cầu tiếp theo.

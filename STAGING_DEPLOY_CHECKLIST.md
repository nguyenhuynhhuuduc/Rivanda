# Checklist Railway staging — chuẩn bị, chưa deploy

Ngày: **08/11/2026**. Agent không chạy migration, không ghi MySQL thật, không xóa dữ liệu và không deploy. Cyber Lab Linux backend vẫn chưa triển khai. Các mục chưa tick là việc chủ dự án cần kiểm tra/thực hiện; không tự coi chúng đã đạt.

## 1. Điều kiện trước khi bấm Deploy

- [ ] Chọn **environment staging riêng**, kiểm tra đúng workspace/project/service. Không thay service production; tắt auto-deploy production cho nhánh đang thử. Không chia sẻ secrets, DB, Volume hoặc tài khoản thật của production.
- [ ] Backup DB và storage hiện có, có phương án khôi phục đã kiểm chứng. Không restore đè lên DB/Volume đang dùng.
- [ ] Có database staging với schema đã đối chiếu các file SQL 001–004. **Không chạy `init-db`, seed, create-admin hay migration để vượt lỗi startup.** Nếu DB mới/trống hoặc schema lệch: dừng và yêu cầu phê duyệt riêng cho công việc schema/dữ liệu.
- [ ] Kiểm tra metadata types, enum, FK, index và migration history với người quản trị DB. Script mới chỉ kiểm tra sự hiện diện **27 bảng/177 cột tối thiểu**, không chứng minh kiểu/constraint/index hoặc lịch sử migration đúng.
- [ ] Chuẩn bị tài khoản ứng dụng MySQL riêng, không dùng `root`; chỉ quyền DML cần thiết trên schema staging và đọc metadata của chính schema, không quyền DDL/admin/toàn server. Không trỏ nhầm endpoint production. Bản cấu hình này yêu cầu host `*.railway.internal` khi chạy trên Railway; DB public chưa có cấu hình TLS và bị preflight chặn, không dùng đường truyền public không mã hóa.
- [ ] Chỉ dùng tài khoản kiểm thử được chủ dự án cấp. Nếu dùng dữ liệu lịch sử có cả local password và OAuth identity, cần rà soát liên kết cũ trước; code không thể xác minh lại lịch sử sở hữu email chỉ từ schema hiện có. Không tự xóa hay gộp identity.

## 2. Cấu hình Railway và Volume

Source hiện chuẩn bị `Dockerfile` Node 24, `.dockerignore`, `railway.json`; không nâng package trong lần này. Phiên bản hiện tại do workspace có sẵn: Next 16.4.5, Nodemailer 10.3.1, Sharp 0.35.5. `npm ci` trong Docker dùng lockfile hiện có.

- [ ] Root directory là gốc repository có `package.json`, `src`, `scripts`, `picture-title/logo-web.jpg`. Dùng Dockerfile đã chuẩn bị, không static export. Không đưa `.env.local`, `uploads` thật, `node_modules` hoặc `.next` từ máy Windows vào build context.
- [ ] Mount **Volume staging riêng** vào `/app/uploads`; đặt `UPLOAD_DIR=/app/uploads`. Tài liệu nằm trong `/app/uploads/documents`. Không mount vào thư mục `public`, `.next` hoặc MySQL data của service khác.
- [ ] Một replica, không multi-region cho service dùng disk cục bộ. `requiredMountPath` đã đặt `/app/uploads`; vẫn phải tạo/attach Volume bằng Railway UI. Đặt resource/spend limits phù hợp và theo dõi dung lượng vì bản cũ được giữ khi thay ảnh.
- [ ] Start command: `node scripts/container-entrypoint.mjs`; pre-deploy command **trống**, không có `npm run init-db`. Kiểm tra cả UI và config environment cũ, không chỉ file mới.
- [ ] Healthcheck `/api/health`, timeout 120 giây, Railway tự cấp `PORT`; server bind `0.0.0.0`. Không cấu hình healthcheck vào Home hoặc trang cần đăng nhập.

Volume Railway chỉ mount lúc runtime, không ở build/pre-deploy. Mount mặc định root-owned. Bootstrap trong image chỉ chown **thư mục `/app/uploads`**, không recursive, rồi drop UID/GID về 1000 **trước khi** preflight và Next chạy. Không thay start command bằng `next start`/`npm start` để bỏ qua bootstrap. Nếu Volume tái sử dụng chứa thư mục con/file có owner khác, cần quản trị viên xem quyền trước; không tự chown toàn bộ hoặc xóa dữ liệu để sửa lỗi. [Railway Volumes](https://docs.railway.com/volumes).

## 3. Variables cần chủ dự án điền

Nhập secrets trực tiếp trong Railway Variables; không gửi giá trị vào chat, không đưa vào Git/Docker ARG hoặc log.

| Biến | Giá trị/yêu cầu |
|---|---|
| `APP_ENV` | `staging` — bắt buộc để bật cổng staging và noindex |
| `APP_URL` | HTTPS origin chính xác, ví dụ `https://<staging-domain>`; không path/query/userinfo |
| `SESSION_SECRET` | Secret ngẫu nhiên riêng staging, ít nhất 32 ký tự; không dùng mẫu hoặc secret production |
| `STAGING_AUTH_USERNAME` | User riêng của cổng staging, không có dấu `:` |
| `STAGING_AUTH_PASSWORD` | Secret mạnh riêng cổng staging, ít nhất 20 ký tự; khác mật khẩu ứng dụng/SESSION_SECRET |
| `DB_HOST`, `DB_PORT` | Endpoint private và port thật của MySQL staging; không đoán port public/private thay thế nhau |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Schema staging và user ứng dụng riêng; password bắt buộc, không root |
| `UPLOAD_DIR` | `/app/uploads` |
| `PORT`, `RAILWAY_VOLUME_MOUNT_PATH` | Railway cấp tại runtime; không tự giả lập mount bằng cách điền biến thay cho attach Volume |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Hoặc đủ cả hai cho app OAuth staging, hoặc trống cả hai |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Tương tự; `FACEBOOK_API_VERSION` tùy chọn theo app đang dùng |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Nếu kiểm thử email; dùng mailbox/sandbox gửi thư staging, không danh sách người dùng thật |

OAuth callback phải đăng ký đúng `{APP_URL}/api/auth/google/callback` và `{APP_URL}/api/auth/facebook/callback`; cấu hình test users/consent của app tương ứng. Giữ cổng staging khi thử OAuth; browser cần được xác thực Basic tại origin staging trước khi ra provider và quay lại. Chưa kiểm thử provider thật trong đợt này.

Thiếu SMTP: không tạo/gửi reset link, không in link ra log. Railway hiện chỉ cho SMTP ở Pro trở lên; Free/Trial/Hobby cần dịch vụ qua HTTPS API, chưa tích hợp API email trong phạm vi này. Có thể để email disabled ở staging và ghi rõ test đó chưa thực hiện, hoặc dùng cấu hình SMTP hợp lệ trên plan hỗ trợ. [Railway outbound networking](https://docs.railway.com/networking/outbound-networking).

## 4. Kiểm tra trước deploy

Chạy tại checkout kiểm thử, không đưa dữ liệu thật vào test:

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node --test tests/upgrade.test.cjs tests/cloud-loader.test.cjs tests/staging-security.test.cjs
npm audit --omit=dev
```

- [ ] Docker build trên Linux/CI bằng source hiện tại; không mount DB/Volume production vào build. Build có tải Google Fonts và dependency theo lockfile. Build Next trên Windows cách ly không thay thế kiểm tra image Linux/native Sharp.
- [ ] Kiểm tra `npm run check:staging` **trong môi trường có runtime variables + Volume staging**. Script chỉ đọc env trong process, `stat/access/realpath` và `INFORMATION_SCHEMA SELECT`, không tự nạp file secrets, không DML/DDL. Không chạy ở pre-deploy vì Volume chưa mount. Startup chạy cùng preflight và dừng nếu thiếu env/storage/minimum schema.
- [ ] Nếu chạy local production, truyền runtime env rõ ràng trước khi gọi script; `npm run start` mới không tự đọc `.env.local` trước preflight. `npm run dev` giữ cơ chế Next development hiện có.
- [ ] Không để `ALLOW_DATABASE_MIGRATIONS` trong Railway Variables. Runner migration đã được khóa mặc định; chỉ mở sau phê duyệt riêng. Một câu SQL lỗi (kể cả duplicate) sẽ dừng và không ghi file migration hoàn tất. MySQL DDL không rollback cả file; không tự chạy lại migration dở.

## 5. Chủ dự án thực hiện deploy staging

1. Hoàn tất các mục trên; kiểm tra service/branch/environment một lần nữa và xem diff. Agent chưa commit/push hoặc khởi chạy deploy.
2. Chủ dự án chủ động Deploy bản source đã duyệt. Image không mang env hoặc file uploads thật. Không bổ sung bước init/seed khi deploy lỗi.
3. Quan sát log: bootstrap hạ quyền, preflight, server `0.0.0.0:$PORT`. Khi lỗi chỉ kiểm tra mã lỗi/tên biến thiếu; không chụp/dán secrets. Schema thiếu thì dừng để lập kế hoạch riêng.
4. Xác nhận healthcheck 200. Endpoint chỉ trả `{ "status": "ok" }`, không kiểm tra DB liên tục; Railway dùng healthcheck khi deploy, không phải monitoring lâu dài. [Railway Healthchecks](https://docs.railway.com/deployments/healthchecks).
5. Mở URL HTTPS staging, xác thực cổng staging trước, sau đó mới đăng nhập tài khoản ứng dụng. Basic gate **không cấp quyền admin**; Server Action/Route Handler vẫn kiểm role/ownership.

## 6. Smoke test sau deploy — chỉ dữ liệu staging được duyệt

- [ ] Không có/mật khẩu cổng sai: Home, Login, Admin, API download, `/uploads/*`, `/_next/static/*`, `/_next/image` đều 401; thiếu cấu hình cổng trả 503. Chỉ `GET/HEAD /api/health` được miễn cổng; POST health không được miễn.
- [ ] Qua cổng nhưng chưa đăng nhập app: Cyber Lab root/section/article và API tải ảnh vẫn yêu cầu login, giữ đúng `next`. Member không được vào Admin; moderator chỉ các mục được phép. Không chỉ kiểm nút/menu.
- [ ] Qua cổng với tài khoản kiểm thử: Home/Discovery/Documents/Account/Admin, logo và dark/light hiển thị đúng. Logo staging dùng ảnh static trực tiếp sau cổng vì Next optimizer không forward Basic auth vào subrequest; không mở public assets để né lỗi. Robots staging chặn `/`; response có `X-Robots-Tag: noindex, nofollow, noarchive` và cổng đặt `Cache-Control: private, no-store` (cache header cuối của static asset cần đối chiếu framework). Noindex không thay thế authentication.
- [ ] Đổi/reset mật khẩu trong tài khoản staging được phép thử: phiên cũ trên browser khác bị từ chối; token reset chỉ dùng được một lần. Session legacy không có credential stamp bị từ chối ngay sau nâng cấp, nên người dùng phải đăng nhập lại. Không dùng rollback code cũ làm cách khôi phục phiên cũ.
- [ ] Dùng ảnh/tài liệu tổng hợp được duyệt để thử quyền upload/download và persistence qua restart/redeploy. Không thử trên tài nguyên production hoặc xóa dữ liệu chỉ để test. Kiểm tra Volume đúng service, đúng thư mục, owner/permissions, dung lượng, backup và khôi phục.
- [ ] Test lỗi DB khi thay cover/hero ở môi trường cách ly: ảnh cũ không bị xóa. File mới có thể mồ côi nếu ghi SQL thất bại; chưa có GC tự động, không tự dọn file.
- [ ] Nếu bật email/OAuth, kiểm tra consent/callback/SMTP thật bằng tài khoản staging được phép. Không coi mock callback đã pass là provider thật đã pass.

## 7. Dừng/rollback và giới hạn

Nếu cổng có thể bị bỏ qua, DB/Volume nhầm production, preflight fail, dữ liệu thiếu hoặc có log nhạy cảm: không mở staging cho tester. Chủ dự án dừng public traffic/deploy và xác định nguyên nhân. Redeploy phiên bản đã duyệt chỉ rollback **code**, không tự rollback DB/storage; không restore đè, xóa file hay chạy migration để khắc phục nhanh.

Các đường High đã sửa có test code/mock, chưa chứng minh trên MySQL/Railway thật. Liên kết OAuth lịch sử, schema/constraint thật, native Linux image/Volume permission, SMTP/OAuth provider và backup/restore cần người vận hành xác nhận. Các vấn đề ngoài phạm vi như rate limit toàn diện, metadata tài liệu private, transaction tags/album và upload ảnh hỏng vẫn theo `PROJECT_CONTEXT.md`. Staging chỉ dành cho tester tin cậy sau cổng; chưa phải chứng nhận production-ready.

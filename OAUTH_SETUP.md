# Google / Facebook OAuth

## Trạng thái và hành vi

- Login/Register dùng authorization-code flow chính thức, không mô phỏng nhà cung cấp. Google xác minh ID token qua JWKS (RS256, issuer, audience/azp, exp, nonce) và PKCE; Facebook kiểm `/debug_token` (App ID, user ID, loại token, hiệu lực), `/me` với Bearer và appsecret_proof. Không lưu access/refresh token trong DB, cookie hay log.
- Cookie flow ký HS256, HttpOnly, SameSite=Lax, TTL 10 phút; production Secure. Chuyển hướng chỉ tới đường dẫn nội bộ. Mỗi browser chỉ có một flow đang chờ; nếu mở hai luồng đồng thời, luồng cũ sẽ bị từ chối và cần bắt đầu lại.
- Identity là **(provider, provider_user_id)**, không phải email. Lần đầu tạo Member + identity + IP hiện có trong cùng transaction. Những lần sau dùng đúng identity, giữ hồ sơ/IP/password/quyền cũ, kể cả email phía provider đã đổi hoặc không còn chia sẻ.
- Nếu email đã có tài khoản: từ chối tạo/gộp, yêu cầu đăng nhập bằng phương thức cũ rồi vào **Tài khoản → Bảo mật** (`/account/security`) và bấm **Liên kết Google/Facebook**. Liên kết dùng POST same-origin, flow ký ràng buộc ID và phiên hiện tại. Không nhập mật khẩu website tại provider. Có thể liên kết cả hai với một hồ sơ; không chuyển identity của hồ sơ khác hoặc thay liên kết provider đã có.
- Lần tạo tài khoản mới cần email hợp lệ; Google phải `email_verified=true`. Facebook có thể không trả email (tài khoản dùng số điện thoại, quyền bị từ chối...): website báo rõ và yêu cầu đăng ký email/mật khẩu, đăng nhập rồi liên kết Facebook. Liên kết hoặc đăng nhập lại bằng identity đã có không yêu cầu provider trả email.
- Tài khoản bị khóa không đăng nhập/liên kết được. Liên kết không tự nâng quyền, thay email hoặc mật khẩu local. Chưa có chức năng gỡ/thay identity trong phạm vi này.

## Biến môi trường và callback

Đặt ở `.env.local` khi phát triển hoặc Variables của môi trường triển khai, **không commit secrets** và không dùng tiền tố `NEXT_PUBLIC_`. Khởi động lại app sau khi đổi env.

| Biến | Giá trị cần cấu hình |
|---|---|
| `APP_URL` | Origin chính xác, ví dụ `http://localhost:3000` hoặc `https://website-cua-ban.vn`; không path/query/hash. Dùng cùng hostname khi mở website, không lẫn localhost và 127.0.0.1 |
| `SESSION_SECRET` | Secret ngẫu nhiên riêng, ít nhất 32 ký tự; dùng cho session và flow OAuth. Đổi secret sẽ làm mất hiệu lực phiên/flow cũ |
| `GOOGLE_CLIENT_ID` | OAuth Client ID loại **Web application** |
| `GOOGLE_CLIENT_SECRET` | Client secret tương ứng, server-only |
| `FACEBOOK_APP_ID` | ID app **Facebook Login** của website |
| `FACEBOOK_APP_SECRET` | App secret tương ứng, server-only |
| `FACEBOOK_API_VERSION` | Tùy chọn; mặc định `v23.0`. Pin phiên bản Graph API còn được hỗ trợ trong Dashboard của app, dạng `vNN.0`, kiểm tra lại trước khi nâng version |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Kết nối MySQL ứng dụng hiện có; không trỏ DB production vào môi trường test |

Không cần `GOOGLE_REDIRECT_URI`, `FACEBOOK_CALLBACK_URL`, `AUTH_SECRET` hoặc NextAuth: callback được tính từ `APP_URL`.

| Provider | Callback local | Callback cho người dùng ngoài |
|---|---|---|
| Google | `http://localhost:3000/api/auth/google/callback` | `https://website-cua-ban.vn/api/auth/google/callback` |
| Facebook | `http://localhost:3000/api/auth/facebook/callback` | `https://website-cua-ban.vn/api/auth/facebook/callback` |

Thay domain ví dụ bằng **domain thật đúng APP_URL**, không thêm dấu `/` sau `callback`. Cả đăng nhập và liên kết dùng chung callback. Website public phải có HTTPS hợp lệ và callback truy cập được từ browser người dùng. `localhost` chỉ dùng máy phát triển; Meta có thể yêu cầu HTTPS tùy app. Nếu không chấp nhận HTTP local, dùng môi trường HTTPS được chủ dự án phê duyệt và app test riêng, không tự mở tunnel/public VNC hay hạ bảo vệ staging.

## Google Cloud / Google Auth Platform

1. Dùng project/client tách biệt cho development, staging và production. Trong **Branding** điền tên app, email hỗ trợ, homepage, privacy/terms hợp lệ; xác minh domain thuộc quyền quản lý khi Google yêu cầu.
2. **Audience → External** để người ngoài Workspace có thể đăng nhập; chuyển publishing status **In production/Published** khi mở công khai. Testing không được coi là đã mở public; kiểm tra giới hạn/audience trong Console (basic identity scopes có ngoại lệ theo chính sách hiện hành).
3. **Data Access** chỉ dùng `openid`, `email`, `profile`; code không yêu cầu Gmail/Drive hoặc quyền nhạy cảm. Hoàn tất brand verification/các điều kiện Console yêu cầu; không hứa logo/tên tùy chỉnh được hiển thị khi chưa được xác minh.
4. **Clients → Create client → Web application**. Thêm callback bảng trên vào **Authorized redirect URIs** đúng scheme/host/port/path. Server redirect flow này không dùng JS SDK nên không cần Authorized JavaScript origins; nếu khai báo, chỉ thêm origin website chính xác, không phải callback path.
5. Điền ID/secret vào env và restart. Dùng browser thông thường (Chrome/Edge...), không dùng embedded webview để thử Google; nhà cung cấp có thể chặn embedded user-agent.

## Meta for Developers

1. Tạo/chọn app có use case **Authenticate and request data from users with Facebook Login** cho website; không nhầm Facebook Login for Business/Instagram. Giữ nguyên App ID khi tái sử dụng identity vì Facebook ID là app-scoped.
2. **App Settings → Basic**: domain website, website URL, contact email, category/icon theo Dashboard; privacy policy, terms và **User Data Deletion** (URL hướng dẫn xóa dữ liệu thật hoặc callback đã triển khai). `/privacy` và `/terms` hiện vẫn cần chủ dự án duyệt nội dung; không khai URL callback xóa dữ liệu giả. Phạm vi này không xây dịch vụ xóa dữ liệu Meta tự động.
3. **Facebook Login → Settings**: bật **Client OAuth Login**, **Web OAuth Login**, HTTPS/strict redirect; thêm đúng callback vào **Valid OAuth Redirect URIs**. Chỉ yêu cầu `public_profile`, `email`. Có thể bật Require App Secret vì server gửi appsecret_proof khi gọi `/me`.
4. Development chỉ dùng vai trò developer/tester được chấp nhận. Để người không có app role đăng nhập, hoàn tất các điều kiện Dashboard và chuyển **Live/Publish**; kiểm tra **Permissions and Features** cho quyền truy cập người ngoài (`public_profile`, `email`, Advanced Access nếu app/use case yêu cầu). Hoàn tất App Review/Business Verification/Data Use Checkup khi Meta yêu cầu. Chỉ đổi Live chưa chứng minh app đã được cấp mọi quyền.
5. Pin `FACEBOOK_API_VERSION` còn hỗ trợ, điền App ID/secret vào env, restart; kiểm tra bằng người dùng không có app role sau khi được cấp quyền. Nếu email không được trả, website chỉ cho tạo tài khoản qua email rồi chủ động liên kết.

Ở staging, giữ Basic auth hiện có. Tester phải vào staging qua Basic auth trước khi sang provider và quay lại; callback không được miễn cổng. Public users cần domain production được phê duyệt riêng, không công khai staging bằng cách bỏ cổng.

## Schema, kiểm thử và phần còn chờ

- Tái sử dụng `users`, `user_identities` từ 002, allocator/IP từ 005. Đã đọc metadata local: PK `(provider, provider_user_id)`, FK `user_id → users.id`, UNIQUE email và default Member có sẵn. **Không cần migration mới và không chạy migration** trong đợt OAuth này.
- Test tự động: `node --test tests/oauth.test.cjs tests/upgrade.test.cjs tests/staging-security.test.cjs`. Chữ ký JWT được kiểm thật với khóa QA; HTTP provider và auth callback được cô lập bằng fixture, không gọi tài khoản Google/Meta thật.
- Test MySQL riêng: `tests/oauth.mysql.test.cjs` chỉ chạy khi đặt `OAUTH_QA_ROOT` tới artifact có DDL và datadir test. Guard bắt buộc loopback **3328**, đúng datadir, tạo schema mới; không nạp `.env`. Bao gồm tạo/re-login/link hai provider, email trùng, identity ownership, đồng thời, rollback và tài khoản khóa. Đừng bỏ guard hoặc trỏ tới DB chính.
- **Kết quả đợt này:** TypeScript và Webpack production build cách ly PASS; 61/61 test auth/hồi quy + 8/8 MySQL QA PASS (gồm callback thật của ứng dụng → MySQL QA → JWT website, provider fixture). Browser kiểm Login desktop và Register mobile 390px, light/dark: hai nút có nhãn trạng thái đúng, form email/mật khẩu còn nguyên, không tràn ngang. Credentials Google/Facebook local chưa được cấu hình đầy đủ. Chưa kiểm consent thật, token thật, callback/domain public hoặc quyền non-role Meta.

Sau cấu hình, chủ dự án tự dùng tài khoản được phép (không gửi password/token trong chat):

1. Từ Login/Register, chọn từng provider: lần đầu tạo một Member, đăng xuất/đăng nhập lại vẫn đúng Profile/IP.
2. Dùng provider có email trùng local: phải bị yêu cầu đăng nhập cũ; đăng nhập rồi bấm liên kết tại Security. Logout và dùng mỗi provider phải vào cùng hồ sơ; email/password vẫn hoạt động.
3. Thử hủy consent, callback cũ/hết hạn, mở hai tab, logout/chuyển user giữa lúc liên kết: không tạo nhầm phiên/identity. Identity đã thuộc người khác phải bị từ chối.
4. Dùng `next` nội bộ của Discovery/Cyber Lab: quay lại đúng trang; URL ngoài bị đưa về `/`. Thử người dùng Google ngoài tổ chức và Facebook không có app role trên môi trường public đã phê duyệt.

Tài liệu chính thức: [Google server flow](https://developers.google.com/identity/openid-connect/openid-connect), [Google audience](https://support.google.com/cloud/answer/15549945), [Meta manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/), [Meta secure requests](https://developers.facebook.com/docs/graph-api/guides/secure-requests/), [Meta versions](https://developers.facebook.com/docs/graph-api/changelog/versions/).

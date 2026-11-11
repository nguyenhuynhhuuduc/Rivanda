# Tái cấu trúc nội dung — giai đoạn 1

Ngày: 09/11/2026. Phạm vi: routing, liên kết/SEO và SEC-06 + nhánh kiểm duyệt ảnh của DATA-03. Không migration, đổi dữ liệu, dependency, auth hoặc deploy. Đây là tài liệu chuẩn bị; các tính năng giai đoạn sau chưa được triển khai.

**Cập nhật theo yêu cầu mới:** xem mục “Blog → Discovery → Profile → JourneyStory Maps” cuối tài liệu; mục đó có ưu tiên với định hướng cũ dưới đây. Resources đã gỡ khỏi điều hướng chung; Discovery tạm độc lập, không CTA JourneyStory; Blog hiện dùng list/search trên schema cũ. Các kết quả 68 test/46 HTTP và danh sách 53 file bên dưới là lịch sử giai đoạn 1, không phải kết quả lượt cập nhật mới.

**Blog Foundation đã triển khai trong source (chưa áp dụng DB chính):** xem mục “Blog Foundation — triển khai và xác minh” cuối tài liệu và [runbook 006](sql/BLOG_FOUNDATION_MIGRATION.md). Các câu “chưa có backend Blog” trong các mốc dưới đây là lịch sử; hiện backend mới chỉ được xác minh trên DB test, DB chính vẫn khóa chức năng mới cho đến khi 006 sẵn sàng.

## Route và tương thích

| URL cũ | URL chuẩn |
|---|---|
| `/discovery` | Giữ URL cho trang giới thiệu cộng đồng, có link JourneyStory; chưa có newsfeed |
| `/discovery/explore`, `/trending`, `/journeys`, `/albums`, `/locations` (cùng tiền tố `/discovery`) | `/journeystory/explore`, `/trending`, `/journeys`, `/albums`, `/locations` (cùng tiền tố `/journeystory`) |
| `/discovery/journeys/:slug`, `/discovery/albums/:slug`, `/discovery/tags/:slug` | Đổi tiền tố thành `/journeystory`, giữ slug |
| `/discovery/photos/:id`, `/discovery/:uuid` | `/journeystory/photos/:id` |
| `/documents`, `/document` | `/resources` — hub giữ nội dung Blog/tài liệu/dự án hiện có |
| `/documents/resources` | `/resources/documents` — danh sách, tìm/lọc và phân trang |
| `/documents/resources/:id` | `/resources/:id` |
| `/documents/projects` | `/resources/projects` |
| `/documents/blog`, `/documents/blog/:slug` | Giữ nguyên |
| `/document/:slug` | Giữ đích tương thích `/documents/blog/:slug` |

Redirect 308 liệt kê cụ thể trong `next.config.mjs`; không có wildcard toàn bộ `/discovery`. Query được chuyển tiếp, không đổi ID/slug hay storage key. Route cũ tái xuất page mới để tránh hai bản triển khai khác nhau. API `/api/photos`, `/api/documents`, quyền xem/tải và vị trí uploads giữ nguyên; chỉ cập nhật URL quay lại sau đăng nhập. Không sao chép hoặc xóa dữ liệu để đổi route.

Navigation thêm JourneyStory/Blog/Resources, giữ Discovery/Cyber Lab/Shop. Home giữ nguyên source/settings: link cũ `/discovery` trên Home nay mở trang giới thiệu cộng đồng, từ đó có lối tới JourneyStory; không thể đồng thời giữ root này làm thư viện cũ và cộng đồng mới. Các card ảnh/album/hành trình dùng chung chuyển trực tiếp sang JourneyStory. Link cũ lưu trong DB/thông báo vẫn dùng được nhờ redirect, không chạy UPDATE dữ liệu.

## Hai nhánh lỗi được xử lý

- **SEC-06:** metadata dùng cùng chính sách truy cập với page. Private/chưa xuất bản không trả title/description cho người không có quyền. Owner/Admin được xem; metadata công khai của tài liệu members đã xuất bản được giữ. Nội dung không công khai đặt noindex; sitemap chỉ có tài liệu public.
- **DATA-03 — duyệt ảnh:** kiểm quyền server, UUID và decision runtime; từ chối cần lý do. Chỉ cập nhật `WHERE id = ? AND status = 'pending'`, kiểm affectedRows; thao tác thua cuộc không gửi thông báo/log thành công. Không cần đổi schema. Các nhánh DATA-03 khác như report trùng, slug và toggle đồng thời **chưa xử lý**. Chưa có version nội dung để giải quyết trường hợp sửa/resubmit rồi quay lại pending; sẽ bổ sung khi xây workflow sửa bài.

## Ma trận quyền và trạng thái — định hướng cần duyệt riêng

| Vai trò | Hiện tại | Định hướng Discovery mới |
|---|---|---|
| Guest | Xem ảnh/Blog công khai; thông tin tài liệu members; không tương tác ghi dữ liệu | Chỉ xem bài public đã duyệt, đăng nhập để tương tác |
| Member | Chỉnh hồ sơ mình; like/save/comment/report/follow; chưa có content.submit | Đăng status/bài/nhiều ảnh; sửa/xóa bài mình qua kiểm ownership server |
| Contributor | Gửi ảnh pending, xóa ảnh mình | Quyền User, không mặc nhiên được duyệt nội dung |
| Moderator | Duyệt ảnh, xử lý comment/report | Duyệt/report theo quyền; không sửa hồ sơ hoặc chiếm quyền tác giả |
| Admin | Quản lý hành trình/album/ảnh/Blog/Documents | Quản lý biên tập và cộng đồng; mọi thao tác vẫn kiểm quyền server |

- JourneyStory: album/ảnh/hành trình biên tập do Admin quản lý. Hiện ảnh có draft/pending/published/rejected/archived, album có is_published; hành trình/status chưa có trạng thái xuất bản riêng. Chưa tự lọc/xóa ảnh contributor cũ vì cần quyết định phân loại dữ liệu.
- Blog: tiếp tục bảng posts và draft/published; không đổi enum hay route để ghép vào cộng đồng.
- Resources: tiếp tục documents với is_published, public/members/private và can_download. Quyền tải độc lập với metadata công khai.
- Discovery dự kiến: tách trạng thái biên tập `draft/submitted/published/archived/deleted` khỏi quyết định duyệt `pending/approved/rejected`. Chỉ public + published + approved xuất hiện cho guest. Sửa nội dung đã duyệt phải có revision/version và chính sách duyệt lại được chốt trước khi làm.
- Profile: giữ avatar/bio/follow/ảnh hiện có; thêm danh sách bài được phép xem, quản lý bài theo author_id; kiểm cả ownership, visibility và trạng thái ở Server Action/Route Handler.

## Kiến trúc/schema dự kiến — chưa tạo SQL hoặc bảng

1. Giữ `trips/photos/albums/album_photos/status_updates` cho JourneyStory; bổ sung trạng thái hành trình, nội dung câu chuyện; `places` (name, maps_url), `trip_places` có thứ tự và tham chiếu địa điểm từ ảnh. URL Maps phải kiểm HTTPS/host ở server. Không thêm Maps API ở giai đoạn này.
2. Tạo miền `community_posts` riêng (author, loại status/article/photo, body, visibility, publication/moderation, version, timestamps); `community_post_media` có thứ tự và chủ sở hữu. Không trộn attachment bài User vào truy vấn ảnh JourneyStory hiện có.
3. Bổ sung likes/saves có PK kép user/post; comments có post_id/parent_id/author/status; kiểm parent cùng bài. Reports có target hợp lệ và chống report mở trùng; moderation_events lưu actor/quyết định/version.
4. Tái sử dụng tags qua bảng liên kết mới; topics và liên kết post/topic. Reuse follow, thông báo, auth/permissions, Markdown, UI/theme và xử lý thumbnail; không dùng ID ảnh thay ID bài hoặc coi thao tác share URL hiện tại là reshare trong feed.
5. FK/index theo feed `(publication, moderation, visibility, published_at, id)`, tác giả và comments; phân trang cursor. Transaction nội dung–tags–media; quyền media theo bài cha. Có quota ảnh/tổng request, rate limit và thao tác like/save đặt trạng thái đích để xử lý retry an toàn.

## Lộ trình MVP

1. Giai đoạn hiện tại: route tương thích, trang giới thiệu Discovery, hai lỗi và test; dữ liệu cũ giữ nguyên.
2. Theo yêu cầu riêng: giao diện JourneyStory/Discovery/Profile bằng fixture, giữ theme và responsive; chốt ma trận quyền/trạng thái/URL trước chức năng.
3. Theo phê duyệt riêng: backup/restore rehearsal, migration bổ sung và server service; bài text/nhiều ảnh, feed mới nhất, CRUD của chủ sở hữu.
4. Hoàn tất like/save/comment/reply/share, hashtag/topic/search/phổ biến, kiểm duyệt/report/chống spam và phân trang trước khi mở cộng đồng. Kiểm guest/member/contributor/moderator/Admin, truy cập chéo tài khoản, lỗi upload và concurrency trong DB test cách ly.

## Bằng chứng và giới hạn

- `tests/content-restructure.test.cjs`: matcher redirect của Next, metadata/page theo vai trò, dữ liệu không tồn tại, decision/UUID/quyền, reject thiếu lý do, duyệt đồng thời, retry, sitemap chuẩn.
- Test hiện có `upgrade.test.cjs`, `staging-security.test.cjs` kiểm hồi quy auth/session/OAuth bằng fixture, quyền ảnh và giữ dữ liệu khi lỗi. Chỉ cập nhật URL quay lại tải ảnh trong test theo route chuẩn mới.
- Không có `.git`; dùng snapshot/hash trước và sau sửa, không suy đoán lịch sử thay đổi. Không chạy test ghi trên DB thật. Kết quả mock không chứng minh workflow trên MySQL thật, Railway hoặc OAuth provider thật.
- Bộ schema/dữ liệu được SELECT ở khảo sát trước: 19 bảng liên quan tồn tại; 1 trip, các bảng bài/ảnh/album/tài liệu/tương tác còn trống. Giai đoạn này không ghi DB.
- Các lỗi ngoài hai nhánh đã giao giữ nguyên, gồm bookmark thiếu validation đối tượng, transaction tags/album/upload, chống spam và phân trang chưa đầy đủ. Không coi giai đoạn này là hoàn thiện mạng xã hội hay chứng nhận production.

## Kết quả kiểm tra kết thúc

- TypeScript source: đạt với `tsc --noEmit --incremental false --pretty false`.
- `node --test tests/content-restructure.test.cjs tests/upgrade.test.cjs tests/staging-security.test.cjs`: **68/68 đạt** (32 test mới và 36 test hồi quy). Tất cả dùng mock/fixture, không có truy vấn ghi DB thật.
- Production build Next 16.4.5: đạt trên bản sao cách ly; không có .env/uploads thật, thay duy nhất module DB trong bản sao bằng fixture tổng hợp. Query viết bị chặn, riêng tăng view Blog là no-op trong RAM. Nguồn ứng dụng không chứa harness này. Google Fonts cần quyền mạng; lần đầu lỗi tải font, đã tải được và build lại đạt. Harness ban đầu có lỗi kiểu pool, đã sửa kiểu trong bản sao trước build đạt; không sửa source để vượt kiểm tra.
- HTTP production cách ly: **46/46 đạt**; trang mới, chi tiết ảnh/album/hành trình, route cũ, query Unicode/query lặp, canonical, sitemap, Home/Blog/Profile/Auth/Shop và guest guard Account/Admin/Cyber Lab. Không thao tác gửi/xóa/duyệt lên DB thật.
- Với Suspense/streaming, private/draft và auth có thể trả HTTP 200 kèm notFound/noindex hoặc meta refresh/RSC redirect; kiểm cả nội dung HTML và không có marker private/draft, không ghi nhầm là HTTP 404/307 ở mọi trường hợp.
- Browser UI/responsive/dark-light: **chưa kiểm được**; cua_repl bị timeout/Statsig trước khi tạo tab. Không coi HTTP hoặc JSX fixture là kiểm thử browser. Không đổi CSS/theme/layout tổng thể; cần xem lại menu mở rộng ở desktop/mobile bằng browser.
- Đối chiếu snapshot: **37 file sửa, 16 file mới, 0 file mất**. Hash Home, Blog, Auth, Admin Dashboard, Cyber Lab/Simulator/IP/session/Shop, SQL/scripts, package/lock và AGENTS giữ nguyên. Những component dùng chung chỉ đổi link/navigation như danh sách dưới.

## Danh sách file của đợt này

File sửa:

- `src/app/(light)/account/actions.ts`
- `src/app/(light)/account/collections/[id]/page.tsx`
- `src/app/(light)/account/comments/page.tsx`
- `src/app/(light)/account/content/page.tsx`
- `src/app/(light)/account/saved/page.tsx`
- `src/app/(light)/discovery/actions.ts`
- `src/app/(light)/discovery/albums/page.tsx`
- `src/app/(light)/discovery/albums/[slug]/page.tsx`
- `src/app/(light)/discovery/explore/page.tsx`
- `src/app/(light)/discovery/journeys/page.tsx`
- `src/app/(light)/discovery/journeys/[slug]/page.tsx`
- `src/app/(light)/discovery/locations/page.tsx`
- `src/app/(light)/discovery/page.tsx`
- `src/app/(light)/discovery/photos/[id]/page.tsx`
- `src/app/(light)/discovery/tags/[slug]/page.tsx`
- `src/app/(light)/discovery/trending/page.tsx`
- `src/app/(light)/documents/actions.ts`
- `src/app/(light)/documents/page.tsx`
- `src/app/(light)/documents/projects/page.tsx`
- `src/app/(light)/documents/resources/page.tsx`
- `src/app/(light)/documents/resources/[id]/page.tsx`
- `src/app/(light)/search/page.tsx`
- `src/app/admin/comments/page.tsx`
- `src/app/admin/discovery-actions.ts`
- `src/app/admin/document-actions.ts`
- `src/app/admin/reports/page.tsx`
- `src/app/api/documents/[id]/download/route.ts`
- `src/app/api/photos/[id]/download/route.ts`
- `src/app/sitemap.ts`
- `src/components/site/Cards.tsx`
- `src/components/site/DocRow.tsx`
- `src/components/site/PhotoTile.tsx`
- `src/components/site/SiteFooter.tsx`
- `src/components/site/SiteHeader.tsx`
- `src/lib/discovery.ts`
- `tests/upgrade.test.cjs`
- `next.config.mjs`

File mới:

- `src/app/(light)/journeystory/albums/page.tsx`
- `src/app/(light)/journeystory/albums/[slug]/page.tsx`
- `src/app/(light)/journeystory/explore/page.tsx`
- `src/app/(light)/journeystory/journeys/page.tsx`
- `src/app/(light)/journeystory/journeys/[slug]/page.tsx`
- `src/app/(light)/journeystory/locations/page.tsx`
- `src/app/(light)/journeystory/page.tsx`
- `src/app/(light)/journeystory/photos/[id]/page.tsx`
- `src/app/(light)/journeystory/tags/[slug]/page.tsx`
- `src/app/(light)/journeystory/trending/page.tsx`
- `src/app/(light)/resources/documents/page.tsx`
- `src/app/(light)/resources/page.tsx`
- `src/app/(light)/resources/projects/page.tsx`
- `src/app/(light)/resources/[id]/page.tsx`
- `tests/content-restructure.test.cjs`
- `CONTENT_RESTRUCTURE_PLAN.md`

## Blog → Discovery → Profile → JourneyStory Maps — yêu cầu mới

### Đối chiếu và phần không cần DB

| Phần | Hiện tại sau lượt này | Còn chờ schema/backend |
|---|---|---|
| Resources | Gỡ khỏi header/footer, breadcrumb Blog và kết quả search chung; Home chỉ đổi nhãn/link theo xác nhận của chủ dự án. Dữ liệu tài liệu/dự án Home vẫn hiện, không còn link. | Không xóa bảng/files/API; route archive và Account/Admin vẫn dùng được. Sitemap public cũ giữ để tránh tự thay SEO; gỡ menu không có nghĩa là tài liệu public trở thành private. |
| Blog | Giữ `/documents/blog` và chi tiết; danh sách dọc, thumbnail, tác giả lấy bằng SELECT theo trang, ngày đăng, tags, search title/summary, phân trang giữ q và empty state. Không đổi model/query dùng chung của Cyber Lab. | Chủ đề, User CRUD, các trạng thái duyệt và Admin chủ đề/duyệt chưa hoạt động. Không dùng tag/category Cyber Lab giả làm chủ đề. |
| Discovery | Trang giới thiệu cộng đồng độc lập; không CTA chính/redirect sang JourneyStory, không nút tương tác giả. | Toàn bộ newsfeed/post/media/like/save/comment/reply/report/filter/popular/rate limit mới chưa mở. |
| Profile | Giữ avatar/bio/follow/ảnh và chức năng cũ. | Quản lý Blog/Discovery của chủ sở hữu chưa triển khai. |
| JourneyStory | Giữ toàn bộ route, album/ảnh/hành trình và redirect cũ. | Maps chưa mở. Luồng gửi ảnh contributor/duyệt ảnh cũ vẫn tồn tại; yêu cầu chỉ Admin quản lý JourneyStory cần điều chỉnh riêng, không tự đổi quyền trong lượt này. |

Không đọc/ghi DB thật trong lượt này; không sửa nội dung đã đăng, auth, upload logic hay nghiệp vụ Home/Cyber Lab/Shop. `DocRow` thêm tùy chọn bỏ link chỉ cho Home; mặc định vẫn giữ link trên archive và Account. CTA Home cấu hình nội bộ tới Resources/Documents cũ được trình bày thành Blog, không UPDATE settings; CTA Cyber Lab/Shop/custom khác giữ nguyên. Link tài liệu cũ đã lưu trong DB và URL trực tiếp không bị đổi hoặc vô hiệu.

### 1. Blog trước — draft 006

`sql/planned/006_blog_foundation.sql` tạo **blog_topics, blog_post_details, blog_review_events, content_rate_buckets**. Không ALTER `posts`, `users`, tag/ảnh cũ hoặc bất kỳ bảng Cyber Lab nào. Blog dùng `posts` cũ để giữ ID/slug/cover/tags; bảng mở rộng chỉ dành cho `posts.type='blog'`. FK không tự kiểm được type, nên mọi service và pre/postflight phải kiểm `type='blog'`.

- Năm chủ đề khởi đầu nằm trong SQL nháp: **Kinh nghiệm du lịch, Nấu ăn, Đời sống, Làm đẹp, Sức khỏe**; chưa được tạo trong DB. Slug ổn định/UNIQUE, đổi tên không đổi slug. Có is_visible/sort_order/deleted_at.
- Admin tạo/sửa/ẩn/sắp xếp/xóa chủ đề. Mặc định xóa mềm, giữ slug đã dùng. Nếu xóa cứng được duyệt riêng, FK **SET NULL** topic_id; không xóa `posts`. Bài không có chủ đề vẫn tồn tại và hiển thị “Chưa phân loại”. Ẩn chủ đề chỉ ẩn lựa chọn/filter; không tự ẩn bài hoặc công khai lại bài. Trang chủ đề ẩn trả notFound/noindex; topic còn hoạt động có URL `/documents/blog?topic=<slug>`.
- `blog_post_details` có draft/pending/published/rejected/hidden/deleted, revision, reviewed_revision, reviewer/note. Backfill chỉ Blog: giữ published/draft từ posts, topic NULL, không bịa tác giả/biên bản duyệt. Bài cũ đã xuất bản tiếp tục được xem sau khi có backend tương thích.
- User active, kể cả member, tạo nháp/gửi duyệt/sửa/xóa bài mình. Đăng mới User luôn draft/pending, không nhận author/status/reviewer từ client. Sửa bài đã xuất bản chuyển `posts.status='draft'` và workflow pending trong cùng transaction để URL/ảnh không lộ phiên bản chưa duyệt; giữ slug, tăng revision. Xóa mềm cũng đưa posts về draft, giữ cover/file và nội dung để phục hồi.
- Admin giữ quyền xuất bản trực tiếp Blog và duyệt User. Moderator chưa được cấp quyền duyệt Blog nếu chủ dự án chưa yêu cầu. CAS kiểm expected revision + pending, không duyệt version cũ; ghi sự kiện/đổi posts.status/workflow/tags cùng transaction, thông báo sau commit.
- Backend Blog mới phải tích hợp nhánh Blog của form Admin cũ trước khi mở cho User: không để writer cũ bỏ qua workflow. Không đổi enum/query chung `posts` hoặc handler Cyber Lab. Không cho đổi type giữa Blog/Cyber Lab từ luồng Blog mới.
- Public query chỉ Blog + posts.published + workflow.published, lọc chủ đề visible; slug/ID/URL cũ giữ nguyên. Metadata, search, cover và API ảnh đều kiểm trạng thái hiệu lực; `image-access.ts` phải được bổ sung quyền cho owner/nháp Blog khi triển khai, không mở public toàn bộ uploads.

### 2. Discovery độc lập — draft 007

`sql/planned/007_discovery_community.sql` tạo **community_topics/posts/media/post_tags/likes/saves/comments/reports/review_events**, không dùng photos/trips/albums làm attachment. Tái sử dụng tags, auth/permission helper, thumbnail, follow, mẫu thông báo và Markdown an toàn; không sao chép lại Desktop hoặc auth.

- Guest chỉ xem public + published + chưa deleted. User active quản lý bài mình; Admin duyệt/ẩn và xử lý report, có thể đề xuất Moderator duyệt Discovery qua quyền cụ thể. Kiểm ownership/visibility/trạng thái ở server cho từng action và media route.
- Status ngắn tối đa 1.000 ký tự; bài dài có title/body; gallery phải có ảnh thuộc chủ sở hữu trước khi publish. Các trường hợp chỉ ảnh, attachment tạm và lỗi upload cần workflow staging/compensation riêng; schema nháp chưa cung cấp upload API hoặc cơ chế thu gom file.
- Media có thứ tự UNIQUE, FK kép `(post_id, owner_id)` kiểm chủ sở hữu; chỉ JPEG/PNG/WebP, giới hạn byte/kích thước/tổng request, số ảnh và quota. Không lưu ảnh community vào bảng JourneyStory, không mở quyền dựa riêng UUID ảnh. Original/preview/download theo quyền bài cha.
- Like/save PK kép, API đặt trạng thái đích để retry không toggle ngược. Comment có FK kép parent/post tránh reply chéo bài; server giới hạn độ sâu, chống chu kỳ và kiểm bài còn tương tác được. Report có FK target thật, CHECK đúng một target, UNIQUE generated key cho một report open/user/target. Xóa mềm giữ báo cáo/lịch sử; không cascade nội dung người khác.
- Feed Mới nhất dùng cursor published_at/id. Phổ biến phải tính từ likes/comments thật trong cửa sổ thời gian đã chốt, có tie-break ID và chiến lược snapshot; không hiển thị số liệu giả. Tìm kiếm/topic/tag và phân trang đều query server, có index theo feed/tác giả/chủ đề.
- Share MVP là URL bài độc lập, không giả thành reshare có số đếm. Mọi thao tác ghi cần đăng nhập; không nút tương tác có vẻ hoạt động trước backend.
- `content_rate_buckets` của 006 dùng transaction/khóa cùng thao tác submit/comment/report/upload; giới hạn và retry rõ ràng. Cần quota tệp, kích thước body, burst/rate limit user, kiểm MIME thật, chống XSS/link độc hại và tránh spam notification trước mở công khai. Chưa triển khai bất kỳ cơ chế này trong lượt hiện tại.

### 3. Profile sau hai backend

Không cần migration riêng ở MVP: dùng users hiện có, posts.author_id và community_posts.author_id với index tương ứng. Public Profile chỉ query nội dung được phép xem; trang quản lý của mình hiển thị trạng thái/note duyệt và CRUD của chính mình. Mọi UPDATE/DELETE có author_id + expected revision, không tin author từ form. Không thay avatar/bio/session hiện có, không tạo bảng Profile trùng users.

### 4. JourneyStory Maps cuối — draft 008

`sql/planned/008_journeystory_maps.sql` tạo **journey_places, journey_trip_places, journey_photo_places**; giữ nguyên location_name cũ, không tự suy đoán URL Maps hoặc gọi geocoding. Admin nhập name/maps_url và gắn trip/photo; không tạo public form quản lý.

Backend phải parse URL server: HTTPS, không userinfo/port lạ/ký tự điều khiển, hostname chính xác và đường dẫn Maps hợp lệ. Allowlist dự kiến `www.google.com/maps/...`, `google.com/maps/...`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl/maps/...`; không chấp nhận suffix giả như `google.com.example`. CHECK SQL chỉ kiểm HTTPS sơ bộ, **không thay validation runtime**. Mở tab mới với noopener/noreferrer, không fetch server tới URL người dùng và không API trả phí. Phân quyền legacy contributor/ảnh cũ phải được xử lý riêng trước khi khẳng định JourneyStory chỉ Admin quản lý; không xóa hoặc tự chuyển dữ liệu cũ sang cộng đồng.

### Quy trình kiểm tra/apply migration — chưa được phép chạy thật

1. Các file ở `sql/planned` là **bản nháp chưa áp dụng**; không nằm trong danh sách SQL top-level mà init-db hiện đọc. Không đăng ký vào runner, không gọi init-db và không tự thực thi bằng Navicat/CLI.
2. Khi được yêu cầu kiểm thử riêng: xác nhận MySQL >=8.0.16/InnoDB, collation và kiểu PK/FK của users/posts/tags/trips/photos; đọc `000_review_preflight.sql`, SHOW CREATE và lịch sử để tránh trùng số migration. Chọn DB test tên riêng, credential chỉ DB đó, không dùng connection production. Dùng dữ liệu tổng hợp.
3. Trước từng draft, bảng đích phải chưa tồn tại; nếu có bất kỳ phần DDL nào thì dừng, không dùng IF NOT EXISTS để che trạng thái áp dụng một phần. Stop-on-first-error; không dùng --force hoặc tắt FOREIGN_KEY_CHECKS. DDL tự commit nên không hứa ROLLBACK toàn migration.
4. 006: kiểm seed đủ 5 slug UNIQUE; backfill thiếu=0/sai type=0/sai trạng thái=0; xóa topic không mất bài; FK/CHECK, draft/pending/public và CAS hai người duyệt. So sánh hash/số bản ghi posts cả Blog/Cyber trước/sau để chứng minh không sửa nội dung cũ. DML seed/backfill có transaction; runner phải rollback và đóng kết nối khi lỗi.
5. 007: kiểm owner kép media, reply cùng bài, UNIQUE like/save/open-report, CHECK, quota/rate atomic, rollback submit nhiều ảnh và lỗi file/DB, không lộ private/nháp qua preview/search/metadata. 008: chỉ mapping mới thay đổi, mọi trip/photo/location_name cũ giữ nguyên; URL validation test với host giả và userinfo.
6. Trước DB thật: chờ phê duyệt riêng, maintenance writer Blog/liên quan, backup DB + uploads mã hóa và restore rehearsal, xác nhận target/schema fingerprint, đủ disk và thời gian. Không áp dụng schema rồi coi là có backend. Giữ tính năng User/community đóng cho tới khi toàn bộ server guard và Admin workflow đã kiểm thử.
7. Rollback ứng dụng ưu tiên tắt writer mới/quay về giao diện đọc cũ, **giữ bảng và nội dung mới** để không mất bài. Nếu DDL lỗi, dừng và kiểm kê phần đã tạo; chỉ xử lý bảng/bản backup theo phê duyệt riêng. Không tự DROP các bảng mới hoặc restore đè DB thật; cần rehearsal và kế hoạch giữ mọi ghi phát sinh sau backup.

Các SQL hiện chỉ được soát xét tĩnh, **chưa kiểm cú pháp/constraint/backfill bằng MySQL test**. Không khẳng định migration đã chạy hoặc tương thích schema thật chỉ vì TypeScript/build đạt.

### Kết quả lượt cập nhật mới và file thay đổi

- TypeScript source đạt; 77/77 test đạt qua `content-structure-next`, `content-restructure`, `upgrade`, `staging-security`. Chín test mới dùng VM/SSR fixture, không nạp env/kết nối DB.
- Production build cuối đạt trên bản sao cách ly không .env/uploads thật; DB được thay bằng fixture, chỉ SELECT giả và no-op tăng view Blog. Không thay pool/logic trong source thật.
- HTTP fixture: 30/30 đạt cho Home/Blog/Discovery/JourneyStory, URL tài liệu cũ, private/nháp và API view, auth guard Account/Admin/Cyber Lab, Shop. Sau chuẩn hóa thêm CTA Home có slash cuối: build lại đạt, 2 smoke HTTP Home/Blog đạt, không lỗi render server.
- Browser IAB hoạt động trở lại: 30 tổ hợp = Home/Blog/Discovery × 1440/1024/768/390/375px × light/dark, không tràn ngang dương. Blog search và pagination giữ q; menu mobile mở được, không Resources, vẫn Cyber Lab/Shop. Theme/viewport thử nghiệm đã khôi phục; screenshot là fixture với placeholder khi không có ảnh bìa, không chứng minh upload hoặc dữ liệu MySQL thật hoạt động.
- SQL chỉ static review: 16 bảng mới, 47 tên constraint không trùng, không reference chưa khai báo và không ALTER bảng hiện có. **Chưa chạy MySQL test/migration**; cú pháp/DDL/constraint/backfill thực tế chưa được xác nhận.
- Không có metadata Git nên không thể xem status/diff lịch sử; snapshot/hash của lượt này xác nhận 9 file sửa + 7 file mới, 0 file mất. Mã nghiệp vụ Cyber Lab/Simulator/Shop/Auth/Admin, posts/settings/permissions/upload dùng chung, API và cấu hình/package/migration cũ giữ hash. Hai file Home chỉ thay link/nhãn theo xác nhận riêng, giữ mọi truy vấn/settings/dữ liệu. Server QA đã dừng; không deploy.

File sửa trong lượt này:

- `src/app/(light)/discovery/page.tsx`
- `src/app/(light)/documents/blog/page.tsx`
- `src/app/(light)/search/page.tsx`
- `src/app/page.tsx`
- `src/components/home/Sections.tsx`
- `src/components/site/DocRow.tsx`
- `src/components/site/SiteFooter.tsx`
- `src/components/site/SiteHeader.tsx`
- `CONTENT_RESTRUCTURE_PLAN.md`

File mới trong lượt này:

- `src/components/blog/BlogListItem.tsx`
- `src/lib/blog-list.ts`
- `tests/content-structure-next.test.cjs`
- `sql/planned/000_review_preflight.sql`
- `sql/planned/006_blog_foundation.sql`
- `sql/planned/007_discovery_community.sql`
- `sql/planned/008_journeystory_maps.sql`

## Blog Foundation — triển khai và xác minh / 09-11-2026

- Đã có Admin topic CRUD (slug bất biến, sort/ẩn, xóa mềm); User draft/submit/own edit/delete; Admin publish/review/reject/hide, row revision, transaction post/topic/tags/review log. Quản lý ở `/account/blog` và `/admin/blog`, chủ đề ở `/admin/blog/topics`. Public URL Blog cũ giữ nguyên, thêm lọc topic/search/page và tên tác giả/chủ đề vào list/detail.
- Bài và chủ đề xóa mềm, giữ content/file. Edit/reject/hide/delete đồng bộ posts.status=draft để Home/search/bookmark/cover cũ không vô tình public bản chưa duyệt. Actor được kiểm lại role/active trong transaction, không tin tác giả/status từ client. Branch Blog của Admin cũ chuyển luồng mới, chặn stale form/đổi type; nhánh Cyber gốc không đổi.
- 006 hiện có **5 bảng**, thêm `blog_foundation_state` so với draft bốn bảng ban đầu. Marker 6 commit cùng seed/backfill; đủ DDL nhưng thiếu marker vẫn khóa chức năng mới. Admin legacy vẫn lưu/xuất bản khi chưa 006, nhưng không hard-delete Blog. Backend mới/5 chủ đề chỉ hoạt động sau apply được duyệt; không tự chạy migration.
- Upload cover: 5MB/24MP, decode JPEG/PNG/WebP thật và re-encode WebP, UUID storage hiện có, strip metadata. User 20 lưu/gửi và 6 cover/15 phút, counter atomic. Cover draft chỉ owner/Admin được đọc; published guest được đọc. Cũ/orphan giữ lại, không GC.
- **TypeScript đạt; 95/95 test đạt = 84 unit/hồi quy + 11 MySQL thực**. MySQL 8.0.46 là instance mới bind loopback/cổng riêng/datadir Temp; schema nền chỉ lấy metadata, data tổng hợp. Backfill không đổi hash bài cũ (gồm metadata legacy), FK/UNIQUE/CHECK, ownership/role giả, concurrent review, rollback lỗi tag, quota 25 yêu cầu/20 commit, marker và ảnh private đã kiểm. Không coi bộ test là restore backup DB chính hoặc load test production.
- Build production cuối đạt trên bản sao đủ source, không .env/uploads thật, DB account giới hạn vào DB test riêng; **không mock/sửa Auth trong bản build**. Source copy đối chiếu hash khớp. HTTP cuối 14/14 đạt: public list/topic/detail, private metadata/cover, guest Account/Admin/Cyber guard và Shop; không lỗi render server.
- Browser dùng Auth thật với account/ảnh tổng hợp trên DB test: login, tạo draft + cover, submit, Admin approve, public article/topic và ảnh tải đúng; topic create/rename/sort/hide giữ slug. Pending không public và cover guest 404 (HTTP), sau approve cover guest 200. Native confirm xóa topic làm công cụ browser bị treo: thao tác xóa UI và ma trận responsive/theme mới **chưa xác minh đầy đủ**, không ghi pass. Logic xóa/không mất bài đã pass MySQL.
- Postflight read-only DB chính: Blog vẫn 0, parent schema users/posts/tags/post_tags giữ nguyên, `blogFoundationReady=false`. Chưa apply 006, không deploy, không tạo account thật/sử dụng password thật. Mã nghiệp vụ Cyber Lab/Simulator/IP/session/Shop/Discovery/JourneyStory/Auth/Home và library posts/users/permissions/uploads, config/dependency/scripts giữ hash. Các shared change chỉ nav Account/Admin, adapter Blog và ACL cover Blog; đã kiểm hồi quy.
- Không có Git metadata; snapshot xác nhận **16 file sửa + 21 file mới, 0 file mất**. Runbook/guard/backfill/rollback: `sql/BLOG_FOUNDATION_MIGRATION.md`. Chưa có autosave/restore UI, tổng quota dung lượng/ngày hoặc housekeeping; không sửa backlog ngoài Blog. Public Profile, Discovery, Journey Maps chưa triển khai trong lượt này.

File sửa:

- `src/app/(light)/account/layout.tsx`
- `src/app/(light)/documents/blog/page.tsx`
- `src/app/(light)/documents/blog/[slug]/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/post-actions.ts`
- `src/app/admin/posts/new/page.tsx`
- `src/app/admin/posts/page.tsx`
- `src/app/admin/posts/[id]/page.tsx`
- `src/components/blog/BlogListItem.tsx`
- `src/lib/blog-list.ts`
- `src/lib/image-access.ts`
- `tests/content-structure-next.test.cjs`
- `tests/staging-security.test.cjs`
- `sql/planned/000_review_preflight.sql`
- `sql/planned/006_blog_foundation.sql`
- `CONTENT_RESTRUCTURE_PLAN.md`

File mới:

- `src/app/(light)/account/blog/actions.ts`
- `src/app/(light)/account/blog/new/page.tsx`
- `src/app/(light)/account/blog/page.tsx`
- `src/app/(light)/account/blog/[id]/page.tsx`
- `src/app/admin/blog/actions.ts`
- `src/app/admin/blog/new/page.tsx`
- `src/app/admin/blog/page.tsx`
- `src/app/admin/blog/topics/page.tsx`
- `src/app/admin/blog/[id]/page.tsx`
- `src/components/blog/BlogEditor.tsx`
- `src/components/blog/BlogEditorScreen.tsx`
- `src/components/blog/BlogManagement.tsx`
- `src/lib/blog-cover.ts`
- `src/lib/blog-policy.ts`
- `src/lib/blog-read.ts`
- `src/lib/blog-revalidate.ts`
- `src/lib/blog-store.ts`
- `sql/BLOG_FOUNDATION_MIGRATION.md`
- `tests/blog-foundation.mysql.test.cjs`
- `tests/blog-foundation.test.cjs`
- `tests/helpers/blog-loader.cjs`

Kết thúc lượt Blog Foundation: build cuối sau ngắt dòng tên/ghi chú dài đạt; app QA và mysqld test đã dừng. Không xóa artefact test hoặc dữ liệu thật. Ma trận responsive/theme mới chưa đo đủ vì browser confirm bị treo; không dùng các kết quả lịch sử để khẳng định toàn bộ UI mới đã pass.

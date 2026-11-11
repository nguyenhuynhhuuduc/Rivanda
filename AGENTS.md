# Quy tắc làm việc với personal-site

Ngày lập: **06/11/2026**. Quy tắc này phản ánh yêu cầu của chủ dự án. Chỉ dẫn mới, rõ ràng của chủ dự án có quyền ưu tiên trong phạm vi được giao; không yêu cầu lại một quyền đã được cấp và còn áp dụng.

## 1. Đọc ngữ cảnh trước khi làm

1. Đọc `PROJECT_CONTEXT.md`, tài liệu này và hướng dẫn cục bộ ở thư mục sắp sửa nếu có.
2. Đọc lại file nguồn liên quan, caller, kiểu dữ liệu, Server Action và schema cần thiết. Tài liệu khảo sát là mốc tham chiếu, không thay thế trạng thái mã hiện tại.
3. Nếu có Git, kiểm tra status/diff để nhận diện thay đổi sẵn có. Nếu không có Git hoặc công cụ không khả dụng, báo đúng giới hạn, không tự init repository hoặc suy đoán lịch sử.
4. Ưu tiên `rg`/`rg --files`; bỏ qua `node_modules`, `.next`, cache, binary và output không cần thiết. Không quét giá trị bí mật.

## 2. Phạm vi và quyền thực hiện

- Chủ dự án giao việc từng bước, **giao diện trước rồi chức năng**. Không chủ động phát triển phần tiếp theo, sửa backlog hoặc mở rộng phạm vi.
- Mỗi yêu cầu: xác định mục tiêu, nơi cần sửa, phụ thuộc và hành vi cần giữ; thực hiện thay đổi nhỏ nhất nhưng đầy đủ.
- Chỉ sửa code/UI khi yêu cầu hiện tại cho phép. Yêu cầu phân tích/chỉ đọc không cấp quyền sửa.
- Các lỗi OPEN trong `PROJECT_CONTEXT.md` là thông tin cần biết, không phải danh sách việc được tự động thực hiện.
- Vấn đề ngoài phạm vi: báo cáo và giữ nguyên. Nếu một phụ thuộc ngoài phạm vi bắt buộc phải sửa mới hoàn thành được yêu cầu, nêu ảnh hưởng cụ thể để chủ dự án quyết định.
- Không cài/update package, đổi framework/kiến trúc, thay cấu hình môi trường, chạy migration hoặc sửa dữ liệu thật nếu chưa được yêu cầu cụ thể.
- Không tạo/cập nhật tài liệu ngoài phạm vi được giao; không ghi đè hoặc xóa tài liệu có sẵn. Khi được giao cập nhật, chỉnh có chủ đích và giữ nội dung không liên quan.
- Sau khi hoàn tất yêu cầu: báo kết quả và dừng. Không tự commit/push/deploy, gửi thông báo bên ngoài hoặc làm tính năng kế tiếp nếu chưa được yêu cầu.

## 3. Giữ nguyên chức năng và giao diện không liên quan

- Tái sử dụng component, UI kit, design token, utility và ma trận quyền hiện có trước khi tạo cấu trúc mới.
- Không đổi thiết kế tổng thể, font/màu, navigation, route, API/action signature, trạng thái dữ liệu hoặc quyền truy cập ngoài yêu cầu.
- Yêu cầu giao diện phải giữ form action, tên field, validation, điều kiện quyền, URL và luồng nghiệp vụ trừ khi người dùng yêu cầu thay đổi chúng.
- Với sửa `globals.css`, kit, shell/header/footer, model Photo/Post/Document hoặc auth: kiểm tra caller và các trang dùng chung; chú ý Home, light/dark, auth và admin có khung khác nhau.
- Không xóa component/luồng chỉ vì trông chưa dùng nếu chưa đối chiếu đủ references. Không sửa hàng loạt hoặc format lại file ngoài phạm vi.
- Bảo toàn thay đổi sẵn có của người dùng; không reset/revert/clean hoặc xóa dữ liệu để làm test chạy được.

## 4. Bảo mật

- Không in, sao chép hoặc đưa vào code/tài liệu/log giá trị `.env`, API key, token, mật khẩu, JWT, OAuth code hay reset link thật.
- Chỉ dùng cấu hình bí mật bên trong công cụ được ủy quyền khi thực sự cần; không dump env, connection string, thông tin tài khoản hoặc lỗi chứa bí mật. Tài liệu chỉ ghi tên biến và lỗi đã lược bỏ chi tiết nhạy cảm.
- Mọi Server Action/Route Handler nhạy cảm phải kiểm tra đăng nhập, quyền và quyền sở hữu ở server; ẩn nút/menu hoặc guard layout không đủ.
- TypeScript không thay thế validation runtime. Khi được sửa luồng liên quan, kiểm tra kiểu, UUID, enum, độ dài, URL, file và trạng thái chuyển đổi tại ranh giới đầu vào.
- Giữ truy vấn có tham số; không ghép SQL từ đầu vào chưa kiểm soát. Không bỏ kiểm tra access/published/download ở file routes.
- Giữ cơ chế xử lý Markdown và giới hạn upload; không bật HTML thô hoặc nới quyền file để giải quyết lỗi giao diện.
- Không làm suy yếu session, OAuth state, password hashing, rate limit hoặc phân quyền. Tham số scrypt ở `lib/password.ts` và `scripts/create-admin.mjs` cần đồng bộ nếu được yêu cầu thay đổi.
- Kiểm thử bằng dữ liệu tổng hợp/mock khi có thể. Không thử khai thác gây hỏng dữ liệu, gửi email thật, làm sập dịch vụ hoặc dùng tài khoản người khác.

## 5. Database và filesystem

- Không thay đổi database hoặc chạy `init-db`, `create-admin`, seed/migration/DDL/DML làm bước kiểm tra mặc định.
- Khi chỉ được audit read-only: chỉ dùng truy vấn metadata/SELECT phù hợp, lấy tối thiểu thông tin cần thiết, không lấy dữ liệu người dùng/bí mật; không thay quyền hoặc reset mật khẩu để kết nối được.
- Không khẳng định schema thật đã đồng bộ từ việc code build được hoặc từ tên migration. Kiểm tra trước đây bị `ER_ACCESS_DENIED_ERROR`; coi schema thật là chưa xác minh cho đến khi có bằng chứng mới.
- Không gọi tùy tiện trang/API trên dữ liệu thật trong audit: GET bài viết có thể tăng view, GET thông báo đánh dấu đã đọc, GET download tài liệu tăng lượt tải.
- Khi có yêu cầu thay đổi dữ liệu/schema: trước tiên chuẩn bị phương án kiểm kê, sao lưu/khôi phục và kiểm tra tương thích; quyền viết thật/migration phải nằm trong chỉ dẫn được cấp. Không thực hiện thay đổi phá hủy chỉ để thử nghiệm.
- Với thay đổi nghiệp vụ được giao, xác định transaction cho các bước SQL liên quan và xử lý lỗi đồng thời. Không xóa file còn được DB tham chiếu trước khi thay thế đã thành công; DB và filesystem không có transaction chung.
- Không xóa ảnh/tài liệu mồ côi, đổi tên storage hoặc dọn cache/user file khi chưa được yêu cầu. `uploads` là dữ liệu cần bảo toàn, không phải build output.
- Migration hiện có rủi ro ghi nhận hoàn tất một phần; không tự chạy lại migration 004 hoặc sửa lịch sử migration để “đồng bộ”.

## 6. Kiểm tra sau thay đổi

Chọn kiểm tra theo phạm vi và mức rủi ro; không tạo test hình thức cho chỉnh sửa tài liệu hoặc thay đổi giao diện nhỏ, dễ đảo ngược.

| Phạm vi | Kiểm tra tối thiểu phù hợp |
|---|---|
| Chỉ tài liệu | Đọc lại nội dung, đường dẫn/tham chiếu, tính nhất quán; xác nhận chỉ tài liệu được phép thay đổi |
| TypeScript/component | `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` khi phù hợp; kiểm tra imports/callers |
| Giao diện/layout | Kiểm tra trang bị sửa, các trạng thái rỗng/lỗi/đăng nhập có liên quan; desktop/tablet/mobile và keyboard nếu môi trường cho phép; đối chiếu theme và trang dùng chung |
| Logic/action/auth | Kiểm thử có ý nghĩa cho nhánh thành công/thất bại, quyền và ownership; dùng mock/fixture trước; kiểm tra các luồng bị ảnh hưởng |
| Storage/database | Xác minh tác động schema/quan hệ và lỗi giữa chừng bằng môi trường cách ly; không test ghi vào DB thật nếu chưa được phép |
| Dependency/cấu hình/build | Kiểm tra tương thích và build phù hợp; báo rõ điều kiện môi trường, không cập nhật tự động để vượt lỗi |

- Build/dev ghi output và có thể chạm dịch vụ qua render/request. Nếu yêu cầu giữ nguyên workspace/dữ liệu thật, dùng bản sao tạm ngoài cây nguồn, không sao chép `.env` hay dữ liệu thật, không trỏ tới DB thật. Không cài dependency hoặc đổi code chỉ để làm kiểm tra này chạy.
- Google Fonts cần mạng khi build; lỗi DNS/sandbox không tự chứng minh lỗi source. Build thành công trước đây trên bản sao không có DB thật cũng không chứng minh runtime tích hợp thành công.
- Không bấm/gọi thao tác gửi, xóa, follow, like, reset, duyệt hoặc download có ghi số liệu trên dữ liệu thật chỉ để chụp/kiểm tra giao diện.
- Nếu không chạy được kiểm tra vì thiếu quyền, công cụ, DB hoặc dữ liệu: báo chính xác phần chưa kiểm tra; không ghi là đã pass.
- Sau khi kiểm tra phù hợp đã pass, chỉ mở rộng/chạy lại khi có thay đổi mới, lỗi hoặc rủi ro chưa giải quyết. Không sửa issue ngoài phạm vi để đạt một kết quả kiểm tra đẹp hơn.

## 7. Báo cáo và lưu ngữ cảnh

- Báo cáo bằng tiếng Việt, ngắn gọn, nêu kết quả trước.
- Ghi rõ file đã thay đổi, thay đổi gì và vì sao; kiểm tra đã chạy/kết quả; giới hạn hoặc rủi ro còn lại có liên quan.
- Phân biệt: lỗi tái hiện trên runtime thật; code/mock xác nhận; rủi ro có điều kiện; phần chưa kiểm tra. Luôn kèm file/hàm hoặc kết quả tương ứng cho kết luận quan trọng.
- Không ghi “đã sửa”, “DB đồng bộ”, “an toàn production” khi chưa có bằng chứng đủ phạm vi.
- Giữ ID phát hiện trong `PROJECT_CONTEXT.md` khi có yêu cầu cập nhật; chỉ đánh dấu resolved sau thay đổi được giao và kiểm tra tương ứng. Không xóa lịch sử xác minh/giới hạn để làm báo cáo trông hoàn chỉnh hơn.
- Lần tạo tài liệu ngày 06/11/2026 chỉ tạo hai file Markdown. Những lỗi đang mở chưa được sửa. Chờ yêu cầu riêng tiếp theo của chủ dự án.

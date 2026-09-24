# Inbox thủ công cho Facebook Messenger

## Mục tiêu

Cho phép nhân viên nhận tin nhắn văn bản mới từ một Facebook Page đã kết nối, xem và trả lời khách trong Inbox hiện có. Dùng lại Facebook Page connection, hội thoại, tin nhắn, phân quyền và realtime của NhuuChat; không tạo một hệ thống Inbox riêng cho Facebook.

## Phạm vi MVP

- Một Facebook Page cho mỗi tài khoản NhuuChat, theo giới hạn kết nối hiện tại.
- Tiếp tục lưu Page Access Token đã mã hóa trong `FacebookPageConnection`.
- Giữ nhập thủ công Page ID + Page Access Token để test nội bộ; mở rộng OAuth hiện có để yêu cầu quyền Messenger.
- Nhận tin nhắn văn bản mới sau khi Page đăng ký webhook với Meta.
- Hiển thị tin đến trong Inbox, cập nhật danh sách và khung chat qua Socket.IO.
- Nhân viên gửi tin nhắn văn bản từ Inbox tới khách qua Messenger Send API.
- Chống ghi trùng sự kiện webhook và giữ phạm vi truy cập đúng tài khoản/Page.
- Đồng bộ Page echo để tin nhân viên gửi từ NhuuChat không bị ghi hai lần; có thể nhận diện tin Page gửi từ Messenger nếu Meta gửi echo tương ứng.

## Không thuộc MVP

- Chatbot AI tự động trả lời. Chỉ xem xét sau khi luồng nhân viên nhận/gửi tin ổn định.
- Gửi/hiển thị ảnh, file, audio, video, template hoặc postback.
- Nhập lịch sử hội thoại cũ từ Conversations API.
- Nhiều Page trong một tài khoản NhuuChat, gọi thoại/video, mẫu marketing hoặc gửi tin ngoài chính sách Messenger.
- Tự động vượt qua giới hạn thời gian gửi của Meta.

## Hiện trạng trong repo

- `FacebookPageConnection` đã lưu Page ID và Page Access Token được mã hóa.
- Kết nối thủ công đã có; OAuth hiện xin `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
- `FacebookPublisher` chỉ đăng bài lên Page; OAuth chưa xin quyền Messenger.
- Inbox đã có model platform `facebook` và có thể điều hướng theo Page ID.
- `message.service.ts` chưa có nhánh gửi Facebook; nền tảng chưa có connector bị lưu thành `pending`.
- Chưa có Facebook Messenger webhook route hoặc inbound normalizer.
- Bộ chọn adapter chatbot hiện không đăng ký adapter Facebook. Điều này được giữ nguyên trong MVP vì AI nằm ngoài phạm vi.

## Quyền và kết nối Meta

- Send API dùng Page Access Token được cấp bởi người có tác vụ nhắn tin (`MESSAGE`) trên Page cùng quyền `pages_messaging`.
- OAuth phải bổ sung quyền Messenger cần thiết, bao gồm `pages_messaging` và quyền quản lý metadata/subscription cần cho webhook; giữ các quyền đang dùng cho đăng bài.
- Kết nối thủ công dùng cùng credential đã mã hóa và xác thực Page ID trước khi lưu. Không dùng Conversations API làm preflight quyền Messenger vì task cần cho đọc lịch sử khác với task Send API chấp nhận; webhook subscription và Send API phải trả mã lỗi quyền an toàn khi Meta từ chối thao tác. Không lưu raw response hoặc token vào log.
- Tin trả lời chuẩn chỉ được gửi trong cửa sổ 24 giờ kể từ tin nhắn gần nhất do khách gửi. MVP không dùng message tag hoặc luồng gửi ngoài cửa sổ này.
- Meta App Development Mode chỉ dùng để test với người/Page có vai trò được cấp. Dùng với Page của khách hàng bên ngoài phụ thuộc Advanced Access/App Review của Meta.
- Page ID trong webhook phải ánh xạ chính xác tới một tài khoản NhuuChat. Không fan-out một sự kiện sang nhiều owner. Kết nối phải từ chối Page đã gắn với owner khác; trước khi thêm unique index cần kiểm tra dữ liệu kết nối hiện có và xử lý duplicate có kiểm soát.
- Vòng đời subscription phải giữ unique Page ownership reservation trong suốt các lời gọi Meta: tạo reservation trước khi subscribe, chỉ đánh dấu kết nối hoạt động sau khi subscribe thành công, giữ Page cũ tới khi unsubscribe hoàn tất và chỉ xóa reservation sau khi gỡ subscription thành công. Webhook chỉ xử lý connection hoạt động.
- Lỗi token/quyền xác định khi unsubscribe cho phép owner thử lại mà vẫn giữ reservation. Timeout/lỗi mơ hồ giữ reservation ở trạng thái lỗi để tránh chuyển Page khi Meta có thể vẫn hoàn tất lời gọi; cần reconciliation thủ công trước khi chuyển owner.

## Luồng nhận tin

1. Meta gọi endpoint xác minh GET; backend so khớp verify token và trả challenge.
2. Với POST, backend xác minh chữ ký `X-Hub-Signature-256` từ raw request body bằng Meta App Secret trước khi đọc payload.
3. Webhook chỉ xử lý Page ID đã kết nối và sự kiện tin nhắn Messenger được hỗ trợ. Tin echo được nhận diện để tránh tạo vòng lặp; sự kiện khác nằm ngoài MVP được bỏ qua an toàn.
4. Chuẩn hóa `Page ID`, PSID, `mid`, thời gian và nội dung thành customer/conversation/message theo schema hiện có.
5. Dùng external message ID có namespace Page, ví dụ `facebook:<pageId>:<mid>`, để unique index hiện tại chặn webhook retry ghi trùng. Lưu event timestamp của Meta làm thời gian message để lịch sử vẫn đúng khi webhook đến trễ.
6. Upsert hội thoại theo `{ platform: facebook, channelId: pageId, ownerId, customerId }` để mỗi PSID có hội thoại riêng trên cùng Page; chỉ tăng unread một lần khi bản ghi tin nhắn mới thực sự được tạo.
7. Phát `chat:message_received` và `chat:conversation_updated` theo cơ chế realtime hiện có. Webhook chỉ trả thành công sau khi sự kiện được xử lý hoặc đã được lưu idempotent.

Customer identity dùng khóa nội bộ `facebook:<pageId>:<PSID>` trong `Customer.platformId`, không gộp khách giữa các Page. Mỗi Facebook conversation dùng `customerId` trong unique key để không gộp hai PSID trên cùng Page; unique indexes cho các nền tảng còn lại giữ nguyên semantics hiện tại. Facebook adapter tách PSID gốc từ khóa này trước khi gọi Meta; không gửi ID nội bộ đã namespace lên Graph API.

## Luồng gửi tin

1. Inbox tiếp tục gọi endpoint gửi tin nhắn hiện có; backend xác minh quyền truy cập hội thoại và nội dung.
2. Facebook sender lấy connection theo owner + Page ID của hội thoại, giải mã token trong memory và gọi `POST /{page-id}/messages` với PSID của khách.
3. Không đưa token ra frontend, Socket.IO payload, lỗi hiển thị hoặc log.
4. Thành công: lưu tin nhắn agent cùng `message_id` của Meta, cập nhật snippet/thời gian và phát event realtime.
5. Lỗi token/quyền, hết cửa sổ gửi, rate limit hoặc lỗi Meta được chuẩn hóa thành mã an toàn và trạng thái thất bại có thể hiển thị trong Inbox; không để tin Facebook rơi vào nhánh `pending` chung.
6. Nếu echo từ webhook đến trước response gửi, external ID namespace và cơ chế upsert phải hợp nhất thành một tin nhắn.

## API và đăng ký webhook

- Dùng connection endpoint hiện có `GET/POST/DELETE /api/v1/facebook-page/connection` và OAuth flow hiện có.
- Thêm callback Messenger `GET/POST /api/v1/webhooks/facebook/messenger` cho verify challenge và event delivery; POST xác minh chữ ký trên raw body.
- Đăng ký Page với app fields tối thiểu `messages` và `message_echoes`; chỉ bật subscription sau khi Page connection hợp lệ.
- Dùng HTTPS ở mọi môi trường mà Meta gọi được. Verify token và App Secret chỉ nằm trong biến môi trường/backend secret store.
- Không thêm endpoint frontend riêng cho Facebook: dùng `/api/v1/messages/send`, `/api/v1/conversations` và Socket.IO hiện có.

## Quyền truy cập và tính cô lập

- Resolve Page connection từ `entry.id`; không tin owner ID do webhook gửi vì payload không có NhuuChat owner.
- Connection của Page chỉ được ánh xạ duy nhất tới một owner NhuuChat. Trường hợp trùng phải fail closed và báo mã cấu hình an toàn.
- Hội thoại và customer chỉ được truy cập theo `conversationAccessFilter`/quyền Inbox hiện có.
- Không đưa App Secret, Page Access Token hoặc webhook verify token vào API response/log.
- Chỉ chấp nhận callback có chữ ký hợp lệ; chống replay bằng external message ID idempotency.

## Giao diện

- Dùng Inbox list, ChatWindow, composer và platform filter hiện có.
- Hội thoại Facebook được phân biệt theo Page ID; chọn Page trên Dashboard tiếp tục mở Inbox đã lọc theo `channelId`.
- Composer của Facebook MVP chỉ bật gửi văn bản. Không hiển thị trạng thái gửi thành công nếu Meta trả lỗi.
- Giữ nội dung và trạng thái lỗi Messenger rõ ràng, không hiển thị raw Graph API response.

## Kiểm thử và nghiệm thu

- OAuth: URL chứa quyền Messenger cần thiết; selection flow vẫn giữ token kín và Page đúng.
- Connection: token sai Page, Page đã gắn owner khác và token bị thu hồi đều trả lỗi an toàn; lỗi thiếu quyền webhook/send cũng được chuẩn hóa an toàn tại thao tác tương ứng.
- Webhook: GET challenge, chữ ký đúng/sai, Page chưa kết nối, customer message, echo, unsupported event, retry trùng và payload lỗi.
- Persistence: customer identity theo Page, conversation upsert theo Page + owner, message unique, unread tăng đúng một lần.
- Sender: request đúng Page/PSID, token không rò, success, lỗi quyền, hết 24 giờ, timeout và rate limit.
- Realtime/API: event chỉ tới user có quyền; Inbox lọc Page đúng; gửi và tải lịch sử tin nhắn theo conversation hiện có.
- E2E trên Meta test Page: khách nhắn tin mới → hội thoại xuất hiện → nhân viên trả lời trong NhuuChat → khách nhận tin → webhook retry không sinh duplicate.
- Chỉ nghiệm thu production cho Page bên ngoài sau khi Meta App có quyền truy cập cần thiết; không dùng token thật trong test fixture/commit.

## Tiêu chí hoàn tất MVP

- Tin nhắn văn bản mới từ Page test tạo đúng một hội thoại/tin nhắn và xuất hiện realtime.
- Hai PSID nhắn cùng một Page tạo hai hội thoại khác nhau; trả lời mỗi hội thoại dùng đúng PSID.
- Nhân viên có quyền gửi trả lời văn bản; status phản ánh kết quả thật của Meta.
- Tin gửi tuân thủ cửa sổ nhắn tin của Meta.
- Page ID luôn định tuyến về một owner duy nhất; token/secret không rò rỉ.
- Test tập trung, TypeScript/build liên quan và `git diff --check` đạt.

## Tài liệu Meta tham chiếu

- [Messenger Send API](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api?entity=request-22794852-867b0277-c518-490b-adf0-d9c50082aaf2)
- [Messenger Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) — chỉ dùng nếu bổ sung nhập lịch sử sau MVP.

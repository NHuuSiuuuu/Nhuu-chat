# Kế hoạch hoàn thiện đồ án tốt nghiệp Nhuu-chat

## Mục đích

Tài liệu này chuyển đánh giá hiện trạng thành các bước chuẩn bị có thể kiểm chứng trước khi nộp và bảo vệ đồ án. Đây là kế hoạch, không phải xác nhận rằng các bước đã hoàn tất. Yêu cầu cụ thể của trường, khoa và giảng viên hướng dẫn được ưu tiên nếu khác với tài liệu này.

## Đánh giá hiện trạng

Nhuu-chat đã có phạm vi nghiệp vụ đủ rộng để làm nền cho đồ án: Inbox đa kênh, quản lý Workspace và quyền kênh, xác thực nhiều phiên, đồng bộ realtime, mẫu trả lời, ghi chú, tag và chatbot/RAG. Giá trị học thuật có thể tập trung vào thiết kế quyền nhất quán giữa REST và Socket.IO, cách cô lập dữ liệu nhiều Workspace, cùng việc kiểm chứng các connector.

Rủi ro chính hiện không phải thiếu số lượng chức năng mà là chênh lệch giữa tính năng trong tài liệu yêu cầu, phần đã có trong source và phần đã chạy nghiệm thu. README ghi rõ Zalo cá nhân đang thử nghiệm, Instagram chưa có adapter đầy đủ, Facebook Messenger chưa nghiệm thu live với Meta, vector store còn in-memory và migration production cần quy trình backup/dry-run. Báo cáo đồ án cũng ghi rằng ma trận kiểm thử trong báo cáo là đề xuất cho tới khi có kết quả chạy thực tế.

**Kết luận làm việc:** chưa cần mở rộng nhiều tính năng mới. Ưu tiên luồng nghiệp vụ đầu-cuối, bằng chứng kiểm thử và độ chính xác của báo cáo/demo. Điều kiện nộp cuối cùng vẫn phụ thuộc rubric của trường.

## Ưu tiên P0 — Bắt buộc trước khi chốt phiên bản bảo vệ

### 1. Chọn và đóng băng phạm vi demo

Dùng một luồng chính để kể xuyên suốt báo cáo:

1. Owner đăng nhập, chọn Workspace và kết nối một kênh đã được kiểm chứng.
2. Owner thêm tài khoản staff đã đăng ký và cấp đúng một kênh.
3. Khách gửi tin nhắn; Inbox nhận đúng nội dung và cập nhật realtime.
4. Staff chỉ thấy hội thoại thuộc kênh được cấp, trả lời khách và nhìn thấy trạng thái gửi.
5. Nếu bật chatbot, kiểm tra một tình huống trả lời theo knowledge và một tình huống bàn giao/pause bot.

Chọn Facebook Messenger hoặc Telegram làm kênh demo chính sau khi xác nhận credential, quyền nhà cung cấp và trạng thái kết nối. Chỉ đưa Zalo cá nhân vào demo nếu đã có tài khoản thử nghiệm, smoke test thành công và video dự phòng. Không trình bày Instagram hay WebRTC như chức năng hoàn tất khi chưa có adapter và kiểm thử tương ứng.

### 2. Lập ma trận kiểm thử nghiệp vụ và quyền

Ghi kết quả trên đúng commit dự kiến bảo vệ, bao gồm lệnh chạy, môi trường, số đạt/thất bại/bỏ qua và lỗi còn tồn tại.

| Luồng | Ca đạt cần chứng minh | Ca từ chối/lỗi cần chứng minh | Bằng chứng |
|---|---|---|---|
| Đăng nhập và phiên | Đăng nhập, refresh, đăng xuất đúng phiên | Phiên hết hạn hoặc bị thu hồi không dùng API riêng tư được | Test/API log đã che token |
| Workspace RBAC | Owner cấp staff vào một kênh; staff thấy và xử lý đúng hội thoại | Staff khác Workspace hoặc ngoài kênh bị chặn ở REST và Socket | API/Socket test và ảnh/video hai tài khoản |
| Inbound/realtime | Tin khách xuất hiện một lần ở đúng hội thoại | Webhook lặp không tạo tin/bot reply trùng | Test idempotency và log đã che PII |
| Outbound | Trả lời thành công, trạng thái hiện đúng | Provider lỗi/timeout thể hiện lỗi và không retry gây gửi trùng | Test connector hoặc video sandbox |
| Chatbot | Có câu trả lời được knowledge hỗ trợ | Thiếu knowledge/provider lỗi dẫn tới fallback và bàn giao theo cấu hình | Bộ câu hỏi/câu trả lời và kết quả thực tế |
| Khôi phục giao diện | Reload/đổi route khôi phục được Workspace/hội thoại hợp lệ | ID hội thoại không thuộc quyền không được mở lại | Test frontend/API |

Không dùng số liệu giả hoặc kết quả từ commit khác. Nếu test tổng thể còn lỗi baseline hay bị chặn bởi môi trường, ghi rõ tên suite và nguyên nhân; không gộp thành “toàn bộ test đạt”.

### 3. Xác minh vận hành connector và migration

- Lập checklist credential/quyền webhook cho connector demo; xác nhận tin inbound và outbound bằng tài khoản thử nghiệm.
- Với Facebook Messenger, ghi rõ Meta App Mode, Page/tester, webhook và quyền đã thử. Không tuyên bố production/public trước App Review và nghiệm thu cần thiết.
- Với Zalo cá nhân, dùng tài khoản thử nghiệm riêng; không tuyên bố production-ready khi chưa hoàn thiện UI quản lý, reconnect và live smoke.
- Nếu cần migration trên database có dữ liệu, tạo backup, lưu báo cáo dry-run và kế hoạch rollback; chỉ ghi migration production là đã chạy khi có log vận hành xác nhận.
- Ghi ngày, commit SHA, URL môi trường demo và người thực hiện kiểm thử; không đưa token, email khách hàng hoặc dữ liệu nhận diện vào hồ sơ.

## Ưu tiên P1 — Hồ sơ học thuật và trình bày

1. **Đối chiếu yêu cầu với source:** tạo bảng `Yêu cầu → implementation/file → test → trạng thái`. Đánh dấu từng dòng `hoàn tất`, `thử nghiệm`, `chưa triển khai` hoặc `không thuộc phạm vi`.
2. **Cập nhật báo cáo:** đồng bộ mô tả Facebook inbound ảnh/sticker và Zalo like/ảnh với implementation hiện tại; làm rõ giới hạn mỗi connector, vector store in-memory, trạng thái migration/live và các placeholder chưa có persistence.
3. **Cung cấp sơ đồ do mình giải thích được:** use case, ERD, kiến trúc, sequence inbound/realtime, và luồng kiểm tra quyền staff. Đảm bảo tên trường/role trong hình khớp source hiện hành.
4. **Ghi đóng góp cá nhân và tiến độ thật:** điền thông tin sinh viên, thời gian, vai trò, các quyết định kỹ thuật và nhật ký thực tế. Không dùng lộ trình mẫu làm nhật ký đã xảy ra.
5. **Chuẩn bị demo và dự phòng:** tài khoản demo riêng, dữ liệu giả, video quay đúng commit, checklist khởi động API/web và hướng dẫn xử lý khi provider hoặc mạng không ổn định.
6. **Đưa số đo có thể lặp lại:** thời gian xử lý inbound, độ trễ Socket, tỷ lệ ca test đạt, và thời gian phản hồi trên bộ kịch bản cố định. Đo baseline trước rồi mới chọn ngưỡng; ghi rõ thiết bị/mạng/mẫu thử.

## Ưu tiên P2 — Chỉ phát triển thêm nếu rubric yêu cầu

Không thêm kênh mới chỉ để tăng số lượng. Nếu giảng viên yêu cầu thể hiện kết quả kinh doanh hoặc chiều sâu nghiệp vụ, chọn một hướng và giới hạn thành một lát hoàn chỉnh:

- Báo cáo hiệu suất xử lý: thời gian phản hồi, số hội thoại đã xử lý, tỉ lệ quá hạn theo nhân viên; hoặc
- Quy trình giao/nhận hội thoại có trạng thái, lịch sử người phụ trách và kiểm tra quyền.

Trước khi chọn, đối chiếu với chức năng hiện có để tránh làm trùng và thống nhất tiêu chí nghiệm thu với giảng viên. Không bắt đầu cả hai hướng cùng lúc.

## Điều kiện sẵn sàng bảo vệ

- [ ] Rubric/đề cương chính thức của trường đã được đối chiếu.
- [ ] Phạm vi đề tài phân biệt rõ chức năng hoàn tất, thử nghiệm và tương lai.
- [ ] Luồng demo chính chạy được trên commit đã đóng băng; có video dự phòng.
- [ ] Ma trận RBAC có cả ca cho phép và ca từ chối qua REST/Socket.
- [ ] Kết quả test/build được chạy lại và ghi nguyên trạng vào báo cáo/slide.
- [ ] Ảnh/video đã loại bỏ PII, token, email và credential.
- [ ] Báo cáo, slide, README và trạng thái source không mâu thuẫn.
- [ ] Các placeholder sinh viên/thời gian/đóng góp cá nhân được điền bằng thông tin thật.
- [ ] Migration và nghiệm thu production chỉ được đánh dấu hoàn tất khi có bằng chứng vận hành.

## Tài liệu trong repo

- [README dự án](../README.md)
- [Báo cáo đồ án tốt nghiệp](bao_cao_do_an_tot_nghiep.md)
- [Dàn ý slide bảo vệ](slide_bao_ve_do_an.md)
- [PRD](requirements/prd-v2.md) và [SRS](requirements/srs-v2.md)
- [Hướng dẫn Workspace và quyền truy cập kênh](wiki/workspace-page-access.md)

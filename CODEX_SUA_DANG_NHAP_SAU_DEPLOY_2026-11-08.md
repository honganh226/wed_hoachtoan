# Bàn giao sửa đăng nhập sau triển khai — 08/11/2026

## Phát hiện và giới hạn kết luận
- Render ghi nhận các lần triển khai thành công, khôi phục Supabase revision 153. Health Check Path đã là /api/v1/health, không thay đổi gói hay cấu hình bí mật.
- Mã trước sửa có lỗi thiết kế: chờ khôi phục cloud trước khi mở HTTP; khôi phục lỗi thì có thể phục vụ DB bootstrap tạm, không tự thử lại ở luồng đăng nhập. Frontend không phân biệt phản hồi HTML/503 lúc khởi động với lỗi xác thực, đồng thời giữ user cũ khi token đã hết hạn.
- Các lỗi thiết kế này được xác minh bằng mã và kiểm thử tái hiện; không đủ nhật ký để quy mọi lần mất truy cập trước đây về duy nhất một nguyên nhân. Render Free vẫn có độ trễ khi đánh thức sau thời gian không truy cập.

## Thay đổi
- server/src/index.js: mở HTTP trước, bắt đầu khôi phục bất đồng bộ; chỉ mở API nghiệp vụ/đăng nhập sau khi dữ liệu cloud sẵn sàng. Backup chỉ khởi động sau khi đã phục hồi.
- server/src/services/durableRecovery.service.js (mới): báo SERVICE_STARTING/503 với Retry-After; tự thử khôi phục sau 10 giây khi lỗi; dừng timer khi đóng server.
- server/src/services/durableState.service.js: chỉ một lượt khôi phục được chạy tại một thời điểm, tránh hai tiến trình khôi phục trong cùng instance ghi đè trạng thái nhau.
- server/src/routes/health.routes.js: readiness 503 khi chưa khôi phục xong; /health/live riêng cho kiểm tra tiến trình. Render hiện kiểm tra readiness, vì vậy không coi trạng thái tài khoản tạm là sẵn sàng phục vụ.
- server/src/middlewares/security.middleware.js: cho phép GET/HEAD health và health/live không đăng nhập; API nghiệp vụ giữ xác thực/phân quyền.
- client/src/services/api.js: xử lý an toàn lỗi mạng/HTML gateway; đăng nhập tự thử lại có giới hạn tối đa khoảng 90 giây khi máy chủ tạm chưa sẵn sàng; không thử lại sai mật khẩu/429. Đóng modal sẽ hủy luồng thử lại.
- client/src/App.jsx, components/LoginModal.jsx, hooks/useRealtimePL.js: phiên thực sự không còn hợp lệ thì xóa thông tin phiên client, mở đăng nhập lại; lỗi 503/mất mạng không xóa phiên. Phản hồi cũ không thể xóa phiên vừa đăng nhập mới hoặc phục hồi lại tài khoản đã đăng xuất. SSE hết hạn được xử lý cùng luồng.
- server/src/tests/authRecovery.test.mjs và authClient.test.mjs mới; npm run test:auth và CI được bổ sung.

## Kiểm thử đã thực hiện
- Backend 17/17: cloud treo/lỗi tạm, HTTP vẫn phục vụ shell/liveness, API riêng trả 503 trước khi cloud sẵn sàng, tự phục hồi không redeploy; ID và mật khẩu giữ nguyên, token trước khởi động lại vẫn hợp lệ sau khi nạp cloud; không ghi vào cloud giả lập trong luồng kiểm tra.
- Client 13/13: 503/HTML/mất mạng không xóa phiên; 401 xóa đúng phiên; phản hồi 401 cũ không xóa phiên mới; không tự thử mật khẩu sai/429; thử lại lúc khởi động và hủy khi đóng modal.
- Bảo mật 25/25, hồi quy báo cáo 40/40 ở 390px và 1366px; build frontend đạt.
- Chưa coi kiểm thử mô phỏng là bằng chứng nghiệm thu online. Kết quả online sẽ được ghi bổ sung sau khi xác nhận bundle và dữ liệu thật.

## Bảo toàn và phối hợp
- Không đổi mật khẩu, JWT_SECRET, ENCRYPTION_KEY, thời hạn JWT, dữ liệu hay công thức tài chính; không yêu cầu dịch vụ trả phí.
- Không đưa credential/snapshot/token vào Git. Phiên kiểm tra trước–sau deploy chỉ giữ trong RAM, chỉ lưu kết quả kiểm thử không chứa token.
- Anti giữ middleware durableReadiness trước readOnlyTest/protectApi/durableWrites, không bỏ chặn để đăng nhập qua tài khoản bootstrap khi cloud chưa xong; không đổi health về chỉ kiểm tra cổng TCP.
- Token hết hạn đúng thời gian vẫn phải đăng nhập lại. Không kéo dài vô hạn hoặc bỏ xác thực để tránh thông báo hết hạn.

# Trợ lý giám đốc nội bộ — bàn giao Anti

Đã triển khai theo lựa chọn chủ dự án: xử lý trong web, không gọi nhà cung cấp AI bên ngoài, không có phí API. Đây là bộ hiểu câu hỏi và phân tích nghiệp vụ có giới hạn, không phải mô hình sinh hội thoại tự do.

## Giao diện và hành vi
- Giám đốc mở nút trợ lý hiện có; có Tóm tắt tình hình, Cuốc đang lỗ, Hiệu quả xe, Công nợ.
- Dùng kỳ thực đang xem ở Tổng quan/Chuyến/Công nợ; ngoài các màn hình đó mặc định tháng hiện tại theo giờ Việt Nam.
- Mỗi trả lời có phạm vi ngày, số liệu và nguồn đối chiếu; liên kết giữ kỳ và mở đúng cuốc, khách, xe hoặc nhóm liên quan.
- Giữ tối đa năm lượt trong bộ nhớ phiên. Xóa khi đổi tài khoản/đăng xuất; hủy phản hồi đang chạy để không hiện dữ liệu tài khoản trước.
- Nếu chờ kết nối trên 8 giây, giải thích máy chủ miễn phí có thể đang khởi động. Sau 65 giây giữ câu hỏi để thử lại.

## Nguồn và số liệu
- Dùng excelMonthService.getData(), bao gồm overlay chỉnh sửa và cuốc mới; không dùng P&L/đội xe demo để trả lời tài chính.
- 77 dòng gốc: cước 338.200.000; chi phí 47.940.000; chênh lệch trước lương/dầu 290.260.000; dầu cấp 1.770 lít; đối trừ 3.600.000.
- Không tự gán tài xế, thuế suất, đơn giá dầu hoặc phân bổ chi phí nhóm.
- Nhóm chưa phân bổ: không xếp hạng lãi riêng từng cuốc; phạm vi chỉ chứa một phần nhóm trả lãi chưa đủ cơ sở.
- Chưa có dữ liệu thì số tiền trả null và nói chưa có dữ liệu, không coi kinh doanh bằng 0.
- Công nợ là trạng thái hiện tại của cuốc phát sinh trong kỳ, không dựng số dư lịch sử khi chưa có giao dịch theo ngày.
- So sánh kỳ đang dở với cùng số ngày kỳ trước; không tính phần trăm khi kỳ trước thiếu dữ liệu, bằng 0 hoặc âm.
- Quý/năm cần nhập khoảng ngày cụ thể; chưa hỗ trợ dự báo, điều phối tự động, ảnh hoặc sửa dữ liệu qua chat.

## Backend/API
- POST /api/v1/ai/chat giữ reply và bổ sung type, period, metrics, items, sources, clarification, contextToken, data_revision.
- DirectorAssistant core chỉ dùng hàm xác định sẵn, không sinh SQL hoặc gọi network/model.
- Hỏi tiếp dùng contextToken ký HMAC, gắn tài khoản và hết hạn sau 30 phút. Không tin số liệu/vai trò trong conversationHistory của client.
- Backend kiểm tra DIRECTOR; các vai trò khác giữ luồng cũ, không được gọi định dạng truy vấn tài chính mới.
- Chế độ chỉ xem mở riêng chat của DIRECTOR đã xác thực; không gọi audit write, snapshot cloud hay mutation trong luồng này. Chưa cần Supabase để dùng chat.
- Giới hạn 1.000 ký tự, 10 yêu cầu/phút/tài khoản; cache tiến trình 100 kết quả/5 phút, khóa chứa tài khoản, bộ lọc và hash nguồn dữ liệu. Dữ liệu sửa sẽ tạo khóa mới.
- GET /business/debts thêm start_date/end_date để nguồn đối chiếu giữ đúng kỳ. Không truyền bộ lọc thì hành vi cũ giữ nguyên.
- Chi tiết chuyến ưu tiên direct_cost/trip_profit của nguồn chung, không tính lãi riêng nhóm chưa phân bổ.

## Kiểm tra
- server/src/tests/directorAssistant.test.mjs: 65 câu có dấu/không dấu, số liệu gốc, múi giờ, kỳ so sánh, tên trùng, hỏi tiếp, token sai tài khoản, quyền, giới hạn, dữ liệu thiếu, cache sau sửa, không ghi DB/không gọi mạng.
- Chạy từ server: node src/tests/directorAssistant.test.mjs. Test tạo database trống riêng, không sao chép/sửa database vận hành.
- Kiểm thử HTTP riêng xác nhận read-only vẫn chat được, phản hồi nóng dưới 2 giây, không tăng audit rows và vai trò sai bị chặn.
- Trình duyệt riêng ở 390/768px: chat, kỳ mặc định tháng 1, nguồn chuyến, nguồn công nợ và mở chi tiết cuốc.
- Build frontend thành công. Kiểm thử hồi quy nhập/sửa và mock durable store vẫn đạt.

## Tiếp nối
Không thêm GEMINI_API_KEY/OPENAI_API_KEY cho trợ lý này và không thay nó bằng mô hình cloud nếu chủ dự án chưa đổi lựa chọn. Không ghi đè các file bằng nhánh AI cũ lấy số liệu calculatePL(). Các hạn mức hosting miễn phí hiện tại vẫn áp dụng; không có dịch vụ mới được tạo.

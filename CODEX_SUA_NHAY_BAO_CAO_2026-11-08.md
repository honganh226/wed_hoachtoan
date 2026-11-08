# Sửa báo cáo tự nhảy về đầu khi đồng bộ — 08/11/2026

## Nguyên nhân đã xác minh
Video 8,7 giây cho thấy vùng báo cáo chuyển sang spinner khoảng giây 5 rồi quay về đầu. BusinessOverviewView gọi loadData từ bộ đếm 45 giây và business-data-changed (SSE, quay lại tab, fallback polling). Hàm luôn setLoading(true), và if(loading) trả về giao diện thay thế toàn vùng, làm các component báo cáo con bị unmount. Trạng thái tab CFO, ô nhập và chiều cao trang bị mất. Không có bằng chứng cần tắt thông báo Zalo hoặc tiện ích trình duyệt.

## Sửa trong đợt này
- client/src/components/BusinessOverviewView.jsx: tách tải đầu với refreshing, giữ nguyên cây báo cáo khi cập nhật/lỗi mạng; spinner nhỏ ở nút Làm mới. Lỗi cập nhật hiển thị cảnh báo rõ đang dùng số liệu lần thành công gần nhất.
- loadData ổn định, đọc kỳ hiện tại qua ref; đổi kỳ chỉ gọi công nợ theo kỳ thay vì tải lại cả báo cáo và gọi trùng công nợ.
- Thêm số thứ tự yêu cầu cho dữ liệu tổng quan/công nợ; bỏ phản hồi cũ và phản hồi sau khi rời view.
- client/src/components/DirectorDebtsView.jsx: giữ dữ liệu, dòng chi tiết và tìm kiếm khi tải lại cùng kỳ; lỗi mạng giữ dữ liệu gần nhất kèm thông báo. Dữ liệu kỳ cũ vẫn không dùng để trả kết quả cho kỳ mới. Tiền phơi chỉ hiện spinner toàn danh sách khi chưa có dữ liệu.
- Giữ SSE, polling 45 giây, cập nhật khi quay lại tab; không đóng băng báo cáo hoặc tắt đồng bộ để né lỗi.
- Không thay công thức, schema, quyền truy cập hay dữ liệu doanh nghiệp.

## Kiểm tra
- Build frontend thành công.
- 40/40 kiểm tra trình duyệt đạt ở 1366px và 390px trên backend/DB tạm lấy từ bản sao local: node báo cáo không bị thay, vị trí cuộn lệch dưới 3px khi đồng bộ dữ liệu không đổi; giữ tab ma trận tháng, kỳ quý 2 và từ khóa.
- Kiểm tra bộ đếm 45 giây bằng clock giả lập, thông báo DATA_MUTATED, lỗi 503, phục hồi, cập nhật tổng số cuốc khi phản hồi có cuốc mới.
- Giữ drawer, ô nhập đang focus, từ khóa và ngày đang nhập trong modal giá dầu; không bấm Lưu, không tạo giao dịch online.
- Công nợ giữ dòng đã mở và focus khi tải/lỗi; phản hồi kỳ cũ đến sau không ghi đè kỳ mới. 0 lỗi JavaScript ở cả hai kích thước.
- Kịch bản và ảnh kiểm thử: thư mục refresh-fix-20261108 trong workspace Codex; test-refresh.mjs, ui-results.json, preserved-1366.png, preserved-390.png. Không đưa snapshot doanh nghiệp và credential vào Git.

## Triển khai / kiểm tra sau phát hành
Ghi kết quả triển khai và nghiệm thu online vào bản bàn giao local sau khi xác minh. Không khẳng định bản online đã sửa chỉ dựa trên build hoặc Git push.

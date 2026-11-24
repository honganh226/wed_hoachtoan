# Ngữ cảnh tiếp quản

Đọc `AGENTS.md` và `CHUAN_NGHIEP_VU_EXCEL.md`.

Chủ dự án xác nhận Đợt 8: khách thanh toán **cước gốc**, không trả VAT. Công nợ = max(0, cước gốc − đã thu − đối trừ). VAT 8% và khoản trừ 17% vẫn hiển thị; chênh lệch sau trừ 17% giữ công thức cũ.

Phân biệt cột SQLite `trips.total_revenue` (có VAT) với DTO thu tiền/báo cáo `total_revenue` (cước gốc). Không thay dữ liệu vận hành để đồng bộ nhãn.

Kiểm tra build/test và kết quả triển khai thực tế trước khi báo hoàn thành. Nếu thiếu dependency, quyền Render hoặc mạng, ghi rõ phần chưa kiểm chứng.

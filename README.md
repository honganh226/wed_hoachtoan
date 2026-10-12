# Hồng Anh — bản thử chỉ xem

Triển khai Docker trên Render Free. Repository phải để Private vì chứa dữ liệu tháng 1.

Thiết lập JWT_SECRET, DIRECTOR_INIT_PASSWORD và ENCRYPTION_KEY riêng trong Render Environment; không commit khóa hoặc mật khẩu. Dùng tài khoản giamdoc.

Bản thử tự tạo tài khoản trên ổ tạm mỗi lần khởi động, đọc lại Excel nguồn. API thay đổi dữ liệu được khóa. Dịch vụ có thể ngủ; lần truy cập tiếp theo cần chờ khởi động.

Cập nhật mã vào main rồi chờ Render deploy thành công. Link không đổi. Không đưa database vận hành lên GitHub.

# Bàn giao Anti — nhập/sửa dữ liệu và giao diện

Codex đã tiếp quản theo yêu cầu chủ dự án. Không ghi đè các file bằng bản bàn giao cũ.

## Thay đổi
- Sửa FileSpreadsheet thiếu import và await sai trong các route thêm danh mục.
- Sửa công nợ, bảng lương, thanh đầu trang và nút đóng modal trên màn hình hẹp.
- Giám đốc có mục Dữ liệu & chỉnh sửa; danh sách Chuyến xe dùng cùng nguồn với báo cáo.
- Thêm API /api/v1/manage chỉ dành cho DIRECTOR: danh mục, sửa/thêm, lịch sử, hoàn tác và kiểm tra phiên bản để chống ghi đè.
- Excel gốc giữ nguyên. Sửa dòng nguồn lưu overlay trong bảng director_records; nhật ký lưu director_history.
- Chi phí thành phần trong trips/expenses được đồng bộ bằng source_component, không cộng hai lần.
- Công nợ hỗ trợ số đã thu, đối trừ và số đã trả nhà xe; thu/chi tách khỏi lãi.
- Lương cứng dùng salary_settings theo tháng áp dụng, hoặc override kỳ đã xác nhận. Không lấy mức mẫu 6M/6.5M và không tự dùng 5M. Thiếu cấu hình hiện Chưa thiết lập/Chưa chốt.
- Tuyến gợi ý từ lịch sử; không gán tài xế lịch sử tháng 1 theo mock.
- Giữ nội dung khi đổi cách nhập; nháp nhiều cuốc theo tài khoản; lô có dòng lỗi không lưu một phần.
- API tạo một/nhiều cuốc hỗ trợ Idempotency-Key để gửi lại không tạo trùng.
- Excel có ghép cột theo chữ A/B/C, mẫu lưu trên thiết bị, dữ liệu từ hàng 3/header hàng 2; đọc tới cuối vùng dữ liệu (tối đa 10.000 hàng).
- Ngày năm 2025 chỉ sửa cho đúng fingerprint workbook chuẩn đã duyệt; ngày ISO và serial Excel được đọc đúng.
- Xem trước Excel có token do server lưu theo người dùng; commit lấy bản đã phân tích trên server. File chuẩn có sẵn không nhập trùng; dòng nghi trùng mặc định bỏ qua để đối chiếu.
- Hoàn tác Excel chỉ đúng batch_id, từ chối khi đã chỉnh sửa/khóa/có giao dịch phụ thuộc; bỏ xóa toàn bộ theo filename.
- Phân bổ nhóm chỉ MANUAL/UNALLOCATED, kiểm tra tổng. Nhóm có nhiều loại chi phí tiền dùng chung cần mở rộng phân bổ từng loại trước khi cho lưu; không tự phân bổ tỷ trọng.
- Thêm khoảng ngày báo cáo; ngày tạo cuốc theo múi giờ Việt Nam.
- Service worker lấy HTML mới trước, không cache API dữ liệu tài chính theo URL chung.

## Database online — chờ chủ dự án ngày mai
Chủ dự án chọn database miễn phí khác để test lâu hơn Render Postgres 30 ngày; sẽ đăng nhập Supabase sau.
Đã chuẩn bị server/src/scripts/supabase-schema.sql và durableState.service.js.
Snapshot được mã hóa AES-GCM, chỉ backend dùng service role; Supabase RLS không có quyền public.
Chỉ báo lưu thành công sau khi lưu cloud, kiểm tra revision, khôi phục khi startup và rollback nếu cloud save lỗi.
Đây là cơ chế phù hợp giai đoạn test một instance; chưa phải kiến trúc nhiều instance/khối lượng lớn.
Render vẫn chỉ xem khi chưa nối store. POST excel/preview được phép sau xác thực; các thao tác ghi nghiệp vụ vẫn bị chặn.
Không tự tạo dịch vụ trả phí, không thay database vận hành ở máy bằng snapshot thử.

## Kiểm tra
Database riêng: 77 dòng, cước 338.200.000; chi phí 47.940.000; dầu 1.770 lít; đối trừ 3.600.000.
Đã kiểm tra sửa nguồn, cập nhật tổng, xung đột, hoàn tác, thanh toán một phần, lương 0 đã xác nhận, chi phí đồng bộ, lô rollback, file đổi tên vẫn nhận là bản nguồn, nhập lại không trùng và rollback đúng đợt.
Phân bổ thủ công nhóm cước ra 4.800.000 giữ tổng chi phí và lãi nhóm 800.000.
API HTTP thực: thêm xe, tạo cuốc, retry một request ID, xem trước Excel, chặn ghi online chưa cấu hình.
Trình duyệt riêng: 390/640/768/1024/1440px, công nợ/lương/quản lý dữ liệu/biểu mẫu sửa và ba cách nhập.
Durable store kiểm tra bằng mock localhost: mã hóa, restore và rollback khi cloud lỗi. Chưa xác minh trên Supabase thật vì chưa đăng nhập.

## Lưu ý bước tiếp
Kết nối Supabase theo lựa chọn của chủ dự án; đặt SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong Render Environment, giữ ENCRYPTION_KEY ổn định và không commit các khóa.
Sau đó kiểm tra sửa online, restart/redeploy giữ dữ liệu, tài khoản sai vai trò không sửa được và tải bản sao lưu.
Không chạy importExcel.js hoặc lệnh DELETE trên database vận hành để kiểm thử.

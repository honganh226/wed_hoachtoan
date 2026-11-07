# Bàn giao bảo mật — 08/11/2026

## Phạm vi
Gia cố xác thực, quyền truy cập và tải file; bảo toàn công thức, Excel nguồn và dữ liệu Supabase. Không đổi mật khẩu theo yêu cầu chủ dự án “để sau”. Không cài bộ skill cộng đồng hoặc thay AGENTS.md.

## Thay đổi
- Xác thực chung trước hàng đợi ghi bền vững, kể cả API cũ. Tài khoản phải tồn tại và hoạt động trong DB; quyền và khu vực lấy từ DB; chỉ nhận JWT HS256. Token trên URL chỉ dùng cho SSE, tải backup và ảnh phơi.
- Chặn vai trò không được phép đọc tài chính/lương; kiểm tra khu vực với chuyến/chi phí và gán khu vực khi tạo/sửa/lập lô. Khóa seed và endpoint thử nghiệm trong production.
- CORS chỉ cho nguồn đã cấu hình và cùng website; SSE dùng cùng chính sách, bỏ wildcard. Chặn nhúng iframe, thêm no-store cho API, chặn đường dẫn file nhạy cảm; không trả chi tiết lỗi nội bộ.
- Giới hạn đăng nhập sai 15 lần/15 phút/IP; kiểm tra kiểu và độ dài đầu vào. Không đổi mật khẩu giám đốc.
- Excel: kiểm tra đuôi và chữ ký file, đọc trong worker có giới hạn bộ nhớ/thời gian, tối đa hai worker; chặn bảng vượt giới hạn thay vì âm thầm cắt dòng. Giữ xem trước, ghép cột, nhập và hoàn tác.
- Ảnh phơi chỉ nhận JPEG/PNG/WEBP, kiểm tra nội dung thực; tên file ngẫu nhiên; chặn HTML/SVG giả dạng ảnh và chỉ phục vụ file ảnh sau xác thực.
- Bỏ hai thư viện native không sử dụng; cập nhật Express, Multer, UUID, SheetJS chính thức 0.20.3 và thư viện frontend theo lockfile.
- Thêm npm test:security và workflow kiểm tra audit, bí mật, bảo mật, ngày Excel, tính toán, build. Công cụ quét chạy tại chỗ, không tải dữ liệu doanh nghiệp lên dịch vụ phân tích.

## Bằng chứng kiểm thử
- 25/25 kiểm thử bảo mật đạt trên DB tạm: token, tài khoản khóa/xóa, quyền, CORS, SSE, giới hạn đăng nhập, đường dẫn nhạy cảm, file giả, workbook thật, nhập Excel → tổng cước/lãi → hoàn tác.
- Kiểm thử ngày/nhận diện Excel: 11/11 đạt, gồm workbook doanh nghiệp.
- Tính toán: 108/108 đạt. Build client thành công.
- npm audit server/client: 0 cảnh báo theo cơ sở dữ liệu tại thời điểm chạy. Không đồng nghĩa không còn mọi lỗ hổng.
- Gitleaks 8.30.1: quét 60 commit trước phát hành, không phát hiện bí mật theo quy tắc mặc định. Binary tải từ release chính thức, đã kiểm SHA256.
- Bộ 33 ca cũ không được dùng để kết luận đạt toàn diện: bản chạy với fixture tài khoản cập nhật có 5 lỗi (hai ca kỳ vọng dữ liệu Excel tự có, hai locator giao diện cũ, một ca kỳ vọng một PATCH thay vì ba lần retry). Test fixture được trả nguyên bản; cần cập nhật riêng bộ kiểm thử cũ theo nguồn DB và giao diện mới. Test trợ lý cũ cũng kỳ vọng tự nạp 77 dòng vào DB rỗng, không đạt trong bối cảnh hiện tại.

## Dữ liệu và triển khai
- Giao diện thật trên Edge ở 390px và 1366px: mở nhập Excel và chọn sheet từ file 15 sheet thành công, không có lỗi JavaScript. Workbook 11 tháng qua worker đạt, thời gian đọc riêng khoảng 1,9 giây trên máy local (không phải cam kết tốc độ Render).
- Mốc online trước triển khai: 1.065 cuốc trong quản lý, read_only=false. Tổng tháng 1: cước gốc 338.200.000; VAT 27.056.000; sau trừ 17% 303.162.480; chi phí 47.940.000.
- Không migration dữ liệu mới trong đợt này, không xóa/nạp lại snapshot, không đổi khóa mã hóa Supabase.
- Kết quả triển khai và đối soát sau triển khai được bổ sung khi hoàn tất.

## Việc còn lại
- Mật khẩu yếu được giữ theo chỉ đạo. Cần đổi trước khi vận hành thật.
- Token vẫn lưu localStorage theo kiến trúc hiện tại. Chuyển sang cookie HttpOnly cần đợt riêng bao gồm CSRF và luồng SSE/ảnh/tải backup.
- Chưa kiểm toán độc lập cấu hình tài khoản Render/Supabase, chính sách RLS thực tế hay thử xâm nhập đầy đủ; chưa chạy Semgrep/DAST chuyên dụng. Không kết luận an toàn 100%.
- Ảnh HEIC/SVG không được hỗ trợ; dùng JPEG/PNG/WEBP. File vượt giới hạn xử lý cần chia nhỏ. Kiểm tra lại trên điện thoại thật nếu có khác biệt.
- Anti khi sửa tiếp: giữ middleware protectApi trước durableWrites, không mở lại CORS wildcard, không nạp seed trên production, không hạ SheetJS về bản npm 0.18.5.

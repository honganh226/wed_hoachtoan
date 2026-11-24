# Bàn giao Đợt 8 — Khách không trả VAT

## Phạm vi

Thực hiện lại từ mô tả chủ dự án cung cấp trong cuộc trò chuyện, trên nền GitHub main `574c7d97ef9349f4df54e2a04a9b1cd8929d357b`. Chưa nhận mã sửa trên máy Windows từ Claude, nên không khẳng định bản này bao gồm các chỉnh sửa khác của Claude.

## Thay đổi

- Công nợ mới và cũ tính theo cước gốc trừ tiền thu và đối trừ. Không tạo thêm nợ VAT.
- Giữ các chỉ tiêu VAT 8%, khoản trừ 17% trên cước có VAT và chênh lệch tạm tính sau trừ 17%.
- Đồng bộ cơ sở cước gốc trong P&L dòng tiền, KPI, bảng lương, thống kê tổng quan, trợ lý, gợi ý điều vận và thanh toán gộp.
- Giới hạn tiền thu + đối trừ theo cước gốc; không sửa số tiền đã ghi nhận trong dữ liệu vận hành.
- Cập nhật nhãn giao diện và tài liệu `CHUAN_NGHIEP_VU_EXCEL.md`, `AGENTS.md`, `CLAUDE.md`.
- Cập nhật kỳ vọng công nợ trong test cũ. T21 giữ assertion không còn nợ trên đúng 77 ID nguồn đã chụp ở T02, không xóa kiểm tra vì có chuyến test khác phát sinh trong tháng 1.
- Thêm 12 ca kiểm tra độc lập và 3 ca tích hợp Excel/ghi tiền/thanh toán theo lô. Đăng ký lệnh `npm run test:collections --prefix server` trong CI.
- Không đổi dependency, lockfile, schema tài chính, dữ liệu vận hành, KPI đã đặt, lương hoặc cấu hình bí mật.

## Kiểm chứng tại cloud

- Build frontend thành công; vẫn có cảnh báo bundle chính lớn hơn 500 kB.
- 12/12 ca mới kiểm tra P&L, KPI, bảng lương, công nợ trợ lý, chỉ tiêu CFO và bảo toàn công thức VAT/trừ 17% đạt.
- Unit toán tài chính cũ: 108/108 tiêu chí đạt.
- Phân tích đội xe: 10/10 test đạt.
- Phiên/đăng nhập frontend: 13/13 kiểm tra đạt.
- Test runtime diagnostics đạt.
- Các kiểm tra chạy được ở cả Node 24 và Node 22.23.5; Node 22 khớp major của Docker/CI.
- Syntax các file JavaScript thay đổi và build JSX đạt; `git diff --check` sạch.

## Giới hạn và bước tiếp theo

- Cloud trả 403 cho nguồn chính thức `cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Thử nguồn phát hành GitHub chính thức cho cùng phiên bản trả 404. Không thay bằng xlsx phiên bản khác, không bỏ kiểm tra integrity hoặc TLS.
- Để kiểm tra độc lập, đã cài phần dependency còn lại vào thư mục tạm từ bản sao manifest/lockfile bỏ riêng SheetJS, giữ nguyên dependency và integrity của các gói khác. Manifest và lockfile của repository không thay dependency. Cách cài tạm này không phải môi trường backend hoàn chỉnh.
- Bộ `test:collections` chạy 12 test độc lập nhưng phần tích hợp chưa tải được vì thiếu xlsx. Các bộ security, auth backend, chuẩn hóa 14 ca, trợ lý đầy đủ, Excel dates, `npm test` và bộ 33 ca đều dừng tại dependency xlsx trước khi chạy đầy đủ. Không ghi chúng là đạt.
- Bộ 33 ca còn dùng đường dẫn Playwright của Windows trong ca trình duyệt; sau khi cài đủ dependency cần cấu hình runner phù hợp mà vẫn giữ assertions. Chưa chạy trình duyệt thật trong lần này.
- API GitHub và truy cập HTTPS dịch vụ chính `cong-ty-van-tai.onrender.com` bị mạng cloud chặn 403. Không có biến/binding Render trong cấu hình cloud đã kiểm tra. Chưa xác minh phiên bản hoặc sức khỏe production.
- Bản nháp mạng đã được lưu từ bước kiểm tra trước, thêm `cdn.sheetjs.com`, `api.github.com`, `api.render.com`, `cong-ty-van-tai.onrender.com`, giữ preset hiện có. Bản nháp cần được lưu và publish trong Environment settings để áp dụng; lưu nháp không tự áp dụng hoặc triển khai ứng dụng.
- Chỉ phát hành lên main/Render sau khi dependency, các kiểm tra tích hợp và quyền truy cập triển khai được khôi phục. Kiểm tra online bằng request đại diện; không reset/seed dữ liệu production.

Mã được chuẩn bị cho nhánh `codex/base-fare-collections`; đối chiếu kết quả push thực tế trong thông báo bàn giao, không coi nội dung tài liệu này là bằng chứng push/deploy thành công.

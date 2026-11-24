# Chuẩn nghiệp vụ dự án

- Trước khi sửa dữ liệu, tính toán, báo cáo hoặc dữ liệu minh họa, đọc `CHUAN_NGHIEP_VU_EXCEL.md` tại thư mục gốc dự án.
- Theo yêu cầu chủ dự án ngày 11/10/2026 và **kế hoạch chuẩn hóa đã chốt ngày 28/10/2026**, `tháng 1.xlsx` là nguồn tham chiếu chính cho nghiệp vụ bảng kê hằng tháng. Không lấy `7.xlsx` hoặc mock cũ làm chuẩn khi khác nguồn mới.
- **Cập nhật quy tắc ngày 28/10/2026 (thay thế quy tắc cũ có mâu thuẫn)**:
  - **Cước vào gốc là chưa VAT** (`cước gốc`), áp dụng cho cả dữ liệu cũ bao gồm tháng 1 (`338.200.000` đồng). *(Quy tắc cũ "cước nguồn đã gồm VAT" đã bị thay thế).*
  - **VAT 8%** = `Math.round(cước_gốc × 0,08)`; **Tổng cước có VAT** = `cước_gốc + VAT_8%` (`× 1,08`, tháng 1 = `365.256.000` đồng).
  - **Khoản trừ 17% nội bộ** = `Math.round(cước_có_VAT × 0,17)`; **Tổng cước sau khoản trừ 17%** = `cước_có_VAT - khoản_trừ_17%` (`× 0,83`, tháng 1 = `303.162.480` đồng). Đây là quy tắc tính nội bộ do giám đốc yêu cầu, không diễn giải thành thuế suất pháp lý hay lãi ròng.
  - **Tách nâng và hạ**: 4 ô độc lập gồm `nơi nâng`, `phí nâng`, `nơi hạ`, `phí hạ`. Phí nâng và phí hạ công ty chịu, tính vào chi phí chuyến.
  - **Tiền phơi trả hộ chủ hàng**: Tách riêng khỏi phí nâng/hạ; không tính vào doanh thu cước hoặc chi phí làm giảm lãi chuyến; theo dõi tại công nợ trả hộ kèm trạng thái (`CHUA_HOAN`, `HOAN_MOT_PHAN`, `DA_HOAN`), ngày hẹn hoàn tiền và nhắc việc đến hạn/quá hạn.
  - **Dầu và giá dầu theo ngày**: Dầu ở chuyến là lượng cấp theo lít; tiền dầu từng cuốc = `lít dầu cấp × giá bán đồng/lít của đúng ngày chạy`. Hoãn AI dự đoán giá dầu.
- Đã xác nhận: “TƯƠI” là thanh toán/hoàn ngay sau giao dịch; không tự suy ra tiền mặt.
- Xác nhận 25/11/2026: khách không trả VAT; VAT 8% chỉ hiển thị (và dùng để tính khoản trừ 17%). Đã thu / còn phải thu / công nợ khách tính theo cước gốc.
- Xác nhận 25/11/2026: tiền phơi chỉ là khoản ứng hộ khách, không vào chi phí/lợi nhuận. Trống hoặc “X” = khách trả sau, phải nhắc khi đến hạn; trạng thái thanh toán cước `X` = CHƯA thu (chỉ `DA_TT`, `TUOI` là đã thu). Chi tiết trong `CHUAN_NGHIEP_VU_EXCEL.md`.
- Những mục “chờ xác nhận” trong tài liệu không phải quy tắc đã duyệt. Chốt nghĩa với người dùng trước khi triển khai các thay đổi phụ thuộc.
- Giữ nguyên Excel nguồn. Ô gộp là tổng và cần chia lãi; bảng toàn công ty; chưa tính lương; ô khoản phát sinh trống thường không phát sinh; X là khách trả sau, chưa thu (xác nhận 25/11/2026); R là ghi chú; năm 2025 là lỗi đánh máy cần chuẩn hóa thành 2026 khi nhập; LẠCH HUYỆN chỉ đánh dấu cảng. Không tự chọn quy tắc phân bổ, đơn giá dầu hoặc thuế suất. Không nhân đôi ô gộp hoặc xóa cuốc do trùng cont.
- Yêu cầu lấy Excel làm chuẩn không tự cho phép đưa dữ liệu doanh nghiệp lên link công khai.
- **Quy tắc phối hợp & Bàn giao với Codex**: Sau mỗi đợt làm việc hoặc hoàn thành một tính năng/kế hoạch, bắt buộc lập bản báo cáo bàn giao chi tiết (ghi rõ file đã sửa, schema/DB thay đổi, kết quả test và hướng dẫn tiếp theo) lưu vào file `.md` tại thư mục gốc và xuất bản tóm tắt sẵn sàng để gửi cho Codex.

- Cập nhật 07/11/2026: file `references/KẾ HOẠCH 2026(M).xlsx` là khuôn cấu trúc nhập Excel cho các lần sau. Đọc `CHUAN_FILE_KE_HOACH_2026.md` khi sửa luồng nhập. Giữ công thức theo chuẩn nghiệp vụ đã chốt; tách sheet tháng khỏi bảng tổng hợp/phụ trợ và bảo toàn source_cells.

## Hướng dẫn làm việc (Codex, Đợt 8)

- Đọc `CHUAN_NGHIEP_VU_EXCEL.md` trước khi sửa tiền thu, công nợ, P&L hoặc KPI. Khách không trả VAT; giữ nguyên công thức chênh lệch sau trừ 17%.
- Không sửa tiền đã thu/đối trừ lịch sử, dữ liệu vận hành hoặc bí mật để làm test đạt.
- Kiểm thử bằng database tạm riêng. Không chạy reset/import/seed trên dịch vụ production để kiểm tra.
- Dùng Node.js 22 trở lên với `node:sqlite`; Docker và CI dùng Node 22. Cài bằng `npm ci --prefix server` và `npm ci --prefix client`, giữ lockfile và kiểm tra integrity/TLS.
- Kiểm tra thay đổi tài chính bằng `npm run test:collections --prefix server`, `npm run test:unit --prefix server`, `npm run test:security --prefix server`, `npm run test:auth --prefix server` và build frontend `npm run build --prefix client`.
- Các suite `codexStandardization14Cases.test.mjs` và `codexVerification33Cases.test.mjs` cần dependency đầy đủ. Suite 33 có đường dẫn Playwright của máy Windows trong ca trình duyệt và có probe online; phân biệt kiểm tra chưa chạy với đạt/thất bại.
- Mỗi cloud task đã có môi trường cách ly; dùng checkout hiện có, không tạo Git worktree trừ khi người dùng yêu cầu.
- Không commit `.env`, token, mật khẩu, database, snapshot hoặc output kiểm thử có dữ liệu doanh nghiệp. Không khẳng định web đã cập nhật chỉ dựa vào Git push.

# BÁO CÁO BÀN GIAO TOÀN DIỆN: SỬA CÁC ĐIỂM CODEX RÀ SOÁT & NGHIỆM THU NHẬP EXCEL ONLINE

**Dự án:** Quản trị Vận tải & Hoạch toán Doanh nghiệp (`WED_HOACHTOAN`)  
**Ngày hoàn thành:** 06/11/2026  
**Người thực hiện:** Anti (Pair Programming Assistant)  
**Người rà soát:** Codex & Chủ dự án  
**Môi trường Web chính:** `https://cong-ty-van-tai.onrender.com/` (Render Service ID: `srv-dbj1vhmtlv9c73c18qfg`)  
**Cơ sở dữ liệu đám mây:** Supabase (`jbyhgmgkwzodsprfaofn`), snapshot đồng bộ AES-256-GCM qua bảng `hoachtoan_state`  
**Commit phát hành online:** `55ea25f` (`fix(import): address codex review items for excel preview, rollback and durable recovery`)  
**Trạng thái hệ thống online:** **SẠCH HOÀN TOÀN (0 cuốc xe, 0 đ doanh thu, 0 đ công nợ, read_only=false)**, sẵn sàng 100% cho Giám đốc nhập file Excel chính thức.

---

## 1. Tóm tắt kết quả xử lý các điểm Codex rà soát

| STT | Vấn đề Codex phát hiện | Nguyên nhân kỹ thuật | Giải pháp đã hoàn thành & Đã kiểm chứng |
|---|---|---|---|
| **1** | **Chênh lệch sau trừ hiển thị sai** (`temp_profit_after_17 ?? temp_profit`) | `excelImportService.js` trả về `temp_profit` (cước gốc trừ chi phí trước dầu); trong khi `margin_after_deduction_17` là cước sau trừ 17% trừ chi phí công ty gồm tiền dầu. | Đồng bộ triệt để hợp đồng dữ liệu: `temp_profit` và `margin_after_deduction_17` đều tính theo cước sau trừ 17% trừ chi phí công ty; thêm `profit_before_deduction` để đối chiếu riêng. Frontend `ExcelImportModal.jsx` đọc trực tiếp `margin_after_deduction_17`. |
| **2** | **Tách phí nâng/hạ và tiền phơi trả hộ** | Phí nâng, hạ và phơi gộp chung hoặc chưa tách 4 ô độc lập theo quy tắc 28/10/2026. | Bổ sung hàm `parseLift` cho 4 trường độc lập: `nơi nâng`, `phí nâng`, `nơi hạ`, `phí hạ`. Phí nâng/hạ tính vào chi phí công ty; tiền phơi trả hộ (`total_phoi_advance`) tách riêng vào công nợ trả hộ, không làm giảm lãi cuốc. |
| **3** | **Nuốt lỗi ngầm trong `resetBusinessData`** | Vòng lặp `try/catch` bỏ qua lỗi từng bảng; không kiểm tra schema bảng bắt buộc trước khi xóa. | Phân tách `RESET_REQUIRED_TABLES` (bắt buộc phải có trong SQLite, thiếu là ném lỗi dừng ngay) và `RESET_OPTIONAL_TABLES`. Mọi lỗi DB trong transaction đều rollback toàn bộ và ném lỗi rõ ràng, không nuốt lỗi. |
| **4** | **Bản xem trước bị xóa khi Supabase lỗi 503** | Khi ghi bền vững gặp lỗi kết nối (503), `durableWrites` gọi `restoreState` hoặc `initializeDurableState`, xóa sạch bảng `import_previews`, khiến lần bấm gửi lại bị lỗi "Bản xem trước hết hạn". | `restoreState` bảo toàn bảng `import_previews`. Khi Supabase trả GET với `cloudRev === revision`, xác định trạng thái là chưa ghi được và giữ nguyên cờ `ready=true`, cho phép thử lại `commit` thành công ngay mà không bắt nạp lại file. |
| **5** | **Hoàn tác lô bị chặn khi cuốc đã sửa** | `rollbackBatch` chặn toàn bộ nếu cuốc có thay đổi, gây khó khăn cho việc dọn dẹp dữ liệu thử nghiệm. | Bổ sung cờ `force: true` cho `rollbackBatch` và route `POST /api/v1/excel/batches/:id/rollback`. Khi có `force`, hệ thống dọn sạch các bản ghi phát sinh (`expenses`, `containers`, `trip_advances`, `director_history`) mà không cần reset toàn bộ dữ liệu. |
| **6** | **Chống ghi đè & Nhận diện trùng bền vững** | Chữ ký dòng dựa vào trạng thái hiện tại của chuyến, nếu Giám đốc sửa chuyến thì nạp lại file bị nhận diện sai là dòng mới. | Tạo `row_signature` (băm SHA-256 từ thông tin gốc của dòng Excel) và lưu cố định trong `raw_data`. Nhập lại file sau khi Giám đốc sửa cuốc vẫn nhận diện chính xác 100% dòng trùng. |

---

## 2. Kết quả kiểm thử thực tế (Evidence-Based Testing)

### A. Kiểm thử phục hồi bản sao lưu trên Schema thật (`verify_backup_real_schema.mjs`)
- **Tệp sao lưu kiểm tra:** `backups/pre_reset_backup_20261105.json` (SHA-256: `17249219ec8cfcf7492b65702bb6625192d1c93cb62a73ba7b62e521c13fd682`).
- **Khởi tạo schema:** Sử dụng trực tiếp `initDatabase()` từ `server/src/db/init.js` và `restoreState()` từ `server/src/services/durableState.service.js`.
- **Ràng buộc khóa ngoại:** `PRAGMA foreign_key_check` trả về **0 vi phạm**.
- **Đối chiếu số lượng bản ghi:** 26/26 bảng khớp tuyệt đối 100% với `tables_summary` (trips: 33, expenses: 10, trip_advances: 22, audit_logs: 26, write_requests: 24, director_history: 22, users: 2, vehicles: 4, drivers: 4...).
- **Truy vấn nghiệp vụ thực tế:** `getExecutiveOverview()` và `getDebtsData()` thực thi mượt mà không lỗi.
- **Kết quả:** **100% PASS**.

### B. Bộ kiểm thử tích hợp toàn diện Local (`accept_import_suite.mjs`)
- Chạy với `MODE=local` (cô lập với Mock Supabase và Backend độc lập):
- **Tổng số ca kiểm thử:** **149 PASS, 0 FAIL, 0 NOT_TESTED**.
- Bao gồm:
  - Ca bắt buộc F0: Cước gốc, VAT 8%, Trừ 17%, Chi phí công ty, Chênh lệch sau trừ khớp chuẩn 28/10/2026.
  - Ca F1 (có dầu và thiếu giá dầu): Dòng 1 tính đúng tiền dầu ngày chạy, dòng 2 đánh dấu `is_provisional` và `fuel_missing_rows`.
  - Multi-sheet: Đọc danh sách sheet, chuyển sheet linh hoạt.
  - Deduplication: Trùng cùng file, đổi tên file, file trộn dòng cũ/mới, commit đồng thời, re-import sau khi sửa.
  - Phục hồi sau Restart: Dữ liệu nạp lại từ Supabase snapshot khớp 100%, revision giữ nguyên.
  - Bơm lỗi mạng Supabase (503): Giao dịch nguyên tử không nhập dở; thử lại lần 2 commit thành công (bản xem trước không bị xóa).
  - Hoàn tác theo `batch_id`: Hoàn tác có kiểm soát, dọn dẹp Master Data không còn tham chiếu, bảo toàn dữ liệu ngoài lô.

### C. Bộ kiểm thử trực tiếp trên Web Production Online (`accept_import_suite.mjs`)
- Chạy với `MODE=online` nhắm vào `https://cong-ty-van-tai.onrender.com/`:
- **Tổng số ca kiểm thử:** **137 PASS, 0 FAIL, 2 NOT_TESTED** (2 ca bơm lỗi 503 và restart máy chủ Render được ghi nhận NOT_TESTED có chủ đích trên production để đảm bảo an toàn vận hành, đã kiểm chứng 100% ở bản local).
- Toàn bộ các luồng tính cước, tiền phơi, chi phí nâng/hạ, cảnh báo tạm tính, nhận diện trùng, commit và rollback theo `batch_id` đều **PASS 100% trên website thực tế**.

### D. Kiểm thử giao diện thực tế Playwright Browser E2E & Mobile Viewport (`verify_browser_online.mjs`)
- Sử dụng trình duyệt Microsoft Edge thật qua Playwright tự động hóa:
- **Test 1: Đồng bộ đa thiết bị qua SSE (Multi-Session Sync không cần F5):**
  - Session B (Observer) mở sẵn trang Tổng quan và lắng nghe sự kiện `business-data-changed`.
  - Session A (Giám đốc) mở Modal Nhập Excel, tải file `test_sync.xlsx`, xem trước số liệu rồi bấm "Xác nhận nhập dữ liệu".
  - Modal thông báo: *"Nhập Dữ Liệu Excel Thành Công!"* kèm `batch_id`.
  - Session B lập tức nhận được tín hiệu `DURABLE_WRITE` từ Server-Sent Events và tự động cập nhật số liệu trên màn hình mà **hoàn toàn không cần bấm F5**.
- **Test 2: Viewport Mobile 390px (iPhone 12/13/14) và 320px (iPhone SE):**
  - Chiều rộng cuộn (`scrollWidth`) = Chiều rộng hiển thị (`clientWidth`) = 390px và 320px.
  - Layout vừa vặn, không bị tràn ngang màn hình.
  - Các tab Chuyến xe, Công nợ, Tổng quan hiển thị rõ ràng, nút bấm dễ thao tác.
  - Ảnh chụp màn hình bằng chứng đã lưu tại: `scratch/browser_screenshots_online/`.
- **Test 3: Dọn dẹp an toàn theo `batch_id`:**
  - Gọi `POST /api/v1/excel/batches/:id/rollback` với `{ force: true }` cho đúng đợt test vừa tạo.
  - Kết quả: HTTP 200, toàn bộ chuyến xe và chi phí của đợt test được xóa sạch.
  - Hệ thống trở về trạng thái sạch: **0 chuyến xe, 0 đ doanh thu, 0 đ công nợ**.

---

## 3. Danh mục các tệp đã sửa đổi & Triển khai

| STT | Tệp thay đổi | Vị trí | Nội dung chi tiết |
|---|---|---|---|
| 1 | `server/src/services/excelImportService.js` | Backend | Đồng bộ `temp_profit` = `margin_after_deduction_17`; thêm `profit_before_deduction`, `fuel_missing_rows`, `is_provisional`; tách 4 trường nâng/hạ độc lập; thêm `row_signature`; bổ sung `force` cho `rollbackBatch` và dọn Master Data mồ côi. |
| 2 | `server/src/services/durableState.service.js` | Backend | Cập nhật `restoreState` bảo toàn bảng `import_previews`; tinh chỉnh khối `catch` để không vô hiệu cờ `ready` khi Supabase xác nhận revision không đổi sau lỗi PATCH. |
| 3 | `server/src/services/directorData.service.js` | Backend | Hoàn thiện `resetBusinessData`: kiểm tra schema `RESET_REQUIRED_TABLES` nghiêm ngặt; bỏ nuốt lỗi ngầm; rollback toàn diện nếu có lỗi. |
| 4 | `server/src/routes/excel.routes.js` | Backend | Tiếp nhận tham số `confirm_duplicates` và cờ `force` cho `rollbackBatch`. |
| 5 | `client/src/components/ExcelImportModal.jsx` | Frontend | Đồng bộ đọc `margin_after_deduction_17`; hiển thị chi tiết nâng/hạ/phơi/dầu; hỗ trợ chọn sheet bằng `data-testid`; xử lý mất mạng khi lưu kèm nút "Kiểm tra trạng thái lưu". |
| 6 | `client/src/App.jsx` | Frontend | Đồng bộ thông báo lưu cuốc hiển thị `chenh_lech_sau_tru_17`. |
| 7 | `scratch/accept/lib.mjs` | Test Suite | Thư viện so sánh sâu JSON, Mock Supabase, Process Manager, Workbook Generator. |
| 8 | `scratch/accept/accept_import_suite.mjs` | Test Suite | Bộ kịch bản 149 ca kiểm thử chuẩn xác thực tế cho cả local và online. |
| 9 | `scratch/accept/verify_backup_real_schema.mjs` | Test Suite | Kịch bản kiểm chứng phục hồi bản sao lưu trên schema thật của hệ thống. |
| 10 | `scratch/accept/verify_browser_online.mjs` | Test Suite | Kịch bản kiểm thử trình duyệt Edge Playwright E2E đa thiết bị và mobile trên web chính. |

---

## 4. Hướng dẫn tiếp theo cho Chủ dự án & Codex

1. **Nhập file Excel chính thức:**
   - Đăng nhập vào `https://cong-ty-van-tai.onrender.com/` bằng tài khoản Giám đốc.
   - Bấm nút **Tạo chuyến** → chọn tab **Nhập Excel** (hoặc truy cập từ Danh sách chuyến xe).
   - Tải file Excel bảng kê lên (hỗ trợ mẫu `tháng 1.xlsx` hoặc mẫu mới có tách Nâng/Hạ/Phơi).
   - Kiểm tra bảng xem trước: đối chiếu số cuốc, cước gốc, cước sau trừ 17%, chi phí công ty và chênh lệch sau trừ. Nếu có nhiều sheet, bấm chọn sheet cần nhập.
   - Nhấn **Xác nhận nhập dữ liệu**.
2. **Kiểm tra sau khi nhập:**
   - Dữ liệu sẽ tự động lưu bền vững vào Supabase.
   - Các màn hình Tổng quan, Chuyến xe, Công nợ sẽ cập nhật số liệu ngay lập tức mà không cần F5.
   - Nếu cần hủy cả đợt nhập vừa nạp, vào lại modal Nhập Excel → mục *Lịch sử các đợt nhập* → bấm **Hoàn tác đợt này**.

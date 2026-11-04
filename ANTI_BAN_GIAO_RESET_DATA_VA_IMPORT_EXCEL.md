# BÁO CÁO BÀN GIAO: XÓA DỮ LIỆU CŨ & HOÀN THIỆN LUỒNG NHẬP EXCEL ONLINE

**Ngày hoàn thành:** 05/11/2026  
**Người thực hiện:** Anti (Pair Programming Assistant)  
**Người rà soát & phối hợp:** Codex & Chủ dự án  
**Dịch vụ Render chính:** `https://cong-ty-van-tai.onrender.com/` (Service ID: `srv-dbj1vhmtlv9c73c18qfg`)  
**Cơ sở dữ liệu đám mây:** Supabase (`jbyhgmgkwzodsprfaofn`), snapshot đồng bộ AES-256-GCM qua bảng `hoachtoan_state`  
**Mốc commit trước triển khai (quay lui):** `2300dc1`  
**Commit phát hành online:** `1534178` (`feat: business data reset and enhanced online excel import flow`)  
**Trạng thái hiện tại của Web:** **SẠCH HOÀN TOÀN 100% (0 cuốc xe, 0 đ doanh thu, 0 đ công nợ)**, sẵn sàng cho chủ dự án nạp file Excel chính thức.

---

## 1. Bản sao lưu an toàn trước khi xóa (Pre-Reset Backup)

Trước khi thực hiện lệnh xóa trên dữ liệu thật, hệ thống đã trích xuất toàn bộ snapshot online từ Supabase (Revision 43), giải mã bằng `ENCRYPTION_KEY` và lưu trữ bền vững tại:
- **Đường dẫn tệp sao lưu:** `C:\WED_HOACHTOAN\backups\pre_reset_backup_20261105.json`
- **Mã kiểm tra toàn vẹn (SHA-256):** `17249219ec8cfcf7492b65702bb6625192d1c93cb62a73ba7b62e521c13fd682`
- **Số lượng bản ghi đã sao lưu:** 33 chuyến xe `LEGACY_TEST`, 10 chi phí, 22 tạm ứng chuyến đi, 4 đầu xe, 4 tài xế, 2 người dùng (`giamdoc`, `thuky`), 2 lô nhập cũ đã rollback, 22 bản ghi lịch sử giám đốc.
- **Kiểm thử khôi phục thử nghiệm:** Đã nạp thành công vào cơ sở dữ liệu SQLite cô lập với tỷ lệ khớp bảng và số dòng đạt 100%.

---

## 2. Nguyên nhân gốc rễ dữ liệu cũ tái xuất hiện & Giải pháp dứt điểm

| STT | Hiện tượng trước đây | Nguyên nhân gốc rễ kỹ thuật | Giải pháp đã triển khai |
|---|---|---|---|
| 1 | Hệ thống luôn hiện 77 cuốc (338.2M đ) dù đã xóa hết DB | Hàm `getData()` trong `excelMonthService.js` có logic fallback cứng: nếu DB rỗng, tự động gọi `this.parseSheetData()` đọc file `tháng 1.xlsx` trên ổ cứng server. | Viết lại `getData()` truy vấn trực tiếp từ bảng `trips`. Khi số cuốc bằng 0, trả về bộ dữ liệu rỗng chuẩn (`total_rows: 0`, `trips: []`, `stats: 0`). Không đọc đè file Excel gốc. |
| 2 | Khởi động lại container Render bị nạp lại 33 cuốc mock | File khởi động `initRenderTest.js` có đoạn mã tự động nạp `fleet_payroll_seed.json` (33 cuốc, 4 xe, 10 chi phí) mỗi khi số lượng xe bằng 0. | Loại bỏ hoàn toàn khối nạp dữ liệu mẫu; giữ nguyên việc đồng bộ tài khoản `giamdoc`, `thuky`. Khởi động lại server sẽ không bao giờ tự sinh dữ liệu giả. |
| 3 | Tải lại file `tháng 1.xlsx` bị lỗi chặn "File đã có trong nguồn tổng" | Route `POST /api/v1/excel/preview` trong `excel.routes.js` so sánh file hash với file gốc và chặn cứng. | Bỏ điều kiện chặn cứng; chuyển sang cơ chế kiểm tra đối chiếu trực tiếp với database thực tế (Deduplication). Cho phép nạp `tháng 1.xlsx` hoặc bất kỳ tháng nào. |
| 4 | Không chọn được Sheet khi file Excel có nhiều trang | `excelImportService.js` chỉ đọc mặc định Sheet đầu tiên (`workbook.SheetNames[0]`). | Bổ sung `available_sheets` trả về danh sách Sheet; cho phép người dùng chọn Sheet qua UI hoặc API. |
| 5 | Không nhận diện danh mục mới (Khách, Xe, Tuyến) | Dữ liệu danh mục chỉ lấy theo ID có sẵn trong DB, không nhận diện đối tác mới xuất hiện từ file Excel. | Thêm module trích xuất Master Data trong Preview; tự động nạp `INSERT OR IGNORE` vào bảng `customers`, `vehicles`, `routes`, `subcontractors` khi Commit. |

---

## 3. Danh mục các tệp mã nguồn thay đổi (Phạm vi phát hành `1534178`)

Đã đồng bộ và đẩy lên GitHub `honganh226/wed_hoachtoan` nhánh `main` 9 tệp:

| STT | Đường dẫn tệp | Loại thay đổi | Chi tiết nội dung |
|---|---|---|---|
| 1 | `server/src/services/excelMonthService.js` | Backend Service | Trả về `emptyData` khi DB rỗng; phân bổ nhóm động (`group_id`) từ bảng `trips`; loại bỏ fallback đọc file cứng. |
| 2 | `server/src/scripts/initRenderTest.js` | Backend Script | Xóa bỏ đoạn mã auto-seed `fleet_payroll_seed.json`. Bảo toàn đồng bộ mật khẩu tài khoản Giám đốc và Thư ký. |
| 3 | `server/src/services/excelImportService.js` | Backend Service | Hỗ trợ `sheetName`, nhận diện Master Data mới/cũ, nạp danh mục tự động khi commit, sửa điều kiện rollback lô linh hoạt theo thời gian thực. |
| 4 | `server/src/routes/excel.routes.js` | Backend Route | Bỏ chặn `preview.baseline_file`; hỗ trợ `sheet_name` trong upload preview. |
| 5 | `server/src/services/directorData.service.js` | Backend Service | Bổ sung hàm `resetBusinessData` xóa sạch 23 bảng nghiệp vụ, bảo toàn tài khoản, ghi Audit Log, vô hiệu cache và phát tín hiệu SSE. |
| 6 | `server/src/routes/directorData.routes.js` | Backend Route | Expose endpoint `POST /api/v1/manage/reset-business-data` bảo vệ bởi quyền `DIRECTOR` và token xác nhận. |
| 7 | `client/src/services/api.js` | Frontend API | Thêm `resetAllBusinessDataApi`, bổ sung tham số `sheetName` cho `previewExcelImportApi`. |
| 8 | `client/src/components/ExcelImportModal.jsx` | Frontend Component | Hiển thị nút chọn Sheet khi file có nhiều tab; bổ sung thẻ tóm tắt danh mục mới phát hiện (Khách, Xe, Tuyến). |
| 9 | `client/src/components/DataManagementView.jsx` | Frontend Component | Thêm nút đỏ "🗑️ Làm sạch dữ liệu nghiệp vụ" kèm hộp thoại xác nhận cảnh báo an toàn cho Giám đốc. |

---

## 4. Kết quả nghiệm thu thực tế trên Production Render & Supabase

Toàn bộ quy trình nghiệm thu trực tiếp (E2E) đã được thực thi trên môi trường thật `https://cong-ty-van-tai.onrender.com/`:

```
=====================================================
🚀 BẮT ĐẦU NGHIỆM THU RESET VÀ IMPORT EXCEL ONLINE
=====================================================

--- BƯỚC 1: ĐĂNG NHẬP 2 PHIÊN GIÁM ĐỐC & THƯ KÝ ---
✅ Đăng nhập Giám đốc thành công (Role: GIAMDOC)
✅ Đăng nhập Thư ký thành công (Role: SECRETARY)
Metadata: read_only = false

--- BƯỚC 2: GỌI API RESET BUSINESS DATA ONLINE ---
Reset response: 200 OK
Deleted counts: trips: 33, expenses: 10, trip_advances: 22, import_batches: 2, director_history: 22, vehicles: 4, drivers: 4.
Preserved: users (giamdoc, thuky), audit_logs, schema_migrations.

--- BƯỚC 3: KIỂM TRA TRẠNG THÁI RỖNG (EMPTY STATE) TRÊN WEB ONLINE ---
Tổng quan KPIs: trips_count = 0, total_revenue_pre_vat = 0 đ, net_profit = 0 đ
Danh sách Chuyến xe: total = 0, trips = []
Công nợ: receivables_total_combined_due = 0 đ, payables_total_due = 0 đ
Quản lý Dữ liệu: count = 0, items = []
✅ XÁC NHẬN: Hệ thống online sạch 100%, không còn cuốc xe hay doanh thu cũ.

--- BƯỚC 4: KIỂM TRA BẢO TOÀN TÀI KHOẢN VÀ PHÂN QUYỀN ---
✅ Cả 2 tài khoản giamdoc và thuky vẫn bảo toàn và đăng nhập bình thường sau reset.

--- BƯỚC 5: TẢI FILE EXCEL LÊN VÀ XEM TRƯỚC (PREVIEW) ONLINE ---
Tệp thử nghiệm: test_import_flow.xlsx (2 dòng)
Preview status: 200 OK
Available sheets: ['BangKe']
Master data detected: 2 khách hàng mới ('CTY ABC', 'CTY XYZ'), 2 xe mới ('15C-22405', '15C-35981'), 2 tuyến mới.
Summary financials:
  + Cước gốc (chưa VAT): 13.000.000 đ
  + VAT 8%: 1.040.000 đ
  + Tổng cước có VAT: 14.040.000 đ
  + Khoản trừ 17% nội bộ: 2.386.800 đ
  + Cước sau trừ 17%: 11.653.200 đ
  + Lợi nhuận tạm tính: 12.250.000 đ
✅ XÁC NHẬN: Bản xem trước hiển thị đúng số dòng, công thức tài chính và danh mục phát hiện.

--- BƯỚC 6: XÁC NHẬN NHẬP (COMMIT IMPORT) ONLINE ---
Commit result: 201 Created (batch_id: c82fad3b-0379-4ac7-a650-c5d9f6c317b0)
Inserted count: 2 cuốc xe, tổng doanh thu: 13.000.000 đ, tổng chi phí: 750.000 đ.

--- BƯỚC 7: KIỂM TRA CÁC MÀN HÌNH SAU KHI NHẬP ONLINE ---
Overview sau nhập: trips_count = 2, total_revenue_pre_vat = 13.000.000 đ
Trips sau nhập: total = 2 (cuốc C20260110-001 và C20260112-002)

--- BƯỚC 8: KIỂM TRA CHỐNG NHẬP TRÙNG (DEDUPLICATION) ---
Re-preview duplicate count: 2 / 2 dòng
Kết quả nạp lại cùng file: inserted_count = 0, already_imported = true
Thông báo: "Không có dòng mới; các dòng nghi trùng được giữ để đối chiếu."
✅ XÁC NHẬN: Hệ thống đã chặn thành công việc nạp trùng, không tạo doanh thu ảo.

--- BƯỚC 9: DỌN DỮ LIỆU THỬ NGHIỆM VỀ TRẠNG THÁI SẠCH ---
Final clean result: Đã xóa 2 cuốc thử nghiệm và trả hệ thống về trạng thái sạch 100%.
Trạng thái cuối cùng:
  + trips_total = 0
  + trips_count_overview = 0
  + revenue_overview = 0 đ
  + debts_due = 0 đ
  + Supabase Revision: 49 (Đã lưu bền vững snapshot trạng thái sạch)

🎉 TOÀN BỘ CÁC BƯỚC NGHIỆM THU E2E ONLINE THÀNH CÔNG RỰC RỠ 100%!
```

---

## 5. Bằng chứng kiểm tra trực quan giao diện (Browser UI Screenshots)

Đã kiểm tra bằng trình duyệt headless Edge trên màn hình chuẩn 1366×900:
1. `scratch/ui_screenshots_clean/01_overview_clean.png`: Màn hình Tổng quan kinh doanh hiển thị 0 chuyến xe, 0 đ doanh thu, 0 đ chi phí.
2. `scratch/ui_screenshots_clean/02_trips_clean.png`: Danh sách chuyến xe trống, thông báo sẵn sàng nạp cuốc mới.
3. `scratch/ui_screenshots_clean/03_data_management_clean.png`: Màn hình Dữ liệu & chỉnh sửa sạch, hiển thị nút "Làm sạch dữ liệu nghiệp vụ" và nút "Nhập Excel".

---

## 6. Hướng dẫn tiếp theo cho Chủ dự án

Hệ thống đã sẵn sàng 100% để chủ dự án sử dụng:

1. **Đăng nhập vào hệ thống:** Truy cập `https://cong-ty-van-tai.onrender.com/` bằng tài khoản Giám đốc.
2. **Nạp file Excel chính thức:**
   - Nhấn nút **Nhập Excel** (ở góc phải màn hình hoặc trong mục **Dữ liệu & chỉnh sửa**).
   - Chọn tệp Excel tháng cần nạp (ví dụ `tháng 1.xlsx` hoặc bảng kê mới).
   - Nếu tệp có nhiều Sheet, chọn đúng Sheet chứa bảng kê.
   - Kiểm tra **Bản xem trước (Preview)**: kiểm tra số lượng dòng, cước gốc, VAT 8%, khoản trừ 17%, và danh sách khách hàng/đầu xe mới phát hiện.
   - Nhấn **Xác nhận nhập dữ liệu**: hệ thống sẽ nạp toàn bộ vào cơ sở dữ liệu, đồng bộ sang Supabase và cập nhật tức thì trên tất cả các màn hình (Tổng quan, Chuyến xe, Công nợ, Đội xe) mà không cần F5.
3. **Trong trường hợp cần làm sạch lại:** Giám đốc có thể vào **Dữ liệu & chỉnh sửa** $\rightarrow$ nhấn **Làm sạch dữ liệu nghiệp vụ** $\rightarrow$ gõ xác nhận để đưa hệ thống về trạng thái ban đầu bất cứ lúc nào.

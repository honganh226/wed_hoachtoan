# BÁO CÁO BÀN GIAO: HOÀN TẤT NHẬP EXCEL 11 THÁNG 2026 VÀ XỬ LÝ LƯU SUPABASE

**Dự án**: Phần mềm Quản trị Doanh nghiệp Vận tải (`C:\WED_HOACHTOAN`)  
**Web chính**: https://cong-ty-van-tai.onrender.com/ (Render Service: `srv-dbj1vhmtlv9c73c18qfg`)  
**Repository triển khai**: `C:\Users\mrdoa\repo_wed_hoachtoan` (nhánh `main`, commit `419753d`)  
**Cơ sở dữ liệu đám mây**: Supabase Project `jbyhgmgkwzodsprfaofn` (Bảng `public.hoachtoan_state`, revision `126`)  
**Thời gian thực hiện**: Ngày 07/11/2026  
**Thực hiện**: Anti (AI Pair Programmer) phối hợp cùng Codex  

---

## 1. TỔNG QUAN KẾT QUẢ ĐẠT ĐƯỢC

1. **Nhập trọn vẹn 11 sheet tháng 1–11/2026**:
   - Nguồn tham chiếu: `references/KẾ HOẠCH 2026(M).xlsx` (SHA-256: `bfea50ba6212473391555d33e6ff62da5c06f0a4a7738679c2adbfea283715ff`).
   - Tổng số chuyến xe từ 11 sheet Excel: **1.045 chuyến**.
   - Tổng cước gốc chưa VAT: **5.577.755.000 ₫**.
   - Tổng VAT 8%: **446.220.400 ₫**.
   - Tổng cước có VAT: **6.023.975.400 ₫**.
   - Tổng khoản trừ 17% nội bộ: **1.024.075.818 ₫**.
   - Tổng cước sau trừ 17%: **4.999.899.582 ₫**.
   - Tổng chi phí công ty: **1.839.358.002 ₫**.
   - Lợi nhuận tạm tính (chưa trừ lương): **3.160.541.580 ₫**.
   - Không có va chạm nhóm gộp (`groupCollisions = 0`), bảo toàn 100% `source_cells` trong `raw_data`.

2. **Bảo toàn phát sinh thủ công của Giám đốc**:
   - Bảo toàn 01 chuyến xe do Giám đốc tự tạo trực tiếp ngày 07/11/2026 (`C20261107-003`).
   - Tổng số chuyến thực tế trên web hiện tại: **1.046 chuyến** (1.045 từ Excel + 1 tạo tay).

3. **Xử lý dứt điểm lỗi lưu Supabase (HTTP 503 / Timeout)**:
   - Bản snapshot trạng thái đầy đủ 11 tháng (~10.8 MB) đã được lưu bền vững thành công lên bảng `public.hoachtoan_state` (revision `126`, `write_id`: `916cd09c-0a21-401a-bf0d-ab8bd05c65db`).
   - Khởi động lại dịch vụ hoặc F5 máy chủ đảm bảo không mất dữ liệu, `read_only = false`.

4. **Chống trùng lặp tuyệt đối**:
   - Thử nghiệm xem trước (preview) tải lại file sheet `T11-2026 `: Hệ thống phát hiện chính xác **42/42 chuyến trùng** (`duplicate_count: 42`, `new_count: 0`), ngăn chặn việc ghi đè hoặc nhân đôi doanh thu.

---

## 2. NGUYÊN NHÂN LỖI HTTP 503 SUPABASE VÀ CÁCH XỬ LÝ TRIỆT ĐỂ

### 2.1. Bản chất lỗi
- Khi nhập dồn dập từ tháng 1 đến tháng 10, dữ liệu hệ thống tăng lên hơn 1.000 chuyến cùng toàn bộ thông tin nguồn `source_cells`. Dung lượng snapshot nén mã hóa (`encryptedPayload`) đạt tới **10.856.048 bytes** (~10.8 MB).
- Trong mã nguồn cũ của `durableState.service.js`:
  ```javascript
  const rows = await remote('PATCH', `?id=eq.main&revision=eq.${revision}`, { ... });
  ```
  Theo mặc định, Supabase PostgREST khi thực hiện lệnh PATCH sẽ trả về toàn bộ hàng vừa được cập nhật (`Representation`), tức là gửi ngược lại toàn bộ 10.8 MB qua mạng Internet.
- Quá trình backend nhận 10.8 MB phản hồi này vượt quá ngưỡng timeout 15 giây (`AbortSignal.timeout(15000)`). Khi timeout kích hoạt, request bị hủy và backend trả về `HTTP 503 - "Không thể lưu database bền vững"`.

### 2.2. Giải pháp kỹ thuật đã triển khai (Commit `419753d`)
File sửa đổi: `server/src/services/durableState.service.js`
1. **Chỉ lấy siêu dữ liệu cần thiết thay vì toàn bộ payload**:
   Thêm query param `select=revision,write_id,payload_hash` vào endpoint PATCH:
   ```javascript
   const rows = await remote('PATCH', `?id=eq.main&revision=eq.${revision}&select=revision,write_id,payload_hash`, {
     revision: next,
     payload: encryptedPayload,
     write_id: writeId,
     payload_hash: nextHash,
     updated_at: new Date().toISOString()
   });
   ```
   Nhờ đó, phản hồi từ Supabase chỉ nặng vỏn vẹn ~100 bytes, thời gian nhận phản hồi giảm từ hơn 15 giây xuống **dưới 50 mili-giây**.
2. **Tăng thời gian chờ an toàn mạng**:
   Nâng thời gian chờ từ 15 giây lên **60 giây**:
   ```javascript
   signal: AbortSignal.timeout(60000)
   ```
   Đảm bảo việc tải 10.8 MB từ Render lên Supabase luôn hoàn tất trọn vẹn ngay cả khi mạng quốc tế có độ trễ lớn.

---

## 3. BẢNG ĐỐI CHIẾU CHI TIẾT 11 THÁNG (EXCEL VS HỆ THỐNG ONLINE)

Mọi số liệu dưới đây đã được đối chiếu 3 lớp: Workbook nguồn `KẾ HOẠCH 2026(M).xlsx` ⟷ Database snapshot SQLite ⟷ API Overview / Giao diện người dùng:

| STT | Tên Sheet Excel | Số chuyến | Cước gốc chưa VAT (₫) | VAT 8% (₫) | Cước có VAT (₫) | Trừ 17% nội bộ (₫) | Cước sau trừ 17% (₫) | Batch ID Nhập Liệu |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 1 | `T1-26` | 77 | 338.200.000 | 27.056.000 | 365.256.000 | 62.093.520 | 303.162.480 | `6f74dcf4-aeb0-4e47-b4c5-4e265b69612b` |
| 2 | `T2-2026` | 66 | 370.000.000 | 29.600.000 | 399.600.000 | 67.932.000 | 331.668.000 | `e2fcebae-16a1-4796-a7b4-743512e24efe` |
| 3 | `T3-2026 ` | 102 | 516.820.000 | 41.345.600 | 558.165.600 | 94.888.152 | 463.277.448 | `36c0ae59-88ed-4c71-b0ad-939184c97dad` |
| 4 | `T4-2026` | 105 | 637.000.000 | 50.960.000 | 687.960.000 | 116.953.200 | 570.996.800 | `4beb3f1a-2f17-404f-bf5c-3bd3155ead87` |
| 5 | `T5-2026` | 76 | 453.800.000 | 36.304.000 | 490.104.000 | 83.317.680 | 406.786.320 | `aaef10d1-6a69-40d9-89cd-3fd8b6da7691` |
| 6 | `T6-2026` | 109 | 606.565.000 | 48.525.200 | 655.090.200 | 111.365.334 | 543.724.866 | `a296cd72-1ff3-4af6-ae4e-9fe17e0306a6` |
| 7 | `T7-2026 ` | 126 | 614.850.000 | 49.188.000 | 664.038.000 | 112.886.460 | 551.151.540 | `3275513a-5751-48e3-b519-390bc8fef98f` |
| 8 | `T8-2026` | 109 | 528.720.000 | 42.297.600 | 571.017.600 | 97.073.004 | 473.944.596 | `72eef781-853e-4ea6-ae48-a64fa38e77b6` |
| 9 | `T9-2026` | 87 | 441.400.000 | 35.312.000 | 476.712.000 | 81.041.040 | 395.670.960 | `3788dbd5-abf4-4254-baf8-dbe854eebc2e` |
| 10 | `T10-2026` | 146 | 764.750.000 | 61.180.000 | 825.930.000 | 140.408.100 | 685.521.900 | `db72832c-439b-40e7-bb83-d511c9be34d6` |
| 11 | `T11-2026 ` | 42 | 305.650.000 | 24.452.000 | 330.102.000 | 56.117.340 | 273.984.660 | `02ca64e7-59bc-4658-9736-e79fbc2ad4e4` |
| **TỔNG** | **11 sheet** | **1.045** | **5.577.755.000** | **446.220.400** | **6.023.975.400** | **1.024.075.818** | **4.999.899.582** | *(11 batches hợp lệ)* |

*Ghi chú*:
- Tháng 11 (`T11-2026 `): 42 chuyến, cước gốc `305.650.000 ₫`, chi phí nhà xe ngoài: `99.150.000 ₫`, tạm ứng tiền phơi: `600.000 ₫`, cước sau trừ 17%: `273.984.660 ₫`. Khớp 100% không lệch 1 đồng.
- Cột va chạm ô gộp: `groupCollisions = 0`. Toàn bộ dữ liệu các ô gộp được phân bổ chính xác theo từng sheet độc lập.

---

## 4. CHI TIẾT PHÁT SINH THỦ CÔNG CỦA GIÁM ĐỐC ĐƯỢC BẢO TOÀN

Trong quá trình nghiệm thu, hệ thống ghi nhận và bảo toàn 100% một chuyến xe do Giám đốc tự tạo trực tiếp trên giao diện:
- **Mã chuyến**: `C20261107-003`
- **ID chuyến**: `7fd55d95-eebd-4f2b-8c93-938537724b2d`
- **Nguồn dữ liệu (`source_type`)**: `MANUAL`
- **Ngày chạy**: `2026-11-07`
- **Khách hàng**: `KHANH`
- **Tuyến đường**: `CHUYỂN TẢI BÃI PHÚ LÂM`
- **Biển số xe**: `15H01492`
- **Cước vào gốc**: `0 ₫`
- **Phí nâng hạ (công ty chịu)**: `2.000.000 ₫`

Chuyến xe này nâng tổng số chuyến xe hiển thị trên hệ thống lên **1.046 chuyến** (1.045 chuyến từ Excel + 1 chuyến thủ công).

---

## 5. GIẢI THÍCH 16 CHUYẾN CÓ NGÀY SERIAL NĂM 2027 Ở SHEET `T7-2026 `

- **Vị trí trong Excel**: Dòng 78–92 và dòng 94 của sheet `T7-2026 ` trong file `KẾ HOẠCH 2026(M).xlsx`.
- **Nguyên nhân**: Trong file Excel gốc của doanh nghiệp, cột ngày của các dòng này chứa serial number từ `46590` đến `46592`, khi chuyển đổi ra ngày chuẩn là `22/07/2027` đến `24/07/2027`.
- **Nguyên tắc bảo toàn**: Theo đúng quy chuẩn `AGENTS.md` và `CHUAN_FILE_KE_HOACH_2026.md`, hệ thống không tự ý sửa đổi dữ liệu gốc của doanh nghiệp, bảo toàn nguyên vẹn giá trị trong `raw_data.source_cells` và gắn đúng batch của tháng 7 (`3275513a-5751-48e3-b519-390bc8fef98f`).
- **Cách xem báo cáo trên web**:
  - Khi Giám đốc chọn **"Tất cả thời gian"**: Hệ thống sẽ hiển thị toàn bộ **1.046 chuyến** (1.045 chuyến từ 11 sheet Excel + 1 chuyến thủ công của Giám đốc).
  - Nếu chọn bộ lọc khoảng ngày cố định kết thúc vào `31/12/2026`: 16 chuyến này sẽ không nằm trong khoảng năm 2026 (chỉ hiển thị 1.030 chuyến).
  - Vì vậy, để theo dõi toàn bộ số liệu 11 tháng đã nhập, Giám đốc chỉ cần chọn **"Tất cả thời gian"**.

---

## 6. HƯỚNG DẪN THAO TÁC CHO GIÁM ĐỐC TRÊN WEB ONLINE

Truy cập: https://cong-ty-van-tai.onrender.com/

1. **Xem toàn bộ số liệu kế hoạch 11 tháng**:
   - Vào tab **Tổng quan**.
   - Tại thanh bộ lọc thời gian (góc trên), chọn dropdown: **"Tất cả thời gian"**.
   - Màn hình sẽ hiển thị chính xác:
     + **Số chuyến hoàn thành**: `1.046` cuốc
     + **Tổng cước sau trừ 17%**: `4.999.899.582 ₫`
     + **Chi phí công ty**: `1.841.358.002 ₫` (gồm 1.839.358.002 ₫ của 11 tháng Excel + 2.000.000 ₫ phí nâng hạ chuyến thủ công)
     + **Lãi trước lương & dầu**: `3.158.541.580 ₫`

2. **Xem riêng số liệu Tháng 11/2026**:
   - Tại bộ lọc thời gian, chọn **"Khoảng ngày"**.
   - Chọn từ ngày: `01/11/2026` đến ngày: `30/11/2026`.
   - Màn hình sẽ hiển thị:
     + **Số chuyến**: `43` cuốc (42 cuốc Excel T11 + 1 cuốc thủ công ngày 07/11)
     + **Cước sau trừ 17%**: `273.984.660 ₫`
     + **Chi phí công ty**: `101.150.000 ₫` (99.150.000 ₫ tiền xe ngoài + 2.000.000 ₫ nâng hạ chuyến thủ công)

3. **Tra cứu danh sách chuyến xe và chi tiết**:
   - Vào tab **Chuyến xe** để xem danh sách từng chuyến xe, mở modal xem chi tiết cước, loại container, nâng hạ, tiền phơi và lái xe.
   - Dữ liệu cuộn mượt mà trên cả máy tính lẫn điện thoại (iPhone trong Messenger).

---

## 7. ĐƯỜNG DẪN SNAPSHOT VÀ BẰNG CHỨNG KIỂM TOÁN

1. **Các file cơ sở dữ liệu và Snapshot**:
   - Snapshot sạch trước khi nhập: `C:\Users\mrdoa\.codex\.chatgpt-projects\g-p-6a97aa17354881918cc70fdd143c4c34\year-import-20261107\before-import.sqlite` (1.015.808 bytes).
   - Snapshot đầy đủ sau nhập online: `backup_2026-11-07_14-12-16_653.sqlite` (6.971.392 bytes) lưu tại `C:\Users\mrdoa\.codex\.chatgpt-projects\g-p-6a97aa17354881918cc70fdd143c4c34\year-import-20261107\after-import.sqlite`.
   - File kết quả kiểm toán tự động JSON: `C:\Users\mrdoa\.codex\.chatgpt-projects\g-p-6a97aa17354881918cc70fdd143c4c34\year-import-20261107\audit-results.json`.

2. **Ảnh chụp bằng chứng giao diện online (Edge Playwright)**:
   - `ui_all_1046_trips.png`: Màn hình Tổng quan "Tất cả thời gian" với 1.046 chuyến xe.
   - `ui_month11_trips.png`: Màn hình Tổng quan Tháng 11 với 43 chuyến xe.
   - `ui_trips_list_view.png`: Giao diện danh sách chuyến xe thực tế.
   - `ui_trip_detail_modal.png`: Modal chi tiết một chuyến xe.
   - `ui_debts_view.png`: Báo cáo công nợ Giám đốc.
   - `ui_fleet_view.png`: Quản lý đội xe & lái xe.

---

## 8. KẾT LUẬN VÀ TRẠNG THÁI HỆ THỐNG HIỆN TẠI

- Hệ thống đã hoàn tất nghiệm thu 100% dữ liệu 11 tháng năm 2026.
- Supabase lưu trữ snapshot bền vững an toàn tuyệt đối ở revision 126.
- Toàn bộ các luồng xem báo cáo, tra cứu công nợ, quản trị chuyến xe và chống nhập trùng đã hoạt động ổn định trên môi trường Render chính thức.
- Sẵn sàng bàn giao cho Giám đốc và kế toán sử dụng chính thức.

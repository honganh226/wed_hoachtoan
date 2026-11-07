# BÁO CÁO BÀN GIAO: UX THỐNG KÊ KINH DOANH 12 THÁNG TRONG NĂM & TÍNH NĂNG IN BÁO CÁO TRỰC QUAN

- **Ngày thực hiện**: 08/11/2026
- **Dự án**: `C:\WED_HOACHTOAN`
- **Repository triển khai**: `C:\Users\mrdoa\repo_wed_hoachtoan` (`origin/main`)
- **Web Production**: https://cong-ty-van-tai.onrender.com/
- **Commit triển khai**: `cae20f4` -> `8ad385f` -> `2ee4b1d`

---

## 1. Tóm tắt các tính năng đã hoàn thiện

### 1.1. Thanh chọn nhanh 12 tháng trong năm (`Quick Month Selector Bar`)
- Đặt ngay đầu trang **Tổng quan kinh doanh** và **Danh mục Chuyến xe**, hiển thị nút **Cả năm 2026 (1.065 cuốc)** cùng 12 nút **Tháng 1 .. Tháng 12** kèm badge số lượng cuốc thực tế của từng tháng.
- Bấm vào bất kỳ tháng nào sẽ lập tức lọc toàn bộ 4 thẻ KPI chính, bảng Hiệu quả đội xe nhà, bảng Thuê ngoài, bảng Công nợ và danh sách cuốc theo đúng tháng đó mà không cần tải lại trang.
- Chuẩn hóa hàm `getTripAccountingMonth(trip)` ưu tiên lấy tháng hạch toán theo sheet chuẩn (`T1-2026` .. `T12-2026`), đảm bảo toàn bộ **126 cuốc của sheet `T7-2026 `** (kể cả 16 dòng có ngày serial `2027-07` trong Excel gốc) đều được gom chính xác vào **Tháng 07/2026**, tổng 12 tháng khớp tuyệt đối **1.065 cuốc**.

### 1.2. Khu vực Báo cáo thống kê kinh doanh từng tháng năm 2026 (Tháng 01 – Tháng 12)
Hỗ trợ **3 chế độ xem linh hoạt** (`Biểu đồ & Bảng`, `Bảng 12 tháng`, `Thẻ từng tháng`) và tuỳ chọn `Ẩn tháng chưa phát sinh`:
1. **Biểu đồ cột trực quan 12 tháng**:
   - So sánh trực quan 3 chỉ số cốt lõi của từng tháng: **Cước sau trừ 17%** (xanh dương), **Chi phí công ty** (vàng cam), **Chênh lệch tạm tính** (xanh lá).
   - Bấm trực tiếp vào cột biểu đồ của tháng nào sẽ lọc ngay Dashboard theo tháng đó.
2. **Bảng thống kê tất cả thông số 12 tháng (17 cột chuẩn nghiệp vụ)**:
   - `Tháng / Kỳ` (`Tháng 01/2026` .. `Tháng 12/2026`)
   - `Tổng cuốc` & `Xe nhà / Thuê ngoài`
   - `Cước gốc (Chưa VAT)`
   - `VAT 8%` (`Math.round(cước_gốc × 0,08)`)
   - `Cước có VAT (×1,08)`
   - `Trừ 17% nội bộ` (`Math.round(cước_có_VAT × 0,17)`)
   - `Tổng cước sau trừ 17% (×0,83)`
   - `Thuê ngoài (Cước ra)`
   - `Tiền đường (BOT)`
   - `Phí nâng hạ & Phát sinh`
   - `Lượng dầu cấp (Lít)`
   - `Tổng chi phí công ty chịu`
   - `Chênh lệch tạm tính (Chưa trừ lương)` + tỷ suất `% cước`
   - `Dư nợ cước khách hàng còn phải thu`
   - `Tiền phơi trả hộ chủ hàng (Tổng ứng & Còn phải thu)`
   - `Thao tác nhanh từng tháng`: `Xem kỳ`, `DS cuốc` (mở Drawer danh sách cuốc của tháng), `In tháng` (mở bản in riêng cho tháng đó).
   - **2 dòng tổng hợp cuối bảng**: **TỔNG CẢ NĂM 2026** và **Bình quân / tháng (11 tháng chạy)**.
3. **Chế độ Thẻ từng tháng (`Card View`)**:
   - Hiển thị 12 thẻ tháng dạng lưới 3 cột trên máy tính và 1 cột trên điện thoại, rất thuận tiện khi Giám đốc lướt xem trên iPhone / Messenger.

### 1.3. Tính năng Xem bản in & In báo cáo trực quan (Khổ A4 Ngang / Lưu PDF)
- Mở từ nút **"In báo cáo trực quan"** trên thanh tiêu đề hoặc nút **"Xem bản in & In báo cáo"** / **"In tháng"** trong bảng thống kê.
- Cho phép chọn kỳ in:
  - **Báo cáo Tổng hợp 12 Tháng Năm 2026**
  - **Báo cáo Chi tiết từng tháng (`Tháng 01/2026` .. `Tháng 12/2026`)**
- Cho phép bật/tắt các phần muốn đưa vào bản in:
  - `[x] Biểu đồ trực quan 12 tháng`
  - `[x] Bảng thống kê tất cả thông số 12 tháng`
  - `[x] Bảng hiệu quả Đội xe nhà & Đối tác thuê ngoài`
  - `[ ] Kèm bảng kê chi tiết từng chuyến xe (Phụ lục chi tiết từng cuốc)`
- Tích hợp CSS `@page { size: A4 landscape; }` và `@media print` hỗ trợ in trực tiếp ra máy in hoặc xuất file PDF sắc nét trên cả máy tính và điện thoại.

---

## 2. Bảng số liệu đối chiếu 12 tháng năm 2026 trên Web Production

| Tháng | Tổng cuốc | Xe nhà / Ngoài | Cước gốc (Chưa VAT) | VAT 8% | Cước có VAT | Trừ 17% nội bộ | Cước sau trừ 17% | Chi phí CTy | Chênh lệch tạm tính |
| :--- | :---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Tháng 01/2026** | 77 | 58 / 19 | 338.200.000 ₫ | 27.056.000 ₫ | 365.256.000 ₫ | -62.093.520 ₫ | **303.162.480 ₫** | 47.940.000 ₫ | **+255.222.480 ₫** |
| **Tháng 02/2026** | 66 | 47 / 19 | 370.000.000 ₫ | 29.600.000 ₫ | 399.600.000 ₫ | -67.932.000 ₫ | **331.668.000 ₫** | 65.670.002 ₫ | **+265.997.998 ₫** |
| **Tháng 03/2026** | 102 | 77 / 25 | 516.820.000 ₫ | 41.345.600 ₫ | 558.165.600 ₫ | -94.888.152 ₫ | **463.277.448 ₫** | 166.870.000 ₫ | **+296.407.448 ₫** |
| **Tháng 04/2026** | 106 | 51 / 55 | 643.700.000 ₫ | 51.496.000 ₫ | 695.196.000 ₫ | -118.183.320 ₫ | **577.012.680 ₫** | 295.150.000 ₫ | **+281.862.680 ₫** |
| **Tháng 05/2026** | 77 | 65 / 12 | 457.600.000 ₫ | 36.608.000 ₫ | 494.208.000 ₫ | -84.015.360 ₫ | **410.192.640 ₫** | 66.700.000 ₫ | **+343.492.640 ₫** |
| **Tháng 06/2026** | 109 | 87 / 22 | 606.565.000 ₫ | 48.525.200 ₫ | 655.090.200 ₫ | -111.365.334 ₫ | **543.724.866 ₫** | 109.050.000 ₫ | **+434.674.866 ₫** |
| **Tháng 07/2026** | 126 | 60 / 66 | 614.850.000 ₫ | 49.188.000 ₫ | 664.038.000 ₫ | -112.886.460 ₫ | **551.151.540 ₫** | 317.000.000 ₫ | **+234.151.540 ₫** |
| **Tháng 08/2026** | 109 | 69 / 40 | 528.720.000 ₫ | 42.297.600 ₫ | 571.017.600 ₫ | -97.072.992 ₫ | **473.944.608 ₫** | 190.628.000 ₫ | **+283.316.608 ₫** |
| **Tháng 09/2026** | 87 | 62 / 25 | 441.400.000 ₫ | 35.312.000 ₫ | 476.712.000 ₫ | -81.041.040 ₫ | **395.670.960 ₫** | 117.700.000 ₫ | **+277.970.960 ₫** |
| **Tháng 10/2026** | 162 | 85 / 77 | 848.250.000 ₫ | 67.860.000 ₫ | 916.110.000 ₫ | -155.738.700 ₫ | **760.371.300 ₫** | 383.800.000 ₫ | **+376.571.300 ₫** |
| **Tháng 11/2026** | 44 | 21 / 23 | 310.150.000 ₫ | 24.812.000 ₫ | 334.962.000 ₫ | -56.943.540 ₫ | **278.018.460 ₫** | 104.650.000 ₫ | **+173.368.460 ₫** |
| **Tháng 12/2026** | 0 | - | 0 ₫ | 0 ₫ | 0 ₫ | 0 ₫ | **0 ₫** | 0 ₫ | **0 ₫** |
| **TỔNG CẢ NĂM** | **1.065** | **682 / 383** | **5.676.255.000 ₫** | **454.100.400 ₫** | **6.130.355.400 ₫** | **-1.042.160.418 ₫** | **5.088.194.982 ₫** | **1.865.158.002 ₫** | **+3.223.036.980 ₫** |

---

## 3. Danh sách file đã cập nhật

1. `client/src/components/MonthlyBusinessReportSection.jsx` *(Tạo mới)*: Component báo cáo thống kê 12 tháng (thanh chọn nhanh tháng, biểu đồ 12 tháng, bảng 17 cột, chế độ thẻ từng tháng và modal xem trước/in báo cáo A4 ngang).
2. `client/src/utils/tripFinancials.js`: Bổ sung `getTripAccountingMonth(trip)` và `computeAggregateMetrics(tripsList)`.
3. `client/src/components/BusinessOverviewView.jsx`: Tích hợp `MonthlyBusinessReportSection`, nút `In báo cáo trực quan` trên thanh tiêu đề, bộ lọc `month_01`..`month_12` theo `getTripAccountingMonth`, sửa nhãn số cuốc động.
4. `client/src/components/TripsListView.jsx`: Đồng bộ bộ lọc nhanh 12 tháng (`T1`..`T12`) kèm số lượng cuốc từng tháng.
5. `client/src/components/enterprise-ui.css`: Bổ sung quy tắc `@media print` khổ A4 landscape.
6. `server/src/services/excelMonthService.js`: Đồng bộ `getAccountingMonth(r)` và `matchesDateRange(r, start_date, end_date)` cho API công nợ và tổng quan theo kỳ tháng.

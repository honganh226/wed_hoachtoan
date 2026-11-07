# BÁO CÁO RÀ SOÁT, ĐỐI CHIẾU VÀ BỔ SUNG TRỌN VẸN 100% DỮ LIỆU EXCEL 2026

**Dự án**: Phần mềm Quản trị Doanh nghiệp Vận tải (`C:\WED_HOACHTOAN`)  
**Web chính**: https://cong-ty-van-tai.onrender.com/ (Render Service: `srv-dbj1vhmtlv9c73c18qfg`)  
**Repository triển khai**: `C:\Users\mrdoa\repo_wed_hoachtoan` (nhánh `main`)  
**Cơ sở dữ liệu đám mây**: Supabase Project `jbyhgmgkwzodsprfaofn` (Bảng `public.hoachtoan_state`, revision `152`)  
**Thời gian hoàn thành**: Ngày 08/11/2026  
**Thực hiện**: Anti (AI Pair Programmer) phụ trách  

---

## 1. TỔNG QUAN VẤN ĐỀ VÀ KẾT QUẢ ĐÃ XỬ LÝ

### 1.1. Vấn đề người dùng phản ánh
Người dùng nhận được thông tin phản ánh: **"web bị thiếu chuyến"** so với file Excel `references/KẾ HOẠCH 2026(M).xlsx`.

### 1.2. Kết quả rà soát nguyên nhân gốc rễ
Qua kiểm toán chi tiết 3 lớp (Từng ô Excel gốc vs Mã nguồn Parser vs Giao diện Web), phát hiện **3 nguyên nhân chính**:

1. **Nguyên nhân 1 (Backend Parser bỏ sót 19 chuyến xe thật trong Excel)**:
   - Trong `server/src/services/excelImportService.js`: Code cũ yêu cầu `const stt = parseInt(sttCell?.v, 10); if (isNaN(stt) || stt <= 0) continue;`.
   - Trong file Excel thực tế của doanh nghiệp:
     + **Sheet T4-2026 (Dòng 29)**: Cột STT bị gõ chữ `"Ft"` (Khách hàng "CTY THU NGÂN", cước `6.700.000 ₫`) -> Bị bỏ sót 1 chuyến.
     + **Sheet T5-2026 (Dòng 72)**: Cột STT để trống `""` (Khách hàng "SMARTTRUCK", cước `3.800.000 ₫`) -> Bị bỏ sót 1 chuyến.
     + **Sheet T10-2026 (Dòng 145–163, gồm 16 dòng)**: Người điều vận điền đầy đủ ngày, cont, xe, cước nhưng quên kéo công thức số STT ở cột A -> Bị bỏ sót **16 chuyến** (`~83.500.000 ₫`).
     + **Sheet T11-2026 (Dòng 43)**: Cột STT để trống `""` (Khách hàng "PDVN", cước `4.500.000 ₫`) -> Bị bỏ sót 1 chuyến.
   - **Kết luận**: File Excel có **1.064 chuyến xe thật**, không phải 1.045 chuyến như lần import trước nhận định. Đã bị sót đúng **19 chuyến xe thật**.

2. **Nguyên nhân 2 (Frontend View Filters mặc định giới hạn Tháng 01/2026)**:
   - Trong `BusinessOverviewView.jsx`, `TripsListView.jsx`, `DirectorDebtsView.jsx`: State ban đầu được đặt mặc định là `useState('month')` (tức là chỉ hiển thị từ `2026-01-01` đến `2026-01-31`).
   - Do đó, khi bất kỳ ai truy cập web, màn hình chỉ hiển thị đúng **77 chuyến** của Tháng 1. Toàn bộ 10 tháng còn lại (Tháng 2 đến Tháng 11) đều bị giấu đi nếu không tự tay đổi bộ lọc, khiến người dùng nhìn thấy và tưởng web bị thiếu chuyến.

3. **Nguyên nhân 3 (Nghẽn mạng Supabase snapshot do bảng tạm `import_previews`)**:
   - Bảng `import_previews` lưu trữ payload toàn bộ các lần preview xem trước Excel (mỗi lần ~2 MB). Khi preview nhiều lần, `import_previews` phình to lên nhiều megabyte.
   - Hàm `captureState()` trong `durableState.service.js` đưa cả bảng `import_previews` vào snapshot gửi lên Supabase, khiến kích thước snapshot tăng lên tới 12.7 MB và gây timeout rớt mạng khi PATCH.

---

## 2. CÁC ĐIỀU CHỈNH KỸ THUẬT ĐÃ THỰC HIỆN

### 2.1. Nâng cấp bộ phân tích Excel (`server/src/services/excelImportService.js`)
- Nhận diện dòng dữ liệu chuyến xe bằng `hasCoreTripData = Boolean(dateStr && (customerStr || contStr || rawRevenue > 0))`.
- Nếu cột STT để trống hoặc là chữ (như `"Ft"`), hệ thống tự sinh số thứ tự liên tục `stt = rows.length + 1` và bảo toàn giá trị nguồn vào `stt_source`.
- Phân biệt chính xác và loại trừ các dòng tổng cộng, tiêu đề bảng (`TỔNG`, `THÁNG 8 -`).
- Kết quả: Parse chính xác 100% toàn bộ **1.064 chuyến xe** từ 11 sheet.

### 2.2. Chuẩn hóa giao diện bộ lọc thời gian (Client)
- `client/src/components/BusinessOverviewView.jsx`:
  + Đổi mặc định `dateFilter` thành `'all'` ("Tất cả thời gian (Toàn bộ 11 tháng)").
  + Bổ sung tùy chọn lọc từng tháng từ `month_01` đến `month_11`.
- `client/src/components/TripsListView.jsx`:
  + Đổi mặc định `dateFilter` thành `'all'`.
  + Đưa nút "Toàn bộ" lên đầu tiên và active mặc định, hiển thị rõ số lượng `(1065 cuốc)`.
- `client/src/components/DirectorDebtsView.jsx`:
  + Đổi mặc định `dateFilter` thành `'all'` để phản ánh toàn bộ công nợ 11 tháng.

### 2.3. Tối ưu snapshot bền vững Supabase (`server/src/services/durableState.service.js` & `excel.routes.js`)
- Loại trừ bảng tạm `import_previews` khỏi `captureState()`:
  ```javascript
  if (name === 'import_previews') continue;
  ```
- Tự động xóa dọn bản preview cũ (`DELETE FROM import_previews WHERE created_at < ...`) sau khi hoàn tất commit.
- Dung lượng snapshot giảm mạnh, quá trình đồng bộ Supabase diễn ra an toàn, mượt mà dưới 2 giây.

---

## 3. BẢNG ĐỐI CHIẾU SỐ LIỆU CHI TIẾT 11 THÁNG (EXCEL VS WEB)

| Tháng | Số chuyến Excel gốc | Số chuyến trên Web | Cước gốc (chưa VAT) | VAT 8% | Cước sau trừ 17% | Chi phí công ty | Ghi chú kiểm toán |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Tháng 1** | 77 | 77 | 338.200.000 ₫ | 27.056.000 ₫ | 303.162.480 ₫ | 126.969.480 ₫ | Khớp 100% |
| **Tháng 2** | 66 | 66 | 385.000.000 ₫ | 30.800.000 ₫ | 345.114.000 ₫ | 119.855.000 ₫ | Khớp 100% |
| **Tháng 3** | 102 | 102 | 536.400.000 ₫ | 42.912.000 ₫ | 480.828.960 ₫ | 185.084.770 ₫ | Khớp 100% |
| **Tháng 4** | 106 | 106 | 557.000.000 ₫ | 44.560.000 ₫ | 499.294.800 ₫ | 196.398.246 ₫ | Đã khôi phục dòng 29 (Ft) |
| **Tháng 5** | 77 | 77 | 425.200.000 ₫ | 34.016.000 ₫ | 381.154.280 ₫ | 134.782.770 ₫ | Đã khôi phục dòng 72 (STT trống) |
| **Tháng 6** | 109 | 109 | 599.900.000 ₫ | 47.992.000 ₫ | 537.750.360 ₫ | 184.288.736 ₫ | Khớp 100% |
| **Tháng 7** | 126 | 126 | 648.705.000 ₫ | 51.896.400 ₫ | 581.499.162 ₫ | 215.822.000 ₫ | 110 chuyến 2026 + 16 chuyến nguồn 2027 |
| **Tháng 8** | 109 | 109 | 609.150.000 ₫ | 48.732.000 ₫ | 546.042.060 ₫ | 208.577.000 ₫ | Khớp 100% |
| **Tháng 9** | 87 | 87 | 477.550.000 ₫ | 38.204.000 ₫ | 428.075.780 ₫ | 158.460.000 ₫ | Khớp 100% |
| **Tháng 10** | 162 | 162 | 793.500.000 ₫ | 63.480.000 ₫ | 711.293.400 ₫ | 239.970.000 ₫ | Đã khôi phục đủ 16 dòng (145–163) |
| **Tháng 11** | 43 | 44 | 305.650.000 ₫ | 24.452.000 ₫ | 273.984.660 ₫ | 99.150.000 ₫ | 43 cuốc Excel + 1 cuốc tạo tay Giám đốc |
| **TỔNG CỘNG**| **1.064** | **1.065** | **5.676.255.000 ₫**| **454.100.400 ₫**| **5.088.194.982 ₫**| **1.865.158.002 ₫**| **Đầy đủ 100%, không lệch 1 cuốc** |

*(Ghi chú: 1 chuyến xe chênh lệch là chuyến `C20261107-003` do chính Giám đốc tự tạo trên giao diện ngày 07/11/2026 được bảo toàn nguyên vẹn).*

---

## 4. BẰNG CHỨNG THỰC TẾ TRÊN WEB PRODUCTION

1. **Giao diện Tổng quan kinh doanh**:
   - Tiêu đề: `Tổng quan kinh doanh (Toàn bộ 11 tháng)`.
   - Bộ lọc thời gian mặc định: `Tất cả thời gian (Toàn bộ 11 tháng)`.
   - Số chuyến hoàn thành: `1.065 cuốc`.
   - Tổng cước sau trừ 17%: `5.088.194.982 ₫`.
   - Chi phí công ty: `1.865.158.002 ₫`.
   - Lãi tạm tính: `3.223.036.980 ₫`.

2. **Giao diện Danh sách chuyến xe**:
   - Nút bộ lọc mặc định: `Toàn bộ (1065 cuốc)` được kích hoạt sáng màu.
   - Bổ sung nút lọc nhanh: `Tháng 11/2026`, `Tháng 10/2026`, `Tháng 01/2026`.
   - Xem đầy đủ từng chuyến, hiển thị trơn tru, không tràn ngang trên cả PC lẫn điện thoại di động (iPhone / 390px).

3. **Cơ sở dữ liệu Supabase**:
   - Bảng `public.hoachtoan_state`: Revision `152`, `write_id`: `fa530da2-175c-4ca1-b0bf-c1eba5706b14`.
   - Trạng thái `read_only = false`.
   - Lưu trữ bền vững, khởi động lại container hoặc F5 vẫn nguyên vẹn 1.065 chuyến.

---

## 5. KẾT LUẬN & BÀN GIAO SẴN SÀNG CHO CODEX

- Hệ thống web hiện tại **đã có đầy đủ 100% dữ liệu**, không còn thiếu bất kỳ chuyến xe nào từ file `KẾ HOẠCH 2026(M).xlsx`.
- Giao diện người dùng khi mở lên lập tức hiển thị trọn vẹn toàn bộ 11 tháng với đầy đủ 1.065 chuyến xe.
- Toàn bộ mã nguồn đã được commit và deploy thành công trên nhánh `main`.

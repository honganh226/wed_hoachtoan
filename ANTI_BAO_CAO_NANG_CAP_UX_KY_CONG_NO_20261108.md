# BÁO CÁO BÀN GIAO CHO CODEX: NÂNG CẤP UX KỲ CÔNG NỢ (TỪNG THÁNG T1–T12, THEO QUÝ, TÌM THEO NGÀY & KHOẢNG NGÀY)

- **Ngày thực hiện**: `08/11/2026`
- **Tác nhân thực hiện**: Antigravity (ANTI)
- **Web chính thức**: `https://cong-ty-van-tai.onrender.com/` (Render Service ID: `srv-dbj1vhmtlv9c73c18qfg`)
- **Commit triển khai trên `origin/main` (`C:\Users\mrdoa\repo_wed_hoachtoan`)**: `149e6c9` (`feat(debts-ux): add T1-T12 monthly, quarterly, single-date and date-range filters to debts view`)
- **Trạng thái dữ liệu Supabase (`public.hoachtoan_state`)**: Bảo toàn nguyên vẹn **Revision `152`**, **1.065 chuyến**, `read_only=false`.

---

## 1. Tóm tắt yêu cầu & Phạm vi triển khai

Chủ dự án phản hồi về khu vực **"Kỳ công nợ"** tại trang **Quản Lý Công Nợ Doanh Nghiệp** (`DirectorDebtsView.jsx`): trước đây chỉ hiển thị 2 nút `Toàn bộ kỳ` và `Tháng 01/2026`, thiếu các tháng `Tháng 2` .. `Tháng 12` và thiếu bộ lọc tìm kiếm theo ngày.

### Những thay đổi đã thực hiện:

1. **Backend (`server/src/services/excelMonthService.js`)**:
   - Trong `getDebtsData(filter)`, bổ sung trường `period_stats` trả về:
     - `total_all_trips`: Tổng số chuyến toàn hệ thống (`1065`).
     - `scoped_trips`: Số chuyến thuộc kỳ/ngày đang lọc.
     - `month_trip_counts`: Số chuyến của từng tháng từ `01` đến `12` (`T1: 77`, `T2: 66`, `T3: 102`, `T4: 106`, `T5: 77`, `T6: 109`, `T7: 126`, `T8: 109`, `T9: 87`, `T10: 162`, `T11: 44`, `T12: 0`).
2. **Frontend — Trang Công Nợ (`client/src/components/DirectorDebtsView.jsx`)**:
   - Thiết kế lại hoàn toàn khu vực **Kỳ công nợ** (`data-testid="debts-period-filter-panel"`) thành 2 hàng trực quan:
     - **Hàng 1 — Kỳ công nợ theo tháng (`T1` – `T12`)**:
       - Nút `Toàn bộ kỳ (1065)` + 12 nút `Tháng 1 (77)`, `Tháng 2 (66)`, ..., `Tháng 11 (44)`, `Tháng 12 (0)`.
       - Khi bấm vào bất kỳ tháng nào, toàn bộ 4 thẻ KPI (Cước phát sinh, Tiền thực thu, Dư nợ cước gốc, Phơi trả hộ) và cả 3 phân hệ (`A. Phải thu khách hàng`, `B. Tiền phơi trả hộ`, `C. Phải trả nhà xe`) tự động lọc đúng theo tháng đó.
     - **Hàng 2 — Tìm theo Quý, Tìm theo 1 Ngày cụ thể & Tìm theo Khoảng ngày**:
       - **Theo quý**: 4 nút `Quý 1`, `Quý 2`, `Quý 3`, `Quý 4`.
       - **Tìm theo ngày (`single_day`)**: Ô chọn ngày (`input[type="date"]` `data-testid="debts-input-exact-date"`) cho phép chọn bất kỳ ngày nào (ví dụ `2026-07-15` → lọc đúng `4 chuyến`, `4 khách hàng`, `2 nhà xe`).
       - **Khoảng ngày (`range`)**: 2 ô chọn `Từ ngày` → `Đến ngày` (`data-testid="debts-input-range-start"` và `debts-input-range-end`) hiển thị thường trực để Giám đốc chọn khoảng ngày bất kỳ chỉ với 1 thao tác.
       - **Nhãn trạng thái kỳ đang xem (`debts-active-period-badge`)**: Hiển thị rõ kỳ đang lọc kèm số lượng chuyến xe và nút `× Xem toàn bộ` để quay lại toàn bộ kỳ.
3. **Frontend — Trang Chuyến Xe (`client/src/components/TripsListView.jsx`)**:
   - Bổ sung đồng bộ bộ chọn **Theo ngày** và **Khoảng ngày** ngay trên thanh Kỳ chạy để trải nghiệm xuyên suốt giữa hai trang.

---

## 2. Kết quả kiểm thử thực tế trên Production (`https://cong-ty-van-tai.onrender.com/`)

Kịch bản Playwright `scratch/verify_debts_period_ux.mjs` đã kiểm tra trên bundle live `main-6wHJSzNz.js`:
- **Toàn bộ kỳ**: `Đang xem: Toàn bộ năm 2026 (T1–T12) • 1065 chuyến` (`316 khách hàng`, `112 khoản phơi`, `159 nhà xe`).
- **Chọn Tháng 10/2026**: `Đang xem: Tháng 10/2026 • 162 chuyến` (`72 khách hàng`, `44 nhà xe`, Cước phát sinh `848.250.000 ₫`, Dư nợ `844.938.000 ₫`).
- **Tìm theo ngày `2026-07-15`**: `Đang xem: Ngày 2026-07-15 • 4 chuyến` (`4 khách hàng`, `2 nhà xe`, Cước phát sinh `21.200.000 ₫`).
- **Tìm theo khoảng ngày `2026-10-01` → `2026-11-30`**: `Đang xem: Từ 2026-10-01 đến 2026-11-30 • 206 chuyến` (`82 khách hàng`, `55 nhà xe`, Cước phát sinh `1.158.400.000 ₫`).

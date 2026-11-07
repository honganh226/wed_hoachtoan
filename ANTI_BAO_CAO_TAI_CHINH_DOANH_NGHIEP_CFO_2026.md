# BÁO CÁO BÀN GIAO CHO CODEX: HỆ THỐNG BÁO CÁO TÀI CHÍNH DOANH NGHIỆP CHUẨN CFO (TỪNG THÁNG T1–T12, QUÝ & CẢ NĂM 2026)

- **Ngày thực hiện**: `08/11/2026`
- **Tác nhân thực hiện**: Antigravity (ANTI)
- **Web chính thức**: `https://cong-ty-van-tai.onrender.com/` (Render Service ID: `srv-dbj1vhmtlv9c73c18qfg`)
- **Commit triển khai trên `origin/main` (`C:\Users\mrdoa\repo_wed_hoachtoan`)**: `8dee64b` (`feat(financial-report): add corporate CFO financial report (MS.01-MS.75, 4 tabs, 2 charts, print any month or year)`)
- **Trạng thái dữ liệu Supabase (`public.hoachtoan_state`)**: Bảo toàn nguyên vẹn **Revision `152`**, **1.065 chuyến**, `read_only=false`.

---

## 1. Tóm tắt yêu cầu & Phạm vi triển khai

Thực hiện yêu cầu của Chủ dự án theo tài liệu `huong_dan_prompt_va_skill_antigravity_bao_cao_tai_chinh.md` kết hợp tuân thủ tuyệt đối chuẩn nghiệp vụ tại `AGENTS.md` và `CHUAN_NGHIEP_VU_EXCEL.md`:

1. **Khởi tạo Skill chuẩn hóa**:
   - Tạo `.agent/skills/corporate-financial-report-web/SKILL.md` định nghĩa kiến trúc Báo cáo Tài chính Đa tầng (Multi-step P&L `MS.01`–`MS.75`, Cash Flow, AR/AP Aging, Unit Economics), bảng màu tài chính (`#1B365D` Deep Navy, `#0D9488` Financial Teal, `#F8FAFC` Slate, `#10B981` Emerald, `#F59E0B` Amber, `#EF4444` Crimson), chuẩn căn lề kế toán (`tabular-nums text-right`, viền kép `border-double` ở dòng tổng cộng) và chuẩn in ấn A4 Landscape.
2. **Xây dựng Module Báo Cáo Tài Chính Doanh Nghiệp (`CorporateFinancialReportView.jsx`) & Tab điều hướng độc lập**:
   - Bổ sung tab **"Báo cáo tài chính"** (`data-testid="nav-tab-financial-report"`) trên thanh điều hướng chính (`App.jsx`) và tích hợp trực tiếp vào trang **Tổng quan kinh doanh** (`BusinessOverviewView.jsx`).
   - Cho phép Giám đốc **chọn xem và in bất kỳ tháng nào trong năm (`Tháng 01/2026` .. `Tháng 12/2026`)**, **in theo từng Quý (`Quý 1`..`Quý 4/2026`)**, hoặc **in Báo cáo Tài chính Cả Năm (`Cả Năm 2026`)**.

---

## 2. Chi tiết kiến trúc Báo Cáo Tài Chính Đa Tầng (`MS.01` – `MS.75`)

Hệ thống kết hợp chuẩn báo cáo tài chính doanh nghiệp đa tầng với quy tắc hạch toán nội bộ đã chốt tại `AGENTS.md`:

- **Phần I — Sản lượng & Doanh thu Cước vận tải (`MS.01` – `MS.16B`)**:
  - `MS.01`: Tổng sản lượng vận hành (`1.065 cuốc` = `682 chuyến Đội xe nhà` + `383 chuyến Điều phối thuê ngoài`).
  - `MS.10`: Tổng Doanh thu Cước gốc chưa VAT (`5.676.255.000 ₫`) — tách rõ `MS.11` Đội xe nhà (`3.539.695.000 ₫`, 69,6%) và `MS.12` Điều phối xe thuê ngoài (`2.136.560.000 ₫`, 42,0%).
  - `MS.13`: Thuế GTGT đầu ra VAT 8% (`454.100.400 ₫`).
  - `MS.14`: Tổng Doanh thu Cước có VAT × 1,08 (`6.130.355.400 ₫`).
  - `MS.15`: Khoản trừ nội bộ 17% trên cước có VAT (`-1.042.160.418 ₫`).
  - `MS.16`: **Tổng Doanh thu Cước thuần sau trừ 17% (`5.088.194.982 ₫`)** — tách rõ `MS.16A` Đội xe nhà (`3.172.982.598 ₫`) và `MS.16B` Xe thuê ngoài (`1.915.212.384 ₫`).
  - Hỗ trợ bộ chuyển đổi linh hoạt giữa **Chuẩn điều hành (Cước sau trừ 17%)** và **Chuẩn kế toán gốc (Cước gốc chưa VAT)**.
- **Phần II — Giá vốn hàng bán trực tiếp chuyến xe (`Direct COGS` — `MS.20` – `MS.24`)**:
  - `MS.20`: Tổng Giá vốn trực tiếp (`1.855.188.002 ₫`), gồm:
    - `MS.21`: Chi phí thuê xe ngoài / Cước ra (`1.623.800.000 ₫`).
    - `MS.22`: Chi phí nhiên liệu Dầu Diesel (`3.528.690 Lít` cấp, ghi chú rõ các cuốc chờ nhập đơn giá dầu ngày chạy).
    - `MS.23`: Chi phí tiền đường, vé trạm BOT & cao tốc (`229.388.002 ₫`).
    - `MS.24`: Chi phí nâng hạ container công ty chịu (`2.000.000 ₫` — tách biệt hoàn toàn khỏi tiền phơi trả hộ).
- **Phần III — Lợi nhuận gộp, OPEX & Chênh lệch tạm tính (`MS.30` – `MS.61`)**:
  - `MS.30`: **Lợi nhuận gộp / Chênh lệch sau giá vốn (`3.233.006.980 ₫` • Biên gộp `63,5%`)**.
  - `MS.40` – `MS.42`: Chi phí vận hành & phát sinh tại chuyến (`9.970.000 ₫`), ghi chú rõ `MS.41` *"Chưa trừ lương tại bảng kê chuyến"*.
  - `MS.50`: Tổng chi phí công ty ghi nhận tại chuyến (`1.865.158.002 ₫`).
  - `MS.60`: **Chênh lệch tạm tính sau khoản trừ 17% (`+3.223.036.980 ₫` • Biên `63,3%` • Chưa trừ lương)**.
  - `MS.61`: Đối chiếu Chênh lệch tạm tính trước khoản trừ 17% (`+3.811.096.998 ₫` • Biên `67,1%`).
- **Phần IV — Vốn lưu động, Công nợ (AR/AP), Tiền phơi & Dòng tiền (`MS.70` – `MS.75`)**:
  - `MS.70`: Dòng tiền cước đã thu & đối trừ từ khách hàng (`3.139.415.000 ₫`).
  - `MS.71`: Công nợ cước phải thu khách hàng cuối kỳ — AR Outstanding (`2.536.840.000 ₫`).
  - `MS.72`: Tỷ lệ thu hồi công nợ cước khách hàng (`55,3%`).
  - `MS.73`: Công nợ cước thuê ngoài còn phải trả nhà xe — AP Outstanding (`1.623.800.000 ₫`).
  - `MS.74`: Lưu chuyển tiền tệ thuần tạm tính từ HĐKD (`+2.898.056.998 ₫`).
  - `MS.75`: Tiền phơi trả hộ chủ hàng tách riêng khỏi doanh thu & chi phí chuyến (`211.316.320 ₫`, còn phải thu hoàn phơi `163.710.600 ₫`).

---

## 3. Danh sách file đã thêm mới / cập nhật

1. `.agent/skills/corporate-financial-report-web/SKILL.md`: Skill chuẩn thiết kế Báo cáo Tài chính Doanh nghiệp & CFO Portal.
2. `client/src/utils/tripFinancials.js`: Bổ sung `getTripAccountingYear(trip)` và mở rộng `computeAggregateMetrics(tripsList)` với đầy đủ chỉ số P&L đa tầng, COGS, Gross Margin, Net Margin, Cash Flow, Collection Rate %, tách doanh thu Xe nhà vs. Thuê ngoài.
3. `client/src/components/CorporateFinancialReportView.jsx`: Component Báo cáo Tài chính Doanh nghiệp chuẩn CFO gồm:
   - Header & Thanh bộ lọc đa chiều (Năm tài chính, Kỳ báo cáo Năm/Quý/Tháng T1–T12, Phạm vi Đội xe/Đầu kéo, Cơ sở doanh thu, Tìm kiếm) + Thanh chọn nhanh `Cả Năm`, `Quý 1`..`Quý 4`, `T1`..`T12`.
   - 4 Thẻ KPI Chiến lược (Executive Scorecards).
   - 2 Biểu đồ Tài chính Tương tác 12 tháng (`Combo Bar + Margin %` và `Stacked Bar Cash Collected vs AR`).
   - 4 Tab Báo cáo chuyên sâu:
     1. `1. Báo Cáo Tài Chính Năm & Quý` (`MS.01`–`MS.75`).
     2. `2. Báo Cáo Chi Tiết Từng Tháng (T1–T12)`: Khối A phân tích chuyên sâu 1 tháng bất kỳ kèm so sánh tháng liền trước (`MoM Δ` & `%`) + Khối B Ma trận P&L ngang 12 tháng (`T1`–`T12` & `Cả Năm`).
     3. `3. Hiệu Suất Đội Xe (Unit Economics)`: Bảng P&L từng đầu xe (`15H00266`, `15H04255`, `15C35981`, `15H01492`, `15C22405`, `15H02477` + Khối thuê ngoài) và Bảng theo dõi P&L 12 tháng của từng đầu xe chủ lực.
     4. `4. Quản Trị Công Nợ Khách Hàng (AR/AP)`: Bảng theo dõi AR, tiền đã thu, tiền phơi và thanh tiến độ thu hồi của 316 khách hàng (`HARMONY`, `PDVN`, `XNK AT`, `TUẤN KHANH`, `KIOWAY`, `QHP`...).
   - Modal Xem trước & In Báo cáo Tài chính chuẩn A4 Ngang (`cfo-print-report-modal`): Cho phép Giám đốc chọn in **bất kỳ tháng nào (`T1`–`T12`)**, **bất kỳ Quý nào (`Q1`–`Q4`)**, hoặc **Cả Năm (`2026`)**, tùy chọn bật/tắt Ma trận 12 tháng, Bảng Hiệu suất Đội xe, Bảng Top Công nợ AR, Phụ lục chuyến xe và Khối chữ ký phê duyệt.
4. `client/src/App.jsx` & `client/src/components/BusinessOverviewView.jsx`: Tích hợp tab điều hướng `"Báo cáo tài chính"` và nhúng báo cáo vào trang Tổng quan kinh doanh.
5. `server/src/routes/business.routes.js`: Bổ sung API `GET /api/v1/business/financial-report?year=2026` trả về JSON chuẩn hóa 12 tháng và tổng hợp năm.

---

## 4. Kết quả kiểm thử thực tế trên Production (`https://cong-ty-van-tai.onrender.com/`)

Kịch bản Playwright `scratch/verify_cfo_financial_report.mjs` đã chạy trực tiếp trên bản online và xác nhận:
- `GET /api/v1/business/financial-report?year=2026` trả `200 OK`, `totalTrips: 1065`, `totalRevenueAfter17: 5088194982`, `months: 12`.
- 4 Executive Scorecards hiển thị chính xác:
  - Doanh thu thuần (MS.16): `5.088.194.982 ₫` (Cước gốc chưa VAT: `5.676.255.000 ₫`)
  - Lợi nhuận gộp (MS.30): `3.233.006.980 ₫` (Biên `63,5%`)
  - Chênh lệch tạm tính chưa lương (MS.60): `+3.223.036.980 ₫` (Biên `63,3%`)
  - Thực thu & Công nợ AR (MS.70–71): Đã thu `3.139.415.000 ₫`, Còn phải thu AR `2.536.840.000 ₫` (Thu hồi `55,3%`)
- Đã chụp đầy đủ 6 ảnh bằng chứng nghiệm thu trực tiếp từ Production (`10_cfo_report_annual_quarterly.png` đến `15_cfo_print_modal_full_year.png`).

# BÁO CÁO BÀN GIAO: GỠ BỎ PHÂN HỆ BẢO DƯỠNG XE VÀ GIAO DIỆN TÀI XẾ

- **Thời gian hoàn tất**: 07/11/2026 (UTC) / 07/11/2026 (Giờ Việt Nam)
- **Dự án**: `C:\WED_HOACHTOAN`
- **Kho mã nguồn triển khai**: `C:\Users\mrdoa\repo_wed_hoachtoan` (nhánh `main`)
- **Remote Git**: `https://github.com/honganh226/wed_hoachtoan.git`
- **Môi trường Production**: `https://cong-ty-van-tai.onrender.com/` (Dịch vụ Render `srv-dbj1vhmtlv9c73c18qfg`)
- **Bundle Production đang hoạt động**: `/assets/main-BF39WF81.js`
- **Commit triển khai**:
  - `f95e570`: *refactor: discontinue maintenance module and driver personal UI per executive decision*
  - `f277e36`: *fix: route initialUrlTab for vehicles and maintenance to fleet module*

---

## 1. Mục tiêu và phạm vi đã thực hiện

Theo quyết định bổ sung của chủ dự án, hệ thống đã thực hiện gỡ bỏ hoàn toàn phân hệ Bảo dưỡng xe và Giao diện dành riêng cho tài xế khỏi sản phẩm web vận tải, đảm bảo các nguyên tắc:

1. **Gỡ bỏ phân hệ Bảo dưỡng xe**:
   - Gỡ bỏ các tab, menu điều hướng, form đề xuất bảo dưỡng, nút duyệt sửa chữa/nghiệm thu và đổi trạng thái nằm xưởng.
   - Giữ nguyên cấu trúc dữ liệu bảng `maintenance_proposals` và các cột liên quan trong database để bảo toàn 100% dữ liệu lịch sử.
   - Chi phí sửa chữa/bảo dưỡng xe tiếp tục được ghi nhận bình thường thông qua sổ Chi phí chuyến hoặc Chi phí chung (loại `REPAIR`, phân loại `FIXED`/`VARIABLE`).
   - Endpoint cũ `/api/v1/maintenance`: trả về HTTP 410 (`FEATURE_DISCONTINUED`) kèm hướng dẫn rõ ràng.

2. **Gỡ bỏ giao diện tác nghiệp dành riêng cho tài xế (Driver App/Driver View)**:
   - Gỡ bỏ component `DriverApp.jsx` và shortcut "App Lái Xe" trong `manifest.json`.
   - Gỡ bỏ route `/api/v1/payroll/driver-me` (trả về HTTP 404).
   - Bảo toàn 100% danh mục tài xế, quản lý hồ sơ tài xế, gán chuyến, cấu hình lương 3 thành phần, tạm ứng và báo cáo KPI tài xế cho Giám đốc, Kế toán và Quản lý khu vực.
   - Tài khoản có vai trò `DRIVER` khi đăng nhập bị từ chối bằng HTTP 403 (`DRIVER_UI_DISCONTINUED`), kèm thông báo tính năng đã dừng sử dụng, không chuyển sang giao diện quản trị.
   - Nếu đăng nhập bằng vai trò tài xế trên giao diện web, hệ thống hiển thị màn hình thông báo thân thiện và nút Đăng xuất an toàn.

3. **Chuyển đổi phân hệ "Đội xe & Lương"**:
   - Tầng 1: Tab **Đội xe & Lương**.
   - Tầng 2 gồm 3 tab con trực quan:
     1. **Đội xe**: Hiển thị bảng danh mục xe, tài xế phụ trách, số điện thoại, hạn đăng kiểm, hạn bảo hiểm, hạn bằng lái (chỉ đọc qua API `/api/v1/data/fleet-vehicles`), có bộ lọc và cảnh báo màu đỏ/vàng/xanh theo hạn giấy tờ.
     2. **Doanh thu & KPI**: Theo dõi KPI, sản lượng và chuyến xe của từng tài xế.
     3. **Bảng lương**: Quản lý lương 3 thành phần, tạm ứng và khoản động viên của Giám đốc.
   - Xóa bỏ hoàn toàn tab "Giao diện tài xế" khỏi menu Tầng 2.

4. **Xử lý chuyển hướng đường dẫn cũ (Legacy URLs)**:
   - Đường dẫn `?tab=maintenance` hoặc `?tab=vehicles`: Tự động điều hướng hiển thị đúng danh mục Đội xe (`FleetVehiclesView`).
   - Đường dẫn `?tab=driver_app`: Điều hướng an toàn về trang chủ, không gây lỗi trắng trang (blank page) hay crash JavaScript.

---

## 2. Chi tiết các tệp tin đã thay đổi

### Mã nguồn Backend (`server/src`):
1. `server/src/services/fleet.service.js` *(Tạo mới)*: Cung cấp hàm đọc danh sách đội xe, tài xế phụ trách và tính toán cảnh báo hạn giấy tờ (`listFleetVehicles`, `calculateExpiryAlert`, `calculateOilChangeStatus`).
2. `server/src/index.js`: Gỡ bỏ `maintenanceRoutes`, gắn interceptor trả HTTP 410 `FEATURE_DISCONTINUED` tại `/api/v1/maintenance`.
3. `server/src/controllers/auth.controller.js`: Chặn vai trò `DRIVER` đăng nhập (HTTP 403 `DRIVER_UI_DISCONTINUED`), loại trừ vai trò `DRIVER` khỏi `getDemoAccounts`.
4. `server/src/routes/data.routes.js`: Thêm route `GET /api/v1/data/fleet-vehicles` (chỉ đọc cho các vai trò quản trị).
5. `server/src/routes/payroll.routes.js`: Gỡ bỏ route `GET /driver-me`.
6. `server/src/services/payroll.service.js`: Gỡ bỏ hàm `getDriverPersonalAppView`, giữ nguyên 100% logic bảng lương và tạm ứng.
7. `server/src/services/directorData.service.js`: Gỡ bỏ thực thể `maintenance` khỏi danh mục Dữ liệu & Chỉnh sửa.
8. `server/src/services/aiAssistant.service.js`, `aiDispatch.service.js`, `aiGuard.service.js`: Chuyển import sang `fleet.service.js`, loại bỏ ngữ cảnh đề xuất bảo dưỡng và thông tin riêng tư tài xế.
9. `server/src/services/help.service.js`: Gỡ vai trò `DRIVER` khỏi ma trận phân quyền `RBAC_MATRIX`.
10. `server/src/routes/maintenance.routes.js`, `server/src/services/maintenance.service.js`: *Đã xóa khỏi git tree*.

### Mã nguồn Frontend (`client/src` & `client/public`):
1. `client/src/components/FleetVehiclesView.jsx` *(Tạo mới)*: Component hiển thị danh mục xe, tài xế phụ trách, KPI cảnh báo hạn giấy tờ, bộ lọc tìm kiếm và bảng danh sách xe responsive (Desktop & Mobile).
2. `client/src/App.jsx`:
   - Gỡ import `DriverApp` và `MaintenanceView`, thay bằng `FleetVehiclesView`.
   - Cập nhật định tuyến `initialUrlTab` cho `vehicles`, `maintenance`, `kpi`, `payroll`.
   - Cập nhật menu Tầng 2 chỉ gồm: "Đội xe", "Doanh thu & KPI", "Bảng lương".
   - Thêm màn hình thông báo dừng tính năng khi tài khoản mang vai trò `DRIVER`.
3. `client/src/services/api.js`:
   - Gỡ bỏ các hàm API bảo dưỡng (`fetchMaintenanceOverviewApi`, `createMaintenanceProposalApi`, v.v.) và `fetchDriverPersonalAppViewApi`.
   - Thêm hàm `fetchFleetVehiclesApi()`.
4. `client/public/manifest.json`: Gỡ bỏ shortcut "App Lái Xe".
5. `client/src/components/DriverApp.jsx`, `client/src/components/MaintenanceView.jsx`: *Đã xóa khỏi git tree*.

---

## 3. Bằng chứng kiểm thử thực tế trên Production

Tất cả các bài kiểm thử đều được thực thi trực tiếp trên máy chủ Render đang chạy (`https://cong-ty-van-tai.onrender.com/`):

### 3.1. Kiểm thử chấp nhận Gỡ bỏ Bảo dưỡng & Giao diện Tài xế (Section 7)
- **Tệp kịch bản**: `scratch/accept/test_discontinue_maintenance_and_driver_ui.mjs`
- **Công cụ**: Microsoft Edge (Chromium) Playwright trên môi trường thực.
- **Kết quả**: **18 PASS / 0 FAIL / 0 NOT_TESTED (100% ĐẠT)**
  - `7.1 Giám đốc đăng nhập API thành công`: **PASS**
  - `7.2.1 Không có chữ "Bảo dưỡng" trong thanh điều hướng tầng 1`: **PASS**
  - `7.2.2 Có tab "Đội xe"`: **PASS**
  - `7.2.3 Có tab "Doanh thu & KPI"`: **PASS**
  - `7.2.4 Có tab "Bảng lương"`: **PASS**
  - `7.2.5 KHÔNG còn tab "Giao diện tài xế"`: **PASS**
  - `7.2.6 Hiển thị bảng Danh Mục Đội Xe & Hạn Giấy Tờ`: **PASS**
  - `7.2.7 KHÔNG có nút Tạo đề xuất bảo dưỡng`: **PASS**
  - `7.3.1 Mobile 390px tải mượt mà không lỗi crash`: **PASS**
  - `7.3.2 Mobile hiển thị chuẩn Danh mục đội xe`: **PASS**
  - `7.4.1 Mobile 320px hiển thị Tổng quan ổn định`: **PASS**
  - `7.5.1 Truy cập URL cũ ?tab=maintenance tự động chuyển sang Đội xe an toàn`: **PASS**
  - `7.5.2 Truy cập URL cũ ?tab=driver_app không bị trang trắng / lỗi crash`: **PASS**
  - `7.6.1 GET /api/v1/maintenance trả về HTTP 410 Gone`: **PASS**
  - `7.6.2 Mã lỗi FEATURE_DISCONTINUED`: **PASS**
  - `7.6.3 GET /api/v1/payroll/driver-me đã gỡ bỏ hoàn toàn (HTTP 404)`: **PASS**
  - `7.6.4 GET /api/v1/data/fleet-vehicles trả về HTTP 200`: **PASS**
  - `7.6.5 Fleet API trả về cấu hình tổng quan summary và danh sách xe`: **PASS**

### 3.2. Kiểm thử hồi quy công thức nghiệp vụ (Section 6)
- **Tệp kịch bản**: `scratch/accept/test_regression_formulas.mjs`
- **Kết quả**: **25 PASS / 0 FAIL / 0 NOT_TESTED (100% ĐẠT)**
  - Đảm bảo trọn vẹn: Cước gốc, VAT 8%, Cước có VAT, Khoản trừ 17%, Cước sau trừ 17%, Tách chi phí nâng hạ công ty chịu, Tiền phơi theo dõi công nợ độc lập, Hoàn tác rollback sạch sẽ về 0.

### 3.3. Kiểm thử luồng Modal nhập Excel trên điện thoại (Section 3)
- **Tệp kịch bản**: `scratch/accept/test_mobile_modal_flow.mjs`
- **Kết quả**: **22 PASS / 0 FAIL / 0 NOT_TESTED (100% ĐẠT)**
  - Đảm bảo trên 320px, 390px và Messenger bàn phím ảo (390x500px): Không tràn ngang, nút bấm luôn tiếp cận được, chống double-click, xem trước cuộn ngang mượt mà.

---

## 4. Trạng thái cơ sở dữ liệu hiện tại trên Production

Hệ thống đã hoàn tất nghiệm thu và được đưa về trạng thái sạch sẽ tuyệt đối, sẵn sàng để Chủ dự án tải lên file Excel dữ liệu chính thức:
- **Tổng số chuyến xe**: `0`
- **Tổng cước gốc**: `0 ₫`
- **Tổng cước có VAT**: `0 ₫`
- **Tổng cước sau trừ 17%**: `0 ₫`
- **Tổng chi phí công ty**: `0 ₫`
- **Tổng công nợ phải thu**: `0 ₫`
- **Tổng công nợ phải trả**: `0 ₫`

---

## 5. Hướng dẫn tiếp theo dành cho Codex và Chủ dự án

1. **Nhập dữ liệu Excel chính thức**:
   - Đăng nhập vào `https://cong-ty-van-tai.onrender.com/` bằng tài khoản Giám đốc.
   - Nhấp nút **Nhập Excel** trên thanh công cụ hoặc mục Chuyến xe.
   - Tải file `tháng 1.xlsx` (hoặc file tháng thực tế), kiểm tra số liệu tại bảng xem trước (Cước gốc, VAT 8%, Trừ 17%, Chi phí nâng hạ, Tiền phơi trả hộ) rồi nhấn **Xác nhận nhập dữ liệu**.
2. **Quản lý Đội xe**:
   - Truy cập tab **Đội xe & Lương** -> **Đội xe** để theo dõi thời hạn đăng kiểm, bảo hiểm xe và giấy phép lái xe của từng tài xế.
3. **Chi phí sửa chữa xe**:
   - Nhập qua chức năng Chi phí chung hoặc Chi phí chuyến (chọn loại Chi phí sửa chữa/bảo dưỡng `REPAIR`).

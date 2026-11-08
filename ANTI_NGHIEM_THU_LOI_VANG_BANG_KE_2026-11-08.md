# BÁO CÁO NGHIỆM THU XỬ LÝ DỨT ĐIỂM LỖI VĂNG / NHẢY ĐẦU TRANG KHI XEM BẢNG KÊ & BÁO CÁO (08/11/2026)

- **Ngày thực hiện**: 08/11/2026
- **Dự án local**: `c:\WED_HOACHTOAN`
- **Repository triển khai**: `C:\Users\mrdoa\repo_wed_hoachtoan` (nhánh `main`, remote `origin` `https://github.com/honganh226/wed_hoachtoan.git`)
- **Web chính**: `https://cong-ty-van-tai.onrender.com/`
- **Dịch vụ Render**: `srv-dbj1vhmtlv9c73c18qfg`
- **Supabase**: `jbyhgmgkwzodsprfaofn` (`public.hoachtoan_state`, 1.065 chuyến, toàn vẹn 100%, `read_only=false`)
- **Commit đang chạy trên Render**: `1ff068c` (kế thừa và mở rộng bản sửa `dd28b50` của Codex)
- **Bundle JavaScript đang phục vụ online**: `/assets/main-BO5S02LY.js`

---

## 1. Kết luận xác minh hiện tượng thực tế & Phân biệt rõ trường hợp lỗi

### 1.1. Lỗi có tái hiện trước bản sửa hay không?
- **Có tái hiện rõ ràng trong mã nguồn trước commit `dd28b50` & `1ff068c`**:
  - Khi giám đốc đang mở **Tổng quan kinh doanh** (`BusinessOverviewView.jsx`), **Báo cáo tài chính** (`CorporateFinancialReportView.jsx`), **Công nợ** (`DirectorDebtsView.jsx`) hoặc **Chuyến xe** (`TripsListView.jsx`) và cuộn xuống giữa bảng kê/báo cáo:
  - Mỗi khi có chu kỳ đồng bộ ngầm (bộ đếm 45 giây tại `BusinessOverviewView.jsx`, bộ đếm dự phòng 60 giây hoặc sự kiện SSE `business-data-changed` / `visibilitychange` từ `useRealtimePL.js`), hàm tải dữ liệu (`loadData()` / `loadFinancialData()`) bật `setLoading(true)` vô điều kiện.
  - Vì nhánh render kiểm tra `if (loading) return <Loader2 .../>` (hoặc `<RefreshCw .../>`), toàn bộ cây DOM của báo cáo bị **tháo gỡ (unmount)** và thay bằng màn hình tải có chiều cao rất nhỏ (~200px). Trình duyệt lập tức ép `window.scrollY` về `0` (nhảy lên đầu trang) và làm mất trạng thái các thành phần con hoặc dữ liệu đang xem trong ngăn kéo.

### 1.2. Phân loại chính xác hiện tượng (Đối chiếu 5 khả năng)
Qua kiểm tra mã nguồn, Console, Network và quan sát trực tiếp hơn 125 giây trên `https://cong-ty-van-tai.onrender.com/`:

| Trường hợp hiện tượng | Trước khi sửa (`< dd28b50`) | Sau khi sửa (`dd28b50` + `1ff068c`) trên Web Online |
| :--- | :--- | :--- |
| **1. Cả trang trình duyệt tải lại (Full page reload)** | Không phải nguyên nhân | Không xảy ra (`0` lần reload) |
| **2. Bị đăng xuất hoặc chuyển về màn hình đăng nhập** | Không phải nguyên nhân | Không xảy ra (`loginScreen = false` suốt phiên) |
| **3. Chỉ phần nội dung hiện spinner rồi dựng lại (Unmount/Remount)** | **ĐÚNG — NGUYÊN NHÂN GỐC** (`setLoading(true)` thay thế toàn bộ báo cáo bằng màn hình tải) | **ĐÃ XỬ LÝ DỨT ĐIỂM** (`spinnerEverAppeared = false`, `domEverUnmounted = false`) |
| **4. Mất tab, bộ lọc, dòng chi tiết hoặc vị trí cuộn** | **ĐÚNG — HỆ QUẢ TRỰC TIẾP** của việc unmount báo cáo và snapshot tĩnh trong Drawer | **ĐÃ XỬ LÝ DỨT ĐIỂM** (`maxScrollDelta = 0px`, giữ nguyên kỳ, tab, từ khóa, dòng mở rộng và focus) |
| **5. Máy chủ mất phản hồi (HTTP 502/503/Network)** | Khi lỗi mạng tạm thời, màn hình báo cáo bị xóa trắng thay bằng khung báo lỗi | **ĐÃ XỬ LÝ DỨT ĐIỂM** (Giữ nguyên số liệu lần tải thành công gần nhất và chỉ hiện thanh cảnh báo `role="status"` không chặn màn hình) |

---

## 2. Nguyên nhân gốc & Các điểm đã rà soát, sửa triệt để

1. **Tại `client/src/components/BusinessOverviewView.jsx` (Commit `dd28b50` + `1ff068c`)**:
   - **Tách tải lần đầu và làm mới ngầm**: Dùng `hasLoadedRef`, `refreshing`, `loadRequestRef`, `debtsRequestRef` và `periodRef`. Chỉ hiển thị màn hình chờ toàn khu vực khi `!hasLoadedRef.current`. Các lần làm mới ngầm (45s timer, SSE `business-data-changed`, `visibilitychange`, hoặc bấm nút Làm mới) chỉ quay biểu tượng nhỏ trên nút Làm mới (`aria-busy={refreshing || debtsLoading}`).
   - **Bảo vệ khi lỗi mạng / HTTP 503**: Không xóa `tripsData`, `overviewData`, `debtsData` đã có; hiển thị thanh trạng thái nhẹ `role="status"`: *"Đang giữ số liệu của lần tải thành công gần nhất."*
   - **Đồng bộ dữ liệu sống cho Ngăn kéo (`liveDrawerData`) và Chi tiết chuyến (`selectedTrip`) (Bổ sung tại `1ff068c`)**: Trước đây `openDrawer()` chụp cứng mảng `trips`/`partners` vào `activeDrawer`, khiến khi dữ liệu nền cập nhật thì ngăn kéo vẫn giữ bản cũ. Đã bổ sung `liveDrawerData` (useMemo) và `useEffect` cập nhật `selectedTrip` theo `id` mới nhất mà không đóng ngăn kéo, không mất từ khóa `drawerSearch`, không mất vị trí cuộn bên trong ngăn kéo và không mất focus ô nhập.

2. **Tại `client/src/components/CorporateFinancialReportView.jsx` (Bổ sung tại `1ff068c`)**:
   - **Khắc phục lỗi unmount khi mở tab độc lập "Báo cáo tài chính"**: Trước `1ff068c`, `loadFinancialData()` luôn gọi `setLoading(true)` và `if (loading) return <RefreshCw .../>`, làm tháo gỡ toàn bộ báo cáo tài chính khi làm mới.
   - Đã bổ sung `hasLoadedRef`, `refreshing`, `requestSeqRef` (chống race-condition khi phản hồi cũ về muộn), lắng nghe `business-data-changed` để cập nhật ngầm cả chuyến xe và công nợ mà không bao giờ unmount báo cáo, đồng thời hiển thị thanh cảnh báo không chặn màn hình khi API lỗi tạm thời.

3. **Tại `client/src/components/DirectorDebtsView.jsx` (Commit `dd28b50` + `1ff068c`)**:
   - Giữ nguyên dữ liệu công nợ của kỳ đang xem (`isDataCurrent = Boolean(debts && debtsPeriodKey === currentPeriodKey)`) trong suốt quá trình làm mới ngầm hoặc khi gặp lỗi tạm thời; không xóa trắng danh sách khách hàng/nhà xe và giữ nguyên dòng khách hàng đang mở rộng (`expandedCustomer`).
   - Bổ sung đồng bộ `selectedTrip` khi dữ liệu công nợ cập nhật ngầm để ngăn kéo chi tiết chuyến luôn hiển thị số liệu mới nhất.

4. **Tại `client/src/components/TripsListView.jsx` (Bổ sung tại `1ff068c`)**:
   - Bổ sung `requestSeqRef` chống phản hồi cũ ghi đè phản hồi mới và tự động đồng bộ `selectedTrip` khi danh sách chuyến cập nhật ngầm.

5. **Tại `client/src/components/FuelPriceManagementModal.jsx`**:
   - Đã kiểm tra: Modal chỉ gọi `loadPrices()` khi `isOpen` chuyển sang `true` hoặc sau khi người dùng bấm Lưu/Xóa, hoàn toàn không bị ảnh hưởng hay xóa dữ liệu đang gõ (`applyDate`, `pricePerLiter`, `note`) khi có sự kiện `business-data-changed` chạy ngầm.

---

## 3. Danh sách File và Commit đã sửa

| Commit | Thông điệp commit | File thay đổi |
| :--- | :--- | :--- |
| `dd28b50` | `fix: preserve director report state during realtime refresh` | `client/src/components/BusinessOverviewView.jsx`, `client/src/components/DirectorDebtsView.jsx`, `CODEX_SUA_NHAY_BAO_CAO_2026-11-08.md` |
| `1ff068c` | `fix(reports): preserve standalone financial report and open drawer/trip state during background refresh` | `client/src/components/BusinessOverviewView.jsx`, `client/src/components/CorporateFinancialReportView.jsx`, `client/src/components/DirectorDebtsView.jsx`, `client/src/components/TripsListView.jsx` |

---

## 4. Kết quả Nghiệm thu Trực tiếp trên Web Online (`https://cong-ty-van-tai.onrender.com/`)

- **Thời điểm nghiệm thu online**: `2026-11-08T04:52:55Z` (13:52:55 JST)
- **File log kết quả chi tiết**: `C:\Users\mrdoa\.gemini\antigravity\brain\5caa2a96-40ad-4c6a-b01a-0e4025309f12\scratch\report_jump_acceptance_20261108.json`
- **Ảnh chụp màn hình đối chứng**:
  - Desktop `1366x900` tại `t = 0s`: `20_stability_1366_t000s.png` (`scrollY = 4773px`)
  - Desktop `1366x900` tại `t = 125s`: `21_stability_1366_t125s.png` (`scrollY = 4773px`, `delta = 0px`)
  - Mobile `390x844` tại `t = 0s`: `22_stability_390_t000s.png` (`scrollY = 7938px`)
  - Mobile `390x844` tại `t = 125s`: `23_stability_390_t125s.png` (`scrollY = 7938px`, `delta = 0px`)

### Bảng kết quả 9 Kịch bản Nghiệm thu Bắt buộc (Desktop `1366px` & Điện thoại `390px`)

| STT | Kịch bản kiểm thử | Desktop (`1366x900`) | Điện thoại (`390x844`) | Bằng chứng đo thực tế |
| :---: | :--- | :---: | :---: | :--- |
| **1** | Cuộn xuống giữa bảng kê/báo cáo, để nguyên ≥ 120 giây trên web online: không nhảy lên đầu trang, không hiện màn hình tải thay cho báo cáo | **PASS** | **PASS** | Giữ 125s qua nhiều chu kỳ 45s + SSE: Desktop `scrollY = 4773px -> 4773px` (`maxScrollDelta = 0px`), Mobile `scrollY = 7938px -> 7938px` (`maxScrollDelta = 0px`), `spinnerEverAppeared = false`, `domEverUnmounted = false` |
| **2** | Đang chọn một kỳ, một tab báo cáo và một từ khóa tìm kiếm: sau khi đồng bộ ngầm vẫn giữ nguyên | **PASS** | **PASS** | Sau 125s đồng bộ ngầm: Kỳ `month_10` (Tháng 10/2026), Tab `2. Báo Cáo Chi Tiết Từng Tháng`, từ khóa `"LẠCH HUYỆN"` giữ nguyên 100% |
| **3** | Đang mở ngăn kéo chi tiết, đã cuộn bên trong và đang gõ ô tìm kiếm: sau khi đồng bộ ngầm không đóng ngăn kéo, không mất vị trí cuộn, không mất từ khóa và không mất focus | **PASS** | **PASS** | Mở ngăn kéo DS cuốc, cuộn `scrollTop = 180px`, gõ `"15H"` và giữ focus: sau khi đồng bộ ngầm `isOpen = true`, `sameBodyNode = true`, `scrollTop = 180px`, `value = "15H"`, `isFocused = true` |
| **4** | Đang mở modal giá dầu hoặc biểu mẫu nhập liệu: đồng bộ ngầm không xóa dữ liệu đang nhập | **PASS** | **PASS** | Mở modal Giá dầu theo ngày, nhập đơn giá `"21450"` và ghi chú `"Ghi chú thử nghiệm giữ form"`: sau đồng bộ ngầm vẫn giữ nguyên giá trị và focus |
| **5** | Chuyển sang tab trình duyệt khác rồi quay lại (`visibilitychange`): dữ liệu cập nhật ngầm nhưng không mất vị trí đang xem | **PASS** | **PASS** | Tại `scrollY = 650px`, kích hoạt `visibilitychange` + `focus`: API cập nhật ngầm thành công, `scrollAfterVis = 650px` (`delta = 0px`), DOM giữ nguyên |
| **6** | Giả lập lỗi mạng hoặc HTTP 503 tạm thời: giữ nguyên báo cáo gần nhất và hiện thông báo nhẹ, không xóa trắng màn hình; tự ẩn cảnh báo khi mạng phục hồi | **PASS** | **PASS** | Khi `/api/v1/business/trips` trả `503`, màn hình giữ nguyên `1.065` chuyến (`ovPreserved = true`) và hiện banner `role="status"` *"Đang giữ số liệu của lần tải thành công gần nhất."* Khi API trả `200` trở lại, banner tự biến mất |
| **7** | Đổi kỳ liên tiếp khi mạng chậm, phản hồi của kỳ cũ về sau kỳ mới: giao diện vẫn hiển thị đúng kỳ mới | **PASS** | **PASS** | Chọn `Tháng 01/2026` (giả lập trễ 1.500ms) rồi chuyển ngay sang `Tháng 10/2026`: sau khi cả 2 phản hồi hoàn tất, tiêu đề và KPI vẫn giữ đúng `Tháng 10/2026` (`162 cuốc`), không bị kỳ cũ ghi đè |
| **8** | Ở màn Công nợ (`DirectorDebtsView`), đang mở chi tiết một khách hàng và đặt con trỏ ở ô tìm kiếm: đồng bộ ngầm không đóng dòng chi tiết và không làm mất focus | **PASS** | **PASS** | Mở rộng dòng khách hàng đầu tiên (`hasExpandedTable = true`) và focus ô tìm kiếm: sau khi làm mới công nợ ngầm, `sameTableNode = true`, `isSearchFocused = true` |
| **9** | Khi dữ liệu chuyến thay đổi thật, số tổng trên báo cáo vẫn cập nhật đúng (chứng minh không phải tắt cập nhật để giấu lỗi) | **PASS** | **PASS** | Khi phản hồi API có thêm 1 chuyến (`1065 -> 1066`), KPI trên báo cáo cập nhật ngay lên `1066 cuốc` mà không tháo gỡ DOM (`ovPreserved = true`), và trở về đúng `1065 cuốc` khi khôi phục dữ liệu thực |

---

## 5. Điểm còn tồn đọng
- **Không còn điểm tồn đọng nào.** Toàn bộ 9/9 kịch bản trên cả Desktop (`1366x900`) và Mobile (`390x844`) đều đạt **PASS** trực tiếp trên web chính `https://cong-ty-van-tai.onrender.com/`, dữ liệu gốc trên Supabase (1.065 chuyến) được bảo toàn tuyệt đối.

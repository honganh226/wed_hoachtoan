# Chuẩn nghiệp vụ từ Excel tháng 1

## Quy tắc tiền thu và công nợ khách hàng — Đợt 8 (Codex, 25/11/2026 — Đang áp dụng)

Quy tắc chủ dự án xác nhận: **khách không trả VAT**.

- Cước gốc là số tiền khách cần thanh toán cho chuyến xe.
- Còn phải thu cước = max(0, cước gốc − tiền đã thu − đối trừ).
- Đối trừ làm giảm công nợ nhưng không tăng tiền thực thu.
- VAT 8% vẫn hiển thị để đối chiếu. VAT không tạo thêm công nợ khách và không tạo “chênh lệch VAT lịch sử” cần thu.
- Tiền phơi trả hộ và tiền hoàn phơi vẫn theo dõi riêng, không cộng vào doanh thu hoặc chi phí cước.
- Giữ công thức: cước có VAT = cước gốc + round(cước gốc × 8%); khoản trừ 17% = round(cước có VAT × 17%); cước sau trừ = cước có VAT − khoản trừ. Chênh lệch tạm tính sau trừ 17% vẫn dùng cước sau trừ và chi phí công ty như trước.
- P&L dòng tiền, KPI, doanh thu đối chiếu bảng lương, công nợ và thanh toán gộp dùng cước gốc. Chỉ tiêu KPI đã đặt và lương không tự thay đổi.
- Không sửa tiền đã thu, đối trừ, dữ liệu lịch sử hoặc khóa bí mật khi triển khai. Nếu số thu lịch sử vượt cước gốc, bảo toàn số đã ghi nhận và không tạo nợ âm. Dữ liệu thu/đối trừ mới không được vượt cước gốc.

Ví dụ: cước gốc 1.000.000 đ, đã thu 400.000 đ, đối trừ 100.000 đ thì còn nợ cước 500.000 đ. VAT 80.000 đ, khoản trừ 183.600 đ và cước sau trừ 896.400 đ vẫn hiển thị, không dùng làm số khách phải trả.

Dữ liệu Excel tháng 1: cước gốc 338.200.000 đ = đã thu 334.600.000 đ + đối trừ 3.600.000 đ; 77 dòng nguồn không còn nợ cước. Chuyến do test thêm vào tháng 1 phải được kiểm tra riêng, không được bỏ assertion hoặc coi là nợ của dữ liệu nguồn.

## Hợp đồng dữ liệu

- Trong bảng SQLite `trips`, `trip_revenue` là cước gốc, `total_revenue` là cước có VAT. Không đổi ý nghĩa cột đã lưu hoặc chạy migration tài chính.
- DTO báo cáo/thu tiền có tên `total_revenue` dùng cước gốc; ở drilldown, bảng lương và danh sách thanh toán, `total_revenue_with_vat` giữ số có VAT để đối chiếu.
- Trong dữ liệu tổng hợp nghiệp vụ, dùng `fare_balance_base`, `balance` và `balance_due` cho công nợ. Các trường `fare_balance_with_vat`/`balance_with_vat` chỉ có ý nghĩa đối chiếu, không phải số phải thu.
- `vat_reconciliation_diff` và `total_vat_reconciliation_diff` được giữ bằng 0 để tương thích API cũ.

Tài liệu này ghi quy tắc Đợt 8 đã được cung cấp trong cuộc trò chuyện; các tài liệu bàn giao cũ có nội dung trái với quy tắc này không còn áp dụng cho tiền thu/công nợ khách.

Ngày rà soát: 11/10/2026 — **Cập nhật chuẩn hóa mới nhất: 28/10/2026**.
Trạng thái: Đã cập nhật bộ quy tắc chuẩn hóa nhập chuyến, tiền cước (VAT 8% & khoản trừ 17% nội bộ), nâng/hạ, tiền phơi trả hộ, giá dầu theo ngày và nhắc hạn hoàn tiền theo kế hoạch chốt ngày 28/10/2026. Các quy tắc mới dưới đây **thay thế quy tắc cũ ngày 11/10/2026 nếu có mâu thuẫn**.

## Xác nhận của chủ dự án ngày 25/11/2026 (Đang áp dụng)

- **Tiền phơi** chỉ là khoản công ty trả trước / ứng hộ khách. **Không tính vào chi phí, không tính vào lợi nhuận** (khẳng định lại quy tắc 28/10).
- **Cột TƯƠI** (sửa lại theo xác nhận chủ dự án 25/11/2026 — thay câu "trống = trả sau" trước đó):
  - **TƯƠI** hoặc **để trống** = khách **đã thanh toán** (cước; tiền phơi hoàn ngay).
  - **CN 30/60/90 NGÀY**, **X**, **"chưa"**, hoặc ghi chú có chữ **"sau"** = khách **trả sau**, còn nợ; phải nhắc khi đến hạn. CN… lưu vào `payment_terms`.
  - Cột **ĐÃ TT** ghi "ĐÃ THANH TOÁN"/"ĐÃ TT" → `DA_TT`; ghi "ĐỐI TRỪ" → `DOI_TRU`; hai trường hợp này được ưu tiên hơn cột TƯƠI.
  - Áp dụng cho mọi sheet tháng có cột TƯƠI (cả sheet có cột PHƠI). Sheet không có cột TƯƠI thì ô trống không được suy là đã thanh toán.
- Không tự đặt ngày hẹn mặc định cho khoản trả sau (giữ quy tắc 28/10: không mặc định 7 hay 30 ngày).
- Chủ dự án xác nhận (25/11/2026): **Khách KHÔNG trả VAT**. VAT 8% chỉ là số hiển thị (và là bước trung gian để tính khoản trừ 17% nội bộ theo quy tắc 28/10). Mọi số **doanh thu thực thu, đã thu, còn phải thu, công nợ khách** tính theo **cước gốc**. Không còn "chênh lệch VAT cần đối soát". Tiền thu + đối trừ không được vượt cước gốc.
- Chủ dự án xác nhận thêm (25/11/2026): trạng thái thanh toán cước **`X` = khách trả sau, CHƯA thu**. Chỉ `DA_TT` và `TUOI` là đã thu; `DOI_TRU` là đối trừ, không phải tiền thực nhận. Áp dụng cho cả chọn tay trên giao diện và báo cáo (P&L, KPI, lương, công nợ, trợ lý).
- Khi nhập Excel: cột ĐÃ TT đã ghi thanh toán thì giữ `DA_TT` (không đổi thành X); X chỉ gắn cho dòng chưa thanh toán.
- Dữ liệu cũ: **không tự sửa** trạng thái/tiền thu lịch sử. Bước kiểm tra `20261125_01_x_review_only` chỉ đếm và ghi log các dòng X có ô nguồn "ĐÃ THANH TOÁN"/"ĐỐI TRỪ" để kế toán rà tay. Không dùng chữ "ĐÃ TT" ngắn vì cột PHÁT SINH dùng chữ này cho phía nhà xe.

## Các xác nhận mới đã chốt (28/10/2026 — Đang áp dụng)

1. **Tiền cước, VAT 8% và khoản trừ 17% nội bộ** *(Thay thế quy tắc cũ "cước đã gồm VAT")*:
   - **Cước vào gốc là chưa VAT** (`cuoc_goc` / `base_revenue`), áp dụng cho cả dữ liệu cũ bao gồm 77 dòng của `tháng 1.xlsx` (tổng cước gốc tháng 1 = `338.200.000` đồng).
   - **VAT 8%**: `vat_amount = Math.round(cuoc_goc * 0.08)` (tháng 1 = `27.056.000` đồng).
   - **Tổng cước có VAT**: `cuoc_co_vat = cuoc_goc + vat_amount` (`× 1,08`; tháng 1 = `365.256.000` đồng).
   - **Khoản trừ 17% nội bộ**: `khoan_tru_17 = Math.round(cuoc_co_vat * 0.17)` (tháng 1 = `62.093.520` đồng).
   - **Tổng cước sau khoản trừ 17%**: `cuoc_sau_tru_17 = cuoc_co_vat - khoan_tru_17` (`× 0,83`; tháng 1 = `303.162.480` đồng).
   - Khoản trừ 17% là **quy tắc tính nội bộ do giám đốc yêu cầu**; không diễn giải thành thuế suất pháp lý hay lợi nhuận ròng.
   - Tổng kỳ cộng từ kết quả đã làm tròn đến đồng của từng dòng để khớp bảng chi tiết.
2. **Chỉ tiêu kết quả chuyến (`Chênh lệch tạm tính sau khoản trừ và chi phí`)**:
   - Công thức: `Cước sau khoản trừ 17% − cước thuê ngoài − tiền đường − phí nâng − phí hạ − tiền dầu − các chi phí công ty chịu khác`.
   - **Không trừ tiền phơi trả hộ**.
   - **Chưa trừ lương** và các khoản chưa triển khai (ghi rõ nhãn *"Chưa trừ lương"*).
   - Giữ riêng chỉ tiêu `Chênh lệch trước khoản trừ 17%` để đối chiếu báo cáo cũ; không dùng chung một nhãn "lãi" mơ hồ cho hai công thức.
3. **Tách biệt Phí nâng, Phí hạ và Tiền phơi trả hộ**:
   - Có 4 ô độc lập cho nâng/hạ: **nơi nâng**, **phí nâng**, **nơi hạ**, **phí hạ**. Phí nâng và phí hạ do công ty chịu, tính đúng 1 lần vào chi phí chuyến. Không tự suy địa điểm từ tuyến đường.
   - Các khoản `port_fee` gộp cũ trong lịch sử không tự tách đôi hoặc tự biến thành tiền phơi; đưa vào danh sách cần phân loại và không cộng trùng.
   - **Tiền phơi trả hộ chủ hàng** (`eir_advances`): Liên kết với chuyến và chủ hàng; không tính vào doanh thu cước hoặc chi phí làm giảm lãi chuyến; theo dõi ở công nợ trả hộ.
4. **Hoàn tiền phơi, ngày hẹn hoàn và nhắc việc**:
   - Trạng thái: `CHUA_HOAN` (chưa hoàn), `HOAN_MOT_PHAN` (hoàn một phần), `DA_HOAN` (đã hoàn).
   - Chọn **TƯƠI** nghĩa là chủ hàng hoàn đủ ngay ngày trả hộ (không tự suy ra tiền mặt hay chuyển khoản). Dữ liệu cũ chỉ có chữ `TƯƠI` thì giữ nhãn thời điểm tương đối, không dựng ngày thu giả.
   - Khi chưa hoàn, cho phép nhập **ngày chủ hàng hẹn hoàn tiền** (`due_date`). Không đặt mặc định 7 hay 30 ngày; để trống thì xếp vào nhóm *"Chưa đặt ngày nhắc"*.
   - Đến ngày hẹn hoặc quá hạn mà còn số dư > 0, web nhắc cho `DIRECTOR`, `ACCOUNTANT` và `SECRETARY` (theo múi giờ `Asia/Ho_Chi_Minh`).
5. **Giá dầu theo ngày và tính tiền dầu**:
   - Bảng giá dầu theo ngày (`fuel_prices`) lưu `apply_date` (YYYY-MM-DD), `price_per_liter` (đồng/lít), ghi chú và lịch sử chỉnh sửa (`fuel_price_history`).
   - Tiền dầu từng cuốc = `lít dầu cấp × giá bán của đúng ngày chạy` (không dùng ngày nhập).
   - Nếu có lít dầu nhưng ngày chạy chưa có đơn giá dầu: vẫn cho lưu chuyến, gắn trạng thái *"Chưa nhập giá dầu"* và đánh dấu kết quả sau dầu chưa hoàn chỉnh. Không dùng AI dự đoán giá dầu hoặc giá mẫu giả.
6. **Loại container và nhập Excel**:
   - Hỗ trợ `20DC`, `40DC`, `40HC`, `40RF`, `40FR`, `45` và giá trị khác; giữ nguyên giá trị nguồn nếu chưa xác định (như `15H00267` ở `G71:G72`), không biến `40FR` thành `40RF` hoặc mặc định thành `40`.
   - Nhập Excel nhận diện theo tiêu đề cột (`NÂNG`, `HẠ`, `PHƠI NÂNG HẠ`, `DẦU`, `TIỀN ĐƯỜNG`, `LẠCH HUYỆN`, `NX NGOÀI`, `PHÁT SINH`, `CƯỚC RA`, `CƯỚC VÀO`, `ĐÃ TT`, `CÔNG NỢ`), giữ nguyên chữ `"K MẤT"` ở cột phơi như ghi chú nguồn không tạo nợ, và giữ `"CN 30 NGÀY"` là điều khoản công nợ 30 ngày.

---

## Yêu cầu đã được người dùng xác nhận (11/10/2026)

- `C:/WED_HOACHTOAN/tháng 1.xlsx` là bảng Excel doanh nghiệp đang dùng hằng tháng. Lấy nguồn này làm chuẩn tham chiếu cho dữ liệu và nghiệp vụ web từ nay về sau.
- “TƯƠI” nghĩa là trả tiền ngay sau giao dịch. Đây là thời điểm/điều kiện thanh toán; chưa xác định phương thức tiền mặt hay chuyển khoản.
- Rà soát, đề xuất thay đổi cấu trúc nếu cần; trao đổi các điểm chưa rõ với người dùng trước khi lập kế hoạch triển khai chi tiết.
- Mục tiêu chính: giám đốc hiểu kết quả công ty, từng chuyến, từng ngày, hiệu quả xe/tài xế và việc cần xử lý.
- Đây là nguồn tham chiếu nghiệp vụ, không phải chỉ thị tự động nhập toàn bộ vào database hoặc đưa dữ liệu doanh nghiệp lên link công khai.

## Các xác nhận bổ sung của chủ doanh nghiệp (11/10/2026 — Lưu lịch sử, một số mục đã được thay thế bởi bản 28/10/2026 ở trên)

- *[ĐÃ THAY THẾ NGÀY 28/10/2026: Nay xác nhận cước vào gốc là chưa VAT, cộng 8% VAT và trừ 17% nội bộ]* ~~Cước đã bao gồm VAT. Chưa xác nhận thuế suất; không cộng VAT thêm lần nữa hoặc tự tách VAT theo mức mặc định.~~
- Giá trị ở ô gộp là tổng cho nhóm dòng được gộp. Người dùng muốn chia lãi xuống từng cuốc. Chưa nêu cách phân bổ chi phí chung; đây là quyết định cần đưa vào phương án, không mặc định chia đều.
- Bảng bao phủ toàn bộ công ty.
- DẦU là lượng dầu cấp. *[Cập nhật 28/10/2026: Quy đổi thành tiền dầu theo bảng giá dầu nhập theo ngày chạy]*.
- Lương nhập riêng ở nơi khác; giai đoạn hiện tại chưa cần tính lương. Chỉ tiêu lãi hiện tại phải ghi rõ chưa trừ lương, không gọi là lãi ròng công ty.
- Ô trống thường là không phát sinh. Áp dụng cách hiểu này cho các ô khoản phát sinh/chi phí phù hợp; vẫn giữ ô nguồn trống để đối chiếu. Không dùng quy tắc này để suy ra số tiền dầu bằng 0, ngày thu, tài xế hoặc loại container.
- Người dùng xác nhận cách hiểu cột P là khách đã thanh toán, M=ĐÃ TT là đã trả nhà xe; giá trị tiền ở M vẫn là khoản phát sinh, không phải trạng thái thanh toán.
- X ở cột TƯƠI là đã thanh toán sau một khoảng thời gian. Không coi X là chưa trả hoặc suy ra đã thanh toán ngay. Chưa có ngày/độ trễ chính xác.
- Cột R là chú thích ngoài, không tự chuyển các ngày tại đây thành ngày thanh toán/hóa đơn.
- Các ngày năm 2025 trong bảng tháng 01/2026 là lỗi đánh máy. Khi chuẩn hóa dữ liệu tháng này, dùng năm 2026 và lưu ngày nguồn để truy vết; không sửa file Excel gốc.
- LẠCH HUYỆN chỉ đánh dấu cảng, không phải khoản phụ phí.
- Người dùng đã cung cấp đủ yêu cầu và muốn Anti thực hiện theo prompt tổng hợp. Các thay đổi mã nguồn cần bám quy tắc đã chốt và kiểm tra trên dữ liệu riêng; không suy diễn các thông số còn thiếu.

## Nguồn và phạm vi kiểm tra

- File có một sheet `T1-26`, tiêu đề B1 là “BẢNG KÊ CƯỚC VẬN CHUYỂN THÁNG 01/2026”.
- Header A2:Q2; cột R có dữ liệu nhưng không có tên cột.
- 77 dòng có STT 1–77, nằm ở hàng 3–79. Vùng định dạng đến hàng 889 không phải 889 bản ghi.
- Đã đọc tất cả ô có nội dung, ô gộp, công thức và giá trị công thức lưu trong file. Không sửa hoặc tính lại file gốc.
- SHA256 bản đã đọc: `3f25479bde7592b3306b844549cce8756e44e626dafb9933603908fd1bbadd36`.

## Các cột thực tế và ý nghĩa cần bảo toàn

- A — STT: số dòng trong bảng kê, chưa coi là mã chuyến duy nhất giữa các tháng.
- B — Ngày tháng: ngày ghi cho từng dòng; 61 dòng năm 2026, 16 dòng năm 2025 trong nguồn. Chủ doanh nghiệp xác nhận 16 dòng là lỗi đánh máy; kỳ nghiệp vụ là tháng 01/2026. Giữ giá trị nguồn, chuẩn hóa năm 2026 khi nhập.
- C — Chủ hàng: thường gộp tên người liên hệ và công ty. Có 53 nhãn sau khi cắt khoảng trắng/viết hoa, chưa khẳng định 53 pháp nhân.
- D — Tuyến đường: có trả hàng, đóng hàng, chuyển kho và tuyến kết hợp nhiều chặng. Giữ nguyên lời mô tả khi chuẩn hóa.
- E — Số cont: có 11 mã lặp ở hai dòng; có thể là nhiều cuốc dùng cùng container. Không dùng mã cont làm khóa duy nhất hoặc tự xóa trùng. E12 trống.
- F — BKS: chứa cả biển xe, tên xe ngoài, “ĐÃ TT”, “MẸ ĐÃ TT” và ô gộp. Cần phân loại theo ngữ nghĩa; không nhập mọi giá trị thành biển xe.
- G/H — 40/20: dữ liệu có 20, 20DC, 40, 40HC, 40RF, 40FR và 45. Hai ô G71:G72 chứa `15H00267`, giữ nguyên giá trị nguồn, đưa vào danh sách cần phân loại, không tự sửa FR thành RF.
- I — DẦU: có 24 ô ghi lượng dạng `110l`, `65L`..., tổng phần lượng đã ghi là 1.770 lít (ô gộp chỉ đếm một lần). Đã xác nhận là lượng dầu cấp; quy đổi thành tiền dầu theo đơn giá dầu ngày chạy khi có giá.
- J — TIỀN ĐƯỜNG: 29 ô tiền, tổng các giá trị được ghi một lần là 23.140.000 đồng. Có nhiều ô gộp chung hai dòng. J74 là `=1360000+200000`, giá trị lưu 1.560.000 đồng và phép cộng kiểm tra khớp.
- K — LẠCH HUYỆN: 26 ô ghi chữ “LẠCH HUYỆN”/“LACH HUYỆN”, không phải số tiền. Đã xác nhận chỉ đánh dấu cảng; không tạo phụ phí từ cột này.
- L — NX NGOÀI: tên nhà xe. Có ô gộp L63:L64. Dòng 3 ghi xe ngoài ngay ở F dù L trống.
- M — PHÁT SINH: chỉ một ô là tiền 300.000 đồng (M52); 17 ô khác ghi “ĐÃ TT”. Cần phân biệt khoản phát sinh và ghi chú thanh toán xe ngoài.
- N — CƯỚC RA: sáu ô tiền, cộng 24.500.000 đồng, có N63:N64 gộp. Ô gộp là tổng nhóm; ô trống thường không phát sinh theo xác nhận của người dùng. Không nhân đôi chi phí hoặc suy diễn giá thuê ngoài.
- O — CƯỚC VÀO: đủ 77 giá trị, cộng `338.200.000` đồng. Theo xác nhận 28/10/2026, đây là **cước gốc chưa VAT**; cộng 8% VAT thành `365.256.000` đồng và sau khoản trừ 17% nội bộ thành `303.162.480` đồng.
- P — ĐÃ TT: 71 “ĐÃ THANH TOÁN”, 5 “ĐÃ TT”, 1 “ĐỐI TRỪ XONG” tại P22. Đã xác nhận đây là thanh toán phía khách hàng; đối trừ không tự biến thành tiền thực nhận. Khi áp quy tắc VAT mới làm cước có VAT cao hơn tiền đã ghi nhận cũ, giữ nguyên tiền đã thu cũ và hiện phần chênh lệch cần đối soát.
- Q — TƯƠI: 66 “TƯƠI”, 2 “X” (Q8, Q22), 9 trống. TƯƠI là thanh toán ngay; X/trống là khách trả sau, cần nhắc khi đến hạn (cập nhật 25/11/2026). Ở tháng 1, P8 đã ghi thanh toán và P22 là ĐỐI TRỪ XONG nên hai dòng X không còn nợ.
- R — không có header: R14 “K HD”; R59 ngày 12/02/2026; R77:R78 ngày 11/02/2026. Đã xác nhận cột này là chú thích ngoài. Giữ nguyên nội dung; không gán thành ngày thanh toán/hóa đơn.

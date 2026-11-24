# Quy tắc tiền thu và công nợ khách hàng — Đợt 8

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

# Hướng dẫn làm việc với dự án

- Đọc `CHUAN_NGHIEP_VU_EXCEL.md` trước khi sửa tiền thu, công nợ, P&L hoặc KPI. Khách không trả VAT; giữ nguyên công thức chênh lệch sau trừ 17%.
- Không sửa tiền đã thu/đối trừ lịch sử, dữ liệu vận hành hoặc bí mật để làm test đạt.
- Kiểm thử bằng database tạm riêng. Không chạy reset/import/seed trên dịch vụ production để kiểm tra.
- Dùng Node.js 22 trở lên với `node:sqlite`; Docker và CI dùng Node 22. Cài bằng `npm ci --prefix server` và `npm ci --prefix client`, giữ lockfile và kiểm tra integrity/TLS.
- Kiểm tra thay đổi tài chính bằng `npm run test:collections --prefix server`, `npm run test:unit --prefix server`, `npm run test:security --prefix server`, `npm run test:auth --prefix server` và build frontend `npm run build --prefix client`.
- Các suite `codexStandardization14Cases.test.mjs` và `codexVerification33Cases.test.mjs` cần dependency đầy đủ. Suite 33 có đường dẫn Playwright của máy Windows trong ca trình duyệt và có probe online; phân biệt kiểm tra chưa chạy với đạt/thất bại.
- Mỗi cloud task đã có môi trường cách ly; dùng checkout hiện có, không tạo Git worktree trừ khi người dùng yêu cầu.
- Không commit `.env`, token, mật khẩu, database, snapshot hoặc output kiểm thử có dữ liệu doanh nghiệp. Không khẳng định web đã cập nhật chỉ dựa vào Git push.

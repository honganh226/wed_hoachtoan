# CLAUDE.md — Kiến thức dự án WED_HOACHTOAN

Cập nhật lần đầu: 25/11/2026 (phiên khảo sát của Claude, chưa sửa mã).
Ký hiệu: **[XM]** = đã xác minh trực tiếp từ mã/tài liệu/lệnh chạy trong phiên này. **[GĐ]** = giả định hoặc suy luận, cần kiểm lại trước khi dựa vào.

## 0. Quy tắc bắt buộc (đọc trước mọi thay đổi)

- Tuân thủ `AGENTS.md`. Trước khi sửa dữ liệu, công thức, báo cáo: đọc `CHUAN_NGHIEP_VU_EXCEL.md`; khi sửa luồng nhập Excel: đọc `CHUAN_FILE_KE_HOACH_2026.md`. [XM]
- Quy tắc tiền cước đang áp dụng (chốt 28/10/2026) [XM]:
  - `cuoc_goc` = cước vào **chưa VAT**.
  - `vat_amount = Math.round(cuoc_goc × 0,08)`; `cuoc_co_vat = cuoc_goc + vat_amount`.
  - `khoan_tru_17 = Math.round(cuoc_co_vat × 0,17)`; `cuoc_sau_tru_17 = cuoc_co_vat − khoan_tru_17`. Khoản trừ 17% là quy tắc nội bộ của giám đốc, không gọi là thuế hay lãi ròng.
  - Chênh lệch tạm tính = `cuoc_sau_tru_17 − cước thuê ngoài − tiền đường − phí nâng − phí hạ − tiền dầu − chi phí khác`. Không trừ tiền phơi trả hộ. Ghi rõ "Chưa trừ lương".
  - Tổng kỳ = cộng các dòng đã làm tròn, không làm tròn trên tổng.
  - Số kiểm tra tháng 1/2026 (77 cuốc): cước gốc 338.200.000; VAT 27.056.000; có VAT 365.256.000; trừ 17% 62.093.520; sau trừ 303.162.480.
- Mục "chờ xác nhận" trong tài liệu chưa phải quy tắc. Không tự chọn cách phân bổ ô gộp, đơn giá dầu, thuế suất.
- Không đưa dữ liệu doanh nghiệp lên link công khai. Không in giá trị `.env`, mật khẩu, khóa, dữ liệu khách hàng.
- Sau mỗi đợt làm việc: lập file bàn giao `.md` ở thư mục gốc (file sửa, thay đổi schema/DB, kết quả test, bước tiếp theo) kèm tóm tắt gửi Codex. [XM, AGENTS.md]
- Repo: `honganh226/wed_hoachtoan` (bản clone trên máy: `C:/Users/mrdoa/repo_wed_hoachtoan`). `C:/WED_HOACHTOAN` là thư mục làm việc cũ, KHÔNG phải repo git, có thay đổi chưa commit của chủ dự án — không chép đè. Deploy: Render `cong-ty-van-tai` từ nhánh `main`. [XM 25/11/2026]

## 1. Dự án là gì

Web nội bộ cho công ty vận tải container (Hải Phòng / Lạch Huyện): nhập chuyến (cuốc), tính cước VAT/khoản trừ 17%, chi phí chuyến, tiền dầu theo ngày, tiền phơi trả hộ, công nợ phải thu/phải trả, báo cáo cho giám đốc, nhập Excel bảng kê tháng. [XM]

Nhiều tác nhân AI đã làm trước đó: "Anti" (file `ANTI_*.md`) và "Codex" (file `CODEX_*.md`). Hơn 60 file báo cáo ở thư mục gốc là lịch sử, có thể mâu thuẫn nhau; ưu tiên `AGENTS.md` > `CHUAN_*.md` > báo cáo mới nhất. [XM]

## 2. Công nghệ [XM]

- **Backend** `server/`: Node.js ESM, Express 4, `node:sqlite` (`DatabaseSync`, cần Node ≥ 22.5; máy hiện tại v22.15.1; `engines` ghi `>=18` là sai), Drizzle ORM (sqlite-proxy), JWT HS256 + bcryptjs, helmet, express-rate-limit, multer, node-cron, SheetJS `xlsx` 0.20.3 (tải từ cdn.sheetjs.com).
- **Frontend** `client/`: React 19, Vite 6, Tailwind 3, lucide-react, PWA (service worker `public/sw.js`, IndexedDB offline `utils/offlineDb.js`). Token lưu `localStorage` (`hoachtoan_auth_token`).
- **Lưu trữ online**: SQLite chạy trong `/tmp` của container Render (mất khi khởi động lại); trạng thái toàn bộ DB được chụp snapshot, mã hóa AES-256-GCM (`ENCRYPTION_KEY`) và lưu lên Supabase (`durableState.service.js`, `durableRecovery.service.js`). Khi khởi động: API bị khóa chỉ đọc cho đến khi khôi phục xong snapshot.
- **Triển khai**: `Dockerfile` (Node 22, build client, chạy `initRenderTest.js` rồi `index.js`). Đang chạy trên Render Free; Supabase pg_cron gọi `/api/v1/health/live` mỗi 10 phút để tránh ngủ (theo `CODEX_KEEPALIVE_SUPABASE_2026-11-08.md`). Có cấu hình cũ cho Railway, Cloudflare Tunnel, PM2/NSSM Windows service. [XM file; trạng thái online hiện tại GĐ]

## 3. Cấu trúc chính [XM]

```
server/src/index.js               Điểm vào; chuỗi middleware: durableReadiness → readOnlyTest → protectApi → durableWrites → idempotentWrites → routes
server/src/middlewares/           auth (JWT, đối chiếu DB user), rbac (requireRole), security (protectApi: phân quyền theo tiền tố + lọc AREA_MANAGER), periodLock, idempotency, readOnlyTest
server/src/routes/*.routes.js     /api/v1/{auth,trips,expenses,advances,business,manage,excel,pl,kpi,payroll,ai,backup,data,period-lock,audit-logs,help,health}
server/src/utils/tripFinancials.js  NGUỒN CÔNG THỨC CHUẨN (VAT 8%, trừ 17%, dầu, phơi, loại cont). Bản sao ở client/src/utils/tripFinancials.js — phải sửa cả hai.
server/src/utils/financialMath.js   Công thức CŨ (calculateVatBreakdown coi cước "V" là đã gồm VAT) — không dùng cho quy tắc mới.
server/src/services/directorData.service.js  Bảng dữ liệu giám đốc (/api/v1/manage) — lớp phủ JSON `director_records` + lịch sử/undo `director_history`
server/src/services/trip.service.js         CRUD chuyến trên bảng SQL `trips`
server/src/services/excelImportService.js, excelMonthService.js, excelReader.service.js  Nhập Excel (preview/commit/rollback theo batch)
server/src/services/plEngine.service.js     P&L realtime (SSE /pl/events), KPI, payroll đọc bảng `trips`
server/src/services/directorAssistant.core.js  Trợ lý giám đốc (rule-based trên dữ liệu). aiAssistant.service.js cho vai trò khác cũng chỉ dùng engine nội bộ; có đọc GEMINI/OPENAI key nhưng chưa gọi API ngoài (25/11/2026)
server/src/db/init.js, schema.js            Tạo ~23 bảng SQLite + migration
client/src/App.jsx                          Điều hướng tab theo vai trò
client/src/components/*.jsx                 Màn hình (CorporateFinancialReportView, BusinessOverviewView, DirectorDebtsView, TripsListView, DataManagementView, ExcelImportModal, ...)
```

Vai trò: `DIRECTOR`, `ACCOUNTANT`, `SECRETARY`, `AREA_MANAGER`, `DRIVER` (DRIVER bị chặn đăng nhập từ 06/11/2026). Tính năng Bảo dưỡng xe đã ngừng (trả 410). [XM]

## 4. Cách chạy local [XM từ package.json; chưa chạy dev server trong phiên này]

```powershell
cd server; npm install; npm run dev        # API cổng 5000 (PORT), đọc server/.env
cd client; npm install; npm run dev        # Vite 5173, proxy tới 5000 (xem vite.config.js)
cd client; npm run build                   # server sẽ phục vụ client/dist nếu có
```

Biến môi trường mà mã đọc: `PORT, NODE_ENV, JWT_SECRET (bắt buộc ≥32 ký tự khi production), JWT_EXPIRES_IN, DB_PATH, EXCEL_PATH, GROUP_ALLOCATIONS_PATH, ENCRYPTION_KEY (64 hex), CLIENT_ORIGIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY, ONLINE_EDITING, RENDER_READ_ONLY, DIRECTOR_INIT_PASSWORD, SECRETARY_INIT_PASSWORD, OFFSITE_BACKUP_*, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BACKUP_DIR`. `.env.example` **thiếu** các biến Supabase, ONLINE_EDITING, RENDER_READ_ONLY, DIRECTOR_INIT_PASSWORD, SECRETARY_INIT_PASSWORD. [XM]

Test: `cd server; npm test` (math + verifyTask45 + verifyTasks72_73_74), `npm run test:security`, `npm run test:auth`, `node src/tests/<tên>.test.mjs`. Khi chạy test, `database.js` tự ép sang `data/test_hoachtoan.db` (sao chép từ DB vận hành nếu chưa có). Lưu ý: test sao lưu sẽ **tạo backup mới và xóa backup cũ nhất** trong thư mục test_backups. [XM]

Kết quả test ngày 25/11/2026 [XM]: math PASS; excelImportDates 11/11; securityBoundaries 25/25; authRecovery 17 checks; authClient 13 checks — đều PASS. Lỗi: `verifyTasks72_73_74` (mong `/api/v1/info` trả 200 nhưng nay cần đăng nhập), `codexStandardization14Cases` (TypeError container_size), `directorAssistant` (0 !== 77), `codexVerification33Cases` 23/32 đạt. Nhiều lỗi có vẻ do test phụ thuộc dữ liệu tháng 1 cũ trong DB thử, hoặc do chính sách auth mới [GĐ — chưa xác định nguyên nhân gốc].

## 5. Dữ liệu [XM]

- DB vận hành local: `server/data/hoachtoan.db`; DB thử `server/data/test_hoachtoan.db`; `server/data/.director_credentials.json` (nhạy cảm).
- Hai mô hình dữ liệu song song: bảng SQL `trips` (đọc bởi plEngine/KPI/payroll) và lớp phủ JSON `director_records` (màn quản lý giám đốc, báo cáo). `syncTripExpenseComponent` cố đồng bộ hai phía. Đây là điểm dễ lệch số.
- Excel nguồn: `tháng 1.xlsx` (chuẩn nghiệp vụ tháng 1), `references/KẾ HOẠCH 2026(M).xlsx` (khuôn nhập từ 07/11/2026, 11 sheet tháng T1–T11). `7.xlsx` là bản cũ, không dùng làm chuẩn.
- Online (theo báo cáo 08/11/2026): 1.065 cuốc sau khi nhập 11 tháng. [GĐ — chưa kiểm tra lại]

## 6. Rủi ro đã ghi nhận (25/11/2026) — chi tiết ở `CLAUDE_BAO_CAO_KHAO_SAT_2026-11-25.md`

ĐÃ SỬA 25/11/2026 (đợt 3): "đã thu cước" lấy từ `customer_payment_status` (không dùng `eir_paid_status` — đó là trạng thái thanh toán **phơi**); P&L có `margin_after_deduction_17` là chỉ tiêu chính; nhập Excel không để "X" ghi đè "ĐỐI TRỪ"; không tự gán 40DC cho cont trống; khóa sổ áp cho mọi danh mục ở `/manage`. Test cần dữ liệu tháng 1 dùng `src/tests/helpers/seedJanuary.mjs` (DB local thường trống). Test hồi quy: `npm run test:fixes`.

Xác nhận 25/11/2026: `X` = khách trả sau, CHƯA thu; chỉ `DA_TT`, `TUOI` là đã thu; `DOI_TRU` không phải tiền thu. Tiền phơi không vào chi phí/lợi nhuận. Không tự sửa dữ liệu thu tiền lịch sử: bước `20261125_01_x_review_only` chỉ ghi log dòng X cần rà.

Xác nhận 25/11/2026: khách KHÔNG trả VAT. Đã thu / còn phải thu / công nợ / doanh thu trong P&L, KPI, lương tính theo cước gốc (`trips.trip_revenue`); `total_revenue` (= có VAT) chỉ để hiển thị. VAT và khoản trừ 17% vẫn dùng cho chỉ tiêu chênh lệch.

Còn mở:
- Dữ liệu online nhập trước 25/11 có thể còn dòng đối trừ bị lưu thành X và cont trống thành 40DC.
- Có nhiều định nghĩa "lãi": `chenh_lech_sau_tru_17`, `chenh_lech_truoc_tru_*`, `trip_profit` (= cước gốc − chi phí trước dầu), `temp_profit`.
- Client có chỗ tính dự phòng VAT trên tổng kỳ (`DirectorDebtsView.jsx` ~357, 545) và `round(x×1,08×0,83)` một bước (`ExcelImportModal.jsx` ~753) — lệch quy tắc làm tròn theo dòng.
- Khóa sổ chỉ áp ở trips/expenses/advances/eir/fuelPrice; chưa thấy ở nhập Excel commit và `/manage` cho thực thể khác trips [GĐ — cần đọc kỹ].
- JWT dự phòng cứng trong `auth.middleware.js` và `auth.controller.js` khi thiếu `JWT_SECRET` (production thì chặn khởi động). Đăng xuất không thu hồi token. Token qua query string cho SSE/tải backup/ảnh.
- Non-production: tài khoản thư ký tự tạo dùng lại hash mật khẩu của giám đốc/kế toán (`db/init.js` ~550). `scripts/initVolume.js` có mật khẩu mặc định cứng cho tài khoản nội bộ.

## 7. Trước khi đưa lên GitHub [XM]

Đã tạo `.gitignore` gốc ngày 25/11/2026; kiểm tra bằng repo tạm cho ra 259 file sẽ được theo dõi (mã nguồn, cấu hình, tài liệu `.md`, script `.bat`). Còn tồn tại trước khi commit:
- Script kiểm thử đọc mật khẩu từ biến môi trường `TEST_*_PASSWORD` (xem `server/.env.example`); không viết mật khẩu vào mã.
- `server/.gitignore` có dòng `data/` nên vô tình loại cả `server/src/data/fleet_payroll_seed.json` (dữ liệu demo 33 chuyến, có tên khách/tài xế). App vẫn chạy khi thiếu file, nhưng bộ lọc `legacyDemoIds` sẽ rỗng trên bản clone.
- ~40 file `.md`/`.bat` có tên miền Render/Supabase/Cloudflare, mã deploy — chấp nhận được nếu repo private.

Danh sách loại trừ trong `.gitignore` gốc (lý do):
`server/.env`, `server/data/`, mọi `*.db`, `*.sqlite`, `server/backups/`, `server/test_backups/`, `backups/`, `ai-test-runtime/`, `scratch/` (96 MB, có mật khẩu viết cứng trong vài script), `upload_manifest.json` (chứa nội dung nhiều file kể cả `tháng 1.xlsx`), `*.xlsx` (`tháng 1.xlsx`, `7.xlsx`, `references/`), `ẢNH Tham Khảo/`, `design-research/` (ảnh chụp có thể chứa dữ liệu khách), `cloudflare/cloudflared.exe`, `client/dist/`, `audit-client-build-*/`, `phase2-release-local/`, `*.bak*`, `*.log`.
Sau đó chạy gitleaks (đã có trong `.github/workflows/security-audit.yml`) trên toàn bộ cây trước commit đầu tiên. Nếu bất kỳ khóa thật nào từng bị lộ, đổi khóa.

## Ngữ cảnh tiếp quản (Codex, Đợt 8)

Đọc `AGENTS.md` và `CHUAN_NGHIEP_VU_EXCEL.md`.

Chủ dự án xác nhận Đợt 8: khách thanh toán **cước gốc**, không trả VAT. Công nợ = max(0, cước gốc − đã thu − đối trừ). VAT 8% và khoản trừ 17% vẫn hiển thị; chênh lệch sau trừ 17% giữ công thức cũ.

Phân biệt cột SQLite `trips.total_revenue` (có VAT) với DTO thu tiền/báo cáo `total_revenue` (cước gốc). Không thay dữ liệu vận hành để đồng bộ nhãn.

Kiểm tra build/test và kết quả triển khai thực tế trước khi báo hoàn thành. Nếu thiếu dependency, quyền Render hoặc mạng, ghi rõ phần chưa kiểm chứng.

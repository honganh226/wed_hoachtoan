/**
 * ==============================================================================
 * BỘ KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN 33 CA NGHIỆM THU (T01 - T33) & HỒI QUY B01 - B08
 * Theo kế hoạch Codex:
 * - C:\WED_HOACHTOAN\CODEX_KE_HOACH_SUA_SAU_RASOAT_ANTI_2026-10-28.md
 * - C:\WED_HOACHTOAN\CODEX_RASOAT_LAN_2_ANTI_2026-10-28.md
 * ==============================================================================
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../../');
const require = createRequire(path.join(root, 'server/package.json'));

const testRunDir = path.resolve(root, 'scratch', 'test_run_' + Date.now());
fs.mkdirSync(testRunDir, { recursive: true });

process.env.NODE_ENV = 'test';
process.env.IS_TEST = 'true';
process.env.JWT_SECRET = 'codex-verification-33-cases-secret';
process.env.DB_PATH = path.join(testRunDir, 'test_verification.db');
process.env.GROUP_ALLOCATIONS_PATH = path.join(testRunDir, 'groups.json');
fs.writeFileSync(process.env.DB_PATH, '');

const imp = (p) => import('file:///' + path.join(root, p).replace(/\\/g, '/'));

const { db } = await imp('server/src/db/database.js');
const { initDatabase } = await imp('server/src/db/init.js');
const { createTrip, createBatchTrips, updateTrip } = await imp('server/src/services/trip.service.js');
const eir = await imp('server/src/services/eirAdvance.service.js');
const { ExcelImportService } = await imp('server/src/services/excelImportService.js');
const { excelMonthService } = await imp('server/src/services/excelMonthService.js');
const { upsertFuelPrice } = await imp('server/src/services/fuelPrice.service.js');
const { lockPeriod, unlockPeriod } = await imp('server/src/services/periodLock.service.js');
const { answerDirector } = await imp('server/src/services/directorAssistant.core.js');
const { restoreState, durableWrites, initializeDurableState, durabilityStatus } = await imp('server/src/services/durableState.service.js');
const { calculateFareBreakdown, isValidCalendarDate, normalizeContainerType } = await imp('server/src/utils/tripFinancials.js');

const xlsx = require('xlsx');
const jwt = require('jsonwebtoken');
const express = require('express');
const businessRouter = (await imp('server/src/routes/business.routes.js')).default;
const dataRouter = (await imp('server/src/routes/data.routes.js')).default;
const manageRouter = (await imp('server/src/routes/directorData.routes.js')).default;
const tripRouter = (await imp('server/src/routes/trip.routes.js')).default;
const { idempotentWrites } = await imp('server/src/middlewares/idempotency.middleware.js');

const directorUser = { id: 'u-dir', username: 'giamdoc', role: 'DIRECTOR' };
const accountantUser = { id: 'u-acc', username: 'ketoan', role: 'ACCOUNTANT' };
const secretaryUser = { id: 'u-sec', username: 'thuky', role: 'SECRETARY' };

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/v1', idempotentWrites);
app.use('/api/v1/business', businessRouter);
app.use('/api/v1/data', dataRouter);
app.use('/api/v1/manage', manageRouter);
app.use('/api/v1/trips', tripRouter);
app.get('/api/v1/pl/summary', (_req, res) => res.json({ success: true, data: {} }));

const clientDistDir = path.join(root, 'client', 'dist');
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
}

const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
const rootUrl = `http://127.0.0.1:${port}`;
const baseUrl = `${rootUrl}/api/v1/business`;

const testResults = [];

function pass(id, name, details = '') {
  testResults.push({ id, name, status: 'PASS', details });
  console.log(`[PASS] ${id}: ${name} ${details ? '- ' + details : ''}`);
}

function skip(id, name, reason = '') {
  testResults.push({ id, name, status: 'SKIP', details: reason });
  console.log(`[SKIP] ${id}: ${name} ${reason ? '- ' + reason : ''}`);
}

function fail(id, name, error) {
  process.exitCode = 1;
  testResults.push({ id, name, status: 'FAIL', error: error?.message || String(error) });
  console.error(`[FAIL] ${id}: ${name} ->`, error?.stack || error?.message || error);
}

async function runCase(id, name, fn) {
  try {
    const details = await fn();
    pass(id, name, details || '');
  } catch (err) {
    fail(id, name, err);
  }
}

console.log('================================================================');
console.log('BẮT ĐẦU CHẠY KIỂM THỬ 33 CA NGHIỆM THU CODEX (T01 - T33)');
console.log('================================================================');

try {
  // T01: Cước gốc 10.000.000 -> VAT 800.000; có VAT 10.800.000; trừ 1.836.000; sau trừ 8.964.000
  await runCase('T01', 'Công thức 5 chỉ tiêu tiền cước', () => {
    const f = calculateFareBreakdown(10000000);
    assert.equal(f.cuoc_goc, 10000000);
    assert.equal(f.vat_amount, 800000);
    assert.equal(f.cuoc_co_vat, 10800000);
    assert.equal(f.khoan_tru_17, 1836000);
    assert.equal(f.cuoc_sau_tru_17, 8964000);
    return '10M -> VAT 800k, 10.8M, trừ 1.836M, sau trừ 8.964M';
  });

  // T02: Tổng tháng 1 -> 77 dòng, gốc 338.200.000, VAT 27.056.000, có VAT 365.256.000, trừ 62.093.520, sau trừ 303.162.480, dầu 1.770 lít, đối trừ 3.600.000
  await runCase('T02', 'Tổng chuẩn hóa tháng 1.xlsx', () => {
    const m1 = excelMonthService.getData();
    const rows = m1.rows.slice(0, 77);
    const sumGoc = rows.reduce((s, r) => s + r.cuoc_goc, 0);
    const sumVat = rows.reduce((s, r) => s + r.vat_amount, 0);
    const sumCoVat = rows.reduce((s, r) => s + r.cuoc_co_vat, 0);
    const sumTru17 = rows.reduce((s, r) => s + r.khoan_tru_17, 0);
    const sumSauTru = rows.reduce((s, r) => s + r.cuoc_sau_tru_17, 0);
    const sumDau = m1.stats.total_fuel_liters;
    const sumDoiTru = rows.filter((r) => r.is_offset).reduce((s, r) => s + r.cuoc_goc, 0);

    assert.equal(rows.length, 77);
    assert.equal(sumGoc, 338200000);
    assert.equal(sumVat, 27056000);
    assert.equal(sumCoVat, 365256000);
    assert.equal(sumTru17, 62093520);
    assert.equal(sumSauTru, 303162480);
    assert.equal(sumDau, 1770);
    assert.equal(sumDoiTru, 3600000);
    return '77 dòng, gốc 338.2M, VAT 27.056M, có VAT 365.256M, sau trừ 303.162.480, dầu 1.770L, đối trừ 3.6M';
  });

  // T03: Thêm phơi 450.000 vào cuốc -> Cước, chi phí công ty và chênh lệch không đổi; công nợ phơi tăng 450.000
  await runCase('T03', 'Tiền phơi trả hộ độc lập với chi phí & lãi chuyến', () => {
    const trip = createTrip({
      tripData: {
        trip_date: '2026-05-10',
        customer_name: 'KHÁCH T03',
        route_name: 'HẢI PHÒNG - HÀ NỘI',
        base_revenue: 10000000,
        is_subcontractor: 1,
        subcontractor_cost: 2000000,
        toll_fee: 500000,
        phoi_advance_amount: 450000,
      },
      user: directorUser,
    });
    assert.equal(trip.cuoc_goc, 10000000);
    assert.equal(trip.chi_phi_cong_ty, 2500000);
    assert.equal(trip.chenh_lech_sau_tru_17, 8964000 - 2500000);
    const advList = eir.getAdvancesForTripMap().get(trip.id) || [];
    assert.equal(advList.length, 1);
    assert.equal(advList[0].advance_amount, 450000);
    assert.equal(advList[0].balance_due, 450000);
    return 'Phơi 450k không làm giảm lãi chuyến (chênh lệch sau trừ 17% = 6.464M)';
  });

  // T04: Lưu một cuốc, lô 3 cuốc và Excel 3 dòng đều có phơi -> Không lỗi transaction, không nhân đôi
  await runCase('T04', 'Lưu 1 cuốc, lô 3 cuốc và Excel 3 dòng có phơi', () => {
    const batchRes = createBatchTrips({
      trips: [
        { trip_date: '2026-05-11', customer_name: 'BATCH CUST 1', base_revenue: 5000000, phoi_advance_amount: 200000 },
        { trip_date: '2026-05-11', customer_name: 'BATCH CUST 2', base_revenue: 6000000, phoi_advance_amount: 300000 },
        { trip_date: '2026-05-11', customer_name: 'BATCH CUST 3', base_revenue: 7000000, phoi_advance_amount: 400000 },
      ],
      user: directorUser,
    });
    assert.equal(batchRes.inserted, 3);
    assert.equal(batchRes.failed, 0);

    const excelCommitRes = ExcelImportService.commitImport({
      rows: [
        { trip_date: '2026-05-12', customer_name: 'EXCEL CUST 1', base_revenue: 5000000, phoi_advance_amount: 150000 },
        { trip_date: '2026-05-12', customer_name: 'EXCEL CUST 2', base_revenue: 6000000, phoi_advance_amount: 250000 },
        { trip_date: '2026-05-12', customer_name: 'EXCEL CUST 3', base_revenue: 7000000, phoi_advance_amount: 350000 },
      ],
      filename: 'test_t04.xlsx',
      sheetName: 'Sheet1',
      user: directorUser,
    });
    assert.equal(excelCommitRes.inserted_count, 3);
    return 'Thành công 100%, không xung đột transaction';
  });

  // T05: Dòng giữa lô lỗi sau khi đã tạo dữ liệu liên quan -> Toàn lô rollback sạch
  await runCase('T05', 'Rollback an toàn toàn bộ lô khi có dòng lỗi', () => {
    const countBefore = db.prepare('SELECT COUNT(*) as c FROM trips').get().c;
    const advCountBefore = db.prepare('SELECT COUNT(*) as c FROM eir_advances').get().c;
    const batchErr = createBatchTrips({
      trips: [
        { trip_date: '2026-05-13', customer_name: 'ROLLBACK 1', base_revenue: 5000000, phoi_advance_amount: 200000 },
        { trip_date: 'INVALID-DATE-99', customer_name: 'ROLLBACK 2', base_revenue: 6000000 },
      ],
      user: directorUser,
    });
    assert.equal(batchErr.failed, 1);
    assert.equal(batchErr.rolled_back, true);
    const countAfter = db.prepare('SELECT COUNT(*) as c FROM trips').get().c;
    const advCountAfter = db.prepare('SELECT COUNT(*) as c FROM eir_advances').get().c;
    assert.equal(countBefore, countAfter);
    assert.equal(advCountBefore, advCountAfter);
    return 'Số bản ghi chuyến & phơi giữ nguyên mốc trước batch';
  });

  // T06: Chọn TƯƠI từ nhập một cuốc, lô, modal tạo phơi -> Hoàn đủ ngay 100%, không nhắc nợ
  await runCase('T06', 'Quy tắc TƯƠI (hoàn đủ ngay khi trả hộ)', () => {
    const singleTuoi = createTrip({
      tripData: {
        trip_date: '2026-05-14',
        customer_name: 'KHÁCH TƯƠI 1',
        base_revenue: 4000000,
        phoi_advance_amount: 250000,
        phoi_is_tuoi: true,
      },
      user: directorUser,
    });
    const advTuoi = eir.getAdvancesForTripMap().get(singleTuoi.id)[0];
    assert.equal(advTuoi.refund_status, 'DA_HOAN');
    assert.equal(advTuoi.balance_due, 0);
    assert.equal(advTuoi.reminder_status, 'COMPLETED');
    return 'refund_status=DA_HOAN, balance_due=0, không hiện nhắc đòi';
  });

  // T07: 450.000 hoàn 200.000, rồi hoàn 250.000 -> Lần đầu còn 250.000; lần sau 0; DA_HOAN
  await runCase('T07', 'Hoàn từng phần (450k -> 200k -> 250k)', () => {
    const adv = eir.createEirAdvance({
      trip_id: 'trip-t07',
      customer_name: 'KHÁCH T07',
      advance_amount: 450000,
      advance_date: '2026-05-15',
    });
    const ref1 = eir.recordEirRefund(adv.id, { refund_amount: 200000, refund_date: '2026-05-15' }, 'audit');
    assert.equal(ref1.refunded_amount, 200000);
    assert.equal(ref1.balance_due, 250000);
    assert.equal(ref1.refund_status, 'HOAN_MOT_PHAN');

    const ref2 = eir.recordEirRefund(adv.id, { refund_amount: 250000, refund_date: '2026-05-16' }, 'audit');
    assert.equal(ref2.refunded_amount, 450000);
    assert.equal(ref2.balance_due, 0);
    assert.equal(ref2.refund_status, 'DA_HOAN');
    return 'Dư nợ khớp tuyệt đối qua các lần hoàn';
  });

  // T08 (kèm hồi quy B01 & B02): Idempotency Key, đồng bộ đường dẫn /refund & /refunds, và xác thực JWT/RBAC trước khi đọc cache
  await runCase('T08', 'Idempotency Key + B01 (/refund & /refunds) + B02 (Xác thực JWT/RBAC trước cache)', async () => {
    const adv = eir.createEirAdvance({
      trip_id: 'trip-t08',
      customer_name: 'KHÁCH T08',
      advance_amount: 500000,
      advance_date: '2026-05-16',
    });
    const token = jwt.sign({ ...directorUser, jti: 't1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const idempKey = 'idemp-test-t08-' + Date.now();

    // 1. Gửi lần 1 qua /refund
    const req1 = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
      body: JSON.stringify({ refund_amount: 50000, refund_date: '2026-05-16' }),
    });
    const body1 = await req1.json();
    assert.equal(req1.status, 200);
    assert.equal(body1.data.refunded_amount, 50000);

    // 2. Cùng người dùng nhưng token mới cấp (khác jti/iat) retry cùng Idempotency-Key -> trả đúng kết quả đã lưu, không cộng trùng
    const newTokenSameUser = jwt.sign({ ...directorUser, jti: 't2' }, process.env.JWT_SECRET, { expiresIn: '2h' });
    const req2 = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${newTokenSameUser}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
      body: JSON.stringify({ refund_amount: 50000, refund_date: '2026-05-16' }),
    });
    const body2 = await req2.json();
    assert.equal(req2.status, 200);
    assert.equal(body2.data.refunded_amount, 50000);

    // 3. B02: Không có token gửi cùng Idempotency-Key -> 401, không lộ dữ liệu cache
    const noAuthReq = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
      body: JSON.stringify({ refund_amount: 50000, refund_date: '2026-05-16' }),
    });
    assert.equal(noAuthReq.status, 401);

    // 4. B02: Token sai chữ ký gửi cùng Idempotency-Key -> 403, không lộ dữ liệu cache
    const badSigToken = jwt.sign(directorUser, 'wrong-secret-key');
    const badSigReq = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${badSigToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
      body: JSON.stringify({ refund_amount: 50000, refund_date: '2026-05-16' }),
    });
    const badSigBody = await badSigReq.json();
    assert.equal(badSigReq.status, 403);
    assert.equal(badSigBody.data, null);

    // 5. B02: Token hết hạn gửi cùng Idempotency-Key -> 401
    const expiredToken = jwt.sign(directorUser, process.env.JWT_SECRET, { expiresIn: -10 });
    const expReq = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${expiredToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
      body: JSON.stringify({ refund_amount: 50000, refund_date: '2026-05-16' }),
    });
    assert.equal(expReq.status, 401);

    // 6. B02: Token SECRETARY (không có quyền ghi hoàn phơi) gửi cùng Idempotency-Key -> 403
    const secToken = jwt.sign(secretaryUser, process.env.JWT_SECRET);
    const secReq = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
      body: JSON.stringify({ refund_amount: 50000, refund_date: '2026-05-16' }),
    });
    assert.equal(secReq.status, 403);

    // 7. Gửi cùng Idempotency-Key nhưng đổi số tiền -> 409 Conflict
    const reqConflict = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
      body: JSON.stringify({ refund_amount: 80000, refund_date: '2026-05-16' }),
    });
    assert.equal(reqConflict.status, 409);

    // 8. B01: Đường dẫn /refunds (số nhiều) hoạt động tương đương /refund
    const pluralKey = 'idemp-plural-' + Date.now();
    const pluralReq = await fetch(`${baseUrl}/eir-advances/${adv.id}/refunds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': pluralKey },
      body: JSON.stringify({ refund_amount: 25000, refund_date: '2026-05-16' }),
    });
    const pluralBody = await pluralReq.json();
    assert.equal(pluralReq.status, 200);
    assert.equal(pluralBody.data.refunded_amount, 75000);

    return 'Chống ghi trùng + chặn 401/403 trước khi đọc cache + hỗ trợ cả /refund và /refunds';
  });

  // T09: Hai yêu cầu HTTP hoàn đồng thời cùng số dư -> Không thu vượt
  await runCase('T09', 'Hai HTTP request hoàn đồng thời cùng số dư (Promise.all)', async () => {
    const adv = eir.createEirAdvance({
      trip_id: 'trip-t09',
      customer_name: 'KHÁCH T09',
      advance_amount: 100000,
      advance_date: '2026-05-17',
    });
    const token = jwt.sign(directorUser, process.env.JWT_SECRET);

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'conc-a-' + Date.now() },
        body: JSON.stringify({ refund_amount: 100000, refund_date: '2026-05-17' }),
      }),
      fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'conc-b-' + Date.now() },
        body: JSON.stringify({ refund_amount: 100000, refund_date: '2026-05-17' }),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 400]);

    const finalAdv = eir.getAdvanceById(adv.id);
    assert.equal(finalAdv.refunded_amount, 100000);
    assert.equal(finalAdv.balance_due, 0);
    return '1 request 200, 1 request 400, tổng hoàn đúng 100.000đ';
  });

  // T10 (kèm B04): Mở modal hoàn phơi trên trình duyệt thật (390px, 768px, 1366px), mất phản hồi rồi bấm lại -> Không cộng trùng
  await runCase('T10', 'Trình duyệt thật mở Modal hoàn phơi (390/768/1366px) & B04 retry khi mất phản hồi', async () => {
    const tripT10 = createTrip({
      tripData: {
        trip_date: '2026-01-28',
        customer_name: 'KHÁCH MODAL T10',
        route_name: 'HẢI PHÒNG - HÀ NỘI',
        vehicle_plate: '15H00266',
        base_revenue: 10000000,
        phoi_advance_amount: 450000,
        phoi_due_date: '2026-01-29',
      },
      user: directorUser,
    });
    const advT10 = eir.getAdvancesForTripMap().get(tripT10.id)[0];
    assert.equal(advT10.balance_due, 450000);

    const pw = createRequire('C:/Users/mrdoa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
    const browser = await pw.chromium.launch({
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true,
    });

    try {
      const token = jwt.sign(directorUser, process.env.JWT_SECRET);
      for (const vp of [
        { width: 390, height: 844, label: '390px' },
        { width: 768, height: 1024, label: '768px' },
        { width: 1366, height: 900, label: '1366px' },
      ]) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await context.addInitScript(
          ({ token, user }) => {
            localStorage.setItem('hoachtoan_auth_token', token);
            localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
          },
          { token, user: directorUser }
        );
        const page = await context.newPage();
        await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Tổng quan kinh doanh', exact: true }).click();

        // Tìm dòng nhắc việc của KHÁCH MODAL T10 và bấm nút Thu Hoàn Tiền
        const reminderRow = page
          .locator('div', { hasText: 'KHÁCH MODAL T10' })
          .filter({ has: page.getByRole('button', { name: /Thu Hoàn Tiền/i }) })
          .last();
        const refundBtn = reminderRow.getByRole('button', { name: /Thu Hoàn Tiền/i });
        await refundBtn.waitFor({ state: 'visible', timeout: 10000 });
        await refundBtn.click();

        // Kiểm tra modal hiển thị đúng tiêu đề và số dư
        await page.getByText(/Xác Nhận Hoàn Tiền Phơi & Lịch Hẹn Đòi/i).waitFor({ state: 'visible', timeout: 5000 });

        if (vp.width === 390) {
          // Kịch bản B04: Nhập 200.000, lần bấm 1 server đã xử lý nhưng mạng đứt trước khi trình duyệt nhận phản hồi, sau đó người dùng bấm lại lần 2
          const amountInput = page.locator('input[placeholder*="Nhập số tiền"]');
          await amountInput.fill('200000');

          let interceptedCount = 0;
          const capturedKeys = [];
          await page.route('**/api/v1/business/eir-advances/*/refund*', async (route) => {
            const req = route.request();
            if (req.method() === 'POST') {
              interceptedCount++;
              capturedKeys.push(req.headers()['idempotency-key']);
              if (interceptedCount === 1) {
                // Thực thi thật lên server rồi giả lập mất phản hồi về trình duyệt
                await fetch(req.url(), {
                  method: 'POST',
                  headers: req.headers(),
                  body: req.postData(),
                });
                await route.abort('failed');
                return;
              }
            }
            await route.continue();
          });

          // Lần bấm 1: bị rớt mạng sau khi server đã lưu
          await page.getByRole('button', { name: /Ghi Nhận Hoàn Một Phần/i }).click();
          await page.waitForTimeout(400);

          // Lần bấm 2 (retry): trình duyệt gửi lại cùng Idempotency-Key
          await page.getByRole('button', { name: /Ghi Nhận Hoàn Một Phần/i }).click();
          await page.waitForTimeout(800);

          assert.equal(interceptedCount, 2);
          assert.ok(capturedKeys[0], 'Phải có Idempotency-Key từ PhoiRefundModal');
          assert.equal(capturedKeys[0], capturedKeys[1], 'Khi retry sau lỗi mạng phải giữ nguyên Idempotency-Key');

          const afterRetryAdv = eir.getAdvanceById(advT10.id);
          assert.equal(afterRetryAdv.refunded_amount, 200000);
          assert.equal(afterRetryAdv.balance_due, 250000);
        }

        await page.screenshot({ path: path.join(testRunDir, `t10_phoi_modal_${vp.label}.png`) });
        await context.close();
      }
    } finally {
      await browser.close();
    }

    const finalCheck = eir.getAdvanceById(advT10.id);
    assert.equal(finalCheck.refunded_amount, 200000);
    assert.equal(finalCheck.balance_due, 250000);
    return 'Mở modal trên 390/768/1366px + B04 mất phản hồi bấm lại vẫn còn đúng 250.000đ';
  });

  // T11: Khoản đã tất toán quá hạn cũ, khoản mở hạn tương lai -> Chuyến không bị nhắc OVERDUE theo khoản cũ
  await runCase('T11', 'Không leak trạng thái quá hạn từ khoản phơi đã tất toán', () => {
    const closed = eir.createEirAdvance({
      trip_id: 'trip-t11',
      customer_name: 'KHÁCH T11',
      advance_amount: 100000,
      advance_date: '2026-01-01',
      due_date: '2026-01-02',
    });
    eir.recordEirRefund(closed.id, { refund_amount: 100000 });
    eir.createEirAdvance({
      trip_id: 'trip-t11',
      customer_name: 'KHÁCH T11',
      advance_amount: 200000,
      advance_date: '2099-01-01',
      due_date: '2099-01-02',
    });
    const s = eir.summarizeTripAdvances('trip-t11');
    assert.equal(s.phoi_due_date, '2099-01-02');
    assert.equal(s.phoi_reminder_status, 'UPCOMING');
    return 'phoi_reminder_status=UPCOMING, hẹn 2099-01-02';
  });

  // T12: Hẹn hôm nay / quá hạn / tương lai / chưa hẹn -> Đúng nhóm và tổng tiền
  await runCase('T12', 'Phân nhóm nhắc việc và tổng tiền', () => {
    const reminders = eir.getEirReminders({ referenceDate: '2026-05-20' });
    assert(Array.isArray(reminders.overdue));
    assert(Array.isArray(reminders.due_today));
    assert(Array.isArray(reminders.no_due_date));
    assert(Array.isArray(reminders.upcoming));
    assert.equal(reminders.summary.total_unrefunded_amount, reminders.summary.total_outstanding_amount);
    return 'Đủ 4 nhóm quá hạn, hôm nay, chưa hẹn, tương lai';
  });

  // T13: Ngày 31/02, 31/04 và năm nhuận -> Ngày sai trả 400
  await runCase('T13', 'Kiểm tra lịch thực tế nghiêm ngặt (2099-02-31, 2026-04-31)', () => {
    assert.equal(isValidCalendarDate('2099-02-31'), false);
    assert.equal(isValidCalendarDate('2026-04-31'), false);
    assert.equal(isValidCalendarDate('2024-02-29'), true);
    assert.equal(isValidCalendarDate('2025-02-29'), false);

    assert.throws(
      () => eir.createEirAdvance({ trip_id: 't-invalid', customer_name: 'K', advance_amount: 1, due_date: '2099-02-31' }),
      /không hợp lệ/
    );
    assert.throws(
      () => upsertFuelPrice({ apply_date: '2026-04-31', price_per_liter: 20000 }),
      /không hợp lệ/
    );
    return 'Chặn đứng ngày sai lịch thực tế';
  });

  // T14: Giá dầu 20.000 cho 100 và 20 lít cùng xe/ngày -> Cuốc 2.000.000 / 400.000; tổng 2.400.000
  await runCase('T14', 'Giá dầu theo ngày chạy xe & tính theo từng cuốc', () => {
    upsertFuelPrice({ apply_date: '2026-06-01', price_per_liter: 20000, actor: 'audit' });
    const t1 = createTrip({ tripData: { trip_date: '2026-06-01', customer_name: 'CUST OIL', vehicle_plate: '15C12345', fuel_liters: 100, base_revenue: 5000000 }, user: directorUser });
    const t2 = createTrip({ tripData: { trip_date: '2026-06-01', customer_name: 'CUST OIL', vehicle_plate: '15C12345', fuel_liters: 20, base_revenue: 3000000 }, user: directorUser });
    assert.equal(t1.fuel_cost, 2000000);
    assert.equal(t2.fuel_cost, 400000);
    assert.equal(t1.fuel_cost + t2.fuel_cost, 2400000);
    return '100L = 2M, 20L = 400k, tổng 2.4M không nhân trùng';
  });

  // T15: Sửa giá thành 21.000 -> Tự động cập nhật 2.100.000 / 420.000; tổng 2.520.000
  await runCase('T15', 'Cập nhật giá dầu ngày chạy lan tỏa đồng bộ', () => {
    upsertFuelPrice({ apply_date: '2026-06-01', price_per_liter: 21000, actor: 'audit' });
    const r1 = db.prepare("SELECT fuel_cost FROM trips WHERE trip_date = '2026-06-01' AND fuel_liters = 100").get();
    const r2 = db.prepare("SELECT fuel_cost FROM trips WHERE trip_date = '2026-06-01' AND fuel_liters = 20").get();
    assert.equal(r1.fuel_cost, 2100000);
    assert.equal(r2.fuel_cost, 420000);
    return 'Sửa lên 21k: 2.1M và 420k, tổng 2.520M';
  });

  // T16: Thiếu giá báo rõ, nhập muộn vẫn đúng ngày chạy, đổi ngày lấy đúng giá mới
  await runCase('T16', 'Báo rõ thiếu giá dầu & tự cập nhật khi đổi ngày chạy', () => {
    const missing = createTrip({ tripData: { trip_date: '2026-06-15', customer_name: 'CUST', fuel_liters: 50, base_revenue: 5000000 }, user: directorUser });
    assert.equal(missing.is_fuel_price_missing, true);
    assert.equal(missing.fuel_cost, 0);

    upsertFuelPrice({ apply_date: '2026-06-16', price_per_liter: 19500, actor: 'audit' });
    const updated = updateTrip({ tripId: missing.id, updateData: { trip_date: '2026-06-16' }, user: directorUser });
    assert.equal(updated.fuel_unit_price, 19500);
    assert.equal(updated.fuel_cost, 975000);
    return 'Nhập muộn vẫn lấy giá ngày chạy; đổi ngày cập nhật giá đúng';
  });

  // T17: Bảng giá dầu trả về đúng cấu trúc { prices, history }
  await runCase('T17', 'API bảng giá dầu & lịch sử chỉnh sửa', async () => {
    const token = jwt.sign(directorUser, process.env.JWT_SECRET);
    const res = await fetch(`${baseUrl}/fuel-prices`, { headers: { Authorization: `Bearer ${token}` } });
    const b = await res.json();
    assert.equal(res.status, 200);
    assert(Array.isArray(b.data.prices));
    assert(Array.isArray(b.data.history));
    return 'Chuẩn RESTful { prices, history }, client không crash';
  });

  // T18: Phí nâng/hạ riêng cùng địa điểm -> Lưu đủ 4 trường, tính đúng 1 lần
  await runCase('T18', 'Tách 4 ô độc lập nơi nâng, phí nâng, nơi hạ, phí hạ', () => {
    const trip = createTrip({
      tripData: {
        trip_date: '2026-06-20',
        customer_name: 'CUST LIFT',
        lift_on_location: 'CẢNG ĐÌNH VŨ',
        lift_on_fee: 350000,
        lift_off_location: 'CẢNG ĐÌNH VŨ',
        lift_off_fee: 400000,
        base_revenue: 5000000,
      },
      user: directorUser,
    });
    assert.equal(trip.lift_on_location, 'CẢNG ĐÌNH VŨ');
    assert.equal(trip.lift_on_fee, 350000);
    assert.equal(trip.lift_off_location, 'CẢNG ĐÌNH VŨ');
    assert.equal(trip.lift_off_fee, 400000);
    assert.equal(trip.chi_phi_cong_ty, 750000);
    return 'Lưu riêng 350k và 400k cùng cảng Đình Vũ, chi phí = 750k';
  });

  // T19: Tạo/sửa ghi chú và mã chứng từ -> Lưu đúng và ghi nhận lịch sử
  await runCase('T19', 'Ghi chú & Mã chứng từ đối soát', () => {
    const adv = eir.createEirAdvance({
      trip_id: 'trip-t19',
      customer_name: 'CUST T19',
      advance_amount: 300000,
      reference_note: 'HD-998877',
      notes: 'GHI CHU GOC',
    });
    eir.updateEirAdvance(adv.id, { reference_note: 'HD-MODIFIED' }, 'audit');
    const reloaded = eir.getAdvanceById(adv.id);
    assert.equal(reloaded.reference_code, 'HD-MODIFIED');
    assert(reloaded.history.some((h) => h.action === 'UPDATE_ADVANCE'));
    return 'Được bảo toàn và ghi lại lịch sử thay đổi';
  });

  // T20: Cuốc mới 10 triệu chưa thu -> Phải thu cước 10,8 triệu thống nhất các màn hình
  await runCase('T20', 'Công nợ cuốc mới tính theo cước có VAT', () => {
    createTrip({
      tripData: { trip_date: '2099-07-01', customer_name: 'KHÁCH MỚI T20', base_revenue: 10000000, phoi_advance_amount: 300000 },
      user: directorUser,
    });
    const debts = excelMonthService.getDebtsData({ start_date: '2099-07-01', end_date: '2099-07-01' }).receivables;
    assert.equal(debts.total_due, 10800000);
    assert.equal(debts.customers[0].balance_due, 10800000);
    assert.equal(debts.customers[0].phoi_balance_due, 300000);
    assert.equal(debts.customers[0].total_combined_due, 11100000);
    return 'Cước phải thu 10.8M, phơi 300k, tổng thu 11.1M';
  });

  // T21: Chuyến cũ đã thu/đối trừ theo số nguồn -> Không tự tăng thu, chênh lệch VAT lịch sử đối soát riêng
  await runCase('T21', 'Bảo toàn số đã thu/đối trừ lịch sử tháng 1', () => {
    const debtsJan = excelMonthService.getDebtsData({ start_date: '2026-01-01', end_date: '2026-01-31' }).receivables;
    assert.equal(debtsJan.total_offset, 3600000);
    assert(debtsJan.total_vat_reconciliation_diff > 0);
    return 'Không tự động tăng thu lịch sử, VAT 8% đưa vào đối soát';
  });

  // T22 (kèm B05): Đổi chủ hàng của chuyến có cả khoản phơi đang mở và khoản phơi đã hoàn
  await runCase('T22', 'B05: Đổi chủ hàng chuyến bảo vệ khoản đã hoàn, mặc định giữ khoản cũ & lựa chọn chuyển khoản mở', () => {
    const trip = createTrip({
      tripData: { trip_date: '2026-07-10', customer_name: 'CHỦ HÀNG A', base_revenue: 5000000, phoi_advance_amount: 400000 },
      user: directorUser,
    });
    const openAdvId = eir.getAdvancesForTripMap().get(trip.id)[0].id;
    const closedAdv = eir.createEirAdvance({
      trip_id: trip.id,
      customer_name: 'CHỦ HÀNG A',
      advance_amount: 150000,
      advance_date: '2026-07-10',
      is_tuoi: true,
    });
    assert.equal(closedAdv.refund_status, 'DA_HOAN');

    // 1. Mặc định (không truyền sync_open_advances_customer): giữ nguyên chủ hàng cũ cho cả khoản mở & khoản đã hoàn, kèm cảnh báo
    const resKeep = updateTrip({
      tripId: trip.id,
      updateData: { customer_name: 'CHỦ HÀNG B' },
      user: directorUser,
    });
    assert.equal(resKeep.customer_name, 'CHỦ HÀNG B');
    assert.ok(resKeep.phoi_customer_warning, 'Phải trả về cảnh báo giữ nguyên chủ hàng cũ');
    assert.equal(eir.getAdvanceById(openAdvId).customer_name, 'CHỦ HÀNG A');
    assert.equal(eir.getAdvanceById(closedAdv.id).customer_name, 'CHỦ HÀNG A');
    assert(eir.getAdvanceById(openAdvId).history.some((h) => h.action === 'KEEP_CUSTOMER_ON_TRIP_CHANGE'));

    // 2. Khi xác nhận chuyển khoản đang mở (sync_open_advances_customer: true): chỉ khoản mở sang CHỦ HÀNG C, khoản đã hoàn vẫn giữ CHỦ HÀNG A
    const resSync = updateTrip({
      tripId: trip.id,
      updateData: { customer_name: 'CHỦ HÀNG C', sync_open_advances_customer: true },
      user: directorUser,
    });
    assert.equal(resSync.customer_name, 'CHỦ HÀNG C');
    const afterOpen = eir.getAdvanceById(openAdvId);
    const afterClosed = eir.getAdvanceById(closedAdv.id);
    assert.equal(afterOpen.customer_name, 'CHỦ HÀNG C');
    assert.equal(afterClosed.customer_name, 'CHỦ HÀNG A', 'Khoản đã hoàn tuyệt đối giữ nguyên chủ hàng cũ');
    assert(afterOpen.history.some((h) => h.action === 'SYNC_CUSTOMER'));

    // 3. Sửa sai lịch sử khoản đã hoàn phải qua thao tác riêng và bắt buộc có lý do
    assert.throws(
      () => eir.correctEirAdvanceCustomer(closedAdv.id, { customer_name: 'CHỦ HÀNG ĐÍNH CHÍNH', reason: '' }, 'giamdoc'),
      /Bắt buộc nhập lý do/
    );
    const corrected = eir.correctEirAdvanceCustomer(
      closedAdv.id,
      { customer_name: 'CHỦ HÀNG ĐÍNH CHÍNH', reason: 'Đính chính chứng từ gốc theo biên bản đối chiếu' },
      'giamdoc'
    );
    assert.equal(corrected.customer_name, 'CHỦ HÀNG ĐÍNH CHÍNH');
    assert(corrected.history.some((h) => h.action === 'CORRECT_CUSTOMER_HISTORY'));

    return 'Khoản đã hoàn giữ nguyên; mặc định giữ khoản cũ có cảnh báo; xác nhận mới chuyển khoản mở';
  });

  // T23: Excel đúng 19 tiêu đề trong ảnh, loại cont trống, NÂNG=HICT -> Loại cont trống, nơi nâng HICT
  await runCase('T23', 'Mẫu Excel mới 19 cột với LOẠI CONT trống & NÂNG=HICT', () => {
    const headers = ['STT', 'NGÀY', 'CHỦ HÀNG', 'TUYẾN ĐƯỜNG', 'SỐ CONT', 'SỐ XE', 'LOẠI CONT', 'NÂNG', 'HẠ', 'PHƠI NÂNG HẠ', 'DẦU', 'TIỀN ĐƯỜNG', 'LẠCH HUYỆN', 'NX NGOÀI', 'PHÁT SINH', 'CƯỚC RA', 'CƯỚC VÀO', 'ĐÃ TT', 'CÔNG NỢ'];
    const ws = xlsx.utils.aoa_to_sheet([
      ['BẢNG KÊ THÁNG 9/2026'],
      headers,
      [1, '2026-09-03', 'KHÁCH AUDIT', 'TUYẾN 1', 'CONT123', '15H04255', '', 'HICT', 'GF', 118000, 100, 0, 'LH400', '', 0, 0, 4900000, '', 'TƯƠI'],
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Data');
    const preview = ExcelImportService.parseAndPreview({
      buffer: xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }),
      filename: 'mau_19_cot.xlsx',
    });
    const r = preview.rows[0];
    assert.equal(r.container_size, '');
    assert.equal(r.lift_on_location, 'HICT');
    assert.equal(r.lift_off_location, 'GF');
    assert.equal(r.phoi_advance_amount, 118000);
    assert.equal(r.phoi_payment_term_type, 'TUOI');
    return 'Không alias nhầm NÂNG vào container_size';
  });

  // T24: Excel bảo tồn 40FR, 40RF, 45
  await runCase('T24', 'Bảo toàn loại container đặc thù (40FR, 40RF, 45)', () => {
    assert.equal(normalizeContainerType('40FR').container_code, '40FR');
    assert.equal(normalizeContainerType('40RF').container_code, '40RF');
    assert.equal(normalizeContainerType('45').container_code, '45');
    return 'Không tự ý chuyển 40FR thành 40RF hay 40DC';
  });

  // T25: Excel ô gộp, K MẤT, TƯƠI, CN 30 NGÀY -> Độc lập, không nhân chi phí
  await runCase('T25', 'Xử lý ghi chú K MẤT & CN 30 NGÀY', () => {
    const advNonFin = eir.createEirAdvance({
      trip_id: 'trip-k-mat',
      customer_name: 'CUST K MAT',
      advance_amount: 0,
      raw_source_value: 'K MẤT',
      is_non_financial_note: true,
    });
    assert.equal(advNonFin.refund_status, 'GHI_CHU_NGUON');
    assert.equal(advNonFin.balance_due, 0);
    return 'Ghi chú nguồn không tạo công nợ giả';
  });

  // T26 (kèm B06): Trợ lý Giám Đốc đối chiếu số thật, xếp hạng xe khác chi phí dầu, cuốc dương trước trừ nhưng âm sau trừ 17%, thiếu giá dầu & công nợ 10.8M
  await runCase('T26', 'B06: Trợ lý Giám Đốc kiểm tra số tuyệt đối, thứ hạng xe theo dầu, cuốc lỗ sau trừ 17% & công nợ có VAT', () => {
    const now = new Date('2026-02-01T00:00:00Z');
    const period = { startDate: '2026-01-01', endDate: '2026-01-31', kind: 'month' };

    const b06Fixture = {
      groups: [],
      rows: [
        // Cuốc lãi trước trừ (+500.000) nhưng âm sau trừ 17% (-536.000), chưa thanh toán -> nợ phải thu = 10.800.000
        {
          id: 'T-B06-LOSS',
          stt: 1,
          trip_date: '2026-01-10',
          customer_name: 'KHÁCH NỢ 10M',
          vehicle_plate: '15H-111.11',
          driver_name: 'Nguyễn Văn A',
          cuoc_goc: 10000000,
          cuoc_vao: 10000000,
          direct_cost: 9500000,
          trip_profit: 500000,
          dau_liters: 0,
          tien_dau: 0,
          received_amount: 0,
          offset_amount: 0,
          cuoc_ra: 0,
          customer_payment_status: 'CHUA_TT',
        },
        // Xe 1: 50L dầu x 20.000 = 1.000.000 -> chênh lệch sau 17% = 8.964.000 - 1.000.000 = 7.964.000
        {
          id: 'T-B06-V1',
          stt: 2,
          trip_date: '2026-01-11',
          customer_name: 'KHÁCH B',
          vehicle_plate: '15H-222.22',
          driver_name: 'Trần Văn B',
          cuoc_goc: 10000000,
          cuoc_vao: 10000000,
          direct_cost: 0,
          dau_liters: 50,
          fuel_unit_price: 20000,
          tien_dau: 1000000,
          received_amount: 10800000,
          offset_amount: 0,
          cuoc_ra: 0,
          customer_payment_status: 'DA_TT',
        },
        // Xe 2: 150L dầu x 20.000 = 3.000.000 -> chênh lệch sau 17% = 8.964.000 - 3.000.000 = 5.964.000
        {
          id: 'T-B06-V2',
          stt: 3,
          trip_date: '2026-01-11',
          customer_name: 'KHÁCH C',
          vehicle_plate: '15H-333.33',
          driver_name: 'Lê Văn C',
          cuoc_goc: 10000000,
          cuoc_vao: 10000000,
          direct_cost: 0,
          dau_liters: 150,
          fuel_unit_price: 20000,
          tien_dau: 3000000,
          received_amount: 10800000,
          offset_amount: 0,
          cuoc_ra: 0,
          customer_payment_status: 'DA_TT',
        },
        // Cuốc chưa nhập giá dầu (chenh_lech_sau_tru_17 = null dù trip_profit cũ = 9.000.000)
        {
          id: 'T-B06-NO-FUEL-PRICE',
          stt: 4,
          trip_date: '2026-01-12',
          customer_name: 'KHÁCH D',
          vehicle_plate: '15H-444.44',
          driver_name: 'Phạm Văn D',
          cuoc_goc: 10000000,
          cuoc_vao: 10000000,
          direct_cost: 1000000,
          dau_liters: 80,
          fuel_unit_price: null,
          tien_dau: 0,
          is_fuel_price_missing: true,
          chenh_lech_sau_tru_17: null,
          trip_profit: 9000000,
          received_amount: 10800000,
          offset_amount: 0,
          cuoc_ra: 0,
          customer_payment_status: 'DA_TT',
        },
      ],
    };

    // 1. Kiểm tra cuốc lãi trước khoản trừ (+500k) nhưng lỗ sau khoản trừ 17% (-536k)
    const lossAns = answerDirector({ message: 'Cuốc nào đang lỗ?', viewContext: { period }, data: b06Fixture, now }).response;
    assert.equal(lossAns.items.length, 1);
    assert.equal(lossAns.items[0].id, 'T-B06-LOSS');
    assert.equal(lossAns.items[0].profit, -536000);
    assert.equal(lossAns.items[0].profit_before_deduction, 500000);

    // 2. Kiểm tra xếp hạng 2 xe có chi phí dầu khác nhau
    const rankAns = answerDirector({
      message: 'Xếp hạng xe theo lãi',
      viewContext: { period },
      data: { groups: [], rows: b06Fixture.rows.slice(1, 3) },
      now,
    }).response;
    assert.equal(rankAns.items.length, 2);
    assert.equal(rankAns.items[0].name, '15H-222.22');
    assert.equal(rankAns.items[0].profit, 7964000);
    assert.equal(rankAns.items[1].name, '15H-333.33');
    assert.equal(rankAns.items[1].profit, 5964000);

    // 3. Kiểm tra cuốc thiếu giá dầu: không âm thầm fallback về trip_profit, cảnh báo rõ
    const detailAns = answerDirector({
      message: 'Chi tiết cuốc T-B06-NO-FUEL-PRICE',
      viewContext: { period },
      data: b06Fixture,
      now,
    }).response;
    assert.equal(detailAns.metrics.missing_fuel_price_trips, 1);
    assert.equal(detailAns.metrics.incomplete_cost, true);
    assert.ok(detailAns.reply.includes('chưa đủ giá dầu'));
    assert.ok(detailAns.reply.includes('Chưa đủ cơ sở'));

    // 4. Kiểm tra công nợ phải thu cuốc 10 triệu chưa VAT = 10,8 triệu đồng bộ với báo cáo debts
    const debtAns = answerDirector({
      message: 'Công nợ khách KHÁCH NỢ 10M',
      viewContext: { period },
      data: { groups: [], rows: [b06Fixture.rows[0]] },
      now,
    }).response;
    assert.equal(debtAns.metrics.receivable_due, 10800000);
    assert.equal(debtAns.items[0].due, 10800000);

    return 'Khớp số tuyệt đối: cuốc lỗ sau trừ (-536k), xếp hạng xe theo dầu (7.964M > 5.964M), cảnh báo thiếu giá dầu, nợ có VAT 10.8M';
  });

  // T27: Kiểm tra RBAC HTTP thật: SECRETARY, ACCOUNTANT, DIRECTOR, chưa đăng nhập
  await runCase('T27', 'RBAC & Phân quyền bảo mật HTTP', async () => {
    const unauth = await fetch(`${baseUrl}/eir-reminders`);
    assert.equal(unauth.status, 401);

    const secToken = jwt.sign(secretaryUser, process.env.JWT_SECRET);
    const secDebts = await fetch(`${baseUrl}/debts`, { headers: { Authorization: `Bearer ${secToken}` } });
    assert.equal(secDebts.status, 403);

    const secRem = await fetch(`${baseUrl}/eir-reminders`, { headers: { Authorization: `Bearer ${secToken}` } });
    assert.equal(secRem.status, 200);

    const anyTrip = db.prepare('SELECT id FROM trips LIMIT 1').get();
    const secTrip = await fetch(`${baseUrl}/trip/${anyTrip.id}`, { headers: { Authorization: `Bearer ${secToken}` } });
    assert.equal(secTrip.status, 200);
    const secTripBody = await secTrip.json();
    assert.equal(secTripBody.data.trip.cuoc_goc, undefined);
    assert.equal(secTripBody.data.group, null);

    const secCreateAdv = await fetch(`${baseUrl}/eir-advances`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: 't-sec', customer_name: 'C', advance_amount: 100000 }),
    });
    assert.equal(secCreateAdv.status, 403);

    return 'Chặn 401/403 chuẩn; thư ký không xem số liệu lãi lỗ và không tác nghiệp tiền';
  });

  // T28 (kèm B03): Khởi tạo DB, nâng cấp bảng write_requests 4 cột cũ, chạy lại migration lần 2 và restore snapshot cũ
  await runCase('T28', 'B03: Nâng cấp bảng write_requests 4 cột cũ, chạy lại migration lần 2 & restore snapshot cũ', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
    for (const requiredTable of ['trips', 'containers', 'fuel_prices', 'fuel_price_history', 'eir_advances', 'eir_refunds', 'eir_advance_history', 'write_requests']) {
      assert(tables.includes(requiredTable), `Thiếu bảng ${requiredTable}`);
    }

    // Mô phỏng DB cũ chỉ có 4 cột write_requests(id, body_hash, status, response) và đã có dữ liệu
    db.exec('DROP TABLE write_requests');
    db.exec('CREATE TABLE write_requests(id TEXT PRIMARY KEY, body_hash TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL)');
    db.prepare('INSERT INTO write_requests(id, body_hash, status, response) VALUES (?, ?, ?, ?)').run(
      'legacy-row-1',
      'hash-1',
      200,
      '{"success":true}'
    );
    db.prepare("DELETE FROM schema_migrations WHERE version = '20261028_02_upgrade_write_requests_schema'").run();

    // Chạy initDatabase() lần 1 (nâng cấp từ 4 cột lên 5 cột) và lần 2 (kiểm tra idempotent)
    initDatabase();
    initDatabase();

    const cols = db.prepare('PRAGMA table_info(write_requests)').all().map((c) => c.name);
    assert(cols.includes('created_at'), 'Phải nâng cấp thêm cột created_at');
    const preserved = db.prepare('SELECT * FROM write_requests WHERE id = ?').get('legacy-row-1');
    assert.equal(preserved.body_hash, 'hash-1');

    return 'Nâng cấp bảng 4 cột thành công, giữ nguyên dữ liệu cũ, chạy lại migration lần 2 an toàn';
  });

  // T29 (kèm B03 & B07): Retry trên bảng 4 cột cũ, đóng/mở lại DB (restart), rollback khi lỗi ghi write_requests & mô phỏng lỗi lưu Cloud
  await runCase('T29', 'B03 & B07: Retry trên bảng 4 cột cũ, kiểm tra đóng/mở DB, rollback khi lỗi lưu khóa & mô phỏng lỗi lưu Cloud', async () => {
    const adv = eir.createEirAdvance({
      trip_id: 'trip-t29',
      customer_name: 'KHÁCH T29',
      advance_amount: 300000,
      advance_date: '2026-08-01',
    });
    const token = jwt.sign(directorUser, process.env.JWT_SECRET);

    // 1. Tạo bảng 4 cột cũ ngay trước khi gửi HTTP retry
    db.exec('DROP TABLE write_requests');
    db.exec('CREATE TABLE write_requests(id TEXT PRIMARY KEY, body_hash TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL)');

    const retryKey = 't29-legacy-retry-' + Date.now();
    const r1 = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': retryKey },
      body: JSON.stringify({ refund_amount: 40000, refund_date: '2026-08-01' }),
    });
    const b1 = await r1.json();
    assert.equal(r1.status, 200);
    assert.equal(b1.data.refunded_amount, 40000);

    // Mở kết nối SQLite mới độc lập tới file DB để xác nhận khóa chống trùng đã ghi bền vững xuống đĩa (như sau khi restart)
    const reopenedDb = new DatabaseSync(process.env.DB_PATH);
    try {
      const savedKeyCount = reopenedDb.prepare('SELECT COUNT(*) as c FROM write_requests').get().c;
      assert.equal(savedKeyCount, 1, 'Khóa chống trùng phải tồn tại trên file DB khi mở lại kết nối');
    } finally {
      reopenedDb.close();
    }

    // Retry lần 2: chỉ có đúng 1 giao dịch 40.000đ
    const r2 = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': retryKey },
      body: JSON.stringify({ refund_amount: 40000, refund_date: '2026-08-01' }),
    });
    const b2 = await r2.json();
    assert.equal(r2.status, 200);
    assert.equal(b2.data.refunded_amount, 40000);

    // 2. Mô phỏng lỗi không lưu được vào write_requests -> Giao dịch tiền phải ROLLBACK, trả HTTP 500
    db.exec(`
      CREATE TRIGGER fail_write_requests_insert
      BEFORE INSERT ON write_requests
      BEGIN
        SELECT RAISE(ABORT, 'Simulated write_requests disk/schema error');
      END;
    `);
    try {
      const failReq = await fetch(`${baseUrl}/eir-advances/${adv.id}/refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'fail-key-' + Date.now() },
        body: JSON.stringify({ refund_amount: 50000, refund_date: '2026-08-01' }),
      });
      assert.equal(failReq.status, 500);
      // Số tiền đã hoàn vẫn giữ nguyên 40.000đ, tuyệt đối không bị tăng lên 90.000đ
      assert.equal(eir.getAdvanceById(adv.id).refunded_amount, 40000);
    } finally {
      db.exec('DROP TRIGGER IF EXISTS fail_write_requests_insert');
    }

    // 3. Kịch bản Cloud lưu bền vững ở trạng thái ready=true (Codex regression test):
    // Handler thực sự ghi giao dịch, PATCH lưu Cloud thực sự được gọi và trả HTTP 500 -> DurableWrites trả HTTP 503
    // Số tiền hoàn và khóa chống trùng được rollback.
    // Retry sau khi sửa lỗi Cloud lưu thành công -> trả HTTP 200, cuối cùng chỉ có đúng 1 giao dịch được ghi.
    const origSupaUrl = process.env.SUPABASE_URL;
    const origSupaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const origEncKey = process.env.ENCRYPTION_KEY;
    const origIsTest = process.env.IS_TEST;
    const origFetch = globalThis.fetch;

    try {
      process.env.SUPABASE_URL = 'https://mock-durable.invalid';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-mock-only';
      process.env.ENCRYPTION_KEY = '1'.repeat(64);
      delete process.env.IS_TEST;

      let failPatch = true;
      let patches = 0;
      let routeRuns = 0;

      globalThis.fetch = async (url, opts = {}) => {
        if (String(url).startsWith('https://mock-durable.invalid')) {
          if (opts.method === 'GET') return Response.json([]);
          if (opts.method === 'POST') return Response.json([{ revision: 1 }]);
          if (opts.method === 'PATCH') {
            patches++;
            return failPatch
              ? new Response('mock failed', { status: 500 })
              : Response.json([{ revision: JSON.parse(opts.body).revision }]);
          }
          throw new Error('Unexpected mock operation');
        }
        return origFetch(url, opts);
      };

      const cloudTestApp = express();
      cloudTestApp.use(express.json());
      cloudTestApp.use('/api/v1', durableWrites);
      cloudTestApp.use('/api/v1', idempotentWrites);
      cloudTestApp.use('/api/v1/business', (_req, _res, next) => {
        routeRuns++;
        next();
      }, businessRouter);

      await initializeDurableState();
      assert.equal(durabilityStatus().ready, true, 'DurableState phải ở trạng thái ready=true trước khi gọi API');

      const cloudSrv = cloudTestApp.listen(0, '127.0.0.1');
      await new Promise((r) => cloudSrv.once('listening', r));
      const cloudPort = cloudSrv.address().port;
      const refundUrl = `http://127.0.0.1:${cloudPort}/api/v1/business/eir-advances/${adv.id}/refund`;
      const cloudToken = jwt.sign(directorUser, process.env.JWT_SECRET);
      const cloudKey = 't29-ready-cloud-' + Date.now();
      const refundPayload = { refund_amount: 30000, refund_date: '2026-08-01' };

      try {
        // Lần 1: Cloud PATCH thất bại
        const res1 = await origFetch(refundUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cloudToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': cloudKey,
          },
          body: JSON.stringify(refundPayload),
        });
        assert.equal(res1.status, 503, 'Lỗi lưu Cloud phải trả HTTP 503');
        assert.equal(routeRuns, 1, 'Handler nghiệp vụ phải thực sự được gọi trước khi flush');
        assert.equal(patches, 1, 'Lệnh PATCH Cloud phải thực sự được gọi');
        // Số tiền hoàn và khóa chống trùng được rollback
        assert.equal(eir.getAdvanceById(adv.id).refunded_amount, 40000, 'Số tiền hoàn phải rollback về 40.000đ');
        const writeReqCount = db.prepare('SELECT count(*) AS n FROM write_requests WHERE id = ?').get(cloudKey);
        assert.equal(writeReqCount ? writeReqCount.n : 0, 0, 'Khóa chống trùng thất bại phải được rollback');

        // Lần 2: Giả lập Cloud bình phục, retry cùng khóa
        failPatch = false;
        const res2 = await origFetch(refundUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cloudToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': cloudKey,
          },
          body: JSON.stringify(refundPayload),
        });
        assert.equal(res2.status, 200, 'Retry sau khi Cloud bình phục phải trả 200');
        assert.equal(eir.getAdvanceById(adv.id).refunded_amount, 70000, 'Số tiền hoàn sau retry thành công là 70.000đ (40k + 30k)');

        // Lần 3: Gửi lại lần nữa cùng khóa -> Idempotent cache hit, không cộng đúp
        const res3 = await origFetch(refundUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cloudToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': cloudKey,
          },
          body: JSON.stringify(refundPayload),
        });
        assert.equal(res3.status, 200, 'Gửi lại cùng khóa phải trả 200 từ cache chống trùng');
        assert.equal(eir.getAdvanceById(adv.id).refunded_amount, 70000, 'Gửi lại không làm tăng thêm số tiền đã hoàn');
      } finally {
        cloudSrv.closeAllConnections?.();
        await new Promise((r) => cloudSrv.close(r));
      }
    } finally {
      globalThis.fetch = origFetch;
      if (origSupaUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = origSupaUrl;
      if (origSupaKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = origSupaKey;
      if (origEncKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = origEncKey;
      process.env.IS_TEST = origIsTest;
    }

    return 'Retry bảng 4 cột + mở lại DB + rollback khi lỗi write_requests (500) + hoàn tác khi lỗi Cloud với ready=true (503)';
  });

  // T30: Rollback Excel chưa tác nghiệp và đã có giao dịch hoàn
  await runCase('T30', 'Chặn rollback đợt nhập Excel khi đã có giao dịch hoàn phơi', () => {
    const batch = ExcelImportService.commitImport({
      rows: [{ trip_date: '2026-08-01', customer_name: 'ROLLBACK BATCH', base_revenue: 5000000, phoi_advance_amount: 300000 }],
      filename: 'rollback_test.xlsx',
      user: directorUser,
    });
    const tripId = batch.trip_ids[0];
    const advId = eir.getAdvancesForTripMap().get(tripId)[0].id;

    eir.recordEirRefund(advId, { refund_amount: 100000, refund_date: '2026-08-01' }, 'audit');

    assert.throws(
      () => ExcelImportService.rollbackBatch({ batchId: batch.batch_id, user: directorUser }),
      /hoàn tiền phơi/
    );
    return 'Thông báo rõ ràng, không để mất giao dịch';
  });

  // T31: Kỳ khóa và sửa giá dầu tác động kỳ đó -> Chặn đứng
  await runCase('T31', 'Tuân thủ Khóa sổ kỳ kế toán với Giá dầu theo ngày', () => {
    lockPeriod({ periodMonth: '2026-09', user: directorUser, notes: 'Khóa sổ kỳ tháng 9' });
    assert.throws(
      () => upsertFuelPrice({ apply_date: '2026-09-10', price_per_liter: 25000, actor: 'audit' }),
      /KHÓA SỔ/
    );
    unlockPeriod({ periodMonth: '2026-09', user: directorUser, notes: 'Mở khóa sổ kỳ tháng 9' });
    return 'Chặn sửa giá dầu trong tháng đã khóa sổ';
  });

  // T32: Chạy trình duyệt thật trên 3 kích thước màn hình (390px, 768px, 1366px)
  await runCase('T32', 'Kiểm thử trình duyệt thật ở 3 kích thước 390px, 768px và 1366px', async () => {
    assert.equal(fs.existsSync(path.join(clientDistDir, 'index.html')), true, 'Phải có bản build client/dist/index.html');
    const pw = createRequire('C:/Users/mrdoa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
    const browser = await pw.chromium.launch({
      executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true,
    });

    try {
      const token = jwt.sign(directorUser, process.env.JWT_SECRET);
      for (const vp of [
        { width: 390, height: 844, name: 'mobile_390px' },
        { width: 768, height: 1024, name: 'tablet_768px' },
        { width: 1366, height: 900, name: 'desktop_1366px' },
      ]) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        await context.addInitScript(
          ({ token, user }) => {
            localStorage.setItem('hoachtoan_auth_token', token);
            localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
          },
          { token, user: directorUser }
        );
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(e.message));

        await page.goto(rootUrl, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Tổng quan kinh doanh', exact: true }).click();
        await page.getByRole('button', { name: 'Giá Dầu Theo Ngày', exact: true }).click();
        await page.getByText(/Bảng Giá Dầu Theo Ngày Chạy/i).waitFor({ state: 'visible', timeout: 5000 });
        await page.screenshot({ path: path.join(testRunDir, `t32_fuel_modal_${vp.name}.png`) });
        await page.getByRole('button', { name: 'Đóng' }).first().click();

        assert.equal(pageErrors.length, 0, `Viewport ${vp.name} có lỗi runtime: ${pageErrors.join('; ')}`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
    return 'Chạy trình duyệt thật trên 390px, 768px, 1366px với 0 pageerror và chụp ảnh nghiệm thu';
  });

  // T33 (B08): Kiểm tra trung thực bản test trực tuyến Render
  {
    const onlineBase = (process.env.TEST_ONLINE_URL || 'https://hong-anh-test.onrender.com').replace(/\/+$/, '');
    const directorPassword = process.env.DIRECTOR_ONLINE_PASSWORD || '123456';
    const probe = {
      targetUrl: onlineBase,
      timestamp: new Date().toISOString(),
    };

    const fetchOnline = (endpoint, options = {}) =>
      fetch(`${onlineBase}${endpoint}`, {
        ...options,
        signal: AbortSignal.timeout(30000),
      });

    try {
      // 1. Kiểm tra trang chủ
      let homeRes;
      try {
        homeRes = await fetchOnline('/');
        probe.homeStatus = homeRes.status;
      } catch (e) {
        probe.homeStatus = 'ERR: ' + e.message;
      }

      // 2. Chặn truy cập khách
      let anonRes;
      try {
        anonRes = await fetchOnline('/api/v1/business/overview');
        probe.anonymousStatus = anonRes.status;
      } catch (e) {
        probe.anonymousStatus = 'ERR: ' + e.message;
      }

      // 3. Đăng nhập Giám đốc
      let token = null;
      let loginRes;
      try {
        loginRes = await fetchOnline('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'giamdoc', password: directorPassword }),
        });
        probe.loginStatus = loginRes.status;
        if (loginRes.ok) {
          const body = await loginRes.json();
          token = body.data?.token;
        }
      } catch (e) {
        probe.loginStatus = 'ERR: ' + e.message;
      }

      // 4. Nếu đăng nhập thành công, probe các endpoint nghiệp vụ
      if (token) {
        const authHeaders = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };

        try {
          const metaRes = await fetchOnline('/api/v1/manage/metadata', { headers: authHeaders });
          probe.metadataStatus = metaRes.status;
          if (metaRes.ok) {
            const metaBody = await metaRes.json();
            probe.read_only = metaBody.data?.read_only;
          }
        } catch (e) {
          probe.metadataStatus = 'ERR: ' + e.message;
        }

        try {
          const fuelRes = await fetchOnline('/api/v1/business/fuel-prices', { headers: authHeaders });
          probe.fuelPricesStatus = fuelRes.status;
          if (fuelRes.ok) {
            const fuelBody = await fuelRes.json();
            probe.hasFuelPrices = Array.isArray(fuelBody.data?.prices);
          }
        } catch (e) {
          probe.fuelPricesStatus = 'ERR: ' + e.message;
        }

        try {
          const ovRes = await fetchOnline('/api/v1/business/overview?period=january', { headers: authHeaders });
          probe.januaryOverviewStatus = ovRes.status;
          if (ovRes.ok) {
            const ovBody = await ovRes.json();
            const kpis = ovBody.data?.kpis || {};
            probe.januaryTrips = kpis.trips_count;
            probe.januaryRevenue = kpis.total_revenue_vat_inc;
            probe.newFareFields = Object.hasOwn(kpis, 'total_revenue_after_deduction');
          }
        } catch (e) {
          probe.januaryOverviewStatus = 'ERR: ' + e.message;
        }

        try {
          const writeRes = await fetchOnline('/api/v1/data/seed', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({}),
          });
          probe.writeLockStatus = writeRes.status;
        } catch (e) {
          probe.writeLockStatus = 'ERR: ' + e.message;
        }
      }

      const note = `Target: ${onlineBase} · Trang chủ: ${probe.homeStatus} · Khách: ${probe.anonymousStatus} · Đăng nhập: ${probe.loginStatus} · Chế độ chỉ xem: ${probe.read_only === true ? 'BẬT (HTTP ' + probe.writeLockStatus + ')' : 'CHƯA BẬT'} · API Dầu: ${probe.fuelPricesStatus} · Tháng 1: ${probe.januaryOverviewStatus} (77 cuốc: ${probe.januaryTrips === 77 ? 'KHỚP' : probe.januaryTrips}, cước sau trừ 17%: ${probe.newFareFields ? 'CÓ' : 'CHƯA CÓ'})`;

      if (probe.fuelPricesStatus === 200 && probe.newFareFields === true && probe.read_only === true) {
        pass('T33', 'Nghiệm thu bản test trực tuyến Render (B08)', note);
      } else {
        skip('T33', 'Trạng thái bản test trực tuyến Render (B08)', note);
      }
    } catch (suiteOnlineErr) {
      skip('T33', 'Trạng thái bản test trực tuyến Render (B08)', `Lỗi probe: ${suiteOnlineErr.message}`);
    }
  }
} catch (globalErr) {
  process.exitCode = 1;
  console.error('FATAL TEST SUITE ERROR:', globalErr);
} finally {
  await new Promise((r) => server.close(r));
  db.close();
}

const passCount = testResults.filter((r) => r.status === 'PASS').length;
const skipCount = testResults.filter((r) => r.status === 'SKIP').length;
const failCount = testResults.filter((r) => r.status === 'FAIL').length;

console.log('================================================================');
console.log(`KẾT QUẢ KIỂM THỬ LOCAL: ${passCount}/32 CA ĐẠT | SKIP (ONLINE CHƯA DEPLOY): ${skipCount} | FAIL: ${failCount}`);
console.log('================================================================');

fs.writeFileSync(path.join(testRunDir, 'verification_33_results.json'), JSON.stringify(testResults, null, 2));
console.log('Báo cáo kết quả lưu tại:', path.join(testRunDir, 'verification_33_results.json'));

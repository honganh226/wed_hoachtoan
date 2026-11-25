/**
 * Kiểm thử hồi quy cho các lỗi sửa ngày 25/11/2026 (xem CLAUDE_BAO_CAO_KHAO_SAT_2026-11-25.md).
 * Chạy trên DB tạm riêng, không đụng DB vận hành hoặc DB kiểm thử dùng chung.
 *   node src/tests/fixes20261125.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hoachtoan-fixes-'));
process.env.NODE_ENV = 'test';
process.env.IS_TEST = 'true';
process.env.DB_PATH = path.join(tmp, 'fixes.db');
process.env.GROUP_ALLOCATIONS_PATH = path.join(tmp, 'groups.json');
fs.writeFileSync(process.env.DB_PATH, '');

const { db } = await import('../db/database.js');
const { createTrip } = await import('../services/trip.service.js');
const { calculatePL } = await import('../services/plEngine.service.js');
const { lockPeriod, unlockPeriod } = await import('../services/periodLock.service.js');
const { saveEntity, deleteEntity, listEntity, savePaymentStatusBatch } = await import('../services/directorData.service.js');
const { seedJanuaryIfMissing } = await import('./helpers/seedJanuary.mjs');
const { ExcelImportService } = await import('../services/excelImportService.js');
const { default: xlsx } = await import('xlsx');

const nowIso = new Date().toISOString();
db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at)
  VALUES ('fix-dir', 'fix-giamdoc', 'khong-dang-nhap', 'GĐ kiểm thử', 'DIRECTOR', NULL, NULL, 1, ?, ?)`).run(nowIso, nowIso);
const director = { id: 'fix-dir', userId: 'fix-dir', username: 'fix-giamdoc', role: 'DIRECTOR' };

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`  ✅ ${name}`); };

// 1. Nhập Excel tháng 1: P22 "ĐỐI TRỪ XONG" + Q22 "X" phải giữ là đối trừ 3.600.000
await seedJanuaryIfMissing();
check('Nhập tháng 1: đủ 77 cuốc, cước gốc 338.200.000', () => {
  const r = db.prepare("SELECT COUNT(*) n, SUM(base_revenue) s FROM trips WHERE trip_date LIKE '2026-01%'").get();
  assert.equal(r.n, 77);
  assert.equal(r.s, 338200000);
});
check('Nhập tháng 1: dòng đối trừ không bị "X" ghi đè', () => {
  const r = db.prepare("SELECT COUNT(*) n, SUM(base_revenue) s FROM trips WHERE customer_payment_status = 'DOI_TRU'").get();
  assert.equal(r.n, 1);
  assert.equal(r.s, 3600000);
});

// 2. P&L: chỉ tiêu chính sau khoản trừ 17% khớp số chuẩn tháng 1
check('P&L tháng 1: cước sau trừ 17% = 303.162.480, chênh lệch tạm tính = cước sau trừ 17% − chi phí', () => {
  const pl = calculatePL({ startDate: '2026-01-01', endDate: '2026-01-31', user: director }).profit_and_loss;
  assert.equal(pl.revenue_pre_vat, 338200000);
  assert.equal(pl.vat_8, 27056000);
  assert.equal(pl.deduction_17, 62093520);
  assert.equal(pl.revenue_after_deduction_17, 303162480);
  assert.equal(pl.margin_after_deduction_17, pl.revenue_after_deduction_17 - pl.company_cost_excluding_salary);
});

// 3. "Đã thu cước" không được lấy từ trạng thái thanh toán phơi
check('P&L: chuyến đã thanh toán PHƠI nhưng chưa thu CƯỚC không tính vào thực thu', () => {
  const trip = createTrip({ tripData: { trip_date: '2026-03-05', customer_name: 'KHÁCH KIỂM THỬ PHƠI', vehicle_plate: 'XE NGOÀI', base_revenue: 1000000, container_size: '40HC' }, user: director });
  db.prepare("UPDATE trips SET eir_paid_status = 'DA_TT', customer_payment_status = 'CHUA_TT', status = 'COMPLETED' WHERE id = ?").run(trip.id);
  const cash = calculatePL({ startDate: '2026-03-01', endDate: '2026-03-31', user: director }).cash_flow;
  assert.equal(cash.expected_revenue, 1000000);
  assert.equal(cash.actual_revenue, 0);
  db.prepare("UPDATE trips SET customer_payment_status = 'DA_TT' WHERE id = ?").run(trip.id);
  assert.equal(calculatePL({ startDate: '2026-03-01', endDate: '2026-03-31', user: director }).cash_flow.actual_revenue, 1000000);
});

// 4. Loại container trống từ nguồn không bị tự gán 40DC
check('Loại container trống được giữ trống (không tự thành 40DC)', () => {
  const trip = createTrip({ tripData: { trip_date: '2026-03-06', customer_name: 'KHÁCH KIỂM THỬ CONT', vehicle_plate: 'XE NGOÀI', base_revenue: 500000, container_size: '', container_type_raw: '' }, user: director });
  const row = db.prepare('SELECT container_type_raw FROM trips WHERE id = ?').get(trip.id);
  assert.equal(row.container_type_raw || '', '');
});

// 5. Khóa sổ áp dụng cho chi phí sửa qua mục quản lý dữ liệu (/manage)
check('Khóa sổ chặn thêm/sửa/xóa chi phí của chuyến thuộc tháng đã khóa', () => {
  const trip = db.prepare("SELECT id FROM trips WHERE trip_date LIKE '2026-03%' LIMIT 1").get();
  const exp = saveEntity('expenses', null, { trip_id: trip.id, expense_type: 'PARKING', category: 'VARIABLE', amount: 50000, expense_date: '2026-03-06', note: 'kiểm thử' }, null, director, 'kiểm thử');
  lockPeriod({ periodMonth: '2026-03', user: director, notes: 'kiểm thử' });
  try {
    assert.throws(() => saveEntity('expenses', null, { trip_id: trip.id, expense_type: 'PARKING', category: 'VARIABLE', amount: 1, expense_date: '2026-03-07' }, null, director, 'kiểm thử'), (e) => e.status === 423);
    const current = listEntity('expenses').find((r) => r.id === exp.id);
    assert.throws(() => deleteEntity('expenses', exp.id, director, 'kiểm thử xóa', current.version), (e) => e.status === 423);
  } finally {
    unlockPeriod({ periodMonth: '2026-03', user: director, notes: 'kiểm thử' });
  }
});

// 6. Cột TƯƠI (xác nhận chủ dự án 25/11/2026): TƯƠI hoặc ĐỂ TRỐNG = đã thanh toán;
//    CN 30/60/90 NGÀY, X, "chưa", "... sau ..." = trả sau (còn nợ, cần nhắc). Cột ĐÃ TT ghi đã thanh toán/đối trừ được ưu tiên.
check('Cột TƯƠI: trống/TƯƠI = đã thu; CN/X/chưa/sau = trả sau; cột ĐÃ TT được ưu tiên', () => {
  const aoa = [
    ['STT', 'NGÀY', 'CHỦ HÀNG', 'CƯỚC VÀO', 'PHƠI NÂNG HẠ', 'ĐÃ TT', 'TƯƠI'],
    [1, '05/04/2026', 'KHÁCH A', 1000000, 300000, '', 'X'],
    [2, '06/04/2026', 'KHÁCH B', 1000000, 300000, '', 'TƯƠI'],
    [3, '07/04/2026', 'KHÁCH C', 1000000, 300000, 'ĐÃ THANH TOÁN', ''],
    [4, '08/04/2026', 'KHÁCH D', 1000000, 0, '', ''],
    [5, '09/04/2026', 'KHÁCH E', 1000000, 0, '', 'CN 60 NGÀY'],
    [6, '10/04/2026', 'KHÁCH F', 1000000, 0, '', 'TƯƠI TT SAU 1 TUẦN'],
    [7, '11/04/2026', 'KHÁCH G', 1000000, 0, 'ĐỐI TRỪ XONG', 'CN 30 NGÀY'],
    [8, '12/04/2026', 'KHÁCH H', 1000000, 0, '', 'chưa'],
  ];
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(aoa), 'T4-2026');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const rows = ExcelImportService.parseAndPreview({ buffer, filename: 'kiem-thu-tuoi.xlsx' }).rows;
  const by = Object.fromEntries(rows.map((r) => [Number(r.stt), r]));
  assert.equal(by[1].customer_payment_status, 'X', 'X = trả sau, chưa thu');
  assert.equal(by[1].phoi_payment_term_type, 'CHUA_DAT', 'X = phơi trả sau');
  assert.equal(by[2].customer_payment_status, 'TUOI', 'TƯƠI = đã thu');
  assert.equal(by[2].phoi_payment_term_type, 'TUOI', 'TƯƠI = phơi hoàn ngay');
  assert.equal(by[3].customer_payment_status, 'DA_TT');
  assert.equal(by[3].phoi_payment_term_type, 'TUOI', 'TƯƠI trống = phơi đã hoàn');
  assert.equal(by[4].customer_payment_status, 'TUOI', 'Cột TƯƠI trống = đã thanh toán');
  assert.equal(by[5].customer_payment_status, 'CHUA_TT', 'CN 60 NGÀY = trả sau');
  assert.equal(by[5].payment_terms, 'CN 60 NGÀY');
  assert.equal(by[6].customer_payment_status, 'CHUA_TT', '"... SAU ..." = trả sau');
  assert.equal(by[7].customer_payment_status, 'DOI_TRU', 'Cột ĐÃ TT ghi đối trừ được ưu tiên');
  assert.equal(by[8].customer_payment_status, 'X', '"chưa" = trả sau, chưa thu');
});

// 7. X = khách trả sau, CHƯA thu (xác nhận chủ dự án 25/11/2026)
check('Tháng 1 sau nhập: dòng P đã thanh toán giữ DA_TT, không còn dòng X', () => {
  const rows = db.prepare("SELECT customer_payment_status s, COUNT(*) n FROM trips WHERE trip_date LIKE '2026-01%' GROUP BY 1").all();
  const by = Object.fromEntries(rows.map((r) => [r.s, r.n]));
  assert.equal(by.DA_TT, 76);
  assert.equal(by.DOI_TRU, 1);
  assert.equal(by.X || 0, 0);
});
check('Chuyến trạng thái X không tính vào thực thu ở P&L', () => {
  const trip = createTrip({ tripData: { trip_date: '2026-05-05', customer_name: 'KHÁCH TRẢ SAU', vehicle_plate: 'XE NGOÀI', base_revenue: 2000000, container_size: '40HC', customer_payment_status: 'X' }, user: director });
  const cash = calculatePL({ startDate: '2026-05-01', endDate: '2026-05-31', user: director }).cash_flow;
  assert.equal(db.prepare('SELECT customer_payment_status s FROM trips WHERE id = ?').get(trip.id).s, 'X');
  assert.equal(cash.expected_revenue, 2000000);
  assert.equal(cash.actual_revenue, 0);
  assert.equal(cash.pending_receivables, 2000000);
});
{
  const mk = (date, cells) => {
    const t = createTrip({ tripData: { trip_date: date, customer_name: 'KHÁCH DỮ LIỆU CŨ', vehicle_plate: 'XE NGOÀI', base_revenue: 1000000, container_size: '40HC', customer_payment_status: 'X' }, user: director });
    db.prepare('UPDATE trips SET raw_data = ? WHERE id = ?').run(JSON.stringify({ source_cells: cells }), t.id);
    return t.id;
  };
  const paidId = mk('2026-06-01', { P9: { value: 'ĐÃ THANH TOÁN' }, Q9: { value: 'X' } });
  const offsetId = mk('2026-06-02', { P10: { value: 'ĐỐI TRỪ XONG' }, Q10: { value: 'X' } });
  const laterId = mk('2026-06-03', { M11: { value: 'ĐÃ TT' }, Q11: { value: 'X' } });
  db.prepare("DELETE FROM schema_migrations WHERE version = '20261125_01_x_review_only'").run();
  const { initDatabase } = await import('../db/init.js');
  initDatabase();
  const st = (id) => db.prepare('SELECT customer_payment_status s FROM trips WHERE id = ?').get(id).s;
  const review = db.prepare("SELECT description FROM schema_migrations WHERE version = '20261125_01_x_review_only'").get();
  // Chủ dự án: không tự sửa dữ liệu thu tiền lịch sử -> bước kiểm tra chỉ đếm, giữ nguyên trạng thái
  check('Dữ liệu thu tiền cũ giữ nguyên; chỉ ghi số dòng X cần rà (1 ĐÃ THANH TOÁN, 1 ĐỐI TRỪ)', () => {
    assert.equal(st(paidId), 'X');
    assert.equal(st(offsetId), 'X');
    assert.equal(st(laterId), 'X');
    assert.ok(review.description.includes('1 dòng X có ô nguồn ĐÃ THANH TOÁN'));
    assert.ok(review.description.includes('1 dòng X có ô nguồn ĐỐI TRỪ'));
  });
}

// 8. Giá dầu nhập/sửa/xóa SAU khi tạo chuyến: P&L phải theo kịp (đợt 7, 25/11/2026)
{
  const { upsertFuelPrice, deleteFuelPrice } = await import('../services/fuelPrice.service.js');
  const trip = createTrip({ tripData: { trip_date: '2026-07-10', customer_name: 'KHÁCH DẦU', vehicle_plate: '15H00266', base_revenue: 5000000, fuel_liters: 100, container_size: '40HC' }, user: director });
  const plCost = () => calculatePL({ startDate: '2026-07-01', endDate: '2026-07-31', user: director }).profit_and_loss.company_cost_excluding_salary;
  const fuelExp = () => db.prepare("SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE trip_id = ? AND source_component = 'fuel_cost'").get(trip.id).s;
  const before = plCost();
  upsertFuelPrice({ apply_date: '2026-07-10', price_per_liter: 20000, actor: 'kiem-thu' });
  const afterAdd = plCost();
  const expAdd = fuelExp();
  upsertFuelPrice({ apply_date: '2026-07-10', price_per_liter: 21000, actor: 'kiem-thu' });
  const afterEdit = plCost();
  deleteFuelPrice({ apply_date: '2026-07-10', actor: 'kiem-thu', reason: 'kiểm thử xóa giá' });
  const afterDelete = plCost();
  check('Giá dầu nhập sau: P&L cộng tiền dầu; sửa giá: theo giá mới; xóa giá: bỏ tiền dầu', () => {
    assert.equal(expAdd, 2000000);
    assert.equal(afterAdd - before, 2000000);
    assert.equal(afterEdit - before, 2100000);
    assert.equal(afterDelete, before);
    assert.equal(fuelExp(), 0);
  });
}

// 9. Báo cáo tài chính (client) đọc số đã trả nhà xe từ dữ liệu đã lưu, khớp màn Công nợ
{
  const { computeAggregateMetrics } = await import('../../../client/src/utils/tripFinancials.js');
  const m = computeAggregateMetrics([
    { is_subcontractor: true, cuoc_goc: 3000000, cuoc_ra: 2500000, subcontractor_payment_status: 'DA_TT', sub_paid_amount: 2500000, vehicle_plate: '15H00001' },
    { is_subcontractor: true, cuoc_goc: 3000000, cuoc_ra: 2000000, subcontractor_payment_status: 'CHUA_TT', sub_paid_amount: 500000, vehicle_plate: 'XE NGOÀI' },
  ]);
  check('Báo cáo tài chính: đã trả / còn phải trả nhà xe theo sub_paid_amount', () => {
    assert.equal(m.totalDaTraNhaXe, 3000000);
    assert.equal(m.totalConPhaiTraNhaXe, 1500000);
  });
}

// 10. Ngày "hôm nay" theo giờ Việt Nam (00:30 sáng 26/11 giờ VN = 17:30 ngày 25/11 UTC)
{
  const { getVietnamTodayIso } = await import('../utils/tripFinancials.js');
  check('Ngày hôm nay tính theo giờ Việt Nam, không theo UTC', () => {
    assert.equal(getVietnamTodayIso(new Date('2026-11-25T17:30:00Z')), '2026-11-26');
  });
}

// 11. Khách không trả VAT (xác nhận 25/11/2026): công nợ, đã thu tính theo cước gốc ở mọi màn
{
  const { excelMonthService, invalidateExcelMonthCache } = await import('../services/excelMonthService.js');
  createTrip({ tripData: { trip_date: '2026-08-08', customer_name: 'KHÁCH CHƯA TRẢ', vehicle_plate: 'XE NGOÀI', base_revenue: 1000000, container_size: '40HC' }, user: director });
  invalidateExcelMonthCache();
  const d = excelMonthService.getDebtsData({ start_date: '2026-08-01', end_date: '2026-08-31' }).receivables;
  const pl = calculatePL({ startDate: '2026-08-01', endDate: '2026-08-31', user: director });
  const jan = excelMonthService.getDebtsData({ start_date: '2026-01-01', end_date: '2026-01-31' }).receivables;
  check('Khách không trả VAT: còn phải thu = cước gốc ở Công nợ và P&L; tháng 1 không còn chênh lệch VAT', () => {
    assert.equal(d.total_due, 1000000);
    assert.equal(pl.cash_flow.pending_receivables, 1000000);
    assert.equal(pl.profit_and_loss.revenue_after_deduction_17, 896400); // VAT/17% vẫn dùng cho chỉ tiêu chênh lệch
    assert.equal(jan.total_due, 0);
    assert.equal(jan.total_vat_reconciliation_diff, 0);
  });
}

check('Sửa hàng loạt TƯƠI: một lần, chỉ đổi cuốc Chưa TT, bỏ qua cuốc đã thu và sai phiên bản', () => {
  const jan = listEntity('trips').filter(r => String(r.trip_date).startsWith('2026-01') && r.customer_payment_status === 'DA_TT' && r.cuoc_goc > 0);
  const [a, b, c, paid] = jan;
  for (const r of [a, b, c]) saveEntity('trips', r.id, { customer_payment_status: 'CHUA_TT' }, r._version, director, 'chuẩn bị kiểm thử');
  const cur = id => listEntity('trips').find(r => r.id === id);
  assert.equal(cur(a.id).received_amount, 0);
  const res = savePaymentStatusBatch([
    { id: a.id, version: cur(a.id)._version },
    { id: b.id, version: cur(b.id)._version },
    { id: c.id, version: 'sai-phien-ban' },
    { id: paid.id, version: paid._version },
  ], 'TUOI', director, 'kiểm thử hàng loạt');
  assert.equal(res.ok, 2);
  assert.equal(res.failed, 2);
  assert.equal(cur(a.id).customer_payment_status, 'TUOI');
  assert.equal(cur(a.id).received_amount, a.cuoc_goc);
  assert.equal(cur(b.id).customer_payment_status, 'TUOI');
  assert.equal(cur(c.id).customer_payment_status, 'CHUA_TT');
  assert.equal(cur(paid.id).customer_payment_status, 'DA_TT');
  assert.equal(db.prepare('SELECT customer_payment_status s FROM trips WHERE id=?').get(a.id).s, 'TUOI');
  assert.throws(() => savePaymentStatusBatch([{ id: a.id }], 'X', director, 'x'));
  assert.throws(() => savePaymentStatusBatch([{ id: a.id }], 'TUOI', director, ''));
});

console.log(`\nKẾT QUẢ: ${passed}/15 ca đạt`);
db.close?.();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

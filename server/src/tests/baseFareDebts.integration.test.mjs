import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-fare-debts-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DB_PATH: path.join(temp, 'isolated.db'),
  GROUP_ALLOCATIONS_PATH: path.join(temp, 'groups.json'), EXCEL_PATH: path.join(root, 'tháng 1.xlsx'),
  JWT_SECRET: randomBytes(48).toString('hex'),
  SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '',
});
new DatabaseSync(process.env.DB_PATH).close();
const { db } = await import('../db/database.js');
const { excelMonthService } = await import('../services/excelMonthService.js');
const { saveEntity, listEntity } = await import('../services/directorData.service.js');
const { createTrip, batchPayTrips, getUnpaidTripsByCustomer } = await import('../services/trip.service.js');
const user = { id: 'base-fare-review', username: 'local-test', role: 'DIRECTOR' };
// Từ 06/11/2026 dữ liệu lấy từ bảng trips, không đọc thẳng Excel: nạp 77 dòng tháng 1 qua đúng luồng nhập Excel.
await (await import('./helpers/seedJanuary.mjs')).seedJanuaryIfMissing({ excelPath: process.env.EXCEL_PATH });
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('January source payments settle base fares without a VAT debt', () => {
  const r = excelMonthService.getDebtsData({ start_date: '2026-01-01', end_date: '2026-01-31' }).receivables;
  assert.equal(r.total_receivable, 338200000);
  assert.equal(r.total_paid, 334600000);
  assert.equal(r.total_offset, 3600000);
  assert.equal(r.total_due, 0);
  assert.equal(r.total_vat_reconciliation_diff, 0);
  assert.equal(r.total_receivable_with_vat, 365256000);
  assert.equal(r.total_after_deduction_17, 303162480);
});
test('partial collection, offset and input limit use base fare with no partial write on rejection', () => {
  const created = createTrip({ tripData: { trip_date: '2099-05-10', customer_name: 'TEST PARTIAL BASE', base_revenue: 1000000 }, user });
  let row = listEntity('trips').find(t => t.id === created.id);
  saveEntity('trips', row.id, { received_amount: 400000, offset_amount: 100000 }, row._version, user, 'Test partial receipt');
  const debt = excelMonthService.getDebtsData({ start_date: '2099-05-10', end_date: '2099-05-10' }).receivables;
  assert.equal(debt.total_paid, 400000);
  assert.equal(debt.total_offset, 100000);
  assert.equal(debt.total_due, 500000);
  row = listEntity('trips').find(t => t.id === created.id);
  assert.throws(() => saveEntity('trips', row.id, { received_amount: 900001 }, row._version, user), /vượt cước gốc/);
  const unchanged = listEntity('trips').find(t => t.id === created.id);
  assert.equal(unchanged.received_amount, 400000);
  assert.equal(unchanged.offset_amount, 100000);
  saveEntity('trips', row.id, { received_amount: 900000 }, unchanged._version, user, 'Finish collection');
  const settled = excelMonthService.getDebtsData({ start_date: '2099-05-10', end_date: '2099-05-10' }).receivables;
  assert.equal(settled.total_due, 0);
  assert.equal(settled.total_paid, 900000);
  assert.equal(settled.total_offset, 100000);
});
test('unpaid-trip list and batch collection agree on base fare, stored VAT remains intact', () => {
  const customer = 'TEST BATCH BASE';
  const t = createTrip({ tripData: { trip_date: '2099-06-10', customer_name: customer, base_revenue: 1000000 }, user });
  const unpaid = getUnpaidTripsByCustomer({ user }).customers.find(c => c.customer_name === customer);
  assert.equal(unpaid.total_receivable, 1000000);
  assert.equal(unpaid.trips[0].total_revenue, 1000000);
  assert.equal(unpaid.trips[0].total_revenue_with_vat, 1080000);
  const batch = batchPayTrips({ tripIds: [t.id], customerName: customer, paymentDate: '2099-06-11', user });
  assert.equal(batch.total_amount, 1000000);
  const stored = db.prepare('SELECT trip_revenue,total_revenue,status FROM trips WHERE id=?').get(t.id);
  assert.equal(stored.trip_revenue, 1000000);
  assert.equal(stored.total_revenue, 1080000);
  assert.equal(stored.status, 'PAID');
});
test('batch collection writes the customer payment status, leaves EIR status alone and clears the debt', () => {
  const customer = 'TEST BATCH STATUS';
  const a = createTrip({ tripData: { trip_date: '2099-07-10', customer_name: customer, base_revenue: 2000000 }, user });
  const b = createTrip({ tripData: { trip_date: '2099-07-10', customer_name: customer, base_revenue: 3000000 }, user });
  let rowB = listEntity('trips').find(t => t.id === b.id);
  saveEntity('trips', b.id, { received_amount: 500000 }, rowB._version, user, 'Thu trước một phần');
  const eirBefore = db.prepare('SELECT eir_paid_status FROM trips WHERE id=?').get(a.id).eir_paid_status;
  const batch = batchPayTrips({ tripIds: [a.id, b.id], customerName: customer, paymentDate: '2099-07-11', paymentNote: 'UNC-TEST', user });
  assert.equal(batch.total_amount, 4500000); // 2.000.000 + phần còn thiếu 2.500.000
  for (const id of [a.id, b.id]) {
    const sql = db.prepare('SELECT customer_payment_status,eir_paid_status,status FROM trips WHERE id=?').get(id);
    assert.equal(sql.customer_payment_status, 'DA_TT');
    assert.equal(sql.status, 'PAID');
    const row = listEntity('trips').find(t => t.id === id);
    assert.equal(row.customer_payment_status, 'DA_TT');
    assert.equal(row.received_amount, row.cuoc_goc);
  }
  assert.equal(db.prepare('SELECT eir_paid_status FROM trips WHERE id=?').get(a.id).eir_paid_status, eirBefore);
  const debt = excelMonthService.getDebtsData({ start_date: '2099-07-10', end_date: '2099-07-10' }).receivables;
  assert.equal(debt.total_due, 0);
  assert.equal(debt.total_paid, 5000000);
  assert.equal(getUnpaidTripsByCustomer({ customerName: customer, user }).total_unpaid_trips, 0);
  assert.throws(() => batchPayTrips({ tripIds: [a.id], user }), /đã ở trạng thái DA_TT/);
  // Cuốc có khoản đối trừ không được thu gộp (tránh biến đối trừ thành tiền thu)
  const c = createTrip({ tripData: { trip_date: '2099-07-12', customer_name: customer, base_revenue: 1000000 }, user });
  const rowC = listEntity('trips').find(t => t.id === c.id);
  saveEntity('trips', c.id, { offset_amount: 200000 }, rowC._version, user, 'Đối trừ một phần');
  assert.throws(() => batchPayTrips({ tripIds: [c.id], user }), /đối trừ/);
  assert.equal(listEntity('trips').find(t => t.id === c.id).customer_payment_status, 'CHUA_TT');
});

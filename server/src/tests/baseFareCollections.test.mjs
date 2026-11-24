import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-fare-collections-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DB_PATH: path.join(temp, 'isolated.db'),
  GROUP_ALLOCATIONS_PATH: path.join(temp, 'groups.json'),
  JWT_SECRET: randomBytes(48).toString('hex'),
  SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SECRET_KEY: '',
});
new DatabaseSync(process.env.DB_PATH).close();
const { db } = await import('../db/database.js');
const { calculatePL } = await import('../services/plEngine.service.js');
const { getDriverKpiProgress, getDriverDrilldown } = await import('../services/kpi.service.js');
const { getPayrollSummary } = await import('../services/payroll.service.js');
const { answerDirector } = await import('../services/directorAssistant.core.js');
const { computeAggregateMetrics, calculateFareBreakdown } = await import('../../../client/src/utils/tripFinancials.js');

const now = '2099-01-01T00:00:00.000Z';
db.prepare('INSERT INTO drivers(id,full_name,kpi_target,created_at,updated_at) VALUES(?,?,?,?,?)')
  .run('base-fare-driver', 'TEST BASE FARE', 4000000, now, now);
const insert = db.prepare(`INSERT INTO trips(id,trip_code,trip_date,customer_name,driver_id,vehicle_plate,route_name,
  trip_revenue,vat_amount,total_revenue,driver_salary,status,eir_paid_status,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const [id, status, paid] of [['unpaid', 'COMPLETED', 'CHUA_TT'], ['paid', 'PAID', 'DA_TT'], ['eir-paid', 'COMPLETED', 'DA_TT']]) {
  insert.run(id, id, '2099-01-10', 'TEST CUSTOMER', 'base-fare-driver', 'TEST-PLATE', 'TEST ROUTE',
    1000000, 80000, 1080000, 100000, status, paid, now, now);
}
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('P&L expected, collected and remaining fare exclude VAT', () => {
  const p = calculatePL({ month: '2099-01' });
  assert.equal(p.cash_flow.expected_revenue, 3000000);
  assert.equal(p.cash_flow.actual_revenue, 2000000);
  assert.equal(p.cash_flow.pending_receivables, 1000000);
  assert.equal(p.cash_flow.collection_rate_percent, 67);
});
test('all P&L breakdowns use the same customer fare basis', () => {
  const b = calculatePL({ month: '2099-01' }).breakdowns;
  assert.equal(b.vehicles[0].revenue, 3000000);
  assert.equal(b.customers[0].total_revenue, 3000000);
  assert.equal(b.customers[0].collected_revenue, 2000000);
  assert.equal(b.customers[0].receivable, 1000000);
  assert.equal(b.routes[0].total_revenue, 3000000);
  assert.equal(b.drivers[0].total_revenue, 3000000);
  assert.equal(b.drivers[0].collected_revenue, 2000000);
});
test('KPI target is compared to base fare and is not automatically changed', () => {
  const k = getDriverKpiProgress({ month: '2099-01' });
  const d = k.drivers.find(d => d.driver_id === 'base-fare-driver');
  assert.equal(d.actual_revenue, 3000000);
  assert.equal(d.collected_revenue, 2000000);
  assert.equal(d.kpi_percent, 75);
  assert.equal(d.kpi_target, 4000000);
});
test('KPI drilldown shows base fare while retaining VAT comparison', () => {
  const d = getDriverDrilldown({ driverId: 'base-fare-driver', month: '2099-01' });
  assert.equal(d.summary.total_revenue, 3000000);
  assert.equal(d.trips[0].total_revenue, 1000000);
  assert.equal(d.trips[0].total_revenue_with_vat, 1080000);
});
test('payroll uses base-fare revenue without changing trip wages', () => {
  const p = getPayrollSummary({ periodMonth: '2099-01' });
  assert.equal(p.summary.total_revenue_generated, 3000000);
  const d = p.drivers.find(d => d.driver_id === 'base-fare-driver');
  assert.equal(d.total_revenue, 3000000);
  assert.equal(d.collected_revenue, 2000000);
  assert.equal(d.trip_salary, 300000);
});
const period = { startDate: '2099-01-01', endDate: '2099-01-31', kind: 'custom', label: 'TEST' };
function answer(received, offset, status = 'CHUA_TT') {
  return answerDirector({ message: 'Công nợ khách TEST CUSTOMER', viewContext: { period }, now: new Date(now),
    data: { groups: [], rows: [{ id: 'test-debt', trip_date: '2099-01-10', customer_name: 'TEST CUSTOMER',
      cuoc_goc: 1000000, cuoc_vao: 1000000, direct_cost: 0, received_amount: received,
      offset_amount: offset, customer_payment_status: status }] } }).response;
}
test('assistant reports unpaid fare of 1M instead of 1.08M', () => {
  const a = answer(0, 0);
  assert.equal(a.metrics.receivable_due, 1000000);
  assert.equal(a.items[0].due, 1000000);
  assert.match(a.reply, /khách không trả VAT/);
});
test('partial receipt and offset reduce base-fare debt, regardless of status label', () => {
  assert.equal(answer(400000, 100000).metrics.receivable_due, 500000);
  assert.equal(answer(400000, 100000, 'DA_TT').metrics.receivable_due, 500000);
});
test('full base-fare payment clears debt without a VAT remainder', () => {
  assert.equal(answer(1000000, 0).metrics.receivable_due, 0);
  assert.equal(answer(0, 1000000, 'DOI_TRU').metrics.receivable_due, 0);
});
test('historical overpayments are not rewritten or converted to negative debt', () => {
  const a = answer(1080000, 0, 'DA_TT');
  assert.equal(a.metrics.received, 1080000);
  assert.equal(a.metrics.receivable_due, 0);
});
test('CFO customer debt agrees with assistant and keeps EIR advances separate', () => {
  const m = computeAggregateMetrics([{ cuoc_goc: 1000000, received_amount: 400000,
    offset_amount: 100000, phoi_total_advance: 300000, phoi_balance_due: 200000 }]);
  assert.equal(m.totalConPhaiThuKhach, 500000);
  assert.equal(m.totalDaThuKhach, 400000);
  assert.equal(m.totalDoiTruKhach, 100000);
  assert.equal(m.totalPhoiConPhaiThu, 200000);
});
test('VAT and the existing internal 17% margin basis are unchanged', () => {
  const f = calculateFareBreakdown(1000000);
  assert.equal(f.vat_amount, 80000);
  assert.equal(f.cuoc_co_vat, 1080000);
  assert.equal(f.khoan_tru_17, 183600);
  assert.equal(f.cuoc_sau_tru_17, 896400);
  const m = computeAggregateMetrics([{ cuoc_goc: 1000000, received_amount: 1000000 }]);
  assert.equal(m.totalChenhLechSauTru17, 896400);
  assert.equal(m.totalConPhaiThuKhach, 0);
});
test('persisted trip VAT totals and payment states remain intact', () => {
  assert.equal(db.prepare('SELECT SUM(total_revenue) AS amount FROM trips').get().amount, 3240000);
  assert.equal(db.prepare("SELECT status FROM trips WHERE id='paid'").get().status, 'PAID');
});

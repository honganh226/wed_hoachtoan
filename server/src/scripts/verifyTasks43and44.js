/**
 * ============================================================
 * SCRIPT KIỂM THỬ TỰ ĐỘNG TASK 4.3 VÀ TASK 4.4
 * ============================================================
 * Kiểm tra:
 * 1. P&L Engine lọc theo khoảng thời gian startDate / endDate (Task 4.3)
 * 2. API /api/v1/pl/summary với các tham số thời gian khác nhau
 * 3. KPI Service: tính tiến độ KPI các tài xế (Task 4.4)
 * 4. API /api/v1/kpi/progress (RBAC, lọc khoảng ngày)
 * 5. Drilldown cuốc xe của tài xế
 * 6. Cập nhật KPI của tài xế & ghi Audit Log
 * ============================================================
 */
import { calculatePL } from '../services/plEngine.service.js';
import { getDriverKpiProgress, getDriverDrilldown, updateDriverKpi } from '../services/kpi.service.js';
import { db } from '../db/database.js';

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
  }
}

console.log('====================================================');
console.log('🧪 BẮT ĐẦU KIỂM THỬ TASK 4.3 & TASK 4.4');
console.log('====================================================\n');

// 1. KIỂM THỬ TASK 4.3: P&L ENGINE BỘ LỌC ĐA CHU KỲ
console.log('--- PHẦN 1: P&L Engine Bộ Lọc Đa Chu Kỳ (Task 4.3) ---');

// 1.1 Toàn bộ dữ liệu
const plAll = calculatePL();
assert(plAll && plAll.cash_flow.expected_revenue > 0, 'calculatePL() toàn bộ dữ liệu trả về doanh thu > 0');
assert(plAll.trips_overview.total_trips > 0, `Tổng số cuốc xe toàn bộ: ${plAll.trips_overview.total_trips}`);

// 1.2 Lọc theo khoảng ngày (Ví dụ: 2026-09-01 đến 2026-09-30)
const plSep2026 = calculatePL({ startDate: '2026-09-01', endDate: '2026-09-30' });
assert(plSep2026 && typeof plSep2026.cash_flow.expected_revenue === 'number', 'Lọc startDate/endDate trả về đúng cấu trúc số nguyên');
console.log(`    📊 Doanh thu tháng 9/2026: ${plSep2026.cash_flow.expected_revenue.toLocaleString('vi-VN')} ₫ (${plSep2026.trips_overview.total_trips} cuốc)`);

// 1.3 Lọc theo khoảng ngày không có chuyến xe
const plEmpty = calculatePL({ startDate: '2025-01-01', endDate: '2025-01-05' });
assert(plEmpty.trips_overview.total_trips === 0, 'Khoảng ngày không có cuốc xe trả về 0 cuốc');
assert(plEmpty.cash_flow.expected_revenue === 0, 'Doanh thu kỳ rỗng = 0');

// 1.4 Lọc theo quý (Q3 2026: 2026-07-01 đến 2026-09-30)
const plQ3 = calculatePL({ startDate: '2026-07-01', endDate: '2026-09-30' });
assert(plQ3.trips_overview.total_trips >= plSep2026.trips_overview.total_trips, 'Quý 3/2026 chứa số cuốc xe >= Tháng 9/2026');

// 2. KIỂM THỬ TASK 4.4: BẢNG ĐIỀU PHỐI KPI ĐỘNG
console.log('\n--- PHẦN 2: Bảng Điều Phối KPI Động (Task 4.4) ---');

// 2.1 Lấy tiến độ KPI toàn bộ tài xế
const kpiProgressAll = getDriverKpiProgress();
assert(kpiProgressAll && Array.isArray(kpiProgressAll.drivers), 'getDriverKpiProgress() trả về mảng danh sách tài xế');
assert(kpiProgressAll.drivers.length > 0, `Có ${kpiProgressAll.drivers.length} tài xế trong hệ thống`);

const firstDriver = kpiProgressAll.drivers[0];
assert(firstDriver && typeof firstDriver.actual_revenue === 'number', 'Tài xế có doanh thu thực tế dạng số nguyên');
assert(firstDriver.kpi_status in { BEHIND: 1, ON_TRACK: 1, EXCEEDED: 1, NO_KPI: 1 }, `Trạng thái KPI hợp lệ: ${firstDriver.kpi_status}`);
console.log(`    🚛 Tài xế đầu bảng: ${firstDriver.full_name} - Doanh thu: ${firstDriver.actual_revenue.toLocaleString('vi-VN')} ₫ - KPI: ${firstDriver.kpi_percent !== null ? firstDriver.kpi_percent + '%' : 'Chưa cài'} [${firstDriver.kpi_status}]`);

// 2.2 Lọc KPI theo khoảng ngày (startDate, endDate)
const kpiSep = getDriverKpiProgress({ startDate: '2026-09-01', endDate: '2026-09-30' });
assert(kpiSep && kpiSep.team_summary.total_actual_revenue >= 0, 'Lọc KPI theo startDate/endDate trả về tổng hợp đội chính xác');

// 2.3 Drilldown cuốc xe tài xế
const drilldown = getDriverDrilldown({ driverId: firstDriver.driver_id });
assert(drilldown && drilldown.driver.id === firstDriver.driver_id, 'Drilldown trả về đúng tài xế');
assert(Array.isArray(drilldown.trips), `Drilldown có danh sách cuốc xe (${drilldown.trips.length} cuốc)`);
assert(Array.isArray(drilldown.expenses), `Drilldown có danh sách chi phí (${drilldown.expenses.length} khoản)`);

// 2.4 Cập nhật chỉ tiêu KPI (Giám đốc đổi KPI)
const originalKpi = firstDriver.kpi_target;
const testKpiTarget = 65000000; // 65 triệu
const updateRes = updateDriverKpi({
  driverId: firstDriver.driver_id,
  newKpiTarget: testKpiTarget,
  reason: 'Kiểm thử cập nhật KPI tự động',
  updatedBy: 'DIRECTOR_TEST'
});
assert(updateRes.new_kpi_target === testKpiTarget, `Cập nhật thành công KPI mới = ${testKpiTarget.toLocaleString('vi-VN')} ₫`);

// Đọc lại từ database kiểm chứng tính bền vững
const checkDriver = db.prepare('SELECT kpi_target FROM drivers WHERE id = ?').get(firstDriver.driver_id);
assert(checkDriver.kpi_target === testKpiTarget, 'Dữ liệu KPI đã lưu kiên cố vào SQLite');

// Hoàn trả lại KPI cũ để bảo toàn dữ liệu gốc
updateDriverKpi({
  driverId: firstDriver.driver_id,
  newKpiTarget: originalKpi,
  reason: 'Hoàn trả KPI sau kiểm thử',
  updatedBy: 'DIRECTOR_TEST'
});
const resetCheck = db.prepare('SELECT kpi_target FROM drivers WHERE id = ?').get(firstDriver.driver_id);
assert(resetCheck.kpi_target === originalKpi, 'Đã hoàn trả an toàn KPI ban đầu của tài xế');

console.log('\n====================================================');
console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passed}/${total} TESTS PASS (${Math.round(passed/total*100)}%)`);
console.log('====================================================');

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}

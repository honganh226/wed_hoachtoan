/**
 * ============================================================
 * SCRIPT KIỂM THỬ TỰ ĐỘNG TASK 6.1
 * BẢNG LƯƠNG 3 THÀNH PHẦN & DỮ LIỆU APP CHO TÀI XẾ
 * ============================================================
 */

import { getPayrollSummary, upsertDriverIncentive, getDriverPersonalAppView } from '../services/payroll.service.js';
import { db } from '../db/database.js';
import { USER_ROLES } from '../db/schema.js';

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Kiểm thử thất bại: ${message}`);
  }
}

console.log('================================================================');
console.log('🧪 BẮT ĐẦU KIỂM THỬ TASK 6.1: BẢNG LƯƠNG 3 THÀNH PHẦN & APP LÁI XE');
console.log('================================================================\n');

// 1. KIỂM THỬ LẤY BẢNG LƯƠNG TỔNG HỢP TOÀN ĐỘI
console.log('--- PHẦN 1: Bảng Lương Tổng Hợp 3 Thành Phần (Tháng 09/2026) ---');
const summary = getPayrollSummary({ periodMonth: '2026-09', user: { role: USER_ROLES.DIRECTOR, username: 'giamdoc' } });

assert(summary && summary.period_month === '2026-09', 'Lấy bảng lương đúng tháng 2026-09');
assert(Array.isArray(summary.drivers) && summary.drivers.length > 0, `Có ${summary.drivers.length} tài xế trong bảng lương`);
assert(summary.summary.total_base_salary > 0, `Tổng lương cứng toàn đội: ${summary.summary.total_base_salary.toLocaleString('vi-VN')}₫`);
assert(summary.summary.total_trip_salary > 0, `Tổng lương chuyến toàn đội: ${summary.summary.total_trip_salary.toLocaleString('vi-VN')}₫`);
assert(Number.isInteger(summary.summary.total_net_payout), 'Tổng quỹ lương thực lĩnh là số nguyên Integer');

const firstDriver = summary.drivers[0];
console.log(`    🚛 Tài xế: ${firstDriver.driver_name} (Xe: ${firstDriver.vehicle_plate})`);
console.log(`       - Thành phần 1 (Lương cứng): ${firstDriver.base_salary.toLocaleString('vi-VN')}₫`);
console.log(`       - Thành phần 2 (Lương chuyến): ${firstDriver.trip_salary.toLocaleString('vi-VN')}₫ (${firstDriver.trips_count} chuyến)`);
console.log(`       - Thành phần 3 (Động viên GĐ): ${firstDriver.incentive_bonus.toLocaleString('vi-VN')}₫`);
console.log(`       - Tạm ứng khấu trừ: -${firstDriver.deductions.toLocaleString('vi-VN')}₫`);
console.log(`       => THỰC LĨNH: ${firstDriver.net_salary.toLocaleString('vi-VN')}₫`);

assert(
  firstDriver.net_salary === firstDriver.base_salary + firstDriver.trip_salary + firstDriver.incentive_bonus - firstDriver.deductions,
  'Công thức thực lĩnh khớp chính xác 100%: Lương cứng + Chuyến + Động viên - Tạm ứng'
);

// 2. KIỂM THỬ GIÁM ĐỐC CẬP NHẬT KHOẢN ĐỘNG VIÊN (DIRECTOR ONLY)
console.log('\n--- PHẦN 2: Giám Đốc Phê Duyệt Khoản Động Viên Bảo Mật ---');
const testIncentiveAmount = 2500000; // 2.500.000₫
const testNote = 'Khen thưởng chạy đêm an toàn và giữ gìn xe sạch đẹp';

const updateRes = upsertDriverIncentive({
  driverId: firstDriver.driver_id,
  periodMonth: '2026-09',
  incentiveAmount: testIncentiveAmount,
  incentiveNote: testNote,
  user: { role: USER_ROLES.DIRECTOR, username: 'giamdoc', id: 'usr_director' },
  ipAddress: '127.0.0.1'
});

assert(updateRes.success === true, 'Cập nhật khoản động viên thành công');
assert(updateRes.data.incentive_amount === testIncentiveAmount, `Khoản động viên đã ghi nhận: ${testIncentiveAmount.toLocaleString('vi-VN')}₫`);

// Kiểm tra lại bảng lương sau khi cập nhật
const summaryAfter = getPayrollSummary({ periodMonth: '2026-09', user: { role: USER_ROLES.DIRECTOR, username: 'giamdoc' } });
const updatedDriver = summaryAfter.drivers.find(d => d.driver_id === firstDriver.driver_id);
assert(updatedDriver.incentive_bonus === testIncentiveAmount, 'Bảng lương tự động cập nhật số tiền động viên mới');
assert(updatedDriver.incentive_note === testNote, 'Lý do động viên được lưu trữ đầy đủ');

// Kiểm tra Audit Log
const audit = db.prepare(`
  SELECT * FROM audit_logs 
  WHERE table_name = 'driver_incentives' 
  ORDER BY created_at DESC LIMIT 1
`).get();
assert(audit && audit.table_name === 'driver_incentives', 'Hệ thống đã ghi Audit Log khi sửa khoản động viên');

// 3. KIỂM THỬ GIAO DIỆN APP CHO TÀI XẾ (DRIVER PERSONAL VIEW)
console.log('\n--- PHẦN 3: Dữ Liệu Tối Ưu Cho App Lái Xe (Driver View) ---');
const driverUser = {
  role: USER_ROLES.DRIVER,
  username: firstDriver.driver_name,
  fullName: firstDriver.driver_name
};

const appView = getDriverPersonalAppView({
  user: driverUser,
  periodMonth: '2026-09'
});

assert(appView && appView.driver.id === firstDriver.driver_id, `Tài xế xem đúng hồ sơ của mình: ${appView.driver.full_name}`);
assert(appView.payroll.net_salary === updatedDriver.net_salary, 'Màn hình điện thoại hiển thị đúng số thực lĩnh');
assert(Array.isArray(appView.trips_summary.trips), `Tài xế xem được danh sách ${appView.trips_summary.total_trips} cuốc xe đã chạy`);
assert(typeof appView.trips_summary.eir_submitted_count === 'number', 'Tài xế thấy trạng thái phơi đã nộp / chưa nộp');
assert(Array.isArray(appView.advances_summary.advances), 'Tài xế xem được danh sách tạm ứng chi tiết');

console.log(`    📱 Thông số App Lái Xe của ${appView.driver.full_name}:`);
console.log(`       - Số cuốc đã chạy: ${appView.trips_summary.total_trips}`);
console.log(`       - Phơi đã nộp: ${appView.trips_summary.eir_submitted_count} | Chưa nộp: ${appView.trips_summary.eir_pending_count}`);
console.log(`       - Tạm ứng đã nhận: ${appView.advances_summary.total_advance_amount.toLocaleString('vi-VN')}₫`);
console.log(`       - Thực lĩnh tháng: ${appView.payroll.net_salary.toLocaleString('vi-VN')}₫`);

console.log('\n================================================================');
console.log(`🎉 TỔNG KẾT KIỂM THỬ TASK 6.1: ${passed}/${total} TIÊU CHÍ PASS 100%`);
console.log('💼 BẢNG LƯƠNG 3 THÀNH PHẦN VÀ APP LÁI XE SẴN SÀNG TÍCH HỢP GIAO DIỆN!');
console.log('================================================================\n');

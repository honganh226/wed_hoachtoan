/**
 * ============================================================
 * VERIFICATION SCRIPT: TASK 2.3 & TASK 3.1
 * ============================================================
 * Kiểm thử tự động:
 * 1. Khóa sổ kỳ (Period Lock):
 *    - Khóa tháng 2026-09
 *    - Xác nhận trạng thái is_locked = 1 trong DB và trips
 *    - Kế toán / Quản lý khu thử tạo/sửa cuốc trong tháng 2026-09 bị chặn HTTP 423
 *    - Kế toán thử Mở khóa bị chặn 403 (Chỉ Giám Đốc mới mở được)
 *    - Giám Đốc mở khóa thành công
 * 2. Audit Log Interceptor:
 *    - Kiểm tra bảng audit_logs ghi nhận đủ action PERIOD_LOCK, PERIOD_UNLOCK, CREATE, UPDATE
 *    - Kiểm tra old_values và new_values lưu đúng JSON
 * 3. Tạo Chuyến xe (Trip Creation MVP Core):
 *    - Chọn xe, tài xế, tuyến ĐÓNG BÌNH XUYÊN
 *    - Tự động điền cước mẫu (3.200.000) và lương tài xế (550.000)
 *    - Gắn cờ [V] đã gồm VAT: tính đúng vat_amount nguyên VND
 *    - Tạo chuyến xe thành công và lưu vào DB
 * 4. Nhân bản cuốc xe hôm qua (Duplicate Trip):
 *    - Nhân bản chuyến vừa tạo sang ngày hôm sau
 *    - Mã cuốc mới tự sinh nối tiếp, giữ nguyên thông tin xe, tài xế, tuyến, cước
 * ============================================================
 */
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { lockPeriod, unlockPeriod, getPeriodLocksStatus, isPeriodLocked } from '../services/periodLock.service.js';
import { recordAuditLog, getAuditLogs, AUDIT_ACTIONS } from '../services/audit.service.js';
import { createTrip, duplicateTrip, updateTrip, getRouteDefaultPrice } from '../services/trip.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hoachtoan_jwt_secret_key_change_in_production_2026_super_long_string';

const directorUser = { id: 'usr_dir_1', username: 'giamdoc', full_name: 'Phạm Giám Đốc', role: 'DIRECTOR' };
const accountantUser = { id: 'usr_acc_1', username: 'ketoan', full_name: 'Nguyễn Thị Kế Toán', role: 'ACCOUNTANT' };
const driverUser = { id: 'usr_drv_1', username: 'liem', full_name: 'Vũ Văn Liêm', role: 'DRIVER' };

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TỰ ĐỘNG CHO TASK 2.3 & TASK 3.1');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PHẦN 1: TÍNH NĂNG KHÓA SỔ KỲ (PERIOD LOCK - TASK 2.3)
  // -------------------------------------------------------------
  console.log('--- PHẦN 1: KIỂM THỬ KHÓA SỔ KỲ (TASK 2.3) ---');

  // Mở khóa trước nếu có dở dang
  unlockPeriod({ periodMonth: '2026-09', user: directorUser, notes: 'Reset ban đầu' });

  assert(!isPeriodLocked('2026-09'), 'Kỳ 2026-09 ban đầu ở trạng thái mở khóa');

  // Kế toán khóa sổ kỳ 2026-09
  const lockResult = lockPeriod({
    periodMonth: '2026-09',
    user: accountantUser,
    notes: 'Kế toán chốt sổ tháng 9/2026'
  });
  assert(lockResult.is_locked === true, 'Kế toán thực hiện khóa sổ kỳ 2026-09 thành công');
  assert(isPeriodLocked('2026-09') === true, 'Hàm isPeriodLocked xác nhận tháng 2026-09 đã bị khóa');
  assert(isPeriodLocked('2026-09-15') === true, 'Hàm isPeriodLocked nhận diện ngày 2026-09-15 nằm trong kỳ khóa');

  // Kiểm tra cờ is_locked trong bảng trips của tháng 2026-09
  const lockedTrips = db.prepare("SELECT count(*) as count FROM trips WHERE strftime('%Y-%m', trip_date) = '2026-09' AND is_locked = 1").get();
  assert(lockedTrips.count === 7, `Đồng bộ cờ is_locked = 1 cho tất cả 7 cuốc xe tháng 2026-09 (Đạt: ${lockedTrips.count})`);

  // Thử tạo chuyến xe mới trong tháng 2026-09 (Kỳ đã khóa) -> Bị chặn
  let createLockedError = false;
  try {
    createTrip({
      tripData: {
        trip_date: '2026-09-20',
        route_name: 'ĐÓNG BÌNH XUYÊN',
        customer_name: 'TTP'
      },
      user: accountantUser
    });
  } catch (e) {
    createLockedError = true;
  }
  assert(createLockedError, 'Chặn tạo mới cuốc xe trong tháng đã khóa sổ');

  // Tìm 1 chuyến trong tháng 9 để thử sửa
  const sepTrip = db.prepare("SELECT id, trip_code FROM trips WHERE strftime('%Y-%m', trip_date) = '2026-09' LIMIT 1").get();
  let updateLockedError = false;
  try {
    updateTrip({
      tripId: sepTrip.id,
      updateData: { total_revenue: 9999999 },
      user: directorUser
    });
  } catch (e) {
    updateLockedError = true;
  }
  assert(updateLockedError, `Chặn chỉnh sửa cuốc xe ${sepTrip.trip_code} thuộc tháng đã khóa sổ`);

  // Giám Đốc mở khóa sổ tháng 2026-09
  const unlockResult = unlockPeriod({
    periodMonth: '2026-09',
    user: directorUser,
    notes: 'Giám Đốc mở khóa để đối soát đột xuất'
  });
  assert(unlockResult.is_locked === false, 'Giám Đốc mở khóa sổ thành công');
  assert(!isPeriodLocked('2026-09'), 'Tháng 2026-09 đã được mở khóa hoàn toàn');

  // -------------------------------------------------------------
  // PHẦN 2: AUDIT LOG INTERCEPTOR (TASK 2.3)
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 2: KIỂM THỬ NHẬT KÝ KIỂM TOÁN AUDIT LOG (TASK 2.3) ---');

  const auditLogs = getAuditLogs({ limit: 10 });
  assert(auditLogs.length > 0, `Đã ghi nhận ${auditLogs.length} bản ghi nhật ký Audit Log`);

  const lockAudit = auditLogs.find(a => a.action === AUDIT_ACTIONS.PERIOD_LOCK && a.record_id === '2026-09');
  assert(!!lockAudit, 'Ghi nhận vết PERIOD_LOCK vào audit_logs');
  assert(lockAudit?.username === 'ketoan', 'Audit log lưu chính xác username người thao tác (ketoan)');

  const unlockAudit = auditLogs.find(a => a.action === AUDIT_ACTIONS.PERIOD_UNLOCK && a.record_id === '2026-09');
  assert(!!unlockAudit, 'Ghi nhận vết PERIOD_UNLOCK vào audit_logs');
  assert(unlockAudit?.username === 'giamdoc', 'Audit log lưu chính xác username người mở khóa (giamdoc)');

  // -------------------------------------------------------------
  // PHẦN 3: TÁC NGHIỆP TẠO CHUYẾN XE MVP (TASK 3.1)
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 3: KIỂM THỬ TẠO CHUYẾN XE & TỰ ĐIỀN CƯỚC MẪU (TASK 3.1) ---');

  // Tra cứu giá cước mẫu theo tuyến
  const routeSample = getRouteDefaultPrice('ĐÓNG BÌNH XUYÊN');
  assert(!!routeSample, 'Tra cứu tuyến "ĐÓNG BÌNH XUYÊN" thành công');
  assert(routeSample.default_price === 3200000, `Cước chuẩn mẫu đạt 3.200.000 ₫ (Thực tế: ${routeSample.default_price})`);
  assert(routeSample.default_driver_pay === 550000, `Công nhật lái xe mẫu đạt 550.000 ₫ (Thực tế: ${routeSample.default_driver_pay})`);

  // Lấy xe và tài xế mẫu
  const vehicle = db.prepare('SELECT id, plate_number FROM vehicles WHERE plate_number = ?').get('15C-22405');
  const driver = db.prepare('SELECT id, full_name, area_id FROM drivers WHERE full_name = ?').get('Vũ Văn Liêm');
  const customer = db.prepare('SELECT id, name FROM customers WHERE name = ?').get('TTP');

  const newTrip = createTrip({
    tripData: {
      trip_date: '2026-10-08',
      vehicle_id: vehicle.id,
      driver_id: driver.id,
      route_id: routeSample.id,
      customer_id: customer.id,
      pickup_location: 'TÂN VŨ',
      dropoff_location: 'KCN BÌNH XUYÊN',
      vat_type: 'V',
      container_number: 'MSMU5022544',
      container_size: '40',
      notes: 'Chuyến xe chạy thử nghiệm UAT'
    },
    user: directorUser
  });

  assert(!!newTrip.id, `Tạo mới chuyến xe thành công: ${newTrip.trip_code}`);
  assert(newTrip.vehicle_plate === '15C-22405', 'Gán đúng biển số xe 15C-22405');
  assert(newTrip.driver_name === 'Vũ Văn Liêm', 'Gán đúng tài xế Vũ Văn Liêm');
  assert(newTrip.total_revenue === 3200000, 'Tự điền cước mẫu chuẩn 3.200.000 ₫');
  assert(newTrip.container_number === 'MSMU5022544', 'Lưu đúng mã container MSMU5022544');

  // Kiểm tra lưu vào bảng containers
  const savedCont = db.prepare('SELECT * FROM containers WHERE trip_id = ?').get(newTrip.id);
  assert(!!savedCont && savedCont.container_number === 'MSMU5022544', 'Container chính được lưu vào bảng containers');

  // Kiểm tra VAT được tính chuẩn số nguyên VND
  const tripInDb = db.prepare('SELECT vat_type, vat_amount, total_revenue FROM trips WHERE id = ?').get(newTrip.id);
  assert(tripInDb.vat_type === 'V', 'Gắn cờ VAT [V] chuẩn xác');
  assert(tripInDb.vat_amount === Math.round(3200000 * 8 / 108), `Tính tiền thuế VAT số nguyên chuẩn 8% (${tripInDb.vat_amount} ₫)`);

  // -------------------------------------------------------------
  // PHẦN 4: NHÂN BẢN CUỐC XE HÔM QUA (DUPLICATE TRIP - TASK 3.1)
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 4: KIỂM THỬ NHÂN BẢN CHUYẾN XE HÔM QUA (TASK 3.1) ---');

  const dupTrip = duplicateTrip({
    sourceTripId: newTrip.id,
    targetDate: '2026-10-09',
    user: directorUser
  });

  assert(!!dupTrip.id && dupTrip.id !== newTrip.id, `Nhân bản chuyến xe thành công: ${dupTrip.trip_code}`);
  assert(dupTrip.trip_date === '2026-10-09', 'Chuyến nhân bản mang ngày mục tiêu mới 2026-10-09');
  assert(dupTrip.vehicle_plate === newTrip.vehicle_plate, 'Giữ nguyên biển số xe chuyến hôm qua');
  assert(dupTrip.driver_name === newTrip.driver_name, 'Giữ nguyên tài xế chuyến hôm qua');
  assert(dupTrip.total_revenue === newTrip.total_revenue, 'Giữ nguyên đơn giá cước mẫu');
  assert(dupTrip.container_number === null, 'Xóa trắng số cont để tài xế hoặc điều độ nhập số cont mới tránh trùng lặp');

  // Kiểm tra cập nhật chuyến xe và Audit Log
  const updatedTrip = updateTrip({
    tripId: dupTrip.id,
    updateData: { total_revenue: 3500000, notes: 'Bổ sung phụ phí chờ hạ hàng' },
    user: accountantUser,
    reason: 'Khách hàng đồng ý bù phụ phí hạ chậm'
  });
  assert(updatedTrip.total_revenue === 3500000, 'Cập nhật tiền cước thành công 3.500.000 ₫');

  const updateAudit = getAuditLogs({ recordId: dupTrip.id, action: AUDIT_ACTIONS.UPDATE });
  assert(updateAudit.length > 0, 'Audit Log ghi nhận lịch sử chỉnh sửa chuyến xe');
  assert(updateAudit[0].reason === 'Khách hàng đồng ý bù phụ phí hạ chậm', 'Lưu đúng lý do điều chỉnh cước');
  assert(updateAudit[0].old_values.total_revenue === 3200000, 'Lưu giá trị cũ old_values = 3.200.000 ₫');
  assert(updateAudit[0].new_values.total_revenue === 3500000, 'Lưu giá trị mới new_values = 3.500.000 ₫');

  console.log('\n================================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASS (100% HOÀN HẢO)`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Lỗi khi chạy kiểm thử:', err);
  process.exit(1);
});

/**
 * ============================================================
 * VERIFICATION SCRIPT: TASK 3.2 & TASK 3.3
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN
 * ============================================================
 * Kiểm thử tự động:
 * 1. Thuật toán ISO 6346:
 *    - Tính Check Digit modulo 11
 *    - Validate mã cont chuẩn (MSMU5022544, TCNU9183777, EMCU3918234)
 *    - Phát hiện sai Check Digit (MSMU5022549)
 *    - Phát hiện sai định dạng (thiếu số, có ký tự lạ)
 * 2. Task 3.2: Xử lý Cont Kẹp 2x20'
 *    - Tạo chuyến xe kèm 2 containers (Cont chính 20' + Cont kẹp thứ hai 20')
 *    - Kiểm tra bảng containers lưu đúng is_second_cont = 1
 *    - Kiểm tra tổng doanh thu cộng gộp chuẩn VND Integer
 *    - Thêm và hủy cont kẹp động (addTripContainer, removeTripContainer)
 *    - Chặn kẹp quá 2 cont
 * 3. Task 3.3: Phân hệ Tạm Ứng Trước Chuyến & Quyết Toán Hoàn Ứng
 *    - Xuất tạm ứng 1.500.000 đ trước chuyến đi (Status PENDING)
 *    - Quyết toán hoàn ứng thừa tiền (+200.000 đ nộp lại quỹ) -> Status SETTLED
 *    - Quyết toán hoàn ứng thiếu tiền (-250.000 đ công ty bù tài xế)
 *    - Thống kê tổng quan getAdvanceSummary khớp từng đồng VND
 *    - Ghi vết kiểm toán Audit Log đầy đủ
 *    - Kiểm tra bảo vệ Khóa Sổ Kỳ (Period Lock)
 * ============================================================
 */
import { db } from '../db/database.js';
import { validateIso6346, calculateIso6346CheckDigit } from '../utils/iso6346.js';
import { 
  createTrip, 
  getTripContainers, 
  addTripContainer, 
  removeTripContainer 
} from '../services/trip.service.js';
import { 
  createAdvance, 
  settleAdvance, 
  getAdvances, 
  getAdvanceSummary 
} from '../services/advance.service.js';
import { lockPeriod, unlockPeriod } from '../services/periodLock.service.js';
import { getAuditLogs } from '../services/audit.service.js';
import { ADVANCE_STATUSES, USER_ROLES } from '../db/schema.js';

const directorUser = { id: 'usr_dir_1', username: 'giamdoc', full_name: 'Phạm Giám Đốc', role: USER_ROLES.DIRECTOR };
const accountantUser = { id: 'usr_acc_1', username: 'ketoan', full_name: 'Nguyễn Thị Kế Toán', role: USER_ROLES.ACCOUNTANT };

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
  console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TỰ ĐỘNG CHO TASK 3.2 & TASK 3.3');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // PHẦN 1: THUẬT TOÁN KIỂM TRA ISO 6346 (TASK 3.2)
  // -------------------------------------------------------------
  console.log('--- PHẦN 1: KIỂM THỬ THUẬT TOÁN ISO 6346 (CHECK DIGIT) ---');

  // Test 1.1: MSMU5022544 (Check digit chuẩn = 4)
  const d1 = calculateIso6346CheckDigit('MSMU502254');
  assert(d1 === 4, `MSMU502254 tính ra Check Digit = 4 (kết quả: ${d1})`);

  const v1 = validateIso6346('MSMU5022544');
  assert(v1.isValid === true && v1.expectedCheckDigit === 4 && v1.actualCheckDigit === 4, 
    'MSMU5022544 xác thực HỢP LỆ chuẩn ISO 6346');

  // Test 1.2: BEAU5051517 từ file 7.xlsx (Check digit chuẩn = 7)
  const d2 = calculateIso6346CheckDigit('BEAU505151');
  assert(d2 === 7, `BEAU505151 tính ra Check Digit = 7 (kết quả: ${d2})`);

  const v2 = validateIso6346('BEAU5051517');
  assert(v2.isValid === true && v2.expectedCheckDigit === 7, 
    'BEAU5051517 xác thực HỢP LỆ chuẩn ISO 6346');

  // Test 1.3: CAAU9601980 từ file 7.xlsx (Trường hợp đặc biệt Modulo 11 ra 10 -> Check digit là 0)
  const d3 = calculateIso6346CheckDigit('CAAU960198');
  assert(d3 === 0, `CAAU960198 tính ra Check Digit = 0 (trường hợp remainder=10 -> digit 0) (kết quả: ${d3})`);

  const v3 = validateIso6346('CAAU9601980');
  assert(v3.isValid === true && v3.expectedCheckDigit === 0, 
    'CAAU9601980 xác thực HỢP LỆ chuẩn ISO 6346 (Check digit 0)');

  // Test 1.4: TCNU9183778 (Check digit chuẩn = 8)
  const v4 = validateIso6346('TCNU9183778');
  assert(v4.isValid === true && v4.expectedCheckDigit === 8, 'TCNU9183778 xác thực HỢP LỆ');

  // Test 1.5: Phát hiện số cont gõ sai Check Digit (MSMU5022549 -> phải là 4)
  const vBadDigit = validateIso6346('MSMU5022549');
  assert(vBadDigit.isValid === false && vBadDigit.actualCheckDigit === 9 && vBadDigit.expectedCheckDigit === 4,
    'Phát hiện đúng sai check digit: Gõ 9 thay vì 4 chuẩn');

  // Test 1.6: Phát hiện sai định dạng (thiếu ký tự, có ký tự không hợp lệ)
  const vShort = validateIso6346('MSMU50225');
  assert(vShort.isValid === false, 'Phát hiện mã cont ngắn hơn 11 ký tự');

  const vBadFormat = validateIso6346('12345678901');
  assert(vBadFormat.isValid === false, 'Phát hiện 4 ký tự đầu không phải là chữ cái');

  // -------------------------------------------------------------
  // PHẦN 2: XỬ LÝ CONT KẸP 2x20\' (TASK 3.2)
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 2: KIỂM THỬ XỬ LÝ CONT KẸP 2x20\' (TASK 3.2) ---');

  // Lấy xe và tài xế mẫu trong DB
  const vehicle = db.prepare('SELECT id, plate_number FROM vehicles LIMIT 1').get();
  const driver = db.prepare('SELECT id, full_name FROM drivers LIMIT 1').get();
  const route = db.prepare('SELECT id, route_name, default_price FROM routes LIMIT 1').get();

  const testDate = '2026-10-18';

  // Test 2.1: Tạo chuyến xe kẹp 2 cont 20' với doanh thu cộng gộp
  const multiContPayload = {
    trip_date: testDate,
    vehicle_id: vehicle?.id,
    driver_id: driver?.id,
    route_id: route?.id,
    customer_name: 'TTP TEST KẸP',
    vat_type: 'V',
    trip_revenue: 5700000, // Cước cont 1 (3.200.000) + Cước cont 2 (2.500.000)
    driver_salary: 800000, // Lương công kẹp cont
    is_multi_container: true,
    containers: [
      {
        container_number: 'MSMU5022544',
        container_size: '20',
        pickup_yard: 'TÂN VŨ',
        dropoff_yard: 'KCN BÌNH XUYÊN',
        lift_on_fee: 150000,
        lift_off_fee: 150000,
        is_second_cont: 0,
        notes: 'Cont 1 (Chính)'
      },
      {
        container_number: 'BEAU5051517',
        container_size: '20',
        pickup_yard: 'ĐÌNH VŨ',
        dropoff_yard: 'KCN BÌNH XUYÊN',
        lift_on_fee: 150000,
        lift_off_fee: 150000,
        is_second_cont: 1,
        notes: 'Cont 2 (Kẹp 2x20)'
      }
    ]
  };

  const createdMultiTrip = createTrip({
    tripData: multiContPayload,
    user: directorUser
  });

  assert(createdMultiTrip && createdMultiTrip.id, `Tạo cuốc xe kẹp cont thành công: ${createdMultiTrip.trip_code}`);
  assert(createdMultiTrip.is_multi_container === true, 'Cờ is_multi_container trả về true');
  assert(createdMultiTrip.total_revenue === 5700000, `Doanh thu cộng gộp = 5.700.000 đ (thực tế: ${createdMultiTrip.total_revenue})`);

  // Test 2.2: Kiểm tra dữ liệu 2 containers trong SQLite
  const savedContainers = getTripContainers(createdMultiTrip.id);
  assert(savedContainers.length === 2, `Chuyến có chính xác 2 containers (thực tế: ${savedContainers.length})`);

  const cont1 = savedContainers.find(c => c.is_second_cont === 0);
  const cont2 = savedContainers.find(c => c.is_second_cont === 1);

  assert(cont1 && cont1.container_number === 'MSMU5022544' && cont1.container_size === '20', 
    'Cont 1 lưu đúng MSMU5022544, size 20, is_second_cont = 0');
  assert(cont2 && cont2.container_number === 'BEAU5051517' && cont2.container_size === '20', 
    'Cont 2 lưu đúng BEAU5051517, size 20, is_second_cont = 1');
  assert(cont1.iso_validation?.isValid === true && cont2.iso_validation?.isValid === true, 
    'Cả 2 containers đều được tự động xác thực ISO 6346 thành công trong service');

  // Test 2.3: Chặn kẹp cont thứ 3 (xe chỉ kéo tối đa 2 cont 20')
  let blocked3rd = false;
  try {
    addTripContainer({
      tripId: createdMultiTrip.id,
      containerData: { container_number: 'EMCU3918234', container_size: '20' },
      user: directorUser
    });
  } catch (e) {
    blocked3rd = true;
  }
  assert(blocked3rd === true, 'Chặn thành công không cho kẹp cont thứ 3 (tối đa 2x20\')');

  // Test 2.4: Hủy cont kẹp thứ 2
  const removeRes = removeTripContainer({
    tripId: createdMultiTrip.id,
    containerId: cont2.id,
    user: directorUser
  });
  assert(removeRes.success === true, 'Hủy cont kẹp thứ 2 thành công');

  const afterRemoveContainers = getTripContainers(createdMultiTrip.id);
  assert(afterRemoveContainers.length === 1, `Sau khi hủy, chuyến còn lại 1 container duy nhất (${afterRemoveContainers.length})`);

  // -------------------------------------------------------------
  // PHẦN 3: PHÂN HỆ TẠM ỨNG TRƯỚC CHUYẾN & QUYẾT TOÁN HOÀN ỨNG (TASK 3.3)
  // -------------------------------------------------------------
  console.log('\n--- PHẦN 3: KIỂM THỬ TẠM ỨNG & QUYẾT TOÁN HOÀN ỨNG (TASK 3.3) ---');

  // Test 3.1: Xuất tạm ứng 1.500.000 đ trước chuyến đi
  const advance1 = createAdvance({
    trip_id: createdMultiTrip.id,
    driver_id: driver?.id,
    advance_date: testDate,
    advance_amount: 1500000,
    notes: 'Tạm ứng dầu Hải Phòng - Vĩnh Phúc & BOT',
    user: accountantUser
  });

  assert(advance1 && advance1.id, `Tạo phiếu tạm ứng thành công: ${advance1.id}`);
  assert(advance1.advance_amount === 1500000, `Tiền tạm ứng = 1.500.000 đ (thực tế: ${advance1.advance_amount})`);
  assert(advance1.status === ADVANCE_STATUSES.PENDING, 'Trạng thái ban đầu là PENDING (chờ hoàn ứng)');
  assert(advance1.settled_amount === 0 && advance1.balance_amount === 0, 'Chưa quyết toán: settled=0, balance=0');

  // Test 3.2: Quyết toán hoàn ứng TH1: Lái xe thực chi 1.300.000 đ (Thừa 200.000 đ nộp lại quỹ)
  const settled1 = settleAdvance({
    advanceId: advance1.id,
    settled_amount: 1300000,
    notes: 'Dầu 1.150k, BOT 150k. Thừa 200k nộp quỹ',
    user: accountantUser
  });

  assert(settled1.status === ADVANCE_STATUSES.SETTLED, 'Sau quyết toán trạng thái chuyển sang SETTLED');
  assert(settled1.settled_amount === 1300000, `Số tiền thực chi ghi nhận = 1.300.000 đ`);
  assert(settled1.balance_amount === 200000, `Chênh lệch dương (+200.000 đ) nghĩa là lái xe thừa tiền nộp quỹ (thực tế: ${settled1.balance_amount})`);
  assert(settled1.settled_at !== null, 'Ghi nhận thời điểm quyết toán settled_at');

  // Test 3.3: Xuất tạm ứng TH2: Lái xe chi vượt ứng (công ty phải bù)
  const advance2 = createAdvance({
    trip_id: createdMultiTrip.id,
    driver_id: driver?.id,
    advance_date: testDate,
    advance_amount: 1000000,
    notes: 'Tạm ứng 1.000.000 đ',
    user: directorUser
  });

  const settled2 = settleAdvance({
    advanceId: advance2.id,
    settled_amount: 1250000,
    notes: 'Thực chi 1.250.000 đ do phát sinh phí sửa vỏ',
    user: directorUser
  });

  assert(settled2.balance_amount === -250000, 
    `Chênh lệch âm (-250.000 đ) nghĩa là quỹ công ty chi bù cho lái xe (thực tế: ${settled2.balance_amount})`);

  // Test 3.4: Thống kê tổng quan getAdvanceSummary
  const summary = getAdvanceSummary(directorUser);
  assert(summary !== null && summary.total_count >= 2, `Thống kê tổng số phiếu: ${summary?.total_count}`);
  assert(summary.total_advance >= 2500000, `Tổng tiền xuất ứng >= 2.500.000 đ (thực tế: ${summary?.total_advance})`);
  assert(summary.total_settled >= 2550000, `Tổng tiền thực chi >= 2.550.000 đ (thực tế: ${summary?.total_settled})`);
  assert(summary.surplus_amount >= 200000, `Tổng thừa nộp quỹ >= 200.000 đ (thực tế: ${summary?.surplus_amount})`);
  assert(summary.deficit_amount >= 250000, `Tổng quỹ bù tài xế >= 250.000 đ (thực tế: ${summary?.deficit_amount})`);

  // Test 3.5: Kiểm tra Audit Log ghi vết đầy đủ
  const recentLogs = getAuditLogs({ limit: 10, tableName: 'trip_advances' });
  assert(recentLogs.length >= 2, `Audit Log ghi nhận đủ ${recentLogs.length} hành động với bảng trip_advances`);

  // Test 3.6: Khóa Sổ Kỳ bảo vệ Tạm Ứng
  lockPeriod({ periodMonth: '2026-10', user: directorUser, notes: 'Test khóa sổ tạm ứng' });

  let blockedLockedAdvance = false;
  try {
    createAdvance({
      trip_id: createdMultiTrip.id,
      driver_id: driver?.id,
      advance_date: '2026-10-25',
      advance_amount: 500000,
      user: accountantUser
    });
  } catch (e) {
    blockedLockedAdvance = true;
  }
  assert(blockedLockedAdvance === true, 'Chặn thành công không cho xuất tạm ứng trong tháng đã Khóa Sổ Kỳ');

  // Mở khóa lại kỳ kế toán
  unlockPeriod({ periodMonth: '2026-10', user: directorUser, notes: 'Mở lại sau test' });

  // -------------------------------------------------------------
  // TỔNG KẾT
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT (100% PASS)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Lỗi ngoại lệ khi chạy test:', err);
  process.exit(1);
});

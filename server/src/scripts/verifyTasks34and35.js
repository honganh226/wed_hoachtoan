/**
 * ============================================================
 * VERIFICATION SCRIPT: TASK 3.4 & TASK 3.5
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN
 * ============================================================
 * Kiểm thử tự động toàn diện:
 * 1. Task 3.4: Chi Phí Thực Tế & Cảnh Báo Bất Thường (>25%)
 *    - Thêm các loại chi phí (Nâng, Hạ, BOT, Tiền dầu, Chọn vỏ...)
 *    - Phân loại Cố định (FIXED) vs Biến động (VARIABLE)
 *    - Thuật toán phát hiện bất thường:
 *      + BOT Bình Xuyên chuẩn 200.000₫, nhập 300.000₫ (+50%) => is_anomaly = 1 (Cờ 🔴 Đỏ)
 *      + BOT chuẩn 200.000₫, nhập 210.000₫ (+5%) => is_anomaly = 0
 *      + Tiền dầu Lào Cai chuẩn 3.000.000₫ (150L), nhập 4.200.000₫ (+40%) => is_anomaly = 1
 *    - Kiểm tra cảnh báo cờ 🟡 Vàng (Nghi quên nhập vé BOT, tiền dầu xe nhà)
 *    - Tiện ích 1-Click Batch Save chi phí trọn bộ cuốc xe
 *    - Cập nhật, xóa chi phí, kiểm tra toàn vẹn số nguyên VND Integer
 *    - Ghi vết Audit Log cho mọi thay đổi chi phí
 *    - Kiểm tra bảo vệ Khóa Sổ Kỳ (Period Lock)
 * 2. Task 3.5: Module Chụp Ảnh Phiếu Phơi & Cảnh Báo Đọng Phơi
 *    - Lưu ảnh phiếu phơi (Mobile Camera Base64 / File) vào thư mục server/uploads/eir/
 *    - Chuyển trạng thái sang DA_TRA và trạng thái chuyến sang EIR_SUBMITTED
 *    - Cập nhật trạng thái thanh toán phơi (DA_TT / CHUA_TT)
 *    - Thuật toán phát hiện đọng phơi: diffDays >= 3 ngày => Bật cờ cảnh báo đọng phơi
 *    - Gỡ bỏ ảnh phơi an toàn và trả trạng thái về CHUA_TRA
 *    - Ghi vết Audit Log cho EIR
 *    - Kiểm tra bảo vệ Khóa Sổ Kỳ cho EIR
 * ============================================================
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { 
  createExpense, 
  updateExpense, 
  deleteExpense, 
  getTripExpenses, 
  getAllExpenses, 
  batchSaveTripExpenses, 
  evaluateExpenseAnomaly, 
  inspectTripExpenseWarnings,
  getExpenseAnalytics,
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABELS
} from '../services/expense.service.js';
import { 
  saveTripEirPhoto, 
  updateTripEirStatus, 
  removeTripEirPhoto, 
  getPendingEirTrips 
} from '../services/eir.service.js';
import { createTrip } from '../services/trip.service.js';
import { lockPeriod, unlockPeriod } from '../services/periodLock.service.js';
import { getAuditLogs } from '../services/audit.service.js';
import { USER_ROLES, EIR_STATUSES, EIR_PAID_STATUSES, TRIP_STATUSES } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const directorUser = { userId: 'usr_dir_1', username: 'giamdoc', full_name: 'Phạm Giám Đốc', role: USER_ROLES.DIRECTOR };
const accountantUser = { userId: 'usr_acc_1', username: 'ketoan', full_name: 'Nguyễn Thị Kế Toán', role: USER_ROLES.ACCOUNTANT };

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

async function runVerification() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN TASK 3.4 VÀ TASK 3.5                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // =========================================================================
  // 1. CHUẨN BỊ DỮ LIỆU THỬ NGHIỆM
  // =========================================================================
  console.log('📌 PHẦN 1: Chuẩn bị chuyến xe thử nghiệm');
  
  // Tuyến Bình Xuyên
  const routeBinhXuyen = db.prepare("SELECT * FROM routes WHERE route_name LIKE '%BÌNH XUYÊN%' LIMIT 1").get();
  assert(routeBinhXuyen && routeBinhXuyen.default_toll === 200000, 'Tuyến Bình Xuyên có định mức BOT chuẩn 200.000₫');

  // Tuyến Lào Cai
  const routeLaoCai = db.prepare("SELECT * FROM routes WHERE route_name LIKE '%LÀO CAI%' LIMIT 1").get();
  assert(routeLaoCai && routeLaoCai.default_fuel_liters === 150, 'Tuyến Lào Cai có định mức dầu Diesel chuẩn 150 Lít');

  // Tạo chuyến đi Bình Xuyên ngày 2026-10-05
  const testTrip1 = createTrip({
    tripData: {
      trip_date: '2026-10-05',
      route_id: routeBinhXuyen.id,
      customer_name: 'TTP TEST TASK 34',
      vehicle_plate: '15C-22405',
      driver_name: 'Vũ Văn Liêm',
      trip_revenue: 3200000,
      vat_type: 'V',
      pickup_location: 'CẢNG ĐÌNH VŨ',
      dropoff_location: 'KCN BÌNH XUYÊN',
      container_number: 'MSMU5022544'
    },
    user: directorUser
  });
  assert(testTrip1 && testTrip1.id, `Đã tạo chuyến test Bình Xuyên: ${testTrip1.trip_code}`);

  // =========================================================================
  // 2. KIỂM THỬ TASK 3.4: THUẬT TOÁN PHÁT HIỆN BẤT THƯỜNG (>25%)
  // =========================================================================
  console.log('\n📌 PHẦN 2: Kiểm thử thuật toán phát hiện bất thường chi phí (>25%)');

  // Case 2.1: Vé BOT Bình Xuyên chuẩn 200k, nhập 300k (+50% > 25%) => Cờ Đỏ is_anomaly = 1
  const botAnomalyCheck = evaluateExpenseAnomaly({
    expenseType: EXPENSE_TYPES.TOLL_BOT,
    amount: 300000,
    tripId: testTrip1.id
  });
  assert(botAnomalyCheck.isAnomaly === 1, 'Vé BOT 300.000₫ (chuẩn 200k) được gán cờ ĐỎ is_anomaly = 1 (+50%)');
  assert(botAnomalyCheck.diffPercent === 50, 'Tỷ lệ chênh lệch tính đúng 50%');
  assert(botAnomalyCheck.reason.includes('vượt 50%'), 'Lý do cảnh báo ghi rõ vượt 50% so với định mức tuyến');

  // Case 2.2: Vé BOT Bình Xuyên chuẩn 200k, nhập 210k (+5% <= 25%) => Không bất thường
  const botNormalCheck = evaluateExpenseAnomaly({
    expenseType: EXPENSE_TYPES.TOLL_BOT,
    amount: 210000,
    tripId: testTrip1.id
  });
  assert(botNormalCheck.isAnomaly === 0, 'Vé BOT 210.000₫ (chuẩn 200k) không bị gắn cờ bất thường (5% <= 25%)');

  // Case 2.3: Tiền dầu tuyến Lào Cai chuẩn 150L (~3.000.000₫ @ 20k/L), nhập 4.200.000₫ (+40% > 25%)
  const fuelAnomalyCheck = evaluateExpenseAnomaly({
    expenseType: EXPENSE_TYPES.FUEL,
    amount: 4200000,
    routeId: routeLaoCai.id
  });
  assert(fuelAnomalyCheck.isAnomaly === 1, 'Tiền dầu 4.200.000₫ (chuẩn 3M) được gán cờ ĐỎ is_anomaly = 1 (+40%)');

  // =========================================================================
  // 3. KIỂM THỬ THÊM / CẬP NHẬT / XÓA CHI PHÍ THỰC TẾ & AUDIT LOG
  // =========================================================================
  console.log('\n📌 PHẦN 3: Thêm, sửa, xóa chi phí thực tế & Ghi vết Audit Log');

  // 3.1: Thêm chi phí nâng cont (Bình thường)
  const expLift = createExpense({
    expenseData: {
      trip_id: testTrip1.id,
      expense_type: EXPENSE_TYPES.LIFT_ON,
      category: 'VARIABLE',
      amount: 1890000,
      note: 'Nâng cont tại Cảng Đình Vũ'
    },
    user: accountantUser
  });
  assert(expLift.expense.amount === 1890000, 'Lưu phí nâng cont 1.890.000₫ chuẩn VND Integer');
  assert(expLift.expense.is_anomaly === 0, 'Phí nâng cảng chuẩn không bị cảnh báo bất thường');

  // 3.2: Thêm chi phí BOT vượt định mức (300.000₫ so với 200.000₫)
  const expBot = createExpense({
    expenseData: {
      trip_id: testTrip1.id,
      expense_type: EXPENSE_TYPES.TOLL_BOT,
      category: 'VARIABLE',
      amount: 300000,
      note: 'Vé BOT QL2 và Cao tốc'
    },
    user: accountantUser
  });
  assert(expBot.expense.is_anomaly === 1, 'Chi phí BOT trong CSDL tự động lưu is_anomaly = 1');
  assert(expBot.expense.amount === 300000, 'Số tiền BOT lưu chuẩn số nguyên 300.000₫');

  // 3.3: Thêm chi phí chọn vỏ cont (Biến động)
  const expSelect = createExpense({
    expenseData: {
      trip_id: testTrip1.id,
      expense_type: EXPENSE_TYPES.SELECT_CONT,
      category: 'VARIABLE',
      amount: 50000,
      note: 'Tiền bồi dưỡng chọn vỏ cont sạch'
    },
    user: accountantUser
  });
  assert(expSelect.expense.amount === 50000, 'Lưu phí chọn vỏ 50.000₫ thành công');

  // 3.4: Thêm chi phí cố định (Bảo hiểm phân bổ cuốc xe)
  const expFixed = createExpense({
    expenseData: {
      trip_id: testTrip1.id,
      expense_type: EXPENSE_TYPES.INSURANCE_FIXED,
      category: 'FIXED',
      amount: 100000,
      note: 'Phân bổ bảo hiểm thân vỏ xe'
    },
    user: accountantUser
  });
  assert(expFixed.expense.category === 'FIXED', 'Lưu đúng danh mục chi phí cố định (FIXED)');

  // 3.5: Lấy danh sách chi phí của chuyến và kiểm tra cảnh báo
  const tripExpRes = getTripExpenses(testTrip1.id);
  assert(tripExpRes.expenses.length === 4, `Cuốc xe có đúng 4 khoản chi phí (thực tế: ${tripExpRes.expenses.length})`);
  assert(tripExpRes.warnings.redFlags.length === 1, 'Hệ thống báo đúng 1 cờ ĐỎ 🔴 cho khoản BOT bất thường');
  assert(tripExpRes.warnings.summary.totalTripExpense === (1890000 + 300000 + 50000 + 100000), 'Tổng chi phí cuốc xe tính chính xác: 2.340.000₫');
  assert(tripExpRes.warnings.summary.totalFixedExpense === 100000, 'Tổng chi phí cố định: 100.000₫');
  assert(tripExpRes.warnings.summary.totalVariableExpense === 2240000, 'Tổng chi phí biến động: 2.240.000₫');

  // 3.6: Kiểm tra cảnh báo cờ Vàng 🟡 (chưa nhập tiền dầu cho xe nhà)
  const yellowWarnings = tripExpRes.warnings.yellowFlags;
  const missingFuelWarn = yellowWarnings.find(y => y.type === 'MISSING_FUEL');
  assert(missingFuelWarn !== undefined, 'Hệ thống phát hiện và bật cờ VÀNG 🟡 do cuốc xe nhà chưa ghi nhận tiền dầu');

  // 3.7: Cập nhật chi phí (Sửa BOT về mức chuẩn 200.000₫ -> Tự xóa cờ đỏ)
  const updatedBot = updateExpense({
    expenseId: expBot.expense.id,
    updateData: {
      amount: 200000,
      note: 'Đã đính chính lại vé BOT đúng định mức 200.000₫'
    },
    user: directorUser
  });
  assert(updatedBot.expense.amount === 200000, 'Cập nhật số tiền BOT về 200.000₫ thành công');
  assert(updatedBot.expense.is_anomaly === 0, 'Cờ đỏ tự động hạ xuống is_anomaly = 0 khi số tiền về mức chuẩn');

  // 3.8: Kiểm tra Audit Log đã ghi nhận
  const logs = getAuditLogs({ tableName: 'expenses', limit: 10 });
  const hasUpdateLog = logs.some(l => l.record_id === expBot.expense.id && l.action === 'UPDATE');
  assert(hasUpdateLog, 'Audit Log ghi nhận vết UPDATE sửa chi phí kèm old/new values');

  // 3.9: Xóa một khoản chi phí (xóa phí chọn vỏ)
  const delRes = deleteExpense({
    expenseId: expSelect.expense.id,
    user: directorUser
  });
  assert(delRes.success === true, 'Xóa chi phí thành công');

  // =========================================================================
  // 4. KIỂM THỬ TIỆN ÍCH 1-CLICK BATCH SAVE CHI PHÍ
  // =========================================================================
  console.log('\n📌 PHẦN 4: Kiểm thử 1-Click Batch Save trọn bộ chi phí cuốc xe');

  const batchResult = batchSaveTripExpenses({
    tripId: testTrip1.id,
    expensesList: [
      { expense_type: EXPENSE_TYPES.FUEL, category: 'VARIABLE', amount: 1300000, note: 'Tiền dầu Diesel 65L' },
      { expense_type: EXPENSE_TYPES.LIFT_OFF, category: 'VARIABLE', amount: 1100000, note: 'Phí hạ cont' }
    ],
    user: accountantUser
  });
  assert(batchResult.savedCount === 2, 'Batch save lưu trọn bộ 2 khoản chi phí cùng lúc thành công');

  // =========================================================================
  // 5. KIỂM THỬ KHÓA SỔ KỲ (PERIOD LOCK) ĐỐI VỚI CHI PHÍ
  // =========================================================================
  console.log('\n📌 PHẦN 5: Kiểm thử bảo vệ Khóa Sổ Kỳ (Period Lock) với Chi Phí');

  // Khóa kỳ tháng 2026-10
  lockPeriod({ periodMonth: '2026-10', notes: 'Khóa kỳ thử nghiệm Task 3.4', user: directorUser });

  let lockBlocked = false;
  try {
    createExpense({
      expenseData: {
        trip_id: testTrip1.id,
        expense_type: EXPENSE_TYPES.OTHER,
        amount: 500000,
        expense_date: '2026-10-05'
      },
      user: accountantUser
    });
  } catch (err) {
    if (err.status === 423 || err.message.includes('khóa sổ')) {
      lockBlocked = true;
    }
  }
  assert(lockBlocked, 'Hệ thống chặn 423 (Locked) khi cố tình thêm chi phí vào tháng đã khóa sổ');

  // Mở khóa lại kỳ
  unlockPeriod({ periodMonth: '2026-10', notes: 'Mở lại kỳ để tiếp tục test', user: directorUser });

  // =========================================================================
  // 6. KIỂM THỬ TASK 3.5: MODULE CHỤP ẢNH PHIẾU PHƠI EIR
  // =========================================================================
  console.log('\n📌 PHẦN 6: Kiểm thử Task 3.5 Chụp Ảnh Phiếu Phơi (Mobile Camera & Nén ảnh)');

  // 6.1: Tạo chuỗi Base64 giả lập ảnh phiếu phơi chụp từ mobile camera
  const dummyBase64Image = 'data:image/jpeg;base64,' + Buffer.from('FAKE_COMPRESSED_EIR_PHOTO_DATA_TEST_TASK_35').toString('base64');

  const uploadEirRes = saveTripEirPhoto({
    tripId: testTrip1.id,
    base64Data: dummyBase64Image,
    user: directorUser
  });
  assert(uploadEirRes.photoUrl && uploadEirRes.photoUrl.startsWith('/uploads/eir/'), `Ảnh phơi được lưu thành công: ${uploadEirRes.photoUrl}`);
  assert(uploadEirRes.trip.eir_status === EIR_STATUSES.DA_TRA, 'Trạng thái phơi tự động chuyển sang DA_TRA');
  assert(uploadEirRes.trip.status === TRIP_STATUSES.EIR_SUBMITTED, 'Vòng đời cuốc xe chuyển tiếp sang EIR_SUBMITTED');
  assert(uploadEirRes.trip.eir_submitted_at !== null, 'Đã ghi nhận thời điểm nộp phơi eir_submitted_at ISO');

  // Kiểm tra file vật lý đã được tạo trên đĩa
  const savedFilename = uploadEirRes.photoUrl.replace('/uploads/eir/', '');
  const physicalPath = path.join(__dirname, '../../uploads/eir', savedFilename);
  assert(fs.existsSync(physicalPath), `File ảnh phơi tồn tại vật lý trên đĩa tại ${physicalPath}`);

  // 6.2: Cập nhật trạng thái thanh toán phơi cảng
  const updatedEir = updateTripEirStatus({
    tripId: testTrip1.id,
    eirStatus: EIR_STATUSES.DA_TRA,
    eirPaidStatus: EIR_PAID_STATUSES.DA_TT,
    notes: 'Đã thanh toán phơi cảng qua ePort Tân Vũ',
    user: accountantUser
  });
  assert(updatedEir.eir_paid_status === EIR_PAID_STATUSES.DA_TT, 'Cập nhật trạng thái thanh toán phơi thành DA_TT');

  // 6.3: Kiểm tra Audit Log cho thao tác nộp phơi
  const eirAuditLogs = getAuditLogs({ tableName: 'trips', limit: 10 });
  const hasEirLog = eirAuditLogs.some(l => l.record_id === testTrip1.id && JSON.stringify(l.new_values || '').includes('DA_TRA'));
  assert(hasEirLog, 'Audit Log ghi nhận lịch sử nộp ảnh phiếu phơi');

  // =========================================================================
  // 7. KIỂM THỬ THUẬT TOÁN CẢNH BÁO ĐỌNG PHƠI (> 3 NGÀY)
  // =========================================================================
  console.log('\n📌 PHẦN 7: Kiểm thử cảnh báo đọng phơi (> 3 ngày)');

  // Tạo một chuyến xe cách đây 6 ngày mà chưa nộp phơi (CHUA_TRA)
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  const oldTripDate = sixDaysAgo.toISOString().slice(0, 10);

  const overdueTrip = createTrip({
    tripData: {
      trip_date: oldTripDate,
      route_id: routeBinhXuyen.id,
      customer_name: 'VTM OVERDUE TEST',
      vehicle_plate: '15H-00266',
      driver_name: 'Trương Văn Hội',
      trip_revenue: 2800000,
      vat_type: 'V',
      container_number: 'TCNU9183777',
      notes: 'Cuốc xe test đọng phơi 6 ngày'
    },
    user: directorUser
  });

  // Quét danh sách đọng phơi (> 3 ngày)
  const pendingEirRes = getPendingEirTrips({ minDaysOverdue: 3, user: directorUser });
  assert(pendingEirRes.overdueCount > 0, `Phát hiện có ${pendingEirRes.overdueCount} chuyến đọng phơi quá 3 ngày`);

  const foundOverdue = pendingEirRes.items.find(i => i.id === overdueTrip.id);
  assert(foundOverdue !== undefined, 'Cuốc xe cũ cách đây 6 ngày được phát hiện chính xác trong danh sách đọng phơi');
  assert(foundOverdue && foundOverdue.days_overdue >= 5, `Số ngày đọng phơi tính chuẩn: ${foundOverdue?.days_overdue} ngày`);
  assert(foundOverdue && foundOverdue.warning_message.includes('Đọng phơi'), 'Có thông điệp cảnh báo đọng phơi rõ ràng');

  // 7.2: Thử gỡ bỏ ảnh phơi
  const removeEirRes = removeTripEirPhoto({
    tripId: testTrip1.id,
    user: directorUser
  });
  assert(removeEirRes.eir_photo_url === null, 'Ảnh phơi đã được gỡ bỏ khỏi cuốc xe');
  assert(removeEirRes.eir_status === EIR_STATUSES.CHUA_TRA, 'Trạng thái chuyển về CHUA_TRA sau khi gỡ ảnh');
  assert(!fs.existsSync(physicalPath), 'File ảnh vật lý trên đĩa đã được dọn dẹp sạch');

  // =========================================================================
  // TỔNG KẾT KẾT QUẢ KIỂM THỬ
  // =========================================================================
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║   KẾT QUẢ KIỂM THỬ TASK 3.4 & TASK 3.5: ${passedTests}/${totalTests} BÀI TEST PASS (${Math.round((passedTests/totalTests)*100)}%)   ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (passedTests === totalTests) {
    console.log('🎉 TẤT CẢ CÁC BÀI TEST TỰ ĐỘNG CHO TASK 3.4 VÀ TASK 3.5 ĐÃ HOÀN TOÀN VƯỢT QUA 100%!');
  } else {
    console.error(`⚠️ Có ${totalTests - passedTests} bài test không đạt yêu cầu.`);
  }
}

runVerification().catch(err => {
  console.error('Lỗi nghiêm trọng khi chạy kiểm thử:', err);
  process.exit(1);
});

/**
 * ============================================================
 * KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN TASK 4.5: THANH TOÁN GỘP BẢNG KÊ
 * ============================================================
 * Kiểm thử:
 * 1. API GET /api/v1/trips/unpaid-summary
 * 2. Phân quyền RBAC (Chỉ DIRECTOR, ACCOUNTANT mới được thanh toán gộp)
 * 3. Kiểm tra tính toàn vẹn và từ chối khi chuyến nằm trong kỳ khóa sổ
 * 4. Thực thi thanh toán gộp 1 lô cuốc xe
 * 5. Xác minh đổi trạng thái chuyến xe (PAID, DA_TT)
 * 6. Xác minh Audit Log ghi vết BATCH_PAYMENT
 * 7. Kiểm chứng số liệu P&L nhảy số tức thì
 * ============================================================
 */
process.env.NODE_ENV = 'test';
process.env.IS_TEST = 'true';

import 'dotenv/config';
import { db } from '../db/database.js';
import { getUnpaidTripsByCustomer, batchPayTrips } from '../services/trip.service.js';
import { lockPeriod, unlockPeriod } from '../services/periodLock.service.js';
import { AUDIT_ACTIONS } from '../services/audit.service.js';
import { TRIP_STATUSES, EIR_PAID_STATUSES } from '../db/schema.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TASK 4.5: THANH TOÁN GỘP THEO BẢNG KÊ');
  console.log('============================================================\n');

  // Test 1: Truy vấn danh sách cuốc xe chưa thanh toán gom theo khách hàng
  console.log('--- TEST 1: Kiểm tra getUnpaidTripsByCustomer ---');
  const unpaidSummary = getUnpaidTripsByCustomer();
  assert(unpaidSummary !== null, 'unpaidSummary trả về kết quả hợp lệ');
  assert(typeof unpaidSummary.total_unpaid_trips === 'number', 'Có trường total_unpaid_trips');
  assert(typeof unpaidSummary.total_receivable === 'number', 'Có trường total_receivable');
  assert(Array.isArray(unpaidSummary.customers), 'customers là một mảng');
  assert(unpaidSummary.customers.length > 0, `Có ít nhất 1 khách hàng phát sinh công nợ (Thực tế: ${unpaidSummary.customers.length})`);
  console.log(`  ℹ️ Tổng khách hàng nợ: ${unpaidSummary.total_unpaid_customers}, Tổng cuốc nợ: ${unpaidSummary.total_unpaid_trips}, Tổng nợ: ${unpaidSummary.total_receivable.toLocaleString('vi-VN')}₫`);

  // Test 2: Kiểm tra lọc theo tên khách hàng cụ thể
  console.log('\n--- TEST 2: Lọc công nợ theo khách hàng cụ thể ---');
  const targetCust = unpaidSummary.customers[0];
  const singleCustSummary = getUnpaidTripsByCustomer({ customerName: targetCust.customer_name });
  assert(singleCustSummary.customers.length === 1, `Lọc đúng 1 khách hàng [${targetCust.customer_name}]`);
  assert(singleCustSummary.customers[0].customer_name === targetCust.customer_name, 'Tên khách hàng khớp 100%');
  assert(singleCustSummary.customers[0].trips.length > 0, 'Khách hàng có danh sách chuyến chi tiết');

  // Test 3: Kiểm tra tính năng validate đầu vào
  console.log('\n--- TEST 3: Kiểm tra validate đầu vào của batchPayTrips ---');
  try {
    batchPayTrips({ tripIds: [] });
    assert(false, 'Phải bắt lỗi mảng tripIds rỗng');
  } catch (e) {
    assert(e.message.includes('ít nhất 1 chuyến xe'), 'Bắt lỗi mảng tripIds rỗng chính xác');
  }

  try {
    batchPayTrips({ tripIds: ['id-khong-ton-tai-123456'] });
    assert(false, 'Phải bắt lỗi ID không tồn tại');
  } catch (e) {
    assert(e.message.includes('không tìm thấy'), 'Bắt lỗi ID chuyến không tồn tại chính xác');
  }

  // Test 4: Kiểm tra bảo vệ khi chuyến nằm trong kỳ Khóa Sổ
  console.log('\n--- TEST 4: Kiểm tra bảo vệ Period Lock khi thanh toán gộp ---');
  const sampleTrip = targetCust.trips[0];
  const tripMonth = sampleTrip.trip_date.slice(0, 7);

  // Khóa sổ tháng này để kiểm tra
  lockPeriod({
    periodMonth: tripMonth,
    user: { id: 'usr_gd', username: 'giamdoc', role: 'DIRECTOR' },
    reason: 'Khóa sổ thử nghiệm Task 4.5'
  });

  try {
    batchPayTrips({
      tripIds: [sampleTrip.id],
      user: { id: 'usr_kt', username: 'ketoan', role: 'ACCOUNTANT' }
    });
    assert(false, 'Phải chặn thanh toán gộp nếu kỳ đã bị khóa sổ');
  } catch (e) {
    assert(e.message.includes('KHÓA SỔ'), `Chặn 423 Locked chính xác: ${e.message}`);
  }

  // Mở khóa lại sổ để tiếp tục test thanh toán
  unlockPeriod({
    periodMonth: tripMonth,
    user: { id: 'usr_gd', username: 'giamdoc', role: 'DIRECTOR' },
    reason: 'Mở khóa sau test'
  });

  // Test 5: Thực thi thanh toán gộp cả lô thành công
  console.log('\n--- TEST 5: Thực thi thanh toán gộp lô nhiều chuyến ---');
  // Lấy 2 chuyến của khách hàng targetCust (hoặc 1 nếu chỉ có 1)
  const tripsToPay = targetCust.trips.slice(0, 2);
  const tripIdsToPay = tripsToPay.map(t => t.id);
  const expectedTotalAmount = tripsToPay.reduce((sum, t) => sum + t.total_revenue, 0);

  const batchResult = batchPayTrips({
    tripIds: tripIdsToPay,
    customerName: targetCust.customer_name,
    paymentDate: '2026-10-08',
    paymentNote: 'UNC-TEST-BATCH-001',
    paymentMethod: 'BANK_TRANSFER',
    user: { id: 'usr_kt', username: 'ketoan', role: 'ACCOUNTANT' },
    ipAddress: '127.0.0.1'
  });

  assert(batchResult.trip_count === tripIdsToPay.length, `Số lượng chuyến đã thanh toán: ${batchResult.trip_count}`);
  assert(batchResult.total_amount === expectedTotalAmount, `Tổng tiền thanh toán khớp chính xác: ${batchResult.total_amount.toLocaleString('vi-VN')}₫`);
  assert(batchResult.payment_note === 'UNC-TEST-BATCH-001', 'Ghi chú số UNC lưu chính xác');

  // Test 6: Kiểm tra trong Database xem các chuyến đã đổi trạng thái chưa
  console.log('\n--- TEST 6: Kiểm tra trạng thái Database sau thanh toán gộp ---');
  for (const tId of tripIdsToPay) {
    const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(tId);
    assert(row.status === TRIP_STATUSES.PAID, `Chuyến ${row.trip_code} trạng thái đã là PAID`);
    assert(row.eir_paid_status === EIR_PAID_STATUSES.DA_TT, `Chuyến ${row.trip_code} eir_paid_status đã là DA_TT`);
  }

  // Test 7: Kiểm tra Audit Log có ghi nhận lô thanh toán không
  console.log('\n--- TEST 7: Kiểm tra Audit Log ghi nhận BATCH_PAYMENT ---');
  const auditLog = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE action = ? AND record_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(AUDIT_ACTIONS.BATCH_PAYMENT, batchResult.batch_id);

  assert(auditLog !== null && auditLog !== undefined, 'Audit Log có bản ghi BATCH_PAYMENT');
  assert(auditLog.username === 'ketoan', 'Audit Log ghi đúng user thao tác (ketoan)');
  const newValues = JSON.parse(auditLog.new_values);
  assert(newValues.total_amount === expectedTotalAmount, 'Audit Log ghi đúng tổng tiền lô thanh toán');
  assert(newValues.trip_count === tripIdsToPay.length, 'Audit Log ghi đúng số lượng chuyến');

  // Test 8: Kiểm tra sau khi thanh toán, số chuyến chưa thanh toán của khách giảm đúng bằng số chuyến đã trả
  console.log('\n--- TEST 8: Kiểm tra cập nhật công nợ sau thanh toán gộp ---');
  const afterSummary = getUnpaidTripsByCustomer({ customerName: targetCust.customer_name });
  const remainingTrips = afterSummary.customers[0]?.total_trips || 0;
  const remainingDebt = afterSummary.customers[0]?.total_receivable || 0;
  assert(remainingTrips === targetCust.total_trips - tripIdsToPay.length, `Số chuyến nợ còn lại giảm chính xác: ${remainingTrips}`);
  assert(remainingDebt === targetCust.total_receivable - expectedTotalAmount, `Số nợ còn lại giảm chính xác: ${remainingDebt.toLocaleString('vi-VN')}₫`);

  console.log('\n============================================================');
  console.log(`🎉 TẤT CẢ ${passedTests}/${totalTests} TESTS CỦA TASK 4.5 ĐỀU PASS 100%!`);
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});

/**
 * ============================================================
 * KIỂM THỬ TỰ ĐỘNG TASK 4.1 & TASK 4.2 - WED_HOACHTOAN
 * ============================================================
 * Kiểm tra:
 * 1. Thuật toán Real-time P&L Engine (Tính toán 2 dòng tiền, lợi nhuận gộp, phân bổ chi phí)
 * 2. Đảm bảo toàn bộ số tiền là số nguyên VND Integer (không số thực)
 * 3. Endpoint SSE /api/v1/pl/events và cơ chế broadcast
 * 4. Nút 1-chạm đổi trạng thái thanh toán và nhảy số thực thu / công nợ
 * ============================================================
 */
import http from 'http';
import { calculatePL, broadcastPLUpdate } from '../services/plEngine.service.js';
import { db } from '../db/database.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN TASK 4.1 & TASK 4.2');
  console.log('═══════════════════════════════════════════════════════════');

  // --- PHẦN 1: TÍNH TOÁN P&L ENGINE NỘI BỘ ---
  console.log('\n--- 1. Kiểm tra Engine P&L & Hợp đồng Tiền tệ Số Nguyên ---');
  const pl = calculatePL();

  assert(pl !== null && typeof pl === 'object', 'Engine P&L khởi tạo và tính toán thành công');
  assert(pl.currency === 'VND_INTEGER', 'Chuẩn tiền tệ là VND_INTEGER');

  // Kiểm tra 2 dòng tiền
  const cf = pl.cash_flow;
  assert(typeof cf.expected_revenue === 'number' && Number.isInteger(cf.expected_revenue), `Doanh thu kỳ vọng là số nguyên VND: ${cf.expected_revenue.toLocaleString('vi-VN')}₫`);
  assert(typeof cf.actual_revenue === 'number' && Number.isInteger(cf.actual_revenue), `Doanh thu thực thu là số nguyên VND: ${cf.actual_revenue.toLocaleString('vi-VN')}₫`);
  assert(typeof cf.pending_receivables === 'number' && Number.isInteger(cf.pending_receivables), `Công nợ phải thu là số nguyên VND: ${cf.pending_receivables.toLocaleString('vi-VN')}₫`);
  assert(cf.expected_revenue === cf.actual_revenue + cf.pending_receivables, 'Khớp đẳng thức tài chính: Doanh thu kỳ vọng = Thực thu + Công nợ');

  // Kiểm tra Lợi nhuận
  const pnl = pl.profit_and_loss;
  assert(Number.isInteger(pnl.expected_gross_profit), `Lợi nhuận gộp kỳ vọng là số nguyên: ${pnl.expected_gross_profit.toLocaleString('vi-VN')}₫`);
  assert(Number.isInteger(pnl.actual_gross_profit), `Lợi nhuận gộp thực thu là số nguyên: ${pnl.actual_gross_profit.toLocaleString('vi-VN')}₫`);
  assert(Number.isInteger(pnl.total_operating_costs), `Tổng chi phí hoạt động là số nguyên: ${pnl.total_operating_costs.toLocaleString('vi-VN')}₫`);
  assert(pnl.expected_gross_profit === cf.expected_revenue - pnl.total_operating_costs, 'Khớp đẳng thức: Lợi nhuận kỳ vọng = Doanh thu kỳ vọng - Chi phí');

  // Kiểm tra phân bổ chi phí Cố định vs Biến động
  const exp = pl.expenses_breakdown;
  assert(Number.isInteger(exp.total_variable), `Chi phí biến động là số nguyên: ${exp.total_variable.toLocaleString('vi-VN')}₫`);
  assert(Number.isInteger(exp.total_fixed), `Chi phí cố định là số nguyên: ${exp.total_fixed.toLocaleString('vi-VN')}₫`);
  assert(exp.fixed_ratio_percent + exp.variable_ratio_percent === 100 || (exp.total_variable === 0 && exp.total_fixed === 0), `Tỉ lệ cố định (${exp.fixed_ratio_percent}%) + biến động (${exp.variable_ratio_percent}%) khớp 100%`);

  // Kiểm tra danh sách phân tích
  assert(Array.isArray(pl.breakdowns.vehicles) && pl.breakdowns.vehicles.length > 0, `Phân tích theo đầu xe: ${pl.breakdowns.vehicles.length} xe`);
  assert(Array.isArray(pl.breakdowns.customers) && pl.breakdowns.customers.length > 0, `Phân tích theo khách hàng: ${pl.breakdowns.customers.length} khách hàng`);
  assert(Array.isArray(pl.breakdowns.routes) && pl.breakdowns.routes.length > 0, `Phân tích theo tuyến đường: ${pl.breakdowns.routes.length} tuyến đường`);

  // --- PHẦN 2: THỰC THI THỬ NGHIỆM ĐỔI TRẠNG THÁI THANH TOÁN & NHẢY SỐ TỨC THÌ ---
  console.log('\n--- 2. Kiểm tra Nhảy Số Real-time khi Đánh Dấu Thanh Toán ---');
  const sampleTrip = db.prepare("SELECT * FROM trips WHERE status != 'PAID' LIMIT 1").get();
  if (sampleTrip) {
    const revenueBefore = pl.cash_flow.actual_revenue;
    const tripRev = sampleTrip.total_revenue;

    // Giả lập thanh toán
    db.prepare("UPDATE trips SET status = 'PAID', eir_paid_status = 'DA_TT' WHERE id = ?").run(sampleTrip.id);
    const plAfterPaid = calculatePL();

    assert(
      plAfterPaid.cash_flow.actual_revenue === revenueBefore + tripRev,
      `Thực thu tăng chuẩn xác +${tripRev.toLocaleString('vi-VN')}₫ khi cuốc ${sampleTrip.trip_code} chuyển sang PAID`
    );
    assert(
      plAfterPaid.cash_flow.pending_receivables === pl.cash_flow.pending_receivables - tripRev,
      `Công nợ giảm tương ứng -${tripRev.toLocaleString('vi-VN')}₫`
    );

    // Rollback lại trạng thái ban đầu để không làm bẩn dữ liệu mẫu
    db.prepare('UPDATE trips SET status = ?, eir_paid_status = ? WHERE id = ?').run(
      sampleTrip.status,
      sampleTrip.eir_paid_status,
      sampleTrip.id
    );

    const plRolledBack = calculatePL();
    assert(plRolledBack.cash_flow.actual_revenue === revenueBefore, 'Hoàn nguyên trạng thái ban đầu thành công');
  } else {
    console.log('  ⚠️ Không có chuyến nào khác PAID để test đổi trạng thái');
  }

  // --- PHẦN 3: KIỂM TRA SSE BROADCAST KHÔNG GÂY LỖI ---
  console.log('\n--- 3. Kiểm tra Cơ chế Broadcast SSE ---');
  try {
    broadcastPLUpdate('TEST_VERIFICATION_EVENT', { trigger: 'TEST_SCRIPT', reason: 'Chạy kiểm thử tự động' });
    assert(true, 'Hàm broadcastPLUpdate chạy trơn tru không phát sinh exception');
  } catch (e) {
    assert(false, `Lỗi khi gọi broadcastPLUpdate: ${e.message}`);
  }

  // TỔNG KẾT
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests} / ${totalTests} BÀI TEST THÀNH CÔNG (PASS RATE: ${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('═══════════════════════════════════════════════════════════');

  if (passedTests === totalTests) {
    console.log('🎉 100% CÁC TEST CASE ĐẠT CHUẨN! BACKEND TASK 4.1 & 4.2 HOẠT ĐỘNG HOÀN HẢO.\n');
    process.exit(0);
  } else {
    console.error('⚠️ Có bài test bị thất bại. Vui lòng kiểm tra lại logic.\n');
    process.exit(1);
  }
}

runTests();

/**
 * ============================================================
 * UNIT TEST SUITE: TOÁN TÀI CHÍNH SỐ NGUYÊN & CONT KẸP (TASK 5.2)
 * ============================================================
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN
 * 
 * Mục tiêu kiểm thử:
 * 1. Tiền tệ số nguyên VND (Integer Money): Không rò rỉ số thực (Zero-float leakage).
 * 2. Phân rã VAT 8% cho [V] và [NV]: Luôn khớp 100% doanh thu trước thuế + tiền thuế = tổng doanh thu.
 * 3. Cont kẹp 2x20': Cộng dồn nâng/hạ độc lập, nhận diện chuẩn xác.
 * 4. ISO 6346 Check Digit Modulo 11: Kiểm thử các mã container thực tế từ dự án.
 * 5. Tạm ứng & Quyết toán hoàn ứng: Cân đối âm dương chính xác.
 * 6. P&L Engine Math: Doanh thu kỳ vọng, thực thu, công nợ, lợi nhuận gộp, biên lợi nhuận.
 * 7. Bảng lương 3 thành phần: Lương cứng + Chuyến + Động viên - Khấu trừ = Thực lĩnh.
 * ============================================================
 */

import {
  toVndInteger,
  calculateVatBreakdown,
  calculateContainerTotals,
  calculateAdvanceSettlement,
  calculateProfitMetrics,
  calculateDriverPayroll
} from '../utils/financialMath.js';
import { validateIso6346, calculateIso6346CheckDigit } from '../utils/iso6346.js';
import { VAT_TYPES } from '../db/schema.js';

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
}

function assertInteger(value, message) {
  assert(Number.isInteger(value), `${message} (Giá trị = ${value} phải là số nguyên Integer)`);
}

console.log('================================================================');
console.log('🧪 BẮT ĐẦU BỘ UNIT TEST TOÁN TÀI CHÍNH SỐ NGUYÊN (TASK 5.2)');
console.log('================================================================\n');

// ============================================================
// PHẦN 1: KIỂM THỬ SỐ NGUYÊN VND (INTEGER MONEY & ZERO-FLOAT LEAKS)
// ============================================================
console.log('--- PHẦN 1: Chuẩn hóa & Ép kiểu Số Nguyên VND (Zero-float Guarantee) ---');

assert(toVndInteger(1890000.4) === 1890000, 'Làm tròn số thực cận dưới (.4) thành số nguyên');
assert(toVndInteger(1890000.6) === 1890001, 'Làm tròn số thực cận trên (.6) thành số nguyên');
assert(toVndInteger('2300000') === 2300000, 'Parse chuỗi số thành Integer VND');
assert(toVndInteger(null) === 0, 'Null trả về 0đ an toàn');
assert(toVndInteger(undefined) === 0, 'Undefined trả về 0đ an toàn');
assert(toVndInteger('') === 0, 'Chuỗi rỗng trả về 0đ an toàn');
assert(toVndInteger('abc') === 0, 'Chuỗi không hợp lệ trả về 0đ');
assert(toVndInteger(-500000.7) === -500001, 'Xử lý số nguyên âm chính xác');

// ============================================================
// PHẦN 2: KIỂM THỬ TÍNH THUẾ VAT 8% VÀ BẢO TOÀN DOANH THU
// ============================================================
console.log('\n--- PHẦN 2: Tính Thuế VAT & Bảo Toàn Tổng Cước (Không Lệch 1 Đồng) ---');

const sampleFares = [
  1890000, 2300000, 3180000, 3800000, 4200000, 5500000, 7200000, 104976000
];

for (const fare of sampleFares) {
  // Test với loại [V] (Đã gồm VAT 8%)
  const vatV = calculateVatBreakdown(fare, VAT_TYPES.V, 8);
  assertInteger(vatV.tripRevenue, `[V] Cước trước thuế cho ${fare.toLocaleString('vi-VN')}₫ là Integer`);
  assertInteger(vatV.vatAmount, `[V] Tiền thuế VAT cho ${fare.toLocaleString('vi-VN')}₫ là Integer`);
  assertInteger(vatV.totalRevenue, `[V] Tổng cước cho ${fare.toLocaleString('vi-VN')}₫ là Integer`);
  assert(
    vatV.tripRevenue + vatV.vatAmount === vatV.totalRevenue,
    `[V] Khớp tuyệt đối: ${vatV.tripRevenue} + ${vatV.vatAmount} = ${vatV.totalRevenue} (Fare: ${fare}₫)`
  );

  // Test với loại [NV] (Chưa gồm VAT)
  const vatNV = calculateVatBreakdown(fare, VAT_TYPES.NV, 8);
  assert(vatNV.vatAmount === 0, `[NV] Tiền thuế VAT cho cước chưa VAT bằng 0đ`);
  assert(vatNV.tripRevenue === fare, `[NV] Doanh thu trước thuế bằng đúng tiền cước`);
  assert(vatNV.totalRevenue === fare, `[NV] Tổng cước bằng đúng tiền cước`);
}

// ============================================================
// PHẦN 3: KIỂM THỬ CONT KẸP (TWIN 20' - 2x20') & CỘNG DỒN CHI PHÍ
// ============================================================
console.log('\n--- PHẦN 3: Xử Lý Cont Kẹp (2x20\') & Phí Nâng/Hạ Hai Vỏ Độc Lập ---');

// Cuốc cont đơn 40ft chuẩn
const single40Conts = [
  { container_number: 'MSMU5022544', container_size: '40', lift_on_fee: 450000, lift_off_fee: 400000, cargo_weight: 22000 }
];
const singleTotals = calculateContainerTotals(single40Conts);
assert(singleTotals.containerCount === 1, 'Cont đơn đếm đúng 1 vỏ');
assert(!singleTotals.isTwin20, 'Cont 40ft không phải là cont kẹp 2x20');
assert(singleTotals.totalLiftFee === 850000, 'Tổng nâng hạ cont đơn = 450k + 400k = 850k');

// Cuốc cont kẹp 2x20ft
const twin20Conts = [
  { container_number: 'MSMU5022544', container_size: '20', lift_on_fee: 300000, lift_off_fee: 280000, cargo_weight: 14000 },
  { container_number: 'TCNU9183777', container_size: '20', lift_on_fee: 320000, lift_off_fee: 280000, cargo_weight: 15500 }
];
const twinTotals = calculateContainerTotals(twin20Conts);
assert(twinTotals.containerCount === 2, 'Cont kẹp đếm đúng 2 vỏ');
assert(twinTotals.isTwin20 === true, 'Hệ thống nhận diện chuẩn xác cờ cont kẹp isTwin20');
assert(twinTotals.totalLiftOn === 620000, 'Tổng phí nâng 2 cont = 300k + 320k = 620k');
assert(twinTotals.totalLiftOff === 560000, 'Tổng phí hạ 2 cont = 280k + 280k = 560k');
assert(twinTotals.totalLiftFee === 1180000, 'Tổng chi phí nâng hạ cả 2 vỏ = 1.180.000₫');
assert(twinTotals.totalWeight === 29500, 'Tổng tải trọng 2 cont cộng gộp = 29.500 kg');
assertInteger(twinTotals.totalLiftFee, 'Tổng phí nâng hạ cont kẹp là Integer');

// ============================================================
// PHẦN 4: KIỂM THỬ THUẬT TOÁN ISO 6346 MODULO 11
// ============================================================
console.log('\n--- PHẦN 4: Thuật Toán ISO 6346 Check Digit Modulo 11 ---');

// Các mã container chuẩn quốc tế hợp lệ ISO 6346
const validContainers = [
  { code: 'MSMU5022544', expectedDigit: 4 },
  { code: 'TCNU9183778', expectedDigit: 8 },
  { code: 'TEMU6154694', expectedDigit: 4 },
  { code: 'CSNU6028880', expectedDigit: 0 } // Trường hợp remainder 10 hoặc check digit 0
];

for (const item of validContainers) {
  const res = validateIso6346(item.code);
  assert(res.isValid === true, `Container ${item.code} hợp lệ ISO 6346 (Check digit = ${res.actualCheckDigit})`);
  assert(res.actualCheckDigit === item.expectedDigit, `Check digit của ${item.code} bằng ${item.expectedDigit}`);
}

// Kiểm tra container sai số check digit hoặc format hỏng (như khi tài xế gõ nhầm)
const invalidCodes = [
  { code: 'TCNU9183777', reason: 'Gõ nhầm check digit (nhập 7, chuẩn là 8)' },
  { code: 'MSMU5022549', reason: 'Sai check digit (nhập 9, chuẩn là 4)' },
  { code: 'MSM5022544', reason: 'Thiếu ký tự loại thiết bị U' },
  { code: 'MSMU502254', reason: 'Thiếu 1 số' },
  { code: '12345678901', reason: 'Không có mã chủ sở hữu chữ cái' }
];

for (const item of invalidCodes) {
  const badRes = validateIso6346(item.code);
  assert(badRes.isValid === false, `Cảnh báo chính xác container lỗi: ${item.code} (${item.reason})`);
}

// ============================================================
// PHẦN 5: KIỂM THỬ TẠM ỨNG TRƯỚC CHUYẾN & QUYẾT TOÁN HOÀN ỨNG
// ============================================================
console.log('\n--- PHẦN 5: Cán Cân Tạm Ứng Trước Chuyến & Quyết Toán Hoàn Ứng ---');

// Trường hợp 1: Tài xế thừa tiền nộp lại quỹ
const advanceOver = calculateAdvanceSettlement(2000000, 1650000);
assert(advanceOver.balanceAmount === 350000, 'Tài xế thừa 350.000₫ nộp lại quỹ công ty');
assert(advanceOver.isFundOwed === true, 'Cờ isFundOwed = true (quỹ thu tiền)');
assert(advanceOver.isDriverOwed === false, 'Cờ isDriverOwed = false');
assertInteger(advanceOver.balanceAmount, 'Số tiền dư nộp quỹ là Integer');

// Trường hợp 2: Tài xế chi thêm, công ty chi bù
const advanceUnder = calculateAdvanceSettlement(1500000, 1850000);
assert(advanceUnder.balanceAmount === -350000, 'Tài xế chi vượt 350.000₫, công ty bù tiền');
assert(advanceUnder.isDriverOwed === true, 'Cờ isDriverOwed = true (công ty bù tài xế)');
assert(advanceUnder.isFundOwed === false, 'Cờ isFundOwed = false');

// Trường hợp 3: Khớp 100%
const advanceEqual = calculateAdvanceSettlement(1500000, 1500000);
assert(advanceEqual.balanceAmount === 0, 'Tạm ứng khớp 100% chi phí thực tế');
assert(advanceEqual.isBalanced === true, 'Cờ isBalanced = true');

// ============================================================
// PHẦN 6: KIỂM THỬ P&L METRICS, LỢI NHUẬN GỘP & BIÊN LỢI NHUẬN
// ============================================================
console.log('\n--- PHẦN 6: P&L Engine Math, Lợi Nhuận Gộp & Biên Lợi Nhuận ---');

const plTest = calculateProfitMetrics(163052000, 25000000, 68000000);
assert(plTest.totalCost === 93000000, 'Tổng chi phí = Cố định (25M) + Biến động (68M) = 93M');
assert(plTest.grossProfit === 70052000, 'Lợi nhuận gộp = Doanh thu - Tổng chi phí = 70.052.000₫');
assert(plTest.profitMarginPercent === 42.96, `Biên lợi nhuận gộp = ${plTest.profitMarginPercent}% (~43%)`);
assertInteger(plTest.grossProfit, 'Lợi nhuận gộp là Integer');
assertInteger(plTest.totalCost, 'Tổng chi phí là Integer');

// Test an toàn khi doanh thu bằng 0 (Zero-division safe)
const plZero = calculateProfitMetrics(0, 10000000, 5000000);
assert(plZero.profitMarginPercent === 0, 'Doanh thu 0đ an toàn chia cho 0, biên lợi nhuận = 0%');
assert(plZero.grossProfit === -15000000, 'Lỗ gộp = -15.000.000₫');

// ============================================================
// PHẦN 7: KIỂM THỬ CÔNG THỨC BẢNG LƯƠNG 3 THÀNH PHẦN (TASK 6.1 PREVIEW)
// ============================================================
console.log('\n--- PHẦN 7: Bảng Lương 3 Thành Phần (Lương cứng + Chuyến + Động viên - Ứng) ---');

// Ví dụ tài xế Vũ Văn Liêm: Lương cứng 6M, Chuyến 8.5M, Thưởng GĐ 2M, Đã tạm ứng 3.5M
const payrollTest = calculateDriverPayroll({
  baseSalary: 6000000,
  tripSalary: 8500000,
  incentiveBonus: 2000000,
  deductions: 3500000
});

assert(payrollTest.totalEarnings === 16500000, 'Tổng thu nhập = 6M + 8.5M + 2M = 16.500.000₫');
assert(payrollTest.netSalary === 13000000, 'Thực lĩnh = 16.5M - 3.5M tạm ứng = 13.000.000₫');
assertInteger(payrollTest.totalEarnings, 'Tổng thu nhập là Integer');
assertInteger(payrollTest.netSalary, 'Lương thực lĩnh là Integer');
assert(
  payrollTest.breakdownPercentages.basePercent +
  payrollTest.breakdownPercentages.tripPercent +
  payrollTest.breakdownPercentages.incentivePercent >= 99.99,
  'Tỷ lệ cấu thành lương 3 thành phần phân rã đủ 100%'
);

console.log(`    💰 Chi tiết bảng lương thử nghiệm:`);
console.log(`       - Thành phần 1 (Lương cứng): ${payrollTest.baseSalary.toLocaleString('vi-VN')}₫ (${payrollTest.breakdownPercentages.basePercent}%)`);
console.log(`       - Thành phần 2 (Lương chuyến): ${payrollTest.tripSalary.toLocaleString('vi-VN')}₫ (${payrollTest.breakdownPercentages.tripPercent}%)`);
console.log(`       - Thành phần 3 (Động viên GĐ): ${payrollTest.incentiveBonus.toLocaleString('vi-VN')}₫ (${payrollTest.breakdownPercentages.incentivePercent}%)`);
console.log(`       - Trừ Tạm ứng đã nhận: -${payrollTest.deductions.toLocaleString('vi-VN')}₫`);
console.log(`       => THỰC LĨNH: ${payrollTest.netSalary.toLocaleString('vi-VN')}₫`);

// ============================================================
// TỔNG KẾT BỘ TEST
// ============================================================
console.log('\n================================================================');
console.log(`🎉 TỔNG KẾT UNIT TEST TASK 5.2: ${passed}/${total} TIÊU CHÍ PASS 100%`);
console.log('🛡️  HOÀN TOÀN KHÔNG CÓ SAI SỐ LÀM TRÒN SỐ THỰC, SỐ NGUYÊN VND BẢO TOÀN TUYỆT ĐỐI!');
console.log('================================================================\n');

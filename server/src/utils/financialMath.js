/**
 * ============================================================
 * TIỆN ÍCH TOÁN TÀI CHÍNH SỐ NGUYÊN (FINANCIAL MATH ENGINE)
 * ============================================================
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN
 * 
 * HỢP ĐỒNG KỸ THUẬT:
 * 1. Tiền tệ luôn là số nguyên VND (Integer Money). Không có số thập phân.
 * 2. Mọi phép nhân/chia phần trăm thuế, phân bổ phải dùng Math.round() hoặc Math.trunc() an toàn.
 * 3. Bảo vệ chia cho 0 (Zero-division safe).
 * 4. Xử lý chính xác các trường hợp Cont Kẹp 2x20' (cộng dồn phí nâng, hạ, không trùng lặp lương).
 * 5. Bảng lương 3 thành phần: Lương cứng + Lương chuyến + Thưởng động viên - Tạm ứng.
 * ============================================================
 */

import { VAT_TYPES } from '../db/schema.js';

/**
 * Chuẩn hóa một giá trị tiền thành số nguyên VND an toàn
 * Loại bỏ hoàn toàn số thập phân, NaN, null, undefined
 * @param {any} value
 * @returns {number} Số nguyên VND (Integer)
 */
export function toVndInteger(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
}

/**
 * Tính toán tiền thuế VAT và doanh thu trước/sau thuế theo loại VAT
 * Chuẩn ngành vận tải container:
 * - VAT_TYPES.V: Đơn giá đã bao gồm VAT 8% -> Doanh thu trước thuế = round(Tổng * 100 / 108), Tiền VAT = Tổng - Trước thuế (hoặc round(Tổng * 8 / 108))
 * - VAT_TYPES.NV: Đơn giá chưa VAT -> Tiền VAT = 0, Doanh thu trước VAT = Tổng
 * @param {number} revenueAmount - Số tiền cước nhập vào
 * @param {string} vatType - 'V' hoặc 'NV'
 * @param {number} vatRate - Tỷ lệ VAT (mặc định 8% cho logistics vận tải)
 * @returns {{ tripRevenue: number, vatAmount: number, totalRevenue: number, isVatIncluded: boolean }}
 */
export function calculateVatBreakdown(revenueAmount, vatType = VAT_TYPES.V, vatRate = 8) {
  const cleanAmount = toVndInteger(revenueAmount);
  
  if (vatType === VAT_TYPES.V) {
    // Giá nhập vào đã gồm VAT 8%
    const vatAmount = Math.round((cleanAmount * vatRate) / (100 + vatRate));
    const tripRevenue = cleanAmount - vatAmount;
    return {
      tripRevenue,
      vatAmount,
      totalRevenue: cleanAmount,
      isVatIncluded: true
    };
  }

  // Loại NV: Chưa bao gồm VAT
  return {
    tripRevenue: cleanAmount,
    vatAmount: 0,
    totalRevenue: cleanAmount,
    isVatIncluded: false
  };
}

/**
 * Tính toán tổng chi phí và thông tin từ danh sách Container (hỗ trợ Cont kẹp 2x20')
 * @param {Array<object>} containers - Danh sách container
 * @returns {{ totalLiftOn: number, totalLiftOff: number, totalLiftFee: number, totalWeight: number, containerCount: number, isTwin20: boolean }}
 */
export function calculateContainerTotals(containers = []) {
  if (!Array.isArray(containers) || containers.length === 0) {
    return {
      totalLiftOn: 0,
      totalLiftOff: 0,
      totalLiftFee: 0,
      totalWeight: 0,
      containerCount: 0,
      isTwin20: false
    };
  }

  let totalLiftOn = 0;
  let totalLiftOff = 0;
  let totalWeight = 0;
  let count20 = 0;

  for (const c of containers) {
    totalLiftOn += toVndInteger(c.lift_on_fee);
    totalLiftOff += toVndInteger(c.lift_off_fee);
    totalWeight += toVndInteger(c.cargo_weight);
    if (c.container_size === '20' || c.container_size === 20) {
      count20++;
    }
  }

  const isTwin20 = containers.length >= 2 && count20 >= 2;

  return {
    totalLiftOn,
    totalLiftOff,
    totalLiftFee: totalLiftOn + totalLiftOff,
    totalWeight,
    containerCount: containers.length,
    isTwin20
  };
}

/**
 * Tính toán cán cân tạm ứng & hoàn ứng chuyến xe
 * @param {number} advanceAmount - Tiền quỹ xuất tạm ứng
 * @param {number} settledAmount - Tiền tài xế thực chi theo vé / phơi
 * @returns {{ balanceAmount: number, isDriverOwed: boolean, isFundOwed: boolean, isBalanced: boolean }}
 */
export function calculateAdvanceSettlement(advanceAmount, settledAmount) {
  const advance = toVndInteger(advanceAmount);
  const settled = toVndInteger(settledAmount);
  const balance = advance - settled;

  return {
    advanceAmount: advance,
    settledAmount: settled,
    balanceAmount: balance, // > 0: Tài xế thừa tiền nộp lại quỹ; < 0: Tài xế chi thiếu công ty bù
    isFundOwed: balance > 0, // Tài xế hoàn trả lại công ty
    isDriverOwed: balance < 0, // Công ty chi bù thêm cho tài xế
    isBalanced: balance === 0 // Khớp đúng 100%
  };
}

/**
 * Tính toán Lợi nhuận gộp & Biên lợi nhuận (P&L Math)
 * @param {number} revenue - Tổng doanh thu
 * @param {number} fixedCost - Chi phí cố định
 * @param {number} variableCost - Chi phí biến động
 * @returns {{ totalCost: number, grossProfit: number, profitMarginPercent: number }}
 */
export function calculateProfitMetrics(revenue, fixedCost = 0, variableCost = 0) {
  const rev = toVndInteger(revenue);
  const fixed = toVndInteger(fixedCost);
  const variable = toVndInteger(variableCost);
  const totalCost = fixed + variable;
  const grossProfit = rev - totalCost;

  // Biên lợi nhuận %: làm tròn 2 chữ số thập phân an toàn
  let marginPercent = 0;
  if (rev > 0) {
    marginPercent = Math.round((grossProfit / rev) * 10000) / 100;
  }

  return {
    revenue: rev,
    fixedCost: fixed,
    variableCost: variable,
    totalCost,
    grossProfit,
    profitMarginPercent: marginPercent
  };
}

/**
 * Công thức tính Lương 3 thành phần của Tài xế:
 * Thành phần 1: Lương cứng (Base salary)
 * Thành phần 2: Lương chuyến (Trip wage - tổng công chuyến chạy trong kỳ)
 * Thành phần 3: Khoản động viên (Incentive / Bonus - GĐ duyệt)
 * Khấu trừ: Tạm ứng chưa hoàn hoặc các khoản khấu trừ
 * Thực lĩnh (Net Salary) = Lương cứng + Lương chuyến + Khoản động viên - Tạm ứng khấu trừ
 * 
 * @param {object} params
 * @param {number} params.baseSalary - Lương cứng
 * @param {number} params.tripSalary - Lương công chuyến
 * @param {number} params.incentiveBonus - Khoản động viên / thưởng
 * @param {number} params.deductions - Các khoản khấu trừ / tạm ứng đã nhận
 * @returns {object} Chi tiết 3 thành phần và thực lĩnh
 */
export function calculateDriverPayroll({
  baseSalary = 0,
  tripSalary = 0,
  incentiveBonus = 0,
  deductions = 0
} = {}) {
  const base = toVndInteger(baseSalary);
  const trip = toVndInteger(tripSalary);
  const incentive = toVndInteger(incentiveBonus);
  const deduct = toVndInteger(deductions);

  const totalEarnings = base + trip + incentive;
  const netSalary = totalEarnings - deduct;

  return {
    baseSalary: base,
    tripSalary: trip,
    incentiveBonus: incentive,
    totalEarnings,
    deductions: deduct,
    netSalary,
    breakdownPercentages: totalEarnings > 0 ? {
      basePercent: Math.round((base / totalEarnings) * 10000) / 100,
      tripPercent: Math.round((trip / totalEarnings) * 10000) / 100,
      incentivePercent: Math.round((incentive / totalEarnings) * 10000) / 100
    } : { basePercent: 0, tripPercent: 0, incentivePercent: 0 }
  };
}

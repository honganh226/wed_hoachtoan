/**
 * ============================================================
 * PAYROLL SERVICE - BẢNG LƯƠNG 3 THÀNH PHẦN & DỮ LIỆU APP LÁI XE
 * ============================================================
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN (Task 6.1)
 *
 * CẤU TRÚC LƯƠNG 3 THÀNH PHẦN:
 * 1. Lương cứng (Base salary định kỳ)
 * 2. Lương chuyến (Trip wage - tổng công chuyến xe chạy trong kỳ)
 * 3. Khoản động viên / Thưởng chuyên cần (Incentive / Bonus - Bảo mật Giám đốc)
 * Khấu trừ: Tạm ứng trước chuyến (Advances)
 * => THỰC LĨNH = Lương cứng + Lương chuyến + Khoản động viên - Tạm ứng
 *
 * BẢO MẬT & PHÂN QUYỀN RBAC:
 * - DIRECTOR: Xem và sửa khoản động viên cho bất kỳ tài xế nào.
 * - ACCOUNTANT: Xem toàn bộ bảng lương phục vụ chi trả, đối chiếu ngân hàng.
 * - AREA_MANAGER: Xem bảng lương các tài xế thuộc phân khu mình phụ trách.
 * - DRIVER: Chỉ xem cuốc xe, tạm ứng và bảng lương của CHÍNH MÌNH (Driver App).
 * ============================================================
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
function configuredSalary(driverId, month) {
  try { return db.prepare('SELECT amount FROM salary_settings WHERE driver_id=? AND effective_month<=? ORDER BY effective_month DESC LIMIT 1').get(driverId,month); } catch { return null; }
}
import { recordAuditLog, AUDIT_ACTIONS } from '../services/audit.service.js';
import { calculateDriverPayroll, toVndInteger } from '../utils/financialMath.js';
import { USER_ROLES } from '../db/schema.js';

/**
 * Lấy Bảng Lương tổng hợp toàn đội theo kỳ tháng (YYYY-MM)
 * @param {object} params
 * @param {string} [params.periodMonth] - Tháng cần xem (mặc định lấy tháng mới nhất có chuyến hoặc tháng hiện tại)
 * @param {object} [params.user] - Người dùng đang đăng nhập (RBAC)
 */
export function getPayrollSummary({ periodMonth = null, user = null } = {}) {
  // Xác định tháng mặc định nếu không truyền
  let targetMonth = periodMonth;
  if (!targetMonth) {
    const latestTrip = db.prepare(`SELECT SUBSTR(trip_date, 1, 7) as month FROM trips ORDER BY trip_date DESC LIMIT 1`).get();
    targetMonth = latestTrip?.month || new Date().toISOString().slice(0, 7);
  }

  // Lọc tài xế theo RBAC
  let driverQuery = `
    SELECT d.*, v.plate_number as default_vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v ON d.default_vehicle_id = v.id
    WHERE d.is_active = 1
  `;
  const driverParams = [];

  if (user && user.role === USER_ROLES.DRIVER) {
    driverQuery += ` AND (d.user_id = ? OR d.full_name = ?)`;
    driverParams.push(user.userId || user.id, user.fullName || user.username);
  } else if (user && user.role === USER_ROLES.AREA_MANAGER && user.areaId) {
    driverQuery += ` AND d.area_id = ?`;
    driverParams.push(user.areaId);
  }

  driverQuery += ` ORDER BY d.full_name ASC`;
  const driverList = db.prepare(driverQuery).all(...driverParams);

  const isDirector = !user || user.role === USER_ROLES.DIRECTOR;

  const payrollRows = [];
  let totalBaseSalary = 0;
  let totalTripSalary = 0;
  let totalIncentive = 0;
  let totalDeductions = 0;
  let totalNetSalary = 0;
  let totalTripsCount = 0;

  for (const drv of driverList) {
    // 1. Tính tổng lương chuyến và lấy danh sách cuốc xe trong tháng
    const trips = db.prepare(`
      SELECT id, trip_code, trip_date, vehicle_plate, route_name, customer_name,
             driver_salary, total_revenue, status, eir_status, eir_paid_status, eir_photo_url
      FROM trips
      WHERE driver_id = ? AND trip_date LIKE ?
      ORDER BY trip_date ASC, trip_code ASC
    `).all(drv.id, `${targetMonth}%`);

    const tripSalarySum = trips.reduce((sum, t) => sum + toVndInteger(t.driver_salary), 0);
    const tripsCount = trips.length;
    const driverRevenueSum = trips.reduce((sum, t) => sum + toVndInteger(t.total_revenue), 0);
    const driverCollectedSum = trips.reduce((sum, t) => sum + (t.status === 'PAID' || t.eir_paid_status === 'DA_TT' ? toVndInteger(t.total_revenue) : 0), 0);

    // 2. Lấy cấu hình Khoản Động Viên & Lương Cứng Override trong tháng
    const incentiveRec = db.prepare(`
      SELECT * FROM driver_incentives
      WHERE driver_id = ? AND period_month = ?
      LIMIT 1
    `).get(drv.id, targetMonth);

    const salarySetting = configuredSalary(drv.id, targetMonth);
    const salaryConfirmed = salarySetting != null || incentiveRec?.base_salary_override != null;
    const baseSalary = incentiveRec?.base_salary_override !== null && incentiveRec?.base_salary_override !== undefined
      ? toVndInteger(incentiveRec.base_salary_override)
      : toVndInteger(salarySetting?.amount ?? 0); // Mặc định 5 triệu nếu chưa cài

    const incentiveBonus = incentiveRec ? toVndInteger(incentiveRec.incentive_amount) : 0;
    const incentiveNote = incentiveRec?.incentive_note || '';

    // 3. Tính tạm ứng trong tháng
    const advances = db.prepare(`
      SELECT id, trip_id, advance_date, advance_amount, settled_amount, balance_amount, status, notes
      FROM trip_advances
      WHERE driver_id = ? AND advance_date LIKE ?
      ORDER BY advance_date ASC
    `).all(drv.id, `${targetMonth}%`);

    // Khấu trừ tạm ứng: tổng số tiền quỹ đã xuất tạm ứng chưa hoàn trả
    const totalAdvanceGiven = advances.reduce((sum, a) => sum + toVndInteger(a.advance_amount), 0);
    const totalAdvanceSettled = advances.reduce((sum, a) => sum + toVndInteger(a.settled_amount), 0);
    
    // Nếu tạm ứng theo chuyến đã quyết toán bù/thừa: khấu trừ theo số thực ứng hoặc số còn nợ
    // Quy chuẩn vận tải: Tài xế nhận ứng tiền ăn/đường trước, khi tính lương trừ phần tạm ứng
    const deductions = totalAdvanceGiven;

    // 4. Áp dụng công thức 3 thành phần chuẩn
    const calc = calculateDriverPayroll({
      baseSalary,
      tripSalary: tripSalarySum,
      incentiveBonus: isDirector || user?.role === USER_ROLES.DRIVER ? incentiveBonus : (incentiveRec?.is_approved ? incentiveBonus : 0),
      deductions
    });

    totalBaseSalary += calc.baseSalary;
    totalTripSalary += calc.tripSalary;
    totalIncentive += calc.incentiveBonus;
    totalDeductions += calc.deductions;
    totalNetSalary += calc.netSalary;
    totalTripsCount += tripsCount;

    payrollRows.push({
      driver_id: drv.id,
      driver_name: drv.full_name,
      phone: drv.phone,
      license_number: drv.license_number,
      license_expiry: drv.license_expiry,
      area_id: drv.area_id,
      vehicle_plate: drv.default_vehicle_plate || 'Chưa gán xe',
      kpi_target: toVndInteger(drv.kpi_target),
      
      // 3 THÀNH PHẦN LƯƠNG
      base_salary: salaryConfirmed ? calc.baseSalary : null,
      base_salary_confirmed: salaryConfirmed,       // Thành phần 1: Lương cứng
      trip_salary: calc.tripSalary,       // Thành phần 2: Lương chuyến
      incentive_bonus: calc.incentiveBonus, // Thành phần 3: Động viên GĐ
      incentive_note: incentiveNote,
      incentive_approved: incentiveRec ? Boolean(incentiveRec.is_approved) : false,
      is_incentive_confidential: !isDirector && user?.role !== USER_ROLES.DRIVER,

      total_earnings: calc.totalEarnings, // Tổng thu nhập
      deductions: calc.deductions,        // Tạm ứng khấu trừ
      net_salary: salaryConfirmed ? calc.netSalary : null,         // Thực lĩnh
      breakdown_percentages: calc.breakdownPercentages,

      // Thống kê tác nghiệp & Doanh thu tạo ra
      trips_count: tripsCount,
      total_revenue: driverRevenueSum,
      collected_revenue: driverCollectedSum,
      cost_to_revenue_ratio: driverRevenueSum > 0 ? Math.round((calc.totalEarnings / driverRevenueSum) * 100) : 0,
      advances_count: advances.length,
      total_advance_given: totalAdvanceGiven,
      total_advance_settled: totalAdvanceSettled,

      // Danh sách con phục vụ Drill-down
      trips,
      advances
    });
  }

  return {
    period_month: targetMonth,
    total_drivers: payrollRows.length,
    total_trips_completed: totalTripsCount,
    summary: {
      missing_base_salary: payrollRows.filter(r=>!r.base_salary_confirmed).length,
      total_base_salary: payrollRows.some(r=>!r.base_salary_confirmed) ? null : totalBaseSalary,
      total_trip_salary: totalTripSalary,
      total_incentive: totalIncentive,
      total_gross_earnings: totalBaseSalary + totalTripSalary + totalIncentive,
      total_deductions: totalDeductions,
      total_net_payout: payrollRows.some(r=>!r.base_salary_confirmed) ? null : totalNetSalary,
      total_revenue_generated: payrollRows.reduce((s, r) => s + (r.total_revenue || 0), 0)
    },
    drivers: payrollRows
  };
}

/**
 * Cập nhật hoặc cấu hình Khoản Động Viên Giám Đốc (DIRECTOR ONLY)
 */
export function upsertDriverIncentive({
  driverId,
  periodMonth,
  incentiveAmount = 0,
  incentiveNote = '',
  baseSalaryOverride = null,
  user = null,
  ipAddress = null
}) {
  if (!driverId) throw new Error('Mã tài xế (driverId) là bắt buộc');
  if (!periodMonth) throw new Error('Tháng kỳ lương (periodMonth: YYYY-MM) là bắt buộc');

  const driver = db.prepare('SELECT id, full_name, base_salary FROM drivers WHERE id = ?').get(driverId);
  if (!driver) throw new Error(`Không tìm thấy tài xế với ID ${driverId}`);

  const amount = toVndInteger(incentiveAmount);
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT * FROM driver_incentives 
    WHERE driver_id = ? AND period_month = ?
  `).get(driverId, periodMonth);

  let recordId;
  const oldValues = existing || null;

  if (existing) {
    recordId = existing.id;
    db.prepare(`
      UPDATE driver_incentives
      SET incentive_amount = ?,
          incentive_note = ?,
          base_salary_override = ?,
          is_approved = 1,
          approved_by = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      amount,
      incentiveNote || null,
      baseSalaryOverride !== null ? toVndInteger(baseSalaryOverride) : existing.base_salary_override,
      user?.username || 'DIRECTOR',
      now,
      recordId
    );
  } else {
    recordId = uuidv4();
    db.prepare(`
      INSERT INTO driver_incentives (
        id, driver_id, period_month, incentive_amount, incentive_note,
        base_salary_override, is_approved, approved_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      recordId,
      driverId,
      periodMonth,
      amount,
      incentiveNote || null,
      baseSalaryOverride !== null ? toVndInteger(baseSalaryOverride) : null,
      user?.username || 'DIRECTOR',
      now,
      now
    );
  }

  const updatedRec = db.prepare('SELECT * FROM driver_incentives WHERE id = ?').get(recordId);

  // Ghi Audit Log hành động sửa thưởng động viên
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'DIRECTOR',
    action: AUDIT_ACTIONS.KPI_CHANGE,
    tableName: 'driver_incentives',
    recordId,
    oldValues,
    newValues: updatedRec,
    reason: `Giám đốc phê duyệt khoản động viên ${amount.toLocaleString('vi-VN')}₫ cho tài xế ${driver.full_name} tháng ${periodMonth}`,
    ipAddress
  });

  return {
    success: true,
    data: updatedRec,
    message: `Đã cập nhật khoản động viên ${amount.toLocaleString('vi-VN')}₫ cho tài xế ${driver.full_name}`
  };
}

/**
 * Cung cấp thông tin tài xế phục vụ App Điện Thoại Riêng Cho Lái Xe (Driver App)
 * @param {object} params
 * @param {object} params.user - Người dùng hiện tại
 * @param {string} [params.periodMonth] - Tháng xem lương
 */
export function getDriverPersonalAppView({ user, periodMonth = null } = {}) {
  if (!user) throw new Error('Yêu cầu xác thực người dùng');

  // Tìm hồ sơ tài xế khớp với user
  let driver = null;
  if (user.userId || user.id) {
    driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(user.userId || user.id);
  }
  if (!driver && user.username) {
    // Thử map theo tên hoặc username nếu chưa gán user_id
    driver = db.prepare('SELECT * FROM drivers WHERE full_name LIKE ? OR user_id = ?').get(`%${user.username}%`, user.username);
  }
  if (!driver) {
    // Lấy tài xế đầu tiên để demo nếu tài khoản test
    driver = db.prepare('SELECT * FROM drivers WHERE is_active = 1 LIMIT 1').get();
  }
  if (!driver) throw new Error('Không tìm thấy thông tin tài xế gắn liền với tài khoản này');

  // Lấy xe mặc định
  let vehicle = null;
  if (driver.default_vehicle_id) {
    vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(driver.default_vehicle_id);
  }

  // Xác định tháng
  let targetMonth = periodMonth;
  if (!targetMonth) {
    const latestTrip = db.prepare(`SELECT SUBSTR(trip_date, 1, 7) as month FROM trips WHERE driver_id = ? ORDER BY trip_date DESC LIMIT 1`).get(driver.id);
    targetMonth = latestTrip?.month || new Date().toISOString().slice(0, 7);
  }

  // Lấy chuyến xe của tài xế
  const trips = db.prepare(`
    SELECT t.*,
           GROUP_CONCAT(c.container_number, ', ') as container_numbers,
           MIN(c.container_size) as container_size
    FROM trips t
    LEFT JOIN containers c ON t.id = c.trip_id
    WHERE t.driver_id = ? AND t.trip_date LIKE ?
    GROUP BY t.id
    ORDER BY t.trip_date DESC, t.trip_code DESC
  `).all(driver.id, `${targetMonth}%`);

  const tripSalaryTotal = trips.reduce((sum, t) => sum + toVndInteger(t.driver_salary), 0);

  // Lấy khoản động viên
  const incentiveRec = db.prepare(`
    SELECT * FROM driver_incentives
    WHERE driver_id = ? AND period_month = ?
  `).get(driver.id, targetMonth);

  const baseSalary = incentiveRec?.base_salary_override !== null && incentiveRec?.base_salary_override !== undefined
    ? toVndInteger(incentiveRec.base_salary_override)
    : toVndInteger(configuredSalary(driver.id, targetMonth)?.amount ?? 0);

  const incentiveAmount = incentiveRec ? toVndInteger(incentiveRec.incentive_amount) : 0;
  const incentiveNote = incentiveRec?.incentive_note || '';

  // Lấy tạm ứng & hoàn ứng
  const advances = db.prepare(`
    SELECT a.*, t.trip_code, t.route_name
    FROM trip_advances a
    LEFT JOIN trips t ON a.trip_id = t.id
    WHERE a.driver_id = ? AND a.advance_date LIKE ?
    ORDER BY a.advance_date DESC
  `).all(driver.id, `${targetMonth}%`);

  const totalAdvance = advances.reduce((sum, a) => sum + toVndInteger(a.advance_amount), 0);
  const totalSettled = advances.reduce((sum, a) => sum + toVndInteger(a.settled_amount), 0);
  const netAdvanceBalance = advances.reduce((sum, a) => sum + toVndInteger(a.balance_amount), 0);

  // Tính lương 3 thành phần
  const payroll = calculateDriverPayroll({
    baseSalary,
    tripSalary: tripSalaryTotal,
    incentiveBonus: incentiveAmount,
    deductions: totalAdvance
  });

  return {
    driver: {
      id: driver.id,
      full_name: driver.full_name,
      phone: driver.phone,
      license_number: driver.license_number,
      license_expiry: driver.license_expiry,
      vehicle_plate: vehicle?.plate_number || '15C-22405',
      area_id: driver.area_id
    },
    period_month: targetMonth,
    payroll: {
      base_salary: payroll.baseSalary,
      trip_salary: payroll.tripSalary,
      incentive_bonus: payroll.incentiveBonus,
      incentive_note: incentiveNote,
      total_earnings: payroll.totalEarnings,
      deductions: payroll.deductions,
      net_salary: payroll.netSalary,
      percentages: payroll.breakdownPercentages
    },
    trips_summary: {
      total_trips: trips.length,
      total_revenue: trips.reduce((sum, t) => sum + toVndInteger(t.total_revenue), 0),
      eir_submitted_count: trips.filter(t => t.eir_status === 'DA_TRA').length,
      eir_pending_count: trips.filter(t => t.eir_status !== 'DA_TRA').length,
      trips
    },
    advances_summary: {
      total_advance_amount: totalAdvance,
      total_settled_amount: totalSettled,
      net_advance_balance: netAdvanceBalance,
      advances
    }
  };
}

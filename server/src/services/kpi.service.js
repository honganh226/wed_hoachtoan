/**
 * ============================================================
 * KPI SERVICE - ĐIỀU PHỐI KPI ĐỘNG THEO TÀI XẾ (TASK 4.4)
 * ============================================================
 * Tính năng chính:
 * 1. Tính toán tiến độ KPI thực tế từng tài xế theo chu kỳ thời gian
 * 2. Phân loại trạng thái KPI: 🔴 Chậm (<80%), 🟡 Đạt (80-100%), 🟢 Vượt (>100%)
 * 3. API chỉnh sửa KPI trực tiếp (Giám đốc) kèm ghi Audit Log
 * 4. Drill-down chi tiết cuốc xe và chi phí từng tài xế
 * 5. Hỗ trợ bộ lọc thời gian startDate/endDate (tích hợp Task 4.3)
 * 6. Cho phép "không cài KPI" (kpi_target = 0) -> bỏ qua tính %
 * ============================================================
 * Quy chuẩn:
 * - Tiền tệ: Số nguyên VND Integer
 * - RBAC: Chỉ DIRECTOR mới được sửa KPI
 * ============================================================
 */
import { db } from '../db/database.js';
import { USER_ROLES } from '../db/schema.js';

// ================================================================
// 1. TÍNH TOÁN KPI TỪNG TÀI XẾ
// ================================================================

/**
 * Lấy tiến độ KPI của tất cả tài xế đang hoạt động
 * @param {object} options
 * @param {string|null} options.startDate - Ngày bắt đầu tính KPI (YYYY-MM-DD)
 * @param {string|null} options.endDate - Ngày kết thúc tính KPI (YYYY-MM-DD)
 * @param {string|null} options.month - Tháng tính KPI (YYYY-MM) - tương thích ngược
 * @param {string|null} options.year - Năm tính KPI (YYYY) - tương thích ngược
 * @param {object|null} options.user - Thông tin user RBAC
 */
export function getDriverKpiProgress({ startDate = null, endDate = null, month = null, year = null, user = null } = {}) {
  // Xây dựng điều kiện lọc thời gian linh hoạt (giống Task 4.3)
  let timeClauses = [];
  let timeParams = [];

  if (startDate && endDate) {
    timeClauses.push('t.trip_date >= ? AND t.trip_date <= ?');
    timeParams.push(startDate, endDate);
  } else if (startDate) {
    timeClauses.push('t.trip_date >= ?');
    timeParams.push(startDate);
  } else if (month) {
    timeClauses.push('t.trip_date LIKE ?');
    timeParams.push(`${month}%`);
  } else if (year) {
    timeClauses.push('t.trip_date LIKE ?');
    timeParams.push(`${year}%`);
  }

  // Lọc RBAC
  if (user) {
    if (user.role === USER_ROLES.AREA_MANAGER && user.areaId) {
      timeClauses.push('t.area_id = ?');
      timeParams.push(user.areaId);
    }
    // DRIVER chỉ xem KPI của chính mình
    if (user.role === USER_ROLES.DRIVER) {
      timeClauses.push('d.user_id = ?');
      timeParams.push(user.userId);
    }
  }

  const whereClause = timeClauses.length > 0 ? `AND ${timeClauses.join(' AND ')}` : '';

  // Query: Tổng hợp doanh thu thực tế của từng tài xế trong kỳ
  const driverStats = db.prepare(`
    SELECT
      d.id AS driver_id,
      d.full_name,
      d.phone,
      d.area_id,
      d.base_salary,
      d.kpi_target,
      d.notes AS driver_notes,
      d.is_active,
      v.plate_number AS default_vehicle_plate,
      COALESCE(SUM(t.total_revenue), 0) AS actual_revenue,
      COALESCE(SUM(t.trip_revenue), 0) AS actual_trip_revenue,
      COUNT(DISTINCT t.id) AS trip_count,
      COALESCE(SUM(t.driver_salary), 0) AS total_driver_salary,
      COALESCE(SUM(CASE WHEN t.status = 'PAID' OR t.eir_paid_status = 'DA_TT' THEN t.total_revenue ELSE 0 END), 0) AS collected_revenue,
      COALESCE(SUM(CASE WHEN t.status = 'PAID' THEN 1 ELSE 0 END), 0) AS paid_trip_count,
      COALESCE(SUM(CASE WHEN t.status = 'RUNNING' OR t.status = 'DISPATCHED' THEN 1 ELSE 0 END), 0) AS active_trip_count,
      MAX(t.trip_date) AS last_trip_date
    FROM drivers d
    LEFT JOIN vehicles v ON d.default_vehicle_id = v.id
    LEFT JOIN trips t ON t.driver_id = d.id ${whereClause}
    WHERE d.is_active = 1
    GROUP BY d.id
    ORDER BY actual_revenue DESC
  `).all(...timeParams);

  // Tính toán % KPI và phân loại trạng thái
  const result = driverStats.map(driver => {
    const actualRevenue = Math.round(Number(driver.actual_revenue || 0));
    const kpiTarget = Math.round(Number(driver.kpi_target || 0));
    const baseSalary = Math.round(Number(driver.base_salary || 0));
    const totalDriverSalary = Math.round(Number(driver.total_driver_salary || 0));
    const collectedRevenue = Math.round(Number(driver.collected_revenue || 0));

    // Tính % tiến độ KPI
    let kpiPercent = null;     // null = không cài KPI
    let kpiStatus = 'NO_KPI';  // NO_KPI | BEHIND | ON_TRACK | EXCEEDED
    let kpiStatusLabel = 'Không cài KPI';
    let kpiStatusIcon = '⚪';

    if (kpiTarget > 0) {
      kpiPercent = Math.round((actualRevenue / kpiTarget) * 100);

      if (kpiPercent < 80) {
        kpiStatus = 'BEHIND';
        kpiStatusLabel = 'Chậm tiến độ';
        kpiStatusIcon = '🔴';
      } else if (kpiPercent <= 100) {
        kpiStatus = 'ON_TRACK';
        kpiStatusLabel = 'Đang đạt KPI';
        kpiStatusIcon = '🟡';
      } else {
        kpiStatus = 'EXCEEDED';
        kpiStatusLabel = 'Vượt chỉ tiêu';
        kpiStatusIcon = '🟢';
      }
    }

    // Tính khoảng cách còn lại để đạt KPI
    const revenueGap = kpiTarget > 0 ? Math.max(0, kpiTarget - actualRevenue) : 0;

    return {
      driver_id: driver.driver_id,
      full_name: driver.full_name,
      phone: driver.phone || '',
      area_id: driver.area_id || '',
      default_vehicle_plate: driver.default_vehicle_plate || '',
      // KPI metrics
      kpi_target: kpiTarget,
      actual_revenue: actualRevenue,
      collected_revenue: collectedRevenue,
      kpi_percent: kpiPercent,
      kpi_status: kpiStatus,
      kpi_status_label: kpiStatusLabel,
      kpi_status_icon: kpiStatusIcon,
      revenue_gap: revenueGap,
      // Thống kê chuyến
      trip_count: driver.trip_count || 0,
      paid_trip_count: driver.paid_trip_count || 0,
      active_trip_count: driver.active_trip_count || 0,
      last_trip_date: driver.last_trip_date || null,
      // Lương
      base_salary: baseSalary,
      total_driver_salary: totalDriverSalary,
      // Ghi chú
      driver_notes: driver.driver_notes || ''
    };
  });

  // Tổng hợp thống kê toàn đội
  const teamSummary = {
    total_drivers: result.length,
    drivers_with_kpi: result.filter(d => d.kpi_target > 0).length,
    drivers_no_kpi: result.filter(d => d.kpi_target === 0).length,
    drivers_exceeded: result.filter(d => d.kpi_status === 'EXCEEDED').length,
    drivers_on_track: result.filter(d => d.kpi_status === 'ON_TRACK').length,
    drivers_behind: result.filter(d => d.kpi_status === 'BEHIND').length,
    total_actual_revenue: result.reduce((sum, d) => sum + d.actual_revenue, 0),
    total_kpi_target: result.reduce((sum, d) => sum + d.kpi_target, 0),
    total_trip_count: result.reduce((sum, d) => sum + d.trip_count, 0)
  };

  const teamKpiPercent = teamSummary.total_kpi_target > 0
    ? Math.round((teamSummary.total_actual_revenue / teamSummary.total_kpi_target) * 100)
    : null;

  return {
    drivers: result,
    team_summary: {
      ...teamSummary,
      team_kpi_percent: teamKpiPercent
    },
    filter_applied: {
      start_date: startDate,
      end_date: endDate,
      month,
      year
    }
  };
}

// ================================================================
// 2. DRILL-DOWN: CHI TIẾT CUỐC XE & CHI PHÍ CỦA 1 TÀI XẾ
// ================================================================

/**
 * Lấy chi tiết cuốc xe và chi phí của một tài xế trong kỳ
 */
export function getDriverDrilldown({ driverId, startDate = null, endDate = null, month = null, year = null } = {}) {
  if (!driverId) throw new Error('Thiếu driverId');

  // Thông tin tài xế
  const driver = db.prepare(`
    SELECT d.*, v.plate_number AS default_vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v ON d.default_vehicle_id = v.id
    WHERE d.id = ?
  `).get(driverId);

  if (!driver) throw new Error('Không tìm thấy tài xế');

  // Xây dựng điều kiện thời gian
  let timeClauses = [];
  let timeParams = [driverId];

  if (startDate && endDate) {
    timeClauses.push('trip_date >= ? AND trip_date <= ?');
    timeParams.push(startDate, endDate);
  } else if (startDate) {
    timeClauses.push('trip_date >= ?');
    timeParams.push(startDate);
  } else if (month) {
    timeClauses.push('trip_date LIKE ?');
    timeParams.push(`${month}%`);
  } else if (year) {
    timeClauses.push('trip_date LIKE ?');
    timeParams.push(`${year}%`);
  }

  const whereTime = timeClauses.length > 0 ? `AND ${timeClauses.join(' AND ')}` : '';

  // Danh sách cuốc xe
  const trips = db.prepare(`
    SELECT
      t.id, t.trip_code, t.trip_date, t.route_name, t.customer_name,
      t.vehicle_plate, t.total_revenue, t.trip_revenue, t.vat_amount,
      t.driver_salary, t.status, t.eir_paid_status, t.vat_type,
      t.is_subcontractor, t.subcontractor_cost
    FROM trips t
    WHERE t.driver_id = ? ${whereTime}
    ORDER BY t.trip_date DESC
    LIMIT 50
  `).all(...timeParams);

  // Chi phí liên quan đến tài xế này trong kỳ
  const expenseParams = [driverId];
  const expenseTimeWhere = timeClauses.length > 0
    ? timeClauses.map(c => c.replace('trip_date', 'e.expense_date')).join(' AND ')
    : '';
  const expenseWhere = expenseTimeWhere ? `AND ${expenseTimeWhere}` : '';

  const expenses = db.prepare(`
    SELECT e.id, e.expense_type, e.category, e.amount, e.expense_date, e.note, e.is_anomaly,
           t.trip_code, t.route_name
    FROM expenses e
    LEFT JOIN trips t ON e.trip_id = t.id
    WHERE t.driver_id = ? ${expenseWhere}
    ORDER BY e.expense_date DESC
    LIMIT 30
  `).all(...expenseParams);

  // Tổng hợp nhanh
  const totalRevenue = trips.reduce((s, t) => s + Math.round(Number(t.total_revenue || 0)), 0);
  const totalSalary = trips.reduce((s, t) => s + Math.round(Number(t.driver_salary || 0)), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Math.round(Number(e.amount || 0)), 0);
  const kpiTarget = Math.round(Number(driver.kpi_target || 0));
  const kpiPercent = kpiTarget > 0 ? Math.round((totalRevenue / kpiTarget) * 100) : null;

  return {
    driver: {
      id: driver.id,
      full_name: driver.full_name,
      phone: driver.phone || '',
      area_id: driver.area_id || '',
      default_vehicle_plate: driver.default_vehicle_plate || '',
      base_salary: Math.round(Number(driver.base_salary || 0)),
      kpi_target: kpiTarget
    },
    summary: {
      total_revenue: totalRevenue,
      total_salary: totalSalary,
      total_expenses: totalExpenses,
      trip_count: trips.length,
      kpi_percent: kpiPercent
    },
    trips,
    expenses
  };
}

// ================================================================
// 3. CẬP NHẬT KPI TARGET (CHỈ GIÁM ĐỐC)
// ================================================================

/**
 * Cập nhật chỉ tiêu KPI của tài xế (kèm lý do ghi Audit Log)
 */
export function updateDriverKpi({ driverId, newKpiTarget, reason, updatedBy } = {}) {
  if (!driverId) throw new Error('Thiếu driverId');
  if (newKpiTarget === undefined || newKpiTarget === null) throw new Error('Thiếu newKpiTarget');

  const kpiTargetInt = Math.round(Number(newKpiTarget));
  if (isNaN(kpiTargetInt) || kpiTargetInt < 0) {
    throw new Error('Chỉ tiêu KPI phải là số nguyên >= 0 (VND)');
  }

  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId);
  if (!driver) throw new Error('Không tìm thấy tài xế');

  const oldKpiTarget = Math.round(Number(driver.kpi_target || 0));
  const now = new Date().toISOString();

  // Cập nhật vào DB
  db.prepare(`
    UPDATE drivers SET kpi_target = ?, updated_at = ? WHERE id = ?
  `).run(kpiTargetInt, now, driverId);

  return {
    driver_id: driverId,
    full_name: driver.full_name,
    old_kpi_target: oldKpiTarget,
    new_kpi_target: kpiTargetInt,
    reason: reason || 'Điều chỉnh chỉ tiêu KPI',
    updated_by: updatedBy || 'DIRECTOR',
    updated_at: now
  };
}

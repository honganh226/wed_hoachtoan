/**
 * ============================================================
 * EXPENSE SERVICE - WED_HOACHTOAN
 * Phân hệ Chi Phí Thực Tế & Cảnh Báo Bất Thường (Task 3.4)
 * ============================================================
 * Quy chuẩn kỹ thuật:
 * - Tiền tệ: Số nguyên VND Integer
 * - Phân loại: FIXED (Cố định: bảo hiểm, khấu hao...) vs VARIABLE (Biến động: nâng, hạ, BOT, dầu...)
 * - Cảnh báo bất thường:
 *   + 🔴 Đỏ (is_anomaly = 1): Chênh lệch > 25% so với định mức tuyến (BOT, Dầu)
 *   + 🟡 Vàng (completeness warning): Nghi ngờ quên nhập chi phí cần thiết (BOT, Dầu xe nhà...)
 * - Kiểm tra Khóa Sổ Kỳ (Period Lock) và Ghi vết Audit Log
 * ============================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/audit.service.js';
import { isPeriodLocked } from '../services/periodLock.service.js';
import { EXPENSE_CATEGORIES, USER_ROLES } from '../db/schema.js';
import { broadcastPLUpdate } from './plEngine.service.js';

// Đơn giá dầu quy chuẩn ước tính để quy đổi lít sang tiền: 20.000 VNĐ / lít
export const BENCHMARK_FUEL_PRICE_VND = 20000;

// Ngưỡng phát hiện bất thường: 25%
export const ANOMALY_THRESHOLD = 0.25;

// Danh mục loại chi phí chuẩn
export const EXPENSE_TYPES = {
  LIFT_ON: 'LIFT_ON',                 // Phí nâng cont
  LIFT_OFF: 'LIFT_OFF',               // Phí hạ cont
  TOLL_BOT: 'TOLL_BOT',               // Vé cầu đường BOT
  FUEL: 'FUEL',                       // Tiền dầu Diesel
  SUBCONTRACTOR: 'SUBCONTRACTOR',     // Cước thuê ngoài
  SELECT_CONT: 'SELECT_CONT',         // Chọn vỏ container
  REPAIR: 'REPAIR',                   // Sửa vỏ / vệ sinh vỏ
  POLICE: 'POLICE',                   // Luật đường / Công an
  TIRE: 'TIRE',                       // Vá lốp / sửa chữa nhanh
  INSURANCE_FIXED: 'INSURANCE_FIXED', // Bảo hiểm xe (Cố định)
  INSPECTION_FIXED: 'INSPECTION_FIXED', // Đăng kiểm xe (Cố định)
  DEPRECIATION_FIXED: 'DEPRECIATION_FIXED', // Khấu hao xe (Cố định)
  OTHER: 'OTHER'                      // Chi phí phát sinh khác
};

// Tên hiển thị tiếng Việt các loại chi phí
export const EXPENSE_TYPE_LABELS = {
  LIFT_ON: 'Phí nâng cont',
  LIFT_OFF: 'Phí hạ cont',
  TOLL_BOT: 'Vé BOT cầu đường',
  FUEL: 'Tiền dầu Diesel',
  SUBCONTRACTOR: 'Cước thuê ngoài',
  SELECT_CONT: 'Chọn vỏ cont',
  REPAIR: 'Sửa vỏ / Vệ sinh',
  POLICE: 'Luật đường bộ',
  TIRE: 'Vá lốp / Sửa chữa nhanh',
  INSURANCE_FIXED: 'Bảo hiểm phương tiện',
  INSPECTION_FIXED: 'Phí đăng kiểm',
  DEPRECIATION_FIXED: 'Khấu hao phương tiện',
  OTHER: 'Chi phí khác'
};

/**
 * Thuật toán phát hiện bất thường tự động:
 * So sánh chi phí thực tế với định mức tuyến đường
 * Nếu chênh lệch > 25% => cờ đỏ is_anomaly = 1
 */
export function evaluateExpenseAnomaly({ expenseType, amount, tripId = null, routeId = null }) {
  let effectiveRoute = null;

  if (tripId) {
    const trip = db.prepare(`
      SELECT t.id, t.route_id, t.route_name, r.default_toll, r.default_fuel_liters, r.default_price
      FROM trips t
      LEFT JOIN routes r ON t.route_id = r.id
      WHERE t.id = ?
    `).get(tripId);

    if (trip) {
      if (trip.route_id) {
        effectiveRoute = {
          id: trip.route_id,
          route_name: trip.route_name,
          default_toll: trip.default_toll || 0,
          default_fuel_liters: trip.default_fuel_liters || 0,
          default_price: trip.default_price || 0
        };
      } else if (trip.route_name) {
        // Tìm theo tên tuyến
        const r = db.prepare('SELECT * FROM routes WHERE route_name = ? LIMIT 1').get(trip.route_name);
        if (r) effectiveRoute = r;
      }
    }
  } else if (routeId) {
    effectiveRoute = db.prepare('SELECT * FROM routes WHERE id = ?').get(routeId);
  }

  // Mặc định không bất thường
  let isAnomaly = 0;
  let reason = null;
  let benchmark = null;
  let diffPercent = 0;

  const numAmount = parseInt(amount || 0, 10);

  if (effectiveRoute) {
    // 1. Kiểm tra vé cầu đường BOT
    if (expenseType === EXPENSE_TYPES.TOLL_BOT) {
      benchmark = effectiveRoute.default_toll || 0;
      if (benchmark > 0) {
        const diff = Math.abs(numAmount - benchmark);
        diffPercent = Math.round((diff / benchmark) * 100);
        if (diff / benchmark > ANOMALY_THRESHOLD) {
          isAnomaly = 1;
          const direction = numAmount > benchmark ? 'vượt' : 'thấp hơn';
          reason = `🔴 Cảnh báo: Vé BOT ${numAmount.toLocaleString('vi-VN')}₫ ${direction} ${diffPercent}% so với định mức tuyến ${effectiveRoute.route_name} (${benchmark.toLocaleString('vi-VN')}₫)`;
        }
      }
    }

    // 2. Kiểm tra tiền dầu Diesel (FUEL)
    else if (expenseType === EXPENSE_TYPES.FUEL) {
      const benchmarkLiters = effectiveRoute.default_fuel_liters || 0;
      if (benchmarkLiters > 0) {
        benchmark = benchmarkLiters * BENCHMARK_FUEL_PRICE_VND;
        const diff = Math.abs(numAmount - benchmark);
        diffPercent = Math.round((diff / benchmark) * 100);
        if (diff / benchmark > ANOMALY_THRESHOLD) {
          isAnomaly = 1;
          const direction = numAmount > benchmark ? 'vượt' : 'thấp hơn';
          reason = `🔴 Cảnh báo: Tiền dầu ${numAmount.toLocaleString('vi-VN')}₫ ${direction} ${diffPercent}% so với định mức ${benchmarkLiters}L ~ ${benchmark.toLocaleString('vi-VN')}₫`;
        }
      }
    }

    // 3. Kiểm tra phí nâng/hạ quá bất thường (> 3.000.000₫ cho 1 cuốc)
    else if (expenseType === EXPENSE_TYPES.LIFT_ON || expenseType === EXPENSE_TYPES.LIFT_OFF) {
      const standardLiftBenchmark = 1890000;
      if (numAmount > standardLiftBenchmark * 1.5) {
        isAnomaly = 1;
        diffPercent = Math.round(((numAmount - standardLiftBenchmark) / standardLiftBenchmark) * 100);
        reason = `🔴 Cảnh báo: Phí nâng/hạ ${numAmount.toLocaleString('vi-VN')}₫ cao bất thường (> 150% phí cảng chuẩn)`;
      }
    }
  }

  return {
    isAnomaly,
    reason,
    benchmark,
    diffPercent
  };
}

/**
 * Quét toàn bộ chi phí của chuyến xe và kiểm tra tính đầy đủ / bất thường:
 * - Cờ Đỏ 🔴: Các khoản chi phí chênh lệch > 25%
 * - Cờ Vàng 🟡: Nghi ngờ quên nhập chi phí cần thiết (BOT, Dầu)
 */
export function inspectTripExpenseWarnings(tripId) {
  const trip = db.prepare(`
    SELECT t.*, r.default_toll, r.default_fuel_liters, r.distance_km
    FROM trips t
    LEFT JOIN routes r ON t.route_id = r.id
    WHERE t.id = ?
  `).get(tripId);

  if (!trip) return { redFlags: [], yellowFlags: [], summary: {} };

  const expenseRows = db.prepare(`
    SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at ASC
  `).all(tripId);

  const redFlags = [];
  const yellowFlags = [];

  let totalTripExpense = 0;
  let totalFixedExpense = 0;
  let totalVariableExpense = 0;

  let hasBot = false;
  let hasFuel = false;
  let hasLiftOn = false;
  let hasLiftOff = false;

  for (const exp of expenseRows) {
    const amt = parseInt(exp.amount || 0, 10);
    totalTripExpense += amt;

    if (exp.category === EXPENSE_CATEGORIES.FIXED) {
      totalFixedExpense += amt;
    } else {
      totalVariableExpense += amt;
    }

    if (exp.expense_type === EXPENSE_TYPES.TOLL_BOT) hasBot = true;
    if (exp.expense_type === EXPENSE_TYPES.FUEL) hasFuel = true;
    if (exp.expense_type === EXPENSE_TYPES.LIFT_ON) hasLiftOn = true;
    if (exp.expense_type === EXPENSE_TYPES.LIFT_OFF) hasLiftOff = true;

    if (exp.is_anomaly === 1) {
      redFlags.push({
        expenseId: exp.id,
        type: exp.expense_type,
        amount: amt,
        label: EXPENSE_TYPE_LABELS[exp.expense_type] || exp.expense_type,
        note: exp.note
      });
    }
  }

  // Kiểm tra cờ vàng (nghi ngờ quên nhập)
  if (trip.default_toll && trip.default_toll > 0 && !hasBot) {
    yellowFlags.push({
      type: 'MISSING_BOT',
      severity: 'WARNING',
      message: `🟡 Chú ý: Tuyến [${trip.route_name}] có vé BOT định mức (${trip.default_toll.toLocaleString('vi-VN')}₫) nhưng chưa ghi nhận vé BOT thực tế!`
    });
  }

  // Chuyến xe nhà nhưng chưa ghi nhận tiền dầu
  if (trip.is_subcontractor === 0 && !hasFuel && trip.default_fuel_liters && trip.default_fuel_liters > 0) {
    yellowFlags.push({
      type: 'MISSING_FUEL',
      severity: 'WARNING',
      message: `🟡 Chú ý: Xe nhà [${trip.vehicle_plate}] chưa ghi nhận tiền dầu Diesel thực tế (Định mức tuyến: ${trip.default_fuel_liters}L)!`
    });
  }

  // Chuyến có điểm nhận / trả cảng nhưng chưa có nâng/hạ
  if (trip.pickup_location && !hasLiftOn) {
    yellowFlags.push({
      type: 'MISSING_LIFT_ON',
      severity: 'INFO',
      message: `🟡 Chú ý: Cuốc xe có nâng cont tại [${trip.pickup_location}] nhưng chưa nhập phí nâng.`
    });
  }

  return {
    redFlags,
    yellowFlags,
    summary: {
      totalTripExpense,
      totalFixedExpense,
      totalVariableExpense,
      count: expenseRows.length,
      anomalyCount: redFlags.length,
      tripRevenue: trip.total_revenue || 0,
      estimatedProfit: (trip.total_revenue || 0) - totalTripExpense - (trip.driver_salary || 0)
    }
  };
}

/**
 * Lấy danh sách chi phí của một chuyến xe cụ thể
 */
export function getTripExpenses(tripId) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) {
    throw new Error(`Không tìm thấy cuốc xe với ID: ${tripId}`);
  }

  const items = db.prepare(`
    SELECT * FROM expenses 
    WHERE trip_id = ? 
    ORDER BY created_at ASC
  `).all(tripId);

  const warnings = inspectTripExpenseWarnings(tripId);

  return {
    trip,
    expenses: items,
    warnings
  };
}

/**
 * Lấy danh sách chi phí tổng hợp có bộ lọc và phân quyền RBAC
 */
export function getAllExpenses({ 
  tripId = null, 
  vehicleId = null, 
  category = null, 
  expenseType = null, 
  isAnomaly = null,
  limit = 50, 
  offset = 0, 
  user = null 
}) {
  const whereClauses = [];
  const params = [];

  if (tripId) {
    whereClauses.push('e.trip_id = ?');
    params.push(tripId);
  }

  if (vehicleId) {
    whereClauses.push('e.vehicle_id = ?');
    params.push(vehicleId);
  }

  if (category) {
    whereClauses.push('e.category = ?');
    params.push(category);
  }

  if (expenseType) {
    whereClauses.push('e.expense_type = ?');
    params.push(expenseType);
  }

  if (isAnomaly !== null && isAnomaly !== undefined) {
    whereClauses.push('e.is_anomaly = ?');
    params.push(isAnomaly ? 1 : 0);
  }

  // RBAC scope
  if (user) {
    if (user.role === USER_ROLES.DRIVER) {
      whereClauses.push('t.driver_id = ?');
      params.push(user.userId);
    } else if (user.role === USER_ROLES.AREA_MANAGER && user.areaId) {
      whereClauses.push('t.area_id = ?');
      params.push(user.areaId);
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT 
      e.*,
      t.trip_code,
      t.trip_date,
      t.vehicle_plate,
      t.driver_name,
      t.customer_name,
      t.route_name,
      v.plate_number AS vehicle_registered_plate
    FROM expenses e
    LEFT JOIN trips t ON e.trip_id = t.id
    LEFT JOIN vehicles v ON e.vehicle_id = v.id
    ${whereSql}
    ORDER BY e.expense_date DESC, e.created_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  const items = db.prepare(sql).all(...params);

  const countSql = `
    SELECT COUNT(*) as total
    FROM expenses e
    LEFT JOIN trips t ON e.trip_id = t.id
    LEFT JOIN vehicles v ON e.vehicle_id = v.id
    ${whereSql}
  `;
  const countParams = params.slice(0, -2);
  const total = db.prepare(countSql).get(...countParams)?.total || 0;

  return { items, total, limit, offset };
}

/**
 * Thêm một khoản chi phí mới
 */
export function createExpense({ expenseData, user, ipAddress = null }) {
  const {
    trip_id = null,
    vehicle_id = null,
    expense_type,
    category = EXPENSE_CATEGORIES.VARIABLE,
    amount = 0,
    expense_date,
    note = '',
    receipt_url = null
  } = expenseData;

  if (!expense_type) {
    throw new Error('Vui lòng chọn loại chi phí (expense_type).');
  }

  const numAmount = parseInt(amount || 0, 10);
  if (numAmount < 0) {
    throw new Error('Số tiền chi phí không được là số âm.');
  }

  // Ngày chi phí: nếu không truyền thì lấy ngày chuyến hoặc ngày hôm nay
  let effectiveDate = expense_date;
  let effectiveVehicleId = vehicle_id;

  if (trip_id) {
    const trip = db.prepare('SELECT trip_date, vehicle_id FROM trips WHERE id = ?').get(trip_id);
    if (!trip) throw new Error(`Không tìm thấy chuyến xe [${trip_id}]`);
    if (!effectiveDate) effectiveDate = trip.trip_date;
    if (!effectiveVehicleId) effectiveVehicleId = trip.vehicle_id;
  }

  if (!effectiveDate) {
    effectiveDate = new Date().toISOString().slice(0, 10);
  }

  // Kiểm tra Khóa Sổ Kỳ
  if (isPeriodLocked(effectiveDate)) {
    const err = new Error(`Kỳ kế toán tháng ${effectiveDate.slice(0, 7)} đã bị khóa sổ. Không thể thêm chi phí.`);
    err.status = 423;
    throw err;
  }

  // Kiểm tra bất thường
  const anomalyResult = evaluateExpenseAnomaly({
    expenseType: expense_type,
    amount: numAmount,
    tripId: trip_id
  });

  const id = uuidv4();
  const now = new Date().toISOString();

  let finalNote = note || '';
  if (anomalyResult.isAnomaly && anomalyResult.reason) {
    finalNote = finalNote ? `${finalNote} [${anomalyResult.reason}]` : anomalyResult.reason;
  }

  const insertStmt = db.prepare(`
    INSERT INTO expenses (
      id, trip_id, vehicle_id, expense_type, category, amount,
      expense_date, note, receipt_url, is_anomaly, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(
    id,
    trip_id,
    effectiveVehicleId,
    expense_type,
    category,
    numAmount,
    effectiveDate,
    finalNote,
    receipt_url,
    anomalyResult.isAnomaly ? 1 : 0,
    now,
    now
  );

  const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || null,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.CREATE,
    tableName: 'expenses',
    recordId: id,
    oldValues: null,
    newValues: created,
    reason: `Thêm chi phí ${EXPENSE_TYPE_LABELS[expense_type] || expense_type}: ${numAmount.toLocaleString('vi-VN')}₫`,
    ipAddress
  });

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('EXPENSE_CREATED', {
    trigger: 'CREATE_EXPENSE',
    reason: `Thêm chi phí ${EXPENSE_TYPE_LABELS[expense_type] || expense_type}: ${numAmount.toLocaleString('vi-VN')}₫`
  });

  return {
    expense: created,
    anomalyInfo: anomalyResult
  };
}

/**
 * Cập nhật một khoản chi phí
 */
export function updateExpense({ expenseId, updateData, user, ipAddress = null }) {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
  if (!existing) {
    throw new Error(`Không tìm thấy khoản chi phí với ID: ${expenseId}`);
  }

  // Kiểm tra Khóa Sổ Kỳ ở cả ngày cũ và ngày mới (nếu sửa ngày)
  if (isPeriodLocked(existing.expense_date)) {
    const err = new Error(`Kỳ kế toán tháng ${existing.expense_date.slice(0, 7)} đã bị khóa sổ. Không thể sửa chi phí.`);
    err.status = 423;
    throw err;
  }

  const newDate = updateData.expense_date || existing.expense_date;
  if (isPeriodLocked(newDate)) {
    const err = new Error(`Kỳ kế toán tháng ${newDate.slice(0, 7)} đã bị khóa sổ. Không thể chuyển chi phí sang tháng đã khóa.`);
    err.status = 423;
    throw err;
  }

  const newAmount = updateData.amount !== undefined ? parseInt(updateData.amount, 10) : existing.amount;
  const newType = updateData.expense_type || existing.expense_type;
  const newTripId = updateData.trip_id !== undefined ? updateData.trip_id : existing.trip_id;

  // Tính lại bất thường
  const anomalyResult = evaluateExpenseAnomaly({
    expenseType: newType,
    amount: newAmount,
    tripId: newTripId
  });

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE expenses SET
      trip_id = ?,
      vehicle_id = ?,
      expense_type = ?,
      category = ?,
      amount = ?,
      expense_date = ?,
      note = ?,
      receipt_url = ?,
      is_anomaly = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    newTripId,
    updateData.vehicle_id !== undefined ? updateData.vehicle_id : existing.vehicle_id,
    newType,
    updateData.category || existing.category,
    newAmount,
    newDate,
    updateData.note !== undefined ? updateData.note : existing.note,
    updateData.receipt_url !== undefined ? updateData.receipt_url : existing.receipt_url,
    anomalyResult.isAnomaly ? 1 : 0,
    now,
    expenseId
  );

  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || null,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.UPDATE,
    tableName: 'expenses',
    recordId: expenseId,
    oldValues: existing,
    newValues: updated,
    reason: updateData.reason || `Sửa chi phí ${EXPENSE_TYPE_LABELS[newType] || newType}: ${newAmount.toLocaleString('vi-VN')}₫`,
    ipAddress
  });

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('EXPENSE_UPDATED', {
    trigger: 'UPDATE_EXPENSE',
    reason: `Sửa chi phí ${EXPENSE_TYPE_LABELS[newType] || newType}: ${newAmount.toLocaleString('vi-VN')}₫`
  });

  return {
    expense: updated,
    anomalyInfo: anomalyResult
  };
}

/**
 * Xóa một khoản chi phí
 */
export function deleteExpense({ expenseId, user, ipAddress = null }) {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
  if (!existing) {
    throw new Error(`Không tìm thấy khoản chi phí với ID: ${expenseId}`);
  }

  if (isPeriodLocked(existing.expense_date)) {
    const err = new Error(`Kỳ kế toán tháng ${existing.expense_date.slice(0, 7)} đã bị khóa sổ. Không thể xóa chi phí.`);
    err.status = 423;
    throw err;
  }

  db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || null,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.DELETE,
    tableName: 'expenses',
    recordId: expenseId,
    oldValues: existing,
    newValues: null,
    reason: `Xóa khoản chi phí: ${EXPENSE_TYPE_LABELS[existing.expense_type] || existing.expense_type} - ${existing.amount.toLocaleString('vi-VN')}₫`,
    ipAddress
  });

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('EXPENSE_DELETED', {
    trigger: 'DELETE_EXPENSE',
    reason: `Xóa khoản chi phí ${EXPENSE_TYPE_LABELS[existing.expense_type] || existing.expense_type}`
  });

  return { success: true, deletedId: expenseId };
}

/**
 * Lưu gộp trọn bộ chi phí một chuyến xe (1-Click Batch Save)
 * Rất thuận tiện trên giao diện nhập chi phí cuốc xe
 */
export function batchSaveTripExpenses({ tripId, expensesList, user, ipAddress = null }) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) throw new Error(`Không tìm thấy cuốc xe [${tripId}]`);

  if (isPeriodLocked(trip.trip_date)) {
    const err = new Error(`Kỳ kế toán tháng ${trip.trip_date.slice(0, 7)} đã bị khóa sổ.`);
    err.status = 423;
    throw err;
  }

  const results = [];

  const runTx = db.transaction(() => {
    // Xóa các chi phí cũ của chuyến nếu client gửi danh sách đầy đủ
    // Hoặc cập nhật từng mục
    for (const item of expensesList) {
      if (item.id) {
        // Cập nhật khoản đã có
        const res = updateExpense({
          expenseId: item.id,
          updateData: {
            ...item,
            trip_id: tripId,
            vehicle_id: trip.vehicle_id,
            expense_date: trip.trip_date
          },
          user,
          ipAddress
        });
        results.push(res);
      } else {
        // Thêm mới
        const res = createExpense({
          expenseData: {
            ...item,
            trip_id: tripId,
            vehicle_id: trip.vehicle_id,
            expense_date: trip.trip_date
          },
          user,
          ipAddress
        });
        results.push(res);
      }
    }
  });

  runTx();

  const warnings = inspectTripExpenseWarnings(tripId);

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('BATCH_EXPENSES_SAVED', {
    trigger: 'BATCH_EXPENSES',
    reason: `Lưu gộp ${results.length} chi phí chuyến ${trip.trip_code}`
  });

  return {
    tripId,
    savedCount: results.length,
    warnings
  };
}

/**
 * Thống kê chi phí theo tháng hoặc quý (cho Dashboard & Báo cáo)
 */
export function getExpenseAnalytics({ month = null, year = null }) {
  let dateFilter = '';
  const params = [];

  if (month) {
    dateFilter = 'WHERE expense_date LIKE ?';
    params.push(`${month}%`);
  } else if (year) {
    dateFilter = 'WHERE expense_date LIKE ?';
    params.push(`${year}%`);
  }

  // Thống kê theo loại chi phí
  const typeStats = db.prepare(`
    SELECT 
      expense_type, 
      category,
      COUNT(*) as count, 
      SUM(amount) as total_amount,
      SUM(is_anomaly) as anomaly_count
    FROM expenses
    ${dateFilter}
    GROUP BY expense_type, category
    ORDER BY total_amount DESC
  `).all(...params);

  // Thống kê Cố định vs Biến động
  const categoryStats = db.prepare(`
    SELECT 
      category, 
      COUNT(*) as count, 
      SUM(amount) as total_amount
    FROM expenses
    ${dateFilter}
    GROUP BY category
  `).all(...params);

  return {
    typeStats,
    categoryStats
  };
}

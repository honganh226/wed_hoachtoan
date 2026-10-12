/**
 * ============================================================
 * ADVANCE SERVICE - WED_HOACHTOAN
 * Phân hệ Tạm Ứng Trước Chuyến & Quyết Toán Hoàn Ứng (Task 3.3)
 * ============================================================
 * Quy chuẩn:
 * - Tiền tệ: Số nguyên VND Integer
 * - Trạng thái: PENDING (Chờ quyết toán) | SETTLED (Đã quyết toán)
 * - Tự động tính chênh lệch balance_amount = advance_amount - settled_amount
 *   + balance > 0: Tài xế thừa tiền nộp hoàn lại quỹ
 *   + balance < 0: Tài xế chi âm tiền túi, quỹ bù lại
 *   + balance = 0: Khớp chính xác
 * - Kiểm tra Khóa Sổ Kỳ (Period Lock) và Ghi vết Audit Log
 * ============================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/audit.service.js';
import { isPeriodLocked } from '../services/periodLock.service.js';
import { ADVANCE_STATUSES, USER_ROLES } from '../db/schema.js';
import { broadcastPLUpdate } from './plEngine.service.js';

/**
 * Lấy danh sách tạm ứng có phân quyền và bộ lọc
 */
export function getAdvances({ tripId = null, driverId = null, status = null, limit = 50, offset = 0, user = null }) {
  const whereClauses = [];
  const params = [];

  // Phân quyền RBAC
  if (user) {
    if (user.role === USER_ROLES.DRIVER) {
      // Tài xế chỉ xem được tạm ứng của chính mình
      const drv = db.prepare('SELECT id FROM drivers WHERE user_id = ? OR full_name LIKE ?').get(user.userId, `%${user.username}%`);
      const effectiveDriverId = drv?.id || user.userId;
      whereClauses.push('ta.driver_id = ?');
      params.push(effectiveDriverId);
    } else if (user.role === USER_ROLES.AREA_MANAGER && user.areaId) {
      // Quản lý khu chỉ xem tài xế khu mình
      whereClauses.push('d.area_id = ?');
      params.push(user.areaId);
    }
  }

  if (tripId) {
    whereClauses.push('ta.trip_id = ?');
    params.push(tripId);
  }

  if (driverId) {
    whereClauses.push('ta.driver_id = ?');
    params.push(driverId);
  }

  if (status) {
    whereClauses.push('ta.status = ?');
    params.push(status);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT 
      ta.*,
      t.trip_code,
      t.trip_date,
      t.vehicle_plate,
      t.customer_name,
      t.route_name,
      d.full_name AS driver_name,
      d.area_id AS driver_area_id
    FROM trip_advances ta
    LEFT JOIN trips t ON ta.trip_id = t.id
    LEFT JOIN drivers d ON ta.driver_id = d.id
    ${whereSql}
    ORDER BY ta.advance_date DESC, ta.created_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);

  // Đếm tổng số bản ghi
  const countSql = `
    SELECT COUNT(*) as total
    FROM trip_advances ta
    LEFT JOIN trips t ON ta.trip_id = t.id
    LEFT JOIN drivers d ON ta.driver_id = d.id
    ${whereSql}
  `;
  const countParams = params.slice(0, -2);
  const totalCount = db.prepare(countSql).get(...countParams)?.total || 0;

  return {
    items: rows,
    total: totalCount,
    limit,
    offset
  };
}

/**
 * Thống kê tổng quan tạm ứng & hoàn ứng
 */
export function getAdvanceSummary(user = null) {
  let whereSql = '';
  const params = [];

  if (user && user.role === USER_ROLES.DRIVER) {
    const drv = db.prepare('SELECT id FROM drivers WHERE user_id = ? OR full_name LIKE ?').get(user.userId, `%${user.username}%`);
    const effectiveDriverId = drv?.id || user.userId;
    whereSql = 'WHERE driver_id = ?';
    params.push(effectiveDriverId);
  } else if (user && user.role === USER_ROLES.AREA_MANAGER && user.areaId) {
    whereSql = 'WHERE driver_id IN (SELECT id FROM drivers WHERE area_id = ?)';
    params.push(user.areaId);
  }

  const sql = `
    SELECT 
      COUNT(*) AS total_count,
      COALESCE(SUM(advance_amount), 0) AS total_advance,
      COALESCE(SUM(settled_amount), 0) AS total_settled,
      COALESCE(SUM(CASE WHEN status = '${ADVANCE_STATUSES.PENDING}' THEN advance_amount ELSE 0 END), 0) AS pending_amount,
      COUNT(CASE WHEN status = '${ADVANCE_STATUSES.PENDING}' THEN 1 END) AS pending_count,
      COUNT(CASE WHEN status = '${ADVANCE_STATUSES.SETTLED}' THEN 1 END) AS settled_count,
      COALESCE(SUM(CASE WHEN status = '${ADVANCE_STATUSES.SETTLED}' AND balance_amount > 0 THEN balance_amount ELSE 0 END), 0) AS surplus_amount,
      COALESCE(SUM(CASE WHEN status = '${ADVANCE_STATUSES.SETTLED}' AND balance_amount < 0 THEN ABS(balance_amount) ELSE 0 END), 0) AS deficit_amount
    FROM trip_advances
    ${whereSql}
  `;

  return db.prepare(sql).get(...params);
}

/**
 * Tạo phiếu xuất tạm ứng trước chuyến đi
 */
export function createAdvance({ trip_id, driver_id = null, advance_date, advance_amount, notes = '', user, ipAddress = null }) {
  if (!trip_id) throw new Error('Vui lòng chọn chuyến xe cần tạm ứng');
  if (!advance_date) throw new Error('Ngày xuất tạm ứng là bắt buộc');

  const numAmount = Math.round(Number(advance_amount) || 0);
  if (numAmount <= 0) {
    throw new Error('Số tiền tạm ứng phải lớn hơn 0 VNĐ');
  }

  // Kiểm tra khóa sổ kỳ
  if (isPeriodLocked(advance_date)) {
    throw new Error(`Kỳ kế toán tháng [${advance_date.slice(0, 7)}] đã bị KHÓA SỔ. Không thể xuất tạm ứng trong kỳ này.`);
  }

  // Tra cứu thông tin chuyến xe
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(trip_id);
  if (!trip) throw new Error('Không tìm thấy chuyến xe tương ứng');

  if (trip.is_locked === 1 || isPeriodLocked(trip.trip_date)) {
    throw new Error(`Chuyến xe thuộc kỳ tháng [${trip.trip_date.slice(0, 7)}] đã bị KHÓA SỔ.`);
  }

  let finalDriverId = driver_id || trip.driver_id;
  if (!finalDriverId) {
    // Nếu chuyến chưa gán tài xế, tra theo tên tài xế trên chuyến
    if (trip.driver_name) {
      const d = db.prepare('SELECT id FROM drivers WHERE full_name = ? LIMIT 1').get(trip.driver_name);
      if (d) finalDriverId = d.id;
    }
  }

  if (!finalDriverId) {
    throw new Error('Chuyến xe này chưa có thông tin Tài xế nhận tiền tạm ứng');
  }

  const advanceId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO trip_advances (
      id, trip_id, driver_id, advance_date, advance_amount,
      settled_amount, balance_amount, status, settled_at, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, NULL, ?, ?, ?)
  `).run(
    advanceId, trip_id, finalDriverId, advance_date, numAmount,
    ADVANCE_STATUSES.PENDING, notes || null, now, now
  );

  const createdAdvance = db.prepare(`
    SELECT ta.*, t.trip_code, t.vehicle_plate, d.full_name AS driver_name
    FROM trip_advances ta
    LEFT JOIN trips t ON ta.trip_id = t.id
    LEFT JOIN drivers d ON ta.driver_id = d.id
    WHERE ta.id = ?
  `).get(advanceId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.CREATE,
    tableName: 'trip_advances',
    recordId: advanceId,
    oldValues: null,
    newValues: createdAdvance,
    reason: `Xuất tạm ứng ${numAmount.toLocaleString('vi-VN')} đ cho tài xế ${createdAdvance.driver_name || ''} (Chuyến ${trip.trip_code})`,
    ipAddress
  });

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('ADVANCE_CREATED', {
    trigger: 'CREATE_ADVANCE',
    reason: `Xuất tạm ứng ${numAmount.toLocaleString('vi-VN')}₫ cho tài xế ${createdAdvance.driver_name || ''}`
  });

  return createdAdvance;
}

/**
 * Quyết toán hoàn ứng sau chuyến đi
 * balance = advance_amount - settled_amount
 */
export function settleAdvance({ advanceId, settled_amount, notes = '', user, ipAddress = null }) {
  const advance = db.prepare(`
    SELECT ta.*, t.trip_code, t.trip_date, d.full_name as driver_name
    FROM trip_advances ta
    LEFT JOIN trips t ON ta.trip_id = t.id
    LEFT JOIN drivers d ON ta.driver_id = d.id
    WHERE ta.id = ?
  `).get(advanceId);

  if (!advance) throw new Error('Không tìm thấy phiếu tạm ứng cần quyết toán');

  // Kiểm tra khóa sổ kỳ
  if (isPeriodLocked(advance.advance_date)) {
    throw new Error(`Kỳ kế toán tháng [${advance.advance_date.slice(0, 7)}] đã bị KHÓA SỔ. Không thể sửa quyết toán.`);
  }

  const numSettled = Math.round(Number(settled_amount) || 0);
  if (numSettled < 0) {
    throw new Error('Số tiền thực chi không được âm');
  }

  const numAdvance = advance.advance_amount;
  const balance = numAdvance - numSettled; // > 0: thừa nộp lại, < 0: thiếu bù thêm

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE trip_advances
    SET settled_amount = ?,
        balance_amount = ?,
        status = ?,
        settled_at = ?,
        notes = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    numSettled,
    balance,
    ADVANCE_STATUSES.SETTLED,
    now,
    notes ? `${advance.notes ? advance.notes + ' | ' : ''}${notes}` : advance.notes,
    now,
    advanceId
  );

  const updatedAdvance = db.prepare(`
    SELECT ta.*, t.trip_code, t.vehicle_plate, d.full_name AS driver_name
    FROM trip_advances ta
    LEFT JOIN trips t ON ta.trip_id = t.id
    LEFT JOIN drivers d ON ta.driver_id = d.id
    WHERE ta.id = ?
  `).get(advanceId);

  // Ghi Audit Log
  const settleDesc = balance > 0 
    ? `Thừa ${balance.toLocaleString('vi-VN')} đ nộp quỹ`
    : balance < 0 
    ? `Thiếu ${Math.abs(balance).toLocaleString('vi-VN')} đ quỹ bù tài xế`
    : 'Khớp hoàn toàn 0 đ';

  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.UPDATE,
    tableName: 'trip_advances',
    recordId: advanceId,
    oldValues: advance,
    newValues: updatedAdvance,
    reason: `Quyết toán hoàn ứng chuyến ${advance.trip_code}: Thực chi ${numSettled.toLocaleString('vi-VN')} đ (${settleDesc})`,
    ipAddress
  });

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('ADVANCE_SETTLED', {
    trigger: 'SETTLE_ADVANCE',
    reason: `Quyết toán hoàn ứng chuyến ${advance.trip_code} (${settleDesc})`
  });

  return updatedAdvance;
}

/**
 * Cập nhật thông tin phiếu tạm ứng
 */
export function updateAdvance({ advanceId, updateData, user, ipAddress = null }) {
  const oldAdvance = db.prepare('SELECT * FROM trip_advances WHERE id = ?').get(advanceId);
  if (!oldAdvance) throw new Error('Không tìm thấy phiếu tạm ứng');

  if (isPeriodLocked(oldAdvance.advance_date)) {
    throw new Error(`Kỳ kế toán tháng [${oldAdvance.advance_date.slice(0, 7)}] đã bị KHÓA SỔ.`);
  }

  const fields = [];
  const params = [];
  const now = new Date().toISOString();

  if (updateData.advance_amount !== undefined) {
    const amt = Math.round(Number(updateData.advance_amount) || 0);
    fields.push('advance_amount = ?');
    params.push(amt);
    if (oldAdvance.status === ADVANCE_STATUSES.SETTLED) {
      fields.push('balance_amount = ?');
      params.push(amt - oldAdvance.settled_amount);
    }
  }

  if (updateData.advance_date !== undefined) {
    if (isPeriodLocked(updateData.advance_date)) {
      throw new Error(`Kỳ kế toán mới [${updateData.advance_date.slice(0, 7)}] đã bị KHÓA SỔ.`);
    }
    fields.push('advance_date = ?');
    params.push(updateData.advance_date);
  }

  if (updateData.notes !== undefined) {
    fields.push('notes = ?');
    params.push(updateData.notes);
  }

  if (fields.length === 0) return oldAdvance;

  fields.push('updated_at = ?');
  params.push(now);
  params.push(advanceId);

  db.prepare(`UPDATE trip_advances SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM trip_advances WHERE id = ?').get(advanceId);

  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.UPDATE,
    tableName: 'trip_advances',
    recordId: advanceId,
    oldValues: oldAdvance,
    newValues: updated,
    reason: `Cập nhật phiếu tạm ứng ${advanceId}`,
    ipAddress
  });

  return updated;
}

/**
 * Xóa phiếu tạm ứng
 */
export function deleteAdvance({ advanceId, user, ipAddress = null }) {
  const advance = db.prepare('SELECT * FROM trip_advances WHERE id = ?').get(advanceId);
  if (!advance) throw new Error('Không tìm thấy phiếu tạm ứng cần xóa');

  if (isPeriodLocked(advance.advance_date)) {
    throw new Error(`Kỳ kế toán tháng [${advance.advance_date.slice(0, 7)}] đã bị KHÓA SỔ. Không thể xóa.`);
  }

  db.prepare('DELETE FROM trip_advances WHERE id = ?').run(advanceId);

  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.DELETE,
    tableName: 'trip_advances',
    recordId: advanceId,
    oldValues: advance,
    newValues: null,
    reason: `Xóa phiếu tạm ứng trị giá ${advance.advance_amount.toLocaleString('vi-VN')} đ`,
    ipAddress
  });

  return { success: true, deletedId: advanceId };
}

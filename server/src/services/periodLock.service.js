/**
 * ============================================================
 * PERIOD LOCK SERVICE - WED_HOACHTOAN
 * ============================================================
 * Quản lý chốt kỳ kế toán theo tháng (YYYY-MM):
 * - Khi kỳ đã khóa: cấm tuyệt đối thêm/sửa/xóa cuốc xe, chi phí, tạm ứng trong tháng đó.
 * - Chỉ Giám Đốc (DIRECTOR) mới có quyền mở khóa sổ (Unlock).
 * - Cả Giám Đốc và Kế Toán có thể thực hiện khóa sổ kỳ (Lock).
 * - Mọi thao tác khóa/mở đều tự động ghi vết vào bảng audit_logs.
 * ============================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { recordAuditLog, AUDIT_ACTIONS } from './audit.service.js';

/**
 * Kiểm tra xem một tháng (YYYY-MM) hoặc ngày cụ thể (YYYY-MM-DD) có đang bị khóa hay không
 * @param {string} dateOrMonth - Ví dụ "2026-09" hoặc "2026-09-15"
 * @returns {boolean}
 */
export function isPeriodLocked(dateOrMonth) {
  if (!dateOrMonth) return false;
  // Trích xuất YYYY-MM
  const month = dateOrMonth.slice(0, 7);
  const row = db.prepare('SELECT is_locked FROM period_locks WHERE period_month = ?').get(month);
  return !!(row && row.is_locked === 1);
}

/**
 * Lấy danh sách trạng thái khóa của tất cả các kỳ trong DB kèm các tháng có dữ liệu
 */
export function getPeriodLocksStatus() {
  // 1. Lấy tất cả kỳ đã từng ghi nhận trong period_locks
  const locks = db.prepare('SELECT * FROM period_locks ORDER BY period_month DESC').all();

  // 2. Lấy danh sách các tháng phát sinh dữ liệu từ bảng trips
  const tripMonths = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', trip_date) as month, COUNT(*) as trip_count, SUM(total_revenue) as total_revenue
    FROM trips 
    WHERE trip_date IS NOT NULL
    GROUP BY month 
    ORDER BY month DESC
  `).all();

  // Map lại danh sách tổng hợp
  const lockMap = new Map();
  for (const l of locks) {
    lockMap.set(l.period_month, l);
  }

  const result = tripMonths.map(tm => {
    const lockInfo = lockMap.get(tm.month);
    return {
      period_month: tm.month,
      trip_count: tm.trip_count,
      total_revenue: tm.total_revenue || 0,
      is_locked: lockInfo ? lockInfo.is_locked === 1 : false,
      locked_by: lockInfo ? lockInfo.locked_by : null,
      locked_at: lockInfo ? lockInfo.locked_at : null,
      notes: lockInfo ? lockInfo.notes : null,
    };
  });

  // Thêm các tháng có trong period_locks nhưng không có trips (nếu có)
  for (const l of locks) {
    if (!result.find(r => r.period_month === l.period_month)) {
      result.push({
        period_month: l.period_month,
        trip_count: 0,
        total_revenue: 0,
        is_locked: l.is_locked === 1,
        locked_by: l.locked_by,
        locked_at: l.locked_at,
        notes: l.notes,
      });
    }
  }

  result.sort((a, b) => b.period_month.localeCompare(a.period_month));
  return result;
}

/**
 * Khóa sổ một kỳ tháng
 */
export function lockPeriod({ periodMonth, user, notes = '', ipAddress = null }) {
  if (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth)) {
    throw new Error('Định dạng kỳ tháng không hợp lệ (yêu cầu định dạng YYYY-MM, ví dụ: 2026-09)');
  }

  const existing = db.prepare('SELECT * FROM period_locks WHERE period_month = ?').get(periodMonth);
  const now = new Date().toISOString();

  if (existing) {
    if (existing.is_locked === 1) {
      return { success: true, message: `Kỳ ${periodMonth} vốn đã ở trạng thái khóa sổ từ trước.` };
    }

    db.prepare(`
      UPDATE period_locks 
      SET is_locked = 1, locked_by = ?, locked_at = ?, notes = ?
      WHERE period_month = ?
    `).run(user?.username || 'SYSTEM', now, notes, periodMonth);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO period_locks (id, period_month, is_locked, locked_by, locked_at, notes)
      VALUES (?, ?, 1, ?, ?, ?)
    `).run(id, periodMonth, user?.username || 'SYSTEM', now, notes);
  }

  // Cập nhật cờ is_locked = 1 cho tất cả các trips trong tháng đó để đồng bộ hóa
  db.prepare(`
    UPDATE trips 
    SET is_locked = 1 
    WHERE strftime('%Y-%m', trip_date) = ?
  `).run(periodMonth);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.PERIOD_LOCK,
    tableName: 'period_locks',
    recordId: periodMonth,
    oldValues: existing ? { is_locked: existing.is_locked } : null,
    newValues: { is_locked: 1, period_month: periodMonth, locked_by: user?.username, locked_at: now, notes },
    reason: notes || `Khóa sổ kỳ kế toán ${periodMonth}`,
    ipAddress
  });

  return {
    success: true,
    period_month: periodMonth,
    is_locked: true,
    locked_by: user?.username,
    locked_at: now,
    message: `Đã khóa sổ kỳ kế toán tháng ${periodMonth} thành công. Mọi thao tác sửa cuốc xe đã bị vô hiệu hóa.`
  };
}

/**
 * Mở khóa sổ một kỳ tháng (CHỈ GIÁM ĐỐC)
 */
export function unlockPeriod({ periodMonth, user, notes = '', ipAddress = null }) {
  if (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth)) {
    throw new Error('Định dạng kỳ tháng không hợp lệ (yêu cầu định dạng YYYY-MM)');
  }

  const existing = db.prepare('SELECT * FROM period_locks WHERE period_month = ?').get(periodMonth);
  const now = new Date().toISOString();

  if (!existing || existing.is_locked === 0) {
    return { success: true, message: `Kỳ ${periodMonth} hiện chưa bị khóa.` };
  }

  db.prepare(`
    UPDATE period_locks 
    SET is_locked = 0, notes = ?
    WHERE period_month = ?
  `).run(notes || 'Đã mở khóa bởi Giám Đốc', periodMonth);

  // Mở khóa cho các chuyến xe trong tháng
  db.prepare(`
    UPDATE trips 
    SET is_locked = 0 
    WHERE strftime('%Y-%m', trip_date) = ?
  `).run(periodMonth);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || user?.id,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.PERIOD_UNLOCK,
    tableName: 'period_locks',
    recordId: periodMonth,
    oldValues: { is_locked: 1, locked_by: existing.locked_by, locked_at: existing.locked_at },
    newValues: { is_locked: 0, unlocked_by: user?.username, unlocked_at: now, notes },
    reason: notes || `Mở khóa sổ kỳ kế toán ${periodMonth} bởi Giám Đốc`,
    ipAddress
  });

  return {
    success: true,
    period_month: periodMonth,
    is_locked: false,
    message: `Đã mở khóa sổ kỳ kế toán tháng ${periodMonth} thành công.`
  };
}

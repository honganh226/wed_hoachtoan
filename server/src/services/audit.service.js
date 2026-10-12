/**
 * ============================================================
 * AUDIT SERVICE - WED_HOACHTOAN
 * ============================================================
 * Ghi nhận tự động lịch sử thay đổi (Audit Log):
 * - Ai sửa cước, sửa tiền, sửa KPI, khóa sổ, tạo/xóa chuyến
 * - Giá trị cũ (oldValues) vs Giá trị mới (newValues) dạng JSON
 * - Lý do chỉnh sửa (reason)
 * - Địa chỉ IP client và thời gian chuẩn ISO 8601
 * ============================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';

export const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  PERIOD_LOCK: 'PERIOD_LOCK',
  PERIOD_UNLOCK: 'PERIOD_UNLOCK',
  KPI_CHANGE: 'KPI_CHANGE',
  BATCH_PAYMENT: 'BATCH_PAYMENT',
  BACKUP: 'BACKUP',
  IMPORT: 'IMPORT',
};

/**
 * Ghi 1 bản ghi vào bảng audit_logs
 * @param {Object} params
 * @param {string} [params.userId]
 * @param {string} [params.username]
 * @param {string} params.action - CREATE | UPDATE | DELETE | PERIOD_LOCK | PERIOD_UNLOCK | KPI_CHANGE
 * @param {string} params.tableName - trips | period_locks | expenses | drivers...
 * @param {string} params.recordId - ID bản ghi bị tác động
 * @param {Object|null} [params.oldValues] - Trạng thái trước khi sửa
 * @param {Object|null} [params.newValues] - Trạng thái sau khi sửa
 * @param {string} [params.reason] - Lý do thay đổi
 * @param {string} [params.ipAddress] - IP của client
 */
export function recordAuditLog({
  userId = null,
  username = 'SYSTEM',
  action,
  tableName,
  recordId,
  oldValues = null,
  newValues = null,
  reason = null,
  ipAddress = null
}) {
  try {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const oldValuesJson = oldValues ? JSON.stringify(oldValues) : null;
    const newValuesJson = newValues ? JSON.stringify(newValues) : null;

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        id, user_id, username, action, table_name, record_id, 
        old_values, new_values, reason, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      userId,
      username,
      action,
      tableName,
      recordId,
      oldValuesJson,
      newValuesJson,
      reason,
      ipAddress,
      createdAt
    );

    return { id, action, tableName, recordId, createdAt };
  } catch (err) {
    console.error('[AUDIT LOG ERROR] Không thể ghi audit log:', err.message);
    return null;
  }
}

/**
 * Lấy danh sách audit logs hỗ trợ lọc
 */
export function getAuditLogs({
  limit = 50,
  tableName = null,
  recordId = null,
  action = null
} = {}) {
  let query = 'SELECT * FROM audit_logs';
  const conditions = [];
  const params = [];

  if (tableName) {
    conditions.push('table_name = ?');
    params.push(tableName);
  }
  if (recordId) {
    conditions.push('record_id = ?');
    params.push(recordId);
  }
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const logs = db.prepare(query).all(...params);

  return logs.map(log => {
    let parsedOld = null;
    let parsedNew = null;
    try {
      if (log.old_values) parsedOld = JSON.parse(log.old_values);
    } catch (e) {
      parsedOld = log.old_values;
    }
    try {
      if (log.new_values) parsedNew = JSON.parse(log.new_values);
    } catch (e) {
      parsedNew = log.new_values;
    }
    return {
      ...log,
      old_values: parsedOld,
      new_values: parsedNew
    };
  });
}

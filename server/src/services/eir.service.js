/**
 * ============================================================
 * EIR SERVICE - WED_HOACHTOAN
 * Module Phiếu Phơi Container & Cảnh Báo Đọng Phơi (Task 3.5)
 * ============================================================
 * Quy chuẩn:
 * - Ảnh phơi chụp từ mobile camera hoặc upload file
 * - Nén ảnh lưu trữ tối ưu trong server/uploads/eir/
 * - Cập nhật trạng thái: DA_TRA (Đã trả) / CHUA_TRA (Chưa trả)
 * - Vòng đời chuyến chuyển tiếp sang EIR_SUBMITTED
 * - Cảnh báo đọng phơi: diffDays > 3 ngày chưa trả phơi
 * - Kiểm tra Khóa Sổ Kỳ và Ghi vết Audit Log
 * ============================================================
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/audit.service.js';
import { isPeriodLocked } from '../services/periodLock.service.js';
import { EIR_STATUSES, EIR_PAID_STATUSES, TRIP_STATUSES } from '../db/schema.js';
import { broadcastPLUpdate } from './plEngine.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_EIR_DIR = path.join(__dirname, '../../uploads/eir');

// Đảm bảo thư mục lưu ảnh tồn tại
if (!fs.existsSync(UPLOADS_EIR_DIR)) {
  fs.mkdirSync(UPLOADS_EIR_DIR, { recursive: true });
}

/**
 * Lấy danh sách các chuyến xe đọng phơi (> 3 ngày chưa nộp/trả phơi)
 */
export function getPendingEirTrips({ minDaysOverdue = 3, user = null } = {}) {
  const whereClauses = ["t.eir_status != 'DA_TRA'"];
  const params = [];

  if (user) {
    if (user.role === 'DRIVER') {
      whereClauses.push('t.driver_id = ?');
      params.push(user.userId);
    } else if (user.role === 'AREA_MANAGER' && user.areaId) {
      whereClauses.push('t.area_id = ?');
      params.push(user.areaId);
    }
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

  const sql = `
    SELECT 
      t.id,
      t.trip_code,
      t.trip_date,
      t.vehicle_plate,
      t.driver_name,
      t.customer_name,
      t.route_name,
      t.status,
      t.eir_status,
      t.eir_paid_status,
      t.eir_photo_url,
      t.eir_submitted_at,
      t.area_id,
      c.container_number,
      c.container_size
    FROM trips t
    LEFT JOIN containers c ON t.id = c.trip_id AND (c.is_second_cont = 0 OR c.is_second_cont IS NULL)
    ${whereSql}
    ORDER BY t.trip_date ASC
  `;

  const allPending = db.prepare(sql).all(...params);

  // Tính số ngày đọng phơi so với ngày hôm nay
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueList = [];

  for (const item of allPending) {
    const tripDate = new Date(item.trip_date);
    tripDate.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - tripDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= minDaysOverdue) {
      overdueList.push({
        ...item,
        days_overdue: diffDays,
        warning_level: diffDays >= 7 ? 'CRITICAL' : 'WARNING',
        warning_message: `⚠️ Đọng phơi ${diffDays} ngày (Chuyến ngày ${item.trip_date})`
      });
    }
  }

  // Sắp xếp số ngày đọng lâu nhất lên đầu
  overdueList.sort((a, b) => b.days_overdue - a.days_overdue);

  return {
    overdueCount: overdueList.length,
    minDaysOverdue,
    items: overdueList
  };
}

/**
 * Lưu ảnh phơi dạng Base64 hoặc từ File Upload và cập nhật cuốc xe
 */
export function saveTripEirPhoto({ tripId, filename, base64Data = null, user = null, ipAddress = null }) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) {
    throw new Error(`Không tìm thấy cuốc xe với ID: ${tripId}`);
  }

  // Kiểm tra Khóa Sổ Kỳ
  if (isPeriodLocked(trip.trip_date)) {
    const err = new Error(`Kỳ kế toán tháng ${trip.trip_date.slice(0, 7)} đã bị khóa sổ.`);
    err.status = 423;
    throw err;
  }

  let finalRelativeUrl = '';

  if (base64Data) {
    // Tách header data:image/jpeg;base64, nếu có
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = 'jpg';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('png')) ext = 'png';
      else if (mime.includes('webp')) ext = 'webp';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64Data, 'base64');
    }

    const safeTripCode = trip.trip_code.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFilename = `eir_${safeTripCode}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOADS_EIR_DIR, safeFilename);

    fs.writeFileSync(filePath, buffer);
    finalRelativeUrl = `/uploads/eir/${safeFilename}`;
  } else if (filename) {
    // Nếu upload qua multer diskStorage
    finalRelativeUrl = `/uploads/eir/${filename}`;
  } else {
    throw new Error('Dữ liệu ảnh phơi không hợp lệ.');
  }

  const nowIso = new Date().toISOString();

  // Chuyển trạng thái sang DA_TRA và EIR_SUBMITTED nếu hợp lý
  let nextStatus = trip.status;
  if (trip.status !== TRIP_STATUSES.PAID) {
    nextStatus = TRIP_STATUSES.EIR_SUBMITTED;
  }

  db.prepare(`
    UPDATE trips SET
      eir_photo_url = ?,
      eir_status = ?,
      eir_submitted_at = ?,
      status = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    finalRelativeUrl,
    EIR_STATUSES.DA_TRA,
    nowIso,
    nextStatus,
    nowIso,
    tripId
  );

  const updatedTrip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || null,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.UPDATE,
    tableName: 'trips',
    recordId: tripId,
    oldValues: { eir_photo_url: trip.eir_photo_url, eir_status: trip.eir_status, status: trip.status },
    newValues: { eir_photo_url: finalRelativeUrl, eir_status: EIR_STATUSES.DA_TRA, status: nextStatus },
    reason: `Cập nhật ảnh phiếu phơi cuốc xe [${trip.trip_code}] và chuyển trạng thái Đã Trả Phơi`,
    ipAddress
  });

  return {
    trip: updatedTrip,
    photoUrl: finalRelativeUrl
  };
}

/**
 * Cập nhật trạng thái phiếu phơi & trạng thái thanh toán phơi
 */
export function updateTripEirStatus({ tripId, eirStatus, eirPaidStatus, notes, user = null, ipAddress = null }) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) {
    throw new Error(`Không tìm thấy cuốc xe với ID: ${tripId}`);
  }

  if (isPeriodLocked(trip.trip_date)) {
    const err = new Error(`Kỳ kế toán tháng ${trip.trip_date.slice(0, 7)} đã bị khóa sổ.`);
    err.status = 423;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const newEirStatus = eirStatus || trip.eir_status;
  const newEirPaid = eirPaidStatus || trip.eir_paid_status;
  const newNotes = notes !== undefined ? notes : trip.notes;

  let submittedAt = trip.eir_submitted_at;
  if (newEirStatus === EIR_STATUSES.DA_TRA && !submittedAt) {
    submittedAt = nowIso;
  } else if (newEirStatus === EIR_STATUSES.CHUA_TRA) {
    submittedAt = null;
  }

  // Cập nhật trạng thái vòng đời
  let nextTripStatus = trip.status;
  if (newEirStatus === EIR_STATUSES.DA_TRA && trip.status !== TRIP_STATUSES.PAID) {
    nextTripStatus = TRIP_STATUSES.EIR_SUBMITTED;
  }

  db.prepare(`
    UPDATE trips SET
      eir_status = ?,
      eir_paid_status = ?,
      eir_submitted_at = ?,
      status = ?,
      notes = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    newEirStatus,
    newEirPaid,
    submittedAt,
    nextTripStatus,
    newNotes,
    nowIso,
    tripId
  );

  const updated = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || null,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.UPDATE,
    tableName: 'trips',
    recordId: tripId,
    oldValues: { eir_status: trip.eir_status, eir_paid_status: trip.eir_paid_status, status: trip.status },
    newValues: { eir_status: newEirStatus, eir_paid_status: newEirPaid, status: nextTripStatus },
    reason: `Cập nhật trạng thái phơi: [${newEirStatus}], thanh toán phơi: [${newEirPaid}]`,
    ipAddress
  });

  // Phát tín hiệu cập nhật P&L Real-time SSE
  broadcastPLUpdate('EIR_STATUS_CHANGED', {
    trigger: 'UPDATE_EIR',
    reason: `Cập nhật phơi chuyến ${trip.trip_code} (Trạng thái: ${newEirStatus}, Thanh toán: ${newEirPaid})`
  });

  return updated;
}

/**
 * Xóa ảnh phiếu phơi của cuốc xe
 */
export function removeTripEirPhoto({ tripId, user = null, ipAddress = null }) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) {
    throw new Error(`Không tìm thấy cuốc xe với ID: ${tripId}`);
  }

  if (isPeriodLocked(trip.trip_date)) {
    const err = new Error(`Kỳ kế toán tháng ${trip.trip_date.slice(0, 7)} đã bị khóa sổ.`);
    err.status = 423;
    throw err;
  }

  // Xóa file vật lý nếu có
  if (trip.eir_photo_url && trip.eir_photo_url.startsWith('/uploads/eir/')) {
    const filename = trip.eir_photo_url.replace('/uploads/eir/', '');
    const fullPath = path.join(UPLOADS_EIR_DIR, filename);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        console.warn('[EIR] Lỗi khi xóa file ảnh vật lý:', e.message);
      }
    }
  }

  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE trips SET
      eir_photo_url = NULL,
      eir_status = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    EIR_STATUSES.CHUA_TRA,
    nowIso,
    tripId
  );

  const updated = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);

  // Ghi Audit Log
  recordAuditLog({
    userId: user?.userId || null,
    username: user?.username || 'SYSTEM',
    action: AUDIT_ACTIONS.UPDATE,
    tableName: 'trips',
    recordId: tripId,
    oldValues: { eir_photo_url: trip.eir_photo_url, eir_status: trip.eir_status },
    newValues: { eir_photo_url: null, eir_status: EIR_STATUSES.CHUA_TRA },
    reason: `Gỡ bỏ ảnh phiếu phơi cuốc xe [${trip.trip_code}]`,
    ipAddress
  });

  return updated;
}

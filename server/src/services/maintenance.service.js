/**
 * ============================================================
 * MAINTENANCE SERVICE - PHÂN HỆ QUẢN LÝ ĐỘI XE & BẢO DƯỠNG
 * ============================================================
 * Task 6.2: Quản lý đội xe, chu kỳ thay dầu/lốp, cảnh báo hạn xe
 * và cơ chế duyệt sửa chữa 100% thuộc Giám đốc (DIRECTOR).
 * ============================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import {
  MAINTENANCE_TYPES,
  MAINTENANCE_STATUSES,
  VEHICLE_STATUSES,
  EXPENSE_CATEGORIES,
  USER_ROLES
} from '../db/schema.js';
import { recordAuditLog } from './audit.service.js';
import { broadcastPLUpdate } from './plEngine.service.js';

/**
 * Tính số ngày còn lại đến ngày hết hạn so với mốc thời gian
 * Trả về { diffDays, status, label, color, isAlert, severity }
 */
export function calculateExpiryAlert(expiryDateStr, baseDate = new Date()) {
  if (!expiryDateStr) {
    return {
      date: null,
      diffDays: null,
      status: 'UNKNOWN',
      label: 'Chưa cập nhật',
      color: 'gray',
      isAlert: false,
      severity: 0
    };
  }

  const today = new Date(baseDate);
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(expiryDateStr);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      date: expiryDateStr,
      diffDays,
      status: 'EXPIRED',
      label: `Quá hạn ${Math.abs(diffDays)} ngày`,
      color: 'red',
      isAlert: true,
      severity: 3
    };
  }

  if (diffDays <= 15) {
    return {
      date: expiryDateStr,
      diffDays,
      status: 'URGENT',
      label: `Khẩn cấp: Còn ${diffDays} ngày`,
      color: 'red',
      isAlert: true,
      severity: 2
    };
  }

  if (diffDays <= 30) {
    return {
      date: expiryDateStr,
      diffDays,
      status: 'WARNING',
      label: `Cảnh báo: Còn ${diffDays} ngày`,
      color: 'yellow',
      isAlert: true,
      severity: 1
    };
  }

  return {
    date: expiryDateStr,
    diffDays,
    status: 'GOOD',
    label: `Còn ${diffDays} ngày`,
    color: 'green',
    isAlert: false,
    severity: 0
  };
}

/**
 * Tính toán chu kỳ thay dầu/lốp của xe
 */
export function calculateOilChangeStatus(vehicle) {
  const currentKm = vehicle.current_km || 0;
  const lastKm = vehicle.last_maintenance_km || 0;
  const interval = vehicle.oil_change_interval_km || 10000;

  const kmSinceLast = Math.max(0, currentKm - lastKm);
  const remainingKm = interval - kmSinceLast;
  const usagePercentage = Math.min(100, Math.round((kmSinceLast / interval) * 100));

  let status = 'GOOD';
  let label = `Còn ${remainingKm.toLocaleString('vi-VN')} km`;
  let color = 'green';
  let isAlert = false;

  if (remainingKm <= 0) {
    status = 'EXPIRED';
    label = `Quá hạn ${Math.abs(remainingKm).toLocaleString('vi-VN')} km! Cần thay dầu ngay`;
    color = 'red';
    isAlert = true;
  } else if (remainingKm <= 1000) {
    status = 'WARNING';
    label = `Sắp đến kỳ: Còn ${remainingKm.toLocaleString('vi-VN')} km`;
    color = 'yellow';
    isAlert = true;
  }

  return {
    currentKm,
    lastKm,
    interval,
    kmSinceLast,
    remainingKm,
    usagePercentage,
    status,
    label,
    color,
    isAlert
  };
}

/**
 * Lấy tổng quan toàn bộ đội xe & cảnh báo hạn
 */
export async function getFleetMaintenanceOverview(user = {}) {
  // 1. Lấy danh sách tất cả các xe kèm thông tin tài xế mặc định
  const query = `
    SELECT 
      v.id,
      v.plate_number,
      v.vehicle_type,
      v.default_driver_id,
      v.status,
      v.inspection_expiry,
      v.insurance_expiry,
      v.current_km,
      v.last_maintenance_km,
      v.oil_change_interval_km,
      v.notes,
      d.full_name as driver_name,
      d.phone as driver_phone,
      d.license_expiry as driver_license_expiry,
      d.area_id as driver_area_id
    FROM vehicles v
    LEFT JOIN drivers d ON v.default_driver_id = d.id
    ${user && user.role === USER_ROLES.AREA_MANAGER && (user.areaId || user.area_id) ? 'WHERE d.area_id = ?' : ''}
    ORDER BY v.plate_number ASC
  `;
  const params = [];
  if (user && user.role === USER_ROLES.AREA_MANAGER && (user.areaId || user.area_id)) {
    params.push(user.areaId || user.area_id);
  }
  const rawVehicles = db.prepare(query).all(...params);

  const now = new Date();

  // 2. Xử lý tính toán cảnh báo cho từng xe
  const vehiclesWithAlerts = rawVehicles.map((v) => {
    const inspectionAlert = calculateExpiryAlert(v.inspection_expiry, now);
    const insuranceAlert = calculateExpiryAlert(v.insurance_expiry, now);
    const licenseAlert = calculateExpiryAlert(v.driver_license_expiry, now);
    const oilStatus = calculateOilChangeStatus(v);

    // Xác định mức độ cảnh báo cao nhất của xe
    const hasRedAlert =
      inspectionAlert.severity >= 2 ||
      insuranceAlert.severity >= 2 ||
      licenseAlert.severity >= 2 ||
      oilStatus.status === 'EXPIRED';

    const hasYellowAlert =
      inspectionAlert.severity === 1 ||
      insuranceAlert.severity === 1 ||
      licenseAlert.severity === 1 ||
      oilStatus.status === 'WARNING';

    let alertSummary = 'NORMAL';
    if (hasRedAlert) alertSummary = 'CRITICAL';
    else if (hasYellowAlert) alertSummary = 'WARNING';

    return {
      ...v,
      inspectionAlert,
      insuranceAlert,
      licenseAlert,
      oilStatus,
      alertSummary
    };
  });

  // 3. Lấy số lượng đề xuất bảo dưỡng đang chờ duyệt (PENDING)
  const pendingRow = db.prepare(
    'SELECT COUNT(*) as count FROM maintenance_proposals WHERE status = ?'
  ).get(MAINTENANCE_STATUSES.PENDING);
  const pendingCount = pendingRow ? Number(pendingRow.count) : 0;

  // 4. Thống kê KPI tổng quan
  const totalVehicles = vehiclesWithAlerts.length;
  const activeCount = vehiclesWithAlerts.filter((v) => v.status === VEHICLE_STATUSES.ACTIVE).length;
  const idleCount = vehiclesWithAlerts.filter((v) => v.status === VEHICLE_STATUSES.IDLE).length;
  const maintenanceCount = vehiclesWithAlerts.filter((v) => v.status === VEHICLE_STATUSES.MAINTENANCE).length;

  const oilAlertCount = vehiclesWithAlerts.filter((v) => v.oilStatus.isAlert).length;
  const inspectionAlertCount = vehiclesWithAlerts.filter((v) => v.inspectionAlert.isAlert).length;
  const insuranceAlertCount = vehiclesWithAlerts.filter((v) => v.insuranceAlert.isAlert).length;
  const licenseAlertCount = vehiclesWithAlerts.filter((v) => v.licenseAlert.isAlert).length;

  const totalAlertCount = vehiclesWithAlerts.filter((v) => v.alertSummary !== 'NORMAL').length;

  return {
    summary: {
      totalVehicles,
      activeCount,
      idleCount,
      maintenanceCount,
      oilAlertCount,
      inspectionAlertCount,
      insuranceAlertCount,
      licenseAlertCount,
      totalAlertCount,
      pendingProposalsCount: pendingCount
    },
    vehicles: vehiclesWithAlerts
  };
}

/**
 * Lấy danh sách đề xuất bảo dưỡng
 */
export async function getMaintenanceProposals(filters = {}) {
  let sql = `
    SELECT 
      mp.id,
      mp.vehicle_id,
      mp.proposal_type,
      mp.title,
      mp.description,
      mp.estimated_cost,
      mp.actual_cost,
      mp.km_at_proposal,
      mp.status,
      mp.proposed_by,
      mp.approved_by,
      mp.approved_at,
      mp.rejection_reason,
      mp.completed_at,
      mp.created_at,
      mp.updated_at,
      v.plate_number,
      v.vehicle_type,
      v.status as vehicle_status,
      d.full_name as driver_name
    FROM maintenance_proposals mp
    LEFT JOIN vehicles v ON mp.vehicle_id = v.id
    LEFT JOIN drivers d ON v.default_driver_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.status) {
    sql += ' AND mp.status = ?';
    params.push(filters.status);
  }
  if (filters.vehicleId) {
    sql += ' AND mp.vehicle_id = ?';
    params.push(filters.vehicleId);
  }
  if (filters.user && filters.user.role === USER_ROLES.AREA_MANAGER && (filters.user.areaId || filters.user.area_id)) {
    sql += ' AND d.area_id = ?';
    params.push(filters.user.areaId || filters.user.area_id);
  }

  sql += ' ORDER BY mp.created_at DESC';

  return db.prepare(sql).all(...params);
}

/**
 * Tạo đề xuất bảo dưỡng mới
 */
export async function createMaintenanceProposal(data, user = {}) {
  const {
    vehicle_id,
    proposal_type = MAINTENANCE_TYPES.PERIODIC,
    title,
    description = '',
    estimated_cost = 0
  } = data;

  if (!vehicle_id) {
    throw new Error('Vui lòng chọn xe cần bảo dưỡng');
  }
  if (!title || title.trim() === '') {
    throw new Error('Vui lòng nhập tiêu đề hoặc lý do bảo dưỡng');
  }

  // Lấy thông tin xe để ghi nhận số ODO tại thời điểm đề xuất
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    throw new Error(`Không tìm thấy xe với ID: ${vehicle_id}`);
  }

  const proposalId = uuidv4();
  const now = new Date().toISOString();
  const costInt = Math.round(Number(estimated_cost) || 0);

  const newRecord = {
    id: proposalId,
    vehicle_id,
    proposal_type,
    title: title.trim(),
    description: description ? description.trim() : '',
    estimated_cost: costInt,
    actual_cost: 0,
    km_at_proposal: vehicle.current_km || 0,
    status: MAINTENANCE_STATUSES.PENDING,
    proposed_by: user.username || user.full_name || 'Hệ Thống',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    completed_at: null,
    created_at: now,
    updated_at: now
  };

  db.prepare(`
    INSERT INTO maintenance_proposals (
      id, vehicle_id, proposal_type, title, description,
      estimated_cost, actual_cost, km_at_proposal, status,
      proposed_by, approved_by, approved_at, rejection_reason,
      completed_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `).run(
    newRecord.id, newRecord.vehicle_id, newRecord.proposal_type, newRecord.title, newRecord.description,
    newRecord.estimated_cost, newRecord.actual_cost, newRecord.km_at_proposal, newRecord.status,
    newRecord.proposed_by, newRecord.approved_by, newRecord.approved_at, newRecord.rejection_reason,
    newRecord.completed_at, newRecord.created_at, newRecord.updated_at
  );

  // Ghi nhật ký kiểm toán Audit Log
  recordAuditLog({
    userId: user.id || null,
    username: user.username || 'System',
    action: 'CREATE',
    tableName: 'maintenance_proposals',
    recordId: proposalId,
    newValues: newRecord,
    reason: `Tạo đề xuất bảo dưỡng: ${title} cho xe ${vehicle.plate_number}`
  });

  return {
    ...newRecord,
    plate_number: vehicle.plate_number
  };
}

/**
 * Phê duyệt đề xuất bảo dưỡng (BẢO MẬT: 100% Thuộc Giám đốc DIRECTOR)
 */
export async function approveMaintenanceProposal(proposalId, user = {}) {
  // Kiểm tra quyền hạn nghiêm ngặt
  if (user.role !== USER_ROLES.DIRECTOR) {
    throw new Error('Từ chối quyền truy cập: Chỉ Giám đốc mới có thẩm quyền phê duyệt đề xuất bảo dưỡng!');
  }

  const proposal = db.prepare('SELECT * FROM maintenance_proposals WHERE id = ?').get(proposalId);
  if (!proposal) {
    throw new Error(`Không tìm thấy đề xuất bảo dưỡng với ID: ${proposalId}`);
  }

  if (proposal.status !== MAINTENANCE_STATUSES.PENDING) {
    throw new Error(`Đề xuất này hiện đang ở trạng thái "${proposal.status}", không thể duyệt lại.`);
  }

  const now = new Date().toISOString();

  // 1. Cập nhật trạng thái đề xuất thành APPROVED
  db.prepare(`
    UPDATE maintenance_proposals
    SET status = ?, approved_by = ?, approved_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    MAINTENANCE_STATUSES.APPROVED,
    user.username || user.full_name || 'DIRECTOR',
    now,
    now,
    proposalId
  );

  // 2. Tự động chuyển trạng thái xe sang MAINTENANCE (🔴 Nằm xưởng)
  db.prepare(`
    UPDATE vehicles
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    VEHICLE_STATUSES.MAINTENANCE,
    now,
    proposal.vehicle_id
  );

  // Ghi Audit Log
  recordAuditLog({
    userId: user.id || null,
    username: user.username || 'DIRECTOR',
    action: 'UPDATE',
    tableName: 'maintenance_proposals',
    recordId: proposalId,
    oldValues: { status: proposal.status },
    newValues: { status: MAINTENANCE_STATUSES.APPROVED, approved_by: user.username },
    reason: `Giám đốc duyệt đề xuất bảo dưỡng: ${proposal.title}. Xe chuyển sang trạng thái NẰM XƯỞNG.`
  });

  return {
    success: true,
    message: 'Giám đốc đã phê duyệt đề xuất bảo dưỡng. Xe đã chuyển sang trạng thái Nằm Xưởng.',
    proposalId,
    status: MAINTENANCE_STATUSES.APPROVED
  };
}

/**
 * Từ chối đề xuất bảo dưỡng (Chỉ Giám đốc DIRECTOR)
 */
export async function rejectMaintenanceProposal(proposalId, reason, user = {}) {
  if (user.role !== USER_ROLES.DIRECTOR) {
    throw new Error('Từ chối quyền truy cập: Chỉ Giám đốc mới có thẩm quyền từ chối đề xuất bảo dưỡng!');
  }

  const proposal = db.prepare('SELECT * FROM maintenance_proposals WHERE id = ?').get(proposalId);
  if (!proposal) {
    throw new Error(`Không tìm thấy đề xuất bảo dưỡng với ID: ${proposalId}`);
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE maintenance_proposals
    SET status = ?, rejection_reason = ?, approved_by = ?, updated_at = ?
    WHERE id = ?
  `).run(
    MAINTENANCE_STATUSES.REJECTED,
    reason || 'Giám đốc không duyệt',
    user.username || 'DIRECTOR',
    now,
    proposalId
  );

  recordAuditLog({
    userId: user.id || null,
    username: user.username || 'DIRECTOR',
    action: 'UPDATE',
    tableName: 'maintenance_proposals',
    recordId: proposalId,
    oldValues: { status: proposal.status },
    newValues: { status: MAINTENANCE_STATUSES.REJECTED, rejection_reason: reason },
    reason: `Giám đốc từ chối đề xuất bảo dưỡng: ${reason || 'Không duyệt'}`
  });

  return {
    success: true,
    message: 'Đã từ chối đề xuất bảo dưỡng.',
    proposalId,
    status: MAINTENANCE_STATUSES.REJECTED
  };
}

/**
 * Hoàn thành nghiệm thu bảo dưỡng, xuất xưởng & ghi nhận chi phí CỐ ĐỊNH (FIXED)
 */
export async function completeMaintenanceProposal(proposalId, payload = {}, user = {}) {
  const proposal = db.prepare('SELECT * FROM maintenance_proposals WHERE id = ?').get(proposalId);
  if (!proposal) {
    throw new Error(`Không tìm thấy đề xuất bảo dưỡng với ID: ${proposalId}`);
  }

  if (proposal.status !== MAINTENANCE_STATUSES.APPROVED) {
    throw new Error(`Đề xuất phải ở trạng thái "Đã Duyệt (APPROVED)" mới có thể nghiệm thu hoàn thành.`);
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(proposal.vehicle_id);
  if (!vehicle) {
    throw new Error(`Không tìm thấy xe với ID: ${proposal.vehicle_id}`);
  }

  const now = new Date().toISOString();
  const todayDate = now.split('T')[0];

  // Chi phí thực tế (VND nguyên)
  const actualCostInt = Math.round(
    Number(payload.actual_cost !== undefined ? payload.actual_cost : proposal.estimated_cost) || 0
  );

  // Số km bảo dưỡng cập nhật
  const completionKm = payload.completion_km
    ? Math.round(Number(payload.completion_km))
    : vehicle.current_km || proposal.km_at_proposal;

  // 1. Cập nhật đề xuất thành COMPLETED
  db.prepare(`
    UPDATE maintenance_proposals
    SET status = ?, actual_cost = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    MAINTENANCE_STATUSES.COMPLETED,
    actualCostInt,
    now,
    now,
    proposalId
  );

  // 2. Cập nhật xe: last_maintenance_km = completionKm, status = IDLE (Sẵn sàng nhận cuốc)
  db.prepare(`
    UPDATE vehicles
    SET last_maintenance_km = ?, current_km = MAX(current_km, ?), status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    completionKm,
    completionKm,
    VEHICLE_STATUSES.IDLE,
    now,
    proposal.vehicle_id
  );

  // 3. TỰ ĐỘNG KẾT NỐI VÀO PHÂN HỆ CHI PHÍ CỐ ĐỊNH (Bảng expenses)
  const expenseId = uuidv4();
  db.prepare(`
    INSERT INTO expenses (
      id, trip_id, vehicle_id, expense_type, category,
      amount, expense_date, note, receipt_url, is_anomaly,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
    )
  `).run(
    expenseId,
    null,
    proposal.vehicle_id,
    'REPAIR',
    EXPENSE_CATEGORIES.FIXED,
    actualCostInt,
    todayDate,
    `Bảo dưỡng/Sửa chữa xe ${vehicle.plate_number}: ${proposal.title} (${proposal.proposal_type})`,
    payload.receipt_url || null,
    0,
    now,
    now
  );

  // 4. Phát tín hiệu SSE Real-time P&L Engine để cập nhật tài chính tức thì
  try {
    broadcastPLUpdate('EXPENSE_CREATED', {
      trigger: 'MAINTENANCE_COMPLETED',
      reason: `Chi phí bảo dưỡng xe ${vehicle.plate_number}: ${actualCostInt.toLocaleString('vi-VN')}₫`
    });
  } catch (err) {
    console.warn('[MAINTENANCE] Không thể phát SSE P&L event:', err.message);
  }

  // 5. Ghi Audit Log
  recordAuditLog({
    userId: user.id || null,
    username: user.username || 'System',
    action: 'UPDATE',
    tableName: 'maintenance_proposals',
    recordId: proposalId,
    oldValues: { status: proposal.status },
    newValues: {
      status: MAINTENANCE_STATUSES.COMPLETED,
      actual_cost: actualCostInt,
      expense_id: expenseId
    },
    reason: `Nghiệm thu hoàn tất bảo dưỡng xe ${vehicle.plate_number}. Tự động tạo chi phí cố định ${actualCostInt.toLocaleString('vi-VN')}₫ và đưa xe về bãi chờ việc.`
  });

  return {
    success: true,
    message: `Đã hoàn tất nghiệm thu bảo dưỡng xe ${vehicle.plate_number}. Chi phí cố định ${actualCostInt.toLocaleString('vi-VN')}₫ đã được hạch toán vào hệ thống.`,
    proposalId,
    expenseId,
    actualCost: actualCostInt,
    vehicleStatus: VEHICLE_STATUSES.IDLE,
    lastMaintenanceKm: completionKm
  };
}

/**
 * Cập nhật trực tiếp trạng thái xe (ACTIVE | IDLE | MAINTENANCE)
 */
export async function updateVehicleStatus(vehicleId, newStatus, user = {}) {
  const validStatuses = Object.values(VEHICLE_STATUSES);
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Trạng thái không hợp lệ. Phải là một trong: ${validStatuses.join(', ')}`);
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
  if (!vehicle) {
    throw new Error(`Không tìm thấy xe với ID: ${vehicleId}`);
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE vehicles
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(newStatus, now, vehicleId);

  recordAuditLog({
    userId: user.id || null,
    username: user.username || 'System',
    action: 'UPDATE',
    tableName: 'vehicles',
    recordId: vehicleId,
    oldValues: { status: vehicle.status },
    newValues: { status: newStatus },
    reason: `Đổi trạng thái xe ${vehicle.plate_number} từ ${vehicle.status} sang ${newStatus}`
  });

  return {
    success: true,
    vehicleId,
    plateNumber: vehicle.plate_number,
    newStatus
  };
}

/**
 * Cập nhật số Km hiện tại hoặc chu kỳ bảo dưỡng xe
 */
export async function updateVehicleKm(vehicleId, data = {}, user = {}) {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
  if (!vehicle) {
    throw new Error(`Không tìm thấy xe với ID: ${vehicleId}`);
  }

  const currentKm = data.current_km !== undefined ? Math.round(Number(data.current_km)) : vehicle.current_km;
  const lastKm = data.last_maintenance_km !== undefined ? Math.round(Number(data.last_maintenance_km)) : vehicle.last_maintenance_km;
  const interval = data.oil_change_interval_km !== undefined ? Math.round(Number(data.oil_change_interval_km)) : vehicle.oil_change_interval_km;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE vehicles
    SET current_km = ?, last_maintenance_km = ?, oil_change_interval_km = ?, updated_at = ?
    WHERE id = ?
  `).run(currentKm, lastKm, interval, now, vehicleId);

  recordAuditLog({
    userId: user.id || null,
    username: user.username || 'System',
    action: 'UPDATE',
    tableName: 'vehicles',
    recordId: vehicleId,
    oldValues: {
      current_km: vehicle.current_km,
      last_maintenance_km: vehicle.last_maintenance_km
    },
    newValues: {
      current_km: currentKm,
      last_maintenance_km: lastKm,
      oil_change_interval_km: interval
    },
    reason: `Cập nhật số km đồng hồ cho xe ${vehicle.plate_number}`
  });

  return {
    success: true,
    vehicleId,
    plateNumber: vehicle.plate_number,
    updatedFields: {
      current_km: currentKm,
      last_maintenance_km: lastKm,
      oil_change_interval_km: interval
    }
  };
}

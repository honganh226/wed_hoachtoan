/**
 * ============================================================
 * FLEET SERVICE - DANH SÁCH ĐỘI XE (CHỈ ĐỌC) & CẢNH BÁO HẠN GIẤY TỜ
 * ============================================================
 * Thay thế phân hệ Bảo dưỡng xe đã ngừng sử dụng (06/11/2026).
 * Giữ lại: danh sách xe kèm tài xế phụ trách, hạn đăng kiểm/bảo hiểm/bằng lái.
 * Không còn: đề xuất bảo dưỡng, duyệt sửa chữa, đổi trạng thái nằm xưởng, cập nhật ODO.
 * Bảng `maintenance_proposals` và các cột xe cũ được GIỮ NGUYÊN để đọc dữ liệu lịch sử.
 * ============================================================
 */
import { db } from '../db/database.js';
import { VEHICLE_STATUSES, USER_ROLES } from '../db/schema.js';

/**
 * Tính số ngày còn lại đến ngày hết hạn so với mốc thời gian
 * Trả về { diffDays, status, label, color, isAlert, severity }
 */
export function calculateExpiryAlert(expiryDateStr, baseDate = new Date()) {
  if (!expiryDateStr) {
    return { date: null, diffDays: null, status: 'UNKNOWN', label: 'Chưa cập nhật', color: 'gray', isAlert: false, severity: 0 };
  }

  const today = new Date(baseDate);
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(expiryDateStr);
  targetDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { date: expiryDateStr, diffDays, status: 'EXPIRED', label: `Quá hạn ${Math.abs(diffDays)} ngày`, color: 'red', isAlert: true, severity: 3 };
  }
  if (diffDays <= 15) {
    return { date: expiryDateStr, diffDays, status: 'URGENT', label: `Khẩn cấp: Còn ${diffDays} ngày`, color: 'red', isAlert: true, severity: 2 };
  }
  if (diffDays <= 30) {
    return { date: expiryDateStr, diffDays, status: 'WARNING', label: `Cảnh báo: Còn ${diffDays} ngày`, color: 'yellow', isAlert: true, severity: 1 };
  }
  return { date: expiryDateStr, diffDays, status: 'GOOD', label: `Còn ${diffDays} ngày`, color: 'green', isAlert: false, severity: 0 };
}

/**
 * Chu kỳ ODO của xe - CHỈ còn phục vụ bộ điều xe AI (aiDispatch.service.js).
 * Không có giao diện hay API nào cho phép sửa ODO/bảo dưỡng.
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
    label = `Quá hạn ${Math.abs(remainingKm).toLocaleString('vi-VN')} km`;
    color = 'red';
    isAlert = true;
  } else if (remainingKm <= 1000) {
    status = 'WARNING';
    label = `Sắp đến kỳ: Còn ${remainingKm.toLocaleString('vi-VN')} km`;
    color = 'yellow';
    isAlert = true;
  }

  return { currentKm, lastKm, interval, kmSinceLast, remainingKm, usagePercentage, status, label, color, isAlert };
}

/**
 * Danh sách đội xe (chỉ đọc) kèm tài xế phụ trách và hạn giấy tờ.
 * Quản lý khu chỉ thấy xe thuộc khu vực của mình (theo khu vực tài xế phụ trách).
 */
export function listFleetVehicles(user = {}) {
  const areaId = user && user.role === USER_ROLES.AREA_MANAGER ? (user.areaId || user.area_id) : null;
  const rows = db.prepare(`
    SELECT
      v.id, v.plate_number, v.vehicle_type, v.default_driver_id, v.status,
      v.inspection_expiry, v.insurance_expiry, v.notes,
      d.full_name AS driver_name, d.phone AS driver_phone,
      d.license_expiry AS driver_license_expiry, d.area_id AS driver_area_id
    FROM vehicles v
    LEFT JOIN drivers d ON v.default_driver_id = d.id
    ${areaId ? 'WHERE d.area_id = ?' : ''}
    ORDER BY v.plate_number ASC
  `).all(...(areaId ? [areaId] : []));

  const now = new Date();
  const vehicles = rows.map((v) => {
    const inspectionAlert = calculateExpiryAlert(v.inspection_expiry, now);
    const insuranceAlert = calculateExpiryAlert(v.insurance_expiry, now);
    const licenseAlert = calculateExpiryAlert(v.driver_license_expiry, now);
    const hasAlert = inspectionAlert.severity >= 1 || insuranceAlert.severity >= 1 || licenseAlert.severity >= 1;
    return { ...v, inspectionAlert, insuranceAlert, licenseAlert, hasAlert };
  });

  const count = (s) => vehicles.filter((v) => v.status === s).length;
  const activeCount = count(VEHICLE_STATUSES.ACTIVE);
  const idleCount = count(VEHICLE_STATUSES.IDLE);
  return {
    summary: {
      totalVehicles: vehicles.length,
      activeCount,
      idleCount,
      // Xe có trạng thái cũ khác ACTIVE/IDLE (VD: dữ liệu lịch sử) hiển thị là "Tạm ngừng"
      inactiveCount: vehicles.length - activeCount - idleCount,
      alertCount: vehicles.filter((v) => v.hasAlert).length
    },
    vehicles
  };
}

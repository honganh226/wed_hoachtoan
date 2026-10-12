/**
 * ============================================================
 * KPI API ROUTES - ĐIỀU PHỐI KPI ĐỘNG (TASK 4.4)
 * ============================================================
 * Prefix: /api/v1/kpi
 * ============================================================
 * Endpoints:
 *   GET  /api/v1/kpi/progress          - Tiến độ KPI tất cả tài xế
 *   GET  /api/v1/kpi/driver/:driverId  - Drill-down chi tiết 1 tài xế
 *   PUT  /api/v1/kpi/driver/:driverId  - Cập nhật chỉ tiêu KPI (DIRECTOR only)
 * ============================================================
 */
import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/audit.service.js';
import {
  getDriverKpiProgress,
  getDriverDrilldown,
  updateDriverKpi
} from '../services/kpi.service.js';

const router = Router();

/**
 * GET /api/v1/kpi/progress
 * Lấy tiến độ KPI của tất cả tài xế đang hoạt động
 * Query params: startDate, endDate, month, year (Task 4.3 integration)
 * Phân quyền: DIRECTOR, ACCOUNTANT, AREA_MANAGER (lọc theo khu)
 */
router.get('/progress', authenticateToken, (req, res) => {
  try {
    const { startDate, endDate, month, year } = req.query;
    const user = req.user;

    // DRIVER không được xem bảng KPI tổng hợp
    if (user.role === USER_ROLES.DRIVER) {
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Tài xế không có quyền xem bảng KPI tổng hợp.'
      });
    }

    const kpiData = getDriverKpiProgress({ startDate, endDate, month, year, user });

    return res.json({
      success: true,
      data: kpiData,
      message: `Đã tải tiến độ KPI của ${kpiData.drivers.length} tài xế`
    });
  } catch (err) {
    console.error('[KPI Progress Error]', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: err.message || 'Lỗi khi tải tiến độ KPI'
    });
  }
});

/**
 * GET /api/v1/kpi/driver/:driverId
 * Drill-down: Lấy chi tiết cuốc xe và chi phí của một tài xế trong kỳ
 * Query params: startDate, endDate, month, year
 * Phân quyền: DIRECTOR, ACCOUNTANT (toàn bộ), AREA_MANAGER (khu mình), DRIVER (chỉ bản thân)
 */
router.get('/driver/:driverId', authenticateToken, async (req, res) => {
  try {
    const { driverId } = req.params;
    const { startDate, endDate, month, year } = req.query;
    const user = req.user;

    // DRIVER chỉ được xem chi tiết của chính mình
    if (user.role === USER_ROLES.DRIVER) {
      // Kiểm tra driver này có phải là tài xế đang đăng nhập không
      const { db } = await import('../db/database.js');
      const driverRecord = db.prepare('SELECT id FROM drivers WHERE user_id = ?').get(user.userId);
      if (!driverRecord || driverRecord.id !== driverId) {
        return res.status(403).json({
          success: false,
          data: null,
          error: 'Bạn chỉ có thể xem thông tin KPI của chính mình.'
        });
      }
    }

    const drilldown = getDriverDrilldown({ driverId, startDate, endDate, month, year });

    return res.json({
      success: true,
      data: drilldown,
      message: `Chi tiết cuốc xe của ${drilldown.driver.full_name}`
    });
  } catch (err) {
    console.error('[KPI Drilldown Error]', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: err.message || 'Lỗi khi tải chi tiết KPI tài xế'
    });
  }
});

/**
 * PUT /api/v1/kpi/driver/:driverId
 * Cập nhật chỉ tiêu KPI của tài xế (chỉ DIRECTOR)
 * Body: { new_kpi_target: number (VND), reason: string }
 */
router.put('/driver/:driverId', authenticateToken, requireRole(USER_ROLES.DIRECTOR), (req, res) => {
  try {
    const { driverId } = req.params;
    const { new_kpi_target, reason } = req.body;

    if (new_kpi_target === undefined || new_kpi_target === null) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Thiếu trường new_kpi_target. Nhập 0 để xóa chỉ tiêu KPI.'
      });
    }

    const updateResult = updateDriverKpi({
      driverId,
      newKpiTarget: new_kpi_target,
      reason: reason || 'Giám đốc điều chỉnh chỉ tiêu KPI',
      updatedBy: req.user.username
    });

    // Ghi Audit Log
    recordAuditLog({
      userId: req.user.userId,
      username: req.user.username,
      action: AUDIT_ACTIONS.KPI_CHANGE || 'KPI_CHANGE',
      tableName: 'drivers',
      recordId: driverId,
      oldValues: { kpi_target: updateResult.old_kpi_target },
      newValues: { kpi_target: updateResult.new_kpi_target },
      reason: updateResult.reason,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      data: updateResult,
      message: `Đã cập nhật chỉ tiêu KPI của ${updateResult.full_name}: ${updateResult.old_kpi_target.toLocaleString('vi-VN')} → ${updateResult.new_kpi_target.toLocaleString('vi-VN')} ₫`
    });
  } catch (err) {
    console.error('[KPI Update Error]', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: err.message || 'Lỗi khi cập nhật KPI'
    });
  }
});

export default router;

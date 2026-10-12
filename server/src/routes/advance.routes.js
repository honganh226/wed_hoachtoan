/**
 * ============================================================
 * ADVANCE ROUTES - WED_HOACHTOAN
 * Phân hệ Tạm Ứng Trước Chuyến & Quyết Toán Hoàn Ứng (Task 3.3)
 * ============================================================
 * Tiền tố API: /api/v1/advances
 * ============================================================
 */
import { Router } from 'express';
import { 
  getAdvances, 
  getAdvanceSummary, 
  createAdvance, 
  settleAdvance, 
  updateAdvance, 
  deleteAdvance 
} from '../services/advance.service.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { checkPeriodLock } from '../middlewares/periodLock.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const router = Router();

/**
 * GET /api/v1/advances
 * Lấy danh sách phiếu tạm ứng (có phân quyền RBAC và filter)
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const { trip_id, driver_id, status, limit, offset } = req.query;
    const result = getAdvances({
      tripId: trip_id,
      driverId: driver_id,
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      user: req.user
    });
    return successResponse(res, result, 'Lấy danh sách tạm ứng thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/advances/summary
 * Thống kê tổng quan tạm ứng & hoàn ứng
 */
router.get('/summary', authenticateToken, (req, res) => {
  try {
    const summary = getAdvanceSummary(req.user);
    return successResponse(res, summary, 'Lấy thống kê tạm ứng thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/advances/trip/:tripId
 * Lấy danh sách phiếu tạm ứng của một chuyến xe cụ thể
 */
router.get('/trip/:tripId', authenticateToken, (req, res) => {
  try {
    const result = getAdvances({
      tripId: req.params.tripId,
      user: req.user
    });
    return successResponse(res, result.items, 'Lấy tạm ứng theo chuyến thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/advances
 * Xuất tạm ứng mới trước chuyến đi (Giám Đốc, Kế Toán, Quản Lý Khu)
 */
router.post(
  '/',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]),
  checkPeriodLock({ dateField: 'advance_date' }),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const created = createAdvance({
        ...req.body,
        user: req.user,
        ipAddress
      });
      return successResponse(res, created, 'Xuất tạm ứng thành công', 201);
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * PUT /api/v1/advances/:id/settle
 * Quyết toán hoàn ứng (Giám Đốc, Kế Toán)
 */
router.put(
  '/:id/settle',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT]),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const { settled_amount, notes } = req.body;
      const settled = settleAdvance({
        advanceId: req.params.id,
        settled_amount,
        notes,
        user: req.user,
        ipAddress
      });
      return successResponse(res, settled, 'Quyết toán hoàn ứng thành công');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * PUT /api/v1/advances/:id
 * Sửa thông tin phiếu tạm ứng
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT]),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const updated = updateAdvance({
        advanceId: req.params.id,
        updateData: req.body,
        user: req.user,
        ipAddress
      });
      return successResponse(res, updated, 'Cập nhật phiếu tạm ứng thành công');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * DELETE /api/v1/advances/:id
 * Xóa phiếu tạm ứng
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT]),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const result = deleteAdvance({
        advanceId: req.params.id,
        user: req.user,
        ipAddress
      });
      return successResponse(res, result, 'Đã xóa phiếu tạm ứng');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

export default router;

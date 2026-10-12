/**
 * ============================================================
 * PERIOD LOCK ROUTES - WED_HOACHTOAN
 * ============================================================
 * Tiền tố: /api/v1/period-lock
 * - GET  /status : Xem trạng thái các kỳ tháng (Ai cũng xem được)
 * - POST /lock   : Khóa sổ kỳ tháng (DIRECTOR & ACCOUNTANT)
 * - POST /unlock : Mở khóa sổ kỳ tháng (CHỈ RIÊNG DIRECTOR)
 * ============================================================
 */
import { Router } from 'express';
import { getPeriodLocksStatus, lockPeriod, unlockPeriod } from '../services/periodLock.service.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const router = Router();

/**
 * GET /api/v1/period-lock/status
 * Danh sách tình trạng khóa của các kỳ tháng
 */
router.get('/status', (req, res) => {
  try {
    const list = getPeriodLocksStatus();
    return successResponse(res, list, 'Lấy danh sách trạng thái khóa sổ kỳ thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/period-lock/lock
 * Khóa sổ một kỳ tháng (Giám Đốc hoặc Kế Toán)
 */
router.post('/lock', authenticateToken, requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT]), (req, res) => {
  try {
    const { period_month, notes } = req.body;
    if (!period_month) {
      return errorResponse(res, 'Vui lòng cung cấp tháng cần khóa sổ (period_month dạng YYYY-MM)', 400);
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = lockPeriod({
      periodMonth: period_month,
      user: req.user,
      notes: notes || `Khóa sổ bởi ${req.user.role === USER_ROLES.DIRECTOR ? 'Giám Đốc' : 'Kế Toán'} ${req.user.full_name}`,
      ipAddress
    });

    return successResponse(res, result, result.message);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/period-lock/unlock
 * Mở khóa sổ một kỳ tháng (CHỈ GIÁM ĐỐC)
 */
router.post('/unlock', authenticateToken, requireRole(USER_ROLES.DIRECTOR), (req, res) => {
  try {
    const { period_month, notes } = req.body;
    if (!period_month) {
      return errorResponse(res, 'Vui lòng cung cấp tháng cần mở khóa sổ (period_month dạng YYYY-MM)', 400);
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = unlockPeriod({
      periodMonth: period_month,
      user: req.user,
      notes: notes || `Mở khóa sổ bởi Giám Đốc ${req.user.full_name}`,
      ipAddress
    });

    return successResponse(res, result, result.message);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

export default router;

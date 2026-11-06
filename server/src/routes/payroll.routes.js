/**
 * ============================================================
 * PAYROLL ROUTES - API BẢNG LƯƠNG 3 THÀNH PHẦN & APP TÀI XẾ
 * ============================================================
 * Hệ Thống Quản Lý Điều Vận Container - WED_HOACHTOAN
 * 
 * Các Endpoint:
 * - GET  /api/v1/payroll/summary      : Bảng lương tổng hợp toàn đội theo tháng (RBAC)
 * - POST /api/v1/payroll/incentive    : Cập nhật khoản động viên GĐ (DIRECTOR only)
 * ============================================================
 */

import express from 'express';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';
import { successResponse, errorResponse } from '../utils/response.js';
import {
  getPayrollSummary,
  upsertDriverIncentive
} from '../services/payroll.service.js';

const router = express.Router();

/**
 * GET /api/v1/payroll/summary
 * Lấy bảng lương tổng hợp toàn đội theo tháng
 * Phân quyền: DIRECTOR, ACCOUNTANT, AREA_MANAGER, DRIVER
 */
router.get('/summary', authenticateToken, (req, res) => {
  try {
    const { month } = req.query;
    const data = getPayrollSummary({
      periodMonth: month || null,
      user: req.user
    });
    return successResponse(res, data, `Tải bảng lương tháng ${data.period_month} thành công`);
  } catch (err) {
    console.error('[API PAYROLL SUMMARY ERROR]', err);
    return errorResponse(res, err.message, 500);
  }
});

/**
 * POST /api/v1/payroll/incentive
 * Cập nhật khoản động viên của Giám đốc cho tài xế (DIRECTOR ONLY)
 */
router.post('/incentive', authenticateToken, requireRole(USER_ROLES.DIRECTOR), (req, res) => {
  try {
    const { driver_id, period_month, incentive_amount, incentive_note, base_salary_override } = req.body;

    if (!driver_id) {
      return errorResponse(res, 'Vui lòng cung cấp driver_id', 400);
    }
    if (!period_month) {
      return errorResponse(res, 'Vui lòng cung cấp period_month (YYYY-MM)', 400);
    }

    const result = upsertDriverIncentive({
      driverId: driver_id,
      periodMonth: period_month,
      incentiveAmount: incentive_amount || 0,
      incentiveNote: incentive_note || '',
      baseSalaryOverride: base_salary_override !== undefined ? base_salary_override : null,
      user: req.user,
      ipAddress: req.ip
    });

    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error('[API PAYROLL INCENTIVE ERROR]', err);
    return errorResponse(res, err.message, 400);
  }
});

export default router;

/**
 * ============================================================
 * AUDIT LOG ROUTES - WED_HOACHTOAN
 * ============================================================
 * Tiền tố: /api/v1/audit-logs
 * Tra cứu lịch sử thay đổi:
 * - Giám Đốc & Kế Toán có thể tra cứu toàn bộ vết
 * ============================================================
 */
import { Router } from 'express';
import { getAuditLogs } from '../services/audit.service.js';
import { successResponse, serverErrorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const router = Router();

/**
 * GET /api/v1/audit-logs
 * Danh sách nhật ký kiểm toán mới nhất
 */
router.get('/', authenticateToken, requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT]), (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const tableName = req.query.tableName || null;
    const recordId = req.query.recordId || null;
    const action = req.query.action || null;

    const logs = getAuditLogs({ limit, tableName, recordId, action });
    return successResponse(res, logs, `Lấy danh sách ${logs.length} nhật ký kiểm toán thành công`);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

export default router;

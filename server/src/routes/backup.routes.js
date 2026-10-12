/**
 * Backup Routes - API endpoints cho chức năng Backup Database
 * Bảo vệ bằng RBAC: Chỉ Giám Đốc mới có quyền tạo backup, tải về hoặc reset!
 */
import { Router } from 'express';
import {
  createBackup,
  listBackups,
  getBackupFilePath,
  resetDatabase,
  getBackupStats,
} from '../services/backup.service.js';
import {
  getOffsiteBackupStatus,
  getOffsiteBackupHistory,
  performOffsiteBackup,
} from '../services/offsiteBackup.service.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const router = Router();

// Toàn bộ API sao lưu và quản lý backup bắt buộc đăng nhập với vai trò Giám Đốc hoặc Kế Toán
router.use(authenticateToken);
router.use(requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT));

// =============================================
// GET /api/v1/backup/stats
// Thống kê tổng quan (DIRECTOR & ACCOUNTANT)
// =============================================
router.get('/stats', (req, res) => {
  try {
    const stats = getBackupStats();
    return successResponse(res, stats, 'Lấy thống kê backup thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

// =============================================
// GET /api/v1/backup/list
// Danh sách các file backup
// =============================================
router.get('/list', (req, res) => {
  try {
    const backups = listBackups();
    return successResponse(res, {
      backups,
      total: backups.length,
    }, `Tìm thấy ${backups.length} file backup`);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

// =============================================
// POST /api/v1/backup/create
// Tạo backup mới (Chỉ DIRECTOR)
// =============================================
router.post('/create', authenticateToken, requireRole(USER_ROLES.DIRECTOR), (req, res) => {
  try {
    console.log(`[API] Giám đốc [${req.user.username}] yêu cầu tạo backup mới...`);
    const result = createBackup();
    return successResponse(res, result, result.message, 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

// =============================================
// GET /api/v1/backup/download/:filename
// Tải file backup về máy (Chỉ DIRECTOR)
// =============================================
router.get('/download/:filename', authenticateToken, requireRole(USER_ROLES.DIRECTOR), (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = getBackupFilePath(filename);

    if (!filepath) {
      return errorResponse(res, `Không tìm thấy file backup: ${filename}`, 404);
    }

    console.log(`[API] Gửi file backup: ${filename}`);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(filepath);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

// =============================================
// POST /api/v1/backup/reset
// Reset toàn bộ database (Chỉ DIRECTOR tuyệt đối)
// =============================================
router.post('/reset', authenticateToken, requireRole(USER_ROLES.DIRECTOR), (req, res) => {
  try {
    const { confirmPhrase } = req.body;

    const REQUIRED_CONFIRM = 'XAC_NHAN_XOA_TOAN_BO_DU_LIEU';
    if (confirmPhrase !== REQUIRED_CONFIRM) {
      return errorResponse(
        res,
        `Thiếu hoặc sai câu xác nhận. Gửi { "confirmPhrase": "${REQUIRED_CONFIRM}" } để xác nhận.`,
        400
      );
    }

    console.log(`[API] ⚠️ Giám đốc [${req.user.username}] thực hiện RESET DATABASE...`);
    const result = resetDatabase();
    return successResponse(res, result, result.message);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

// =============================================
// OFFSITE BACKUP ENDPOINTS (Task 7.4)
// =============================================

// GET /api/v1/backup/offsite/status
// Lấy trạng thái và cấu hình sao lưu hàng đêm ra Telegram
router.get('/offsite/status', (req, res) => {
  try {
    const status = getOffsiteBackupStatus();
    return successResponse(res, status, 'Lấy trạng thái Offsite Backup thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

// GET /api/v1/backup/offsite/history
// Lịch sử sao lưu offsite gần nhất
router.get('/offsite/history', (req, res) => {
  try {
    const history = getOffsiteBackupHistory();
    return successResponse(res, {
      history,
      total: history.length
    }, `Lấy ${history.length} bản ghi lịch sử sao lưu offsite`);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

// POST /api/v1/backup/offsite/trigger
// Kích hoạt sao lưu ngay lập tức gửi ra Telegram (Chỉ DIRECTOR)
router.post('/offsite/trigger', authenticateToken, requireRole(USER_ROLES.DIRECTOR), async (req, res) => {
  try {
    const { channel } = req.body;
    console.log(`[API] Giám Đốc [${req.user.username}] yêu cầu kích hoạt sao lưu Offsite...`);
    const result = await performOffsiteBackup({
      triggeredBy: `DIRECTOR_MANUAL (${req.user.username})`,
      channel: channel || 'TELEGRAM',
    });
    return successResponse(res, result, result.message, 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

export default router;


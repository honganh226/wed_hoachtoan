/**
 * ============================================================
 * MAINTENANCE ROUTES - API QUẢN LÝ ĐỘI XE & BẢO DƯỠNG
 * ============================================================
 * Tiền tố: /api/v1/maintenance
 * ============================================================
 */
import { Router } from 'express';
import {
  getFleetMaintenanceOverview,
  getMaintenanceProposals,
  createMaintenanceProposal,
  approveMaintenanceProposal,
  rejectMaintenanceProposal,
  completeMaintenanceProposal,
  updateVehicleStatus,
  updateVehicleKm
} from '../services/maintenance.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

// Toàn bộ API yêu cầu xác thực người dùng
router.use(authenticateToken);

/**
 * GET /api/v1/maintenance/overview
 * Lấy tổng quan trạng thái toàn bộ đội xe, cảnh báo đăng kiểm, bảo hiểm, bằng lái, thay dầu
 */
router.get('/overview', async (req, res) => {
  try {
    const overview = await getFleetMaintenanceOverview(req.user);
    return successResponse(res, overview, 'Lấy tổng quan đội xe và bảo dưỡng thành công');
  } catch (error) {
    console.error('[MAINTENANCE_OVERVIEW_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi lấy tổng quan đội xe', 500);
  }
});

/**
 * GET /api/v1/maintenance/proposals
 * Lấy danh sách đề xuất bảo dưỡng (có thể lọc theo status hoặc vehicleId)
 */
router.get('/proposals', async (req, res) => {
  try {
    const { status, vehicleId } = req.query;
    const proposals = await getMaintenanceProposals({ status, vehicleId, user: req.user });
    return successResponse(res, proposals, 'Lấy danh sách đề xuất bảo dưỡng thành công');
  } catch (error) {
    console.error('[MAINTENANCE_PROPOSALS_GET_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi lấy danh sách đề xuất', 500);
  }
});

/**
 * POST /api/v1/maintenance/proposals
 * Tạo đề xuất bảo dưỡng mới
 */
router.post('/proposals', async (req, res) => {
  try {
    const newProposal = await createMaintenanceProposal(req.body, req.user);
    return successResponse(res, newProposal, 'Tạo đề xuất bảo dưỡng thành công', 201);
  } catch (error) {
    console.error('[MAINTENANCE_PROPOSAL_CREATE_ERROR]', error);
    return errorResponse(res, error.message || 'Không thể tạo đề xuất bảo dưỡng', 400);
  }
});

/**
 * PUT /api/v1/maintenance/proposals/:id/approve
 * Phê duyệt đề xuất bảo dưỡng (BẢO MẬT: 100% Thuộc Giám đốc DIRECTOR)
 */
router.put('/proposals/:id/approve', requireRole([USER_ROLES.DIRECTOR]), async (req, res) => {
  try {
    const result = await approveMaintenanceProposal(req.params.id, req.user);
    return successResponse(res, result, result.message);
  } catch (error) {
    console.error('[MAINTENANCE_APPROVE_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi phê duyệt đề xuất', 400);
  }
});

/**
 * PUT /api/v1/maintenance/proposals/:id/reject
 * Từ chối đề xuất bảo dưỡng (Chỉ Giám đốc DIRECTOR)
 */
router.put('/proposals/:id/reject', requireRole([USER_ROLES.DIRECTOR]), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await rejectMaintenanceProposal(req.params.id, reason, req.user);
    return successResponse(res, result, result.message);
  } catch (error) {
    console.error('[MAINTENANCE_REJECT_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi từ chối đề xuất', 400);
  }
});

/**
 * PUT /api/v1/maintenance/proposals/:id/complete
 * Nghiệm thu hoàn tất bảo dưỡng, xuất xưởng & tự động tạo chi phí CỐ ĐỊNH (FIXED)
 */
router.put('/proposals/:id/complete', async (req, res) => {
  try {
    const result = await completeMaintenanceProposal(req.params.id, req.body, req.user);
    return successResponse(res, result, result.message);
  } catch (error) {
    console.error('[MAINTENANCE_COMPLETE_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi nghiệm thu hoàn tất bảo dưỡng', 400);
  }
});

/**
 * PUT /api/v1/maintenance/vehicles/:id/status
 * Cập nhật trực tiếp trạng thái xe (ACTIVE | IDLE | MAINTENANCE)
 */
router.put('/vehicles/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const result = await updateVehicleStatus(req.params.id, status, req.user);
    return successResponse(res, result, 'Cập nhật trạng thái xe thành công');
  } catch (error) {
    console.error('[VEHICLE_STATUS_UPDATE_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi cập nhật trạng thái xe', 400);
  }
});

/**
 * PUT /api/v1/maintenance/vehicles/:id/km
 * Cập nhật số Km đồng hồ của xe
 */
router.put('/vehicles/:id/km', async (req, res) => {
  try {
    const result = await updateVehicleKm(req.params.id, req.body, req.user);
    return successResponse(res, result, 'Cập nhật số km xe thành công');
  } catch (error) {
    console.error('[VEHICLE_KM_UPDATE_ERROR]', error);
    return errorResponse(res, error.message || 'Lỗi cập nhật km xe', 400);
  }
});

export default router;

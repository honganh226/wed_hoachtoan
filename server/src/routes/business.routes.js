import { Router } from 'express';
import { excelMonthService } from '../services/excelMonthService.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const router = Router();

// BẢO VỆ BẮT BUỘC: Mọi endpoint kinh doanh đều yêu cầu Đăng nhập và quyền DIRECTOR hoặc ACCOUNTANT
router.use(authenticateToken);
router.use(requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT));

/**
 * GET /api/v1/business/overview
 * Báo cáo Tổng quan Giám Đốc 3 phần A, B, C theo chuẩn Excel tháng 1
 */
router.get('/overview', (req, res) => {
  try {
    const period = req.query.period || 'month';
    const result = excelMonthService.getExecutiveOverview({ period, start_date:req.query.start_date, end_date:req.query.end_date });
    return successResponse(res, result, 'Lấy tổng quan kinh doanh thành công');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

/**
 * GET /api/v1/business/trips
 * Danh sách toàn bộ cuốc xe chuẩn hóa từ Excel tháng 1
 */
router.get('/trips', (req, res) => {
  try {
    const data = excelMonthService.getData();
    let { rows } = data;

    // Bộ lọc tùy chọn
    if (req.query.customer) {
      const q = req.query.customer.toLowerCase();
      rows = rows.filter(r => r.customer_name.toLowerCase().includes(q));
    }
    if (req.query.vehicle) {
      rows = rows.filter(r => r.vehicle_plate === req.query.vehicle);
    }
    if (req.query.group) {
      rows = rows.filter(r => r.group_id === req.query.group);
    }

    return successResponse(res, {
      total: rows.length,
      trips: rows
    }, 'Lấy danh sách cuốc xe thành công');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

/**
 * GET /api/v1/business/trip/:id
 * Chi tiết một cuốc xe và nhóm dùng chung tương ứng
 */
router.get('/trip/:id', (req, res) => {
  try {
    const data = excelMonthService.getData();
    const trip = data.rows.find(r => r.id === req.params.id || r.row_index === parseInt(req.params.id, 10));
    if (!trip) {
      return errorResponse(res, `Không tìm thấy cuốc xe: ${req.params.id}`, 404);
    }

    let group = null;
    let groupTrips = [];
    if (trip.group_id) {
      group = data.groups.find(g => g.group_key === trip.group_id);
      if (group) {
        groupTrips = data.rows.filter(r => group.trips.includes(r.id));
      }
    }

    return successResponse(res, {
      trip,
      group,
      group_trips: groupTrips
    }, 'Lấy chi tiết cuốc xe thành công');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

/**
 * GET /api/v1/business/groups
 * Danh sách các nhóm hành trình / nhóm chi phí chung và trạng thái phân bổ
 */
router.get('/groups', (req, res) => {
  try {
    const data = excelMonthService.getData();
    return successResponse(res, data.groups, 'Lấy danh sách nhóm chi phí dùng chung thành công');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

/**
 * POST /api/v1/business/group/:groupKey/allocate
 * TẠM KHÓA TRONG BẢN ONLINE ĐẦU TIÊN (Theo yêu cầu rà soát của Ban Giám đốc và Codex)
 * Nhóm chưa phân bổ chỉ hiển thị chênh lệch cấp nhóm, không cho phép ghi phân bổ để tránh sai lệch đối soát chi tiết chuyến.
 */
router.post('/group/:groupKey/allocate', requireRole(USER_ROLES.DIRECTOR), (req,res)=>{
  try { const result=excelMonthService.setGroupAllocation(req.params.groupKey,req.body.mode,req.body.allocations||req.body.manualAllocations||req.body.manual_allocations||{});return successResponse(res,result,'Đã lưu phân bổ thủ công'); }
  catch(e){return errorResponse(res,e.message,400);}
});

/**
 * GET /api/v1/business/debts
 * Danh sách Công nợ Phải thu khách hàng và Phải trả nhà xe
 */
router.get('/debts', (req, res) => {
  try {
    const {start_date,end_date}=req.query;
    if((start_date||end_date)&&(!/^\d{4}-\d{2}-\d{2}$/.test(start_date||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end_date||'')||start_date>end_date))return errorResponse(res,'Khoảng ngày công nợ không hợp lệ',400);
    const debts = excelMonthService.getDebtsData({start_date,end_date});
    return successResponse(res, debts, 'Lấy dữ liệu công nợ thành công');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

export default router;

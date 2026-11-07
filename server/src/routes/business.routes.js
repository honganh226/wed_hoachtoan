import { Router } from 'express';
import { excelMonthService } from '../services/excelMonthService.js';
import { listFuelPrices, upsertFuelPrice, deleteFuelPrice } from '../services/fuelPrice.service.js';
import {
  getAdvanceById,
  createEirAdvance,
  updateEirAdvance,
  recordEirRefund,
  cancelEirRefund,
  correctEirAdvanceCustomer,
  getEirReminders,
} from '../services/eirAdvance.service.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const router = Router();

// BẢO VỆ BẮT BUỘC: Mọi endpoint kinh doanh đều yêu cầu Đăng nhập
router.use(authenticateToken);

// Nhắc việc tiền phơi đến hạn / quá hạn: Cho phép DIRECTOR, ACCOUNTANT và SECRETARY (Thư ký)
router.get('/eir-reminders', requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.SECRETARY), (req, res) => {
  try {
    const result = getEirReminders({ referenceDate: req.query.date });
    return successResponse(res, result, 'Lấy danh sách nhắc hoàn tiền phơi thành công');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

router.get('/eir-advances/:id', requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.SECRETARY), (req, res) => {
  try {
    const item = getAdvanceById(req.params.id);
    if (!item) return errorResponse(res, 'Không tìm thấy khoản tiền phơi trả hộ', 404);
    return successResponse(res, item, 'Lấy chi tiết khoản tiền phơi thành công');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

// Chi tiết một cuốc xe (Cho phép SECRETARY xem chi tiết chuyến được giao để đối chiếu phơi, nhưng các báo cáo tổng quan tài chính bên dưới chỉ dành cho DIRECTOR & ACCOUNTANT)
router.get('/trip/:id', requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.SECRETARY), (req, res) => {
  try {
    const data = excelMonthService.getData();
    const trip = data.rows.find(r => r.id === req.params.id || r.row_index === parseInt(req.params.id, 10));
    if (!trip) {
      return errorResponse(res, `Không tìm thấy cuốc xe: ${req.params.id}`, 404);
    }

    if (req.user?.role === USER_ROLES.SECRETARY) {
      const secretaryTrip = {
        id: trip.id,
        trip_code: trip.trip_code,
        trip_date: trip.trip_date,
        customer_name: trip.customer_name,
        route_name: trip.route_name,
        vehicle_plate: trip.vehicle_plate,
        driver_name: trip.driver_name,
        container_number: trip.container_number,
        container_size: trip.container_size,
        container_type_raw: trip.container_type_raw,
        lift_on_location: trip.lift_on_location,
        lift_off_location: trip.lift_off_location,
        phoi_advances: trip.phoi_advances || [],
        eir_advances: trip.eir_advances || trip.phoi_advances || [],
        phoi_count: trip.phoi_count || 0,
        phoi_total_advance: trip.phoi_total_advance || 0,
        phoi_total_refunded: trip.phoi_total_refunded || 0,
        phoi_balance_due: trip.phoi_balance_due || 0,
        phoi_remaining_amount: trip.phoi_remaining_amount || trip.phoi_balance_due || 0,
        phoi_due_date: trip.phoi_due_date || null,
        phoi_status: trip.phoi_status || 'KHONG_PHAT_SINH',
        phoi_status_label: trip.phoi_status_label || '',
        phoi_reminder_status: trip.phoi_reminder_status || 'NONE',
        phoi_reminder_label: trip.phoi_reminder_label || '',
        phoi_is_completed: Boolean(trip.phoi_is_completed),
        notes: trip.notes || trip.notes_r || null,
      };
      return successResponse(res, {
        trip: secretaryTrip,
        group: null,
        group_trips: []
      }, 'Lấy thông tin điều vận cuốc xe thành công');
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

// Các endpoint báo cáo điều hành và tài chính dưới đây yêu cầu quyền DIRECTOR hoặc ACCOUNTANT
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
 * GET /api/v1/business/financial-report
 * Báo cáo tài chính doanh nghiệp chuẩn CFO (Từng tháng T1-T12 & Cả năm)
 */
router.get('/financial-report', (req, res) => {
  try {
    const fiscalYear = parseInt(req.query.year || '2026', 10) || 2026;
    const data = excelMonthService.getData();
    const rows = data.rows || [];

    const summarizeSlice = (slice) => {
      let totalTrips = slice.length;
      let ownTrips = 0;
      let extTrips = 0;
      let totalRevenue = 0;
      let ownRevenue = 0;
      let extRevenue = 0;
      let totalVat8 = 0;
      let totalRevenueWithVat = 0;
      let totalDeduction17 = 0;
      let totalRevenueAfter17 = 0;
      let subcontractCost = 0;
      let fuelCost = 0;
      let fuelLiters = 0;
      let tollAndRoadCost = 0;
      let portAndHandlingCost = 0;
      let maintenanceAndMisc = 0;
      let cashCollected = 0;
      let arOutstanding = 0;
      let apOutstanding = 0;

      slice.forEach((r) => {
        const rev = Number(r.cuoc_goc ?? r.cuoc_vao ?? r.base_revenue ?? 0);
        const vat = Math.round(rev * 0.08);
        const coVat = rev + vat;
        const tru17 = Math.round(coVat * 0.17);
        const sau17 = coVat - tru17;
        const sub = Number(r.cuoc_ra ?? r.subcontractor_cost ?? 0);
        const fCost = Number(r.tien_dau ?? r.fuel_cost ?? 0);
        const fLiters = Number(r.dau_liters ?? r.fuel_liters ?? 0);
        const toll = Number(r.tien_duong ?? r.toll_fee ?? 0);
        const lift = Number(r.phi_nang ?? r.lift_on_fee ?? 0) + Number(r.phi_ha ?? r.lift_off_fee ?? 0);
        const misc = Number(r.phat_sinh ?? r.other_costs ?? 0);

        totalRevenue += rev;
        totalVat8 += vat;
        totalRevenueWithVat += coVat;
        totalDeduction17 += tru17;
        totalRevenueAfter17 += sau17;

        if (r.is_subcontractor) {
          extTrips += 1;
          extRevenue += rev;
        } else {
          ownTrips += 1;
          ownRevenue += rev;
        }

        subcontractCost += sub;
        fuelCost += fCost;
        fuelLiters += fLiters;
        tollAndRoadCost += toll;
        portAndHandlingCost += lift;
        maintenanceAndMisc += misc;

        const rec = Number(r.received_amount ?? 0) + Number(r.offset_amount ?? 0);
        const bal = Number(r.fare_balance_base ?? Math.max(0, rev - rec));
        cashCollected += rec;
        arOutstanding += bal;
        if (r.is_subcontractor && !r.is_subcontractor_paid) {
          apOutstanding += sub;
        }
      });

      const totalCOGS = subcontractCost + fuelCost + tollAndRoadCost + portAndHandlingCost;
      const grossProfit = totalRevenue - totalCOGS;
      const grossProfitAfter17 = totalRevenueAfter17 - totalCOGS;
      const totalOPEX = maintenanceAndMisc;
      const netProfit = grossProfit - totalOPEX;
      const netProfitAfter17 = grossProfitAfter17 - totalOPEX;

      return {
        totalTrips,
        ownTrips,
        extTrips,
        totalRevenue,
        ownRevenue,
        extRevenue,
        totalVat8,
        totalRevenueWithVat,
        totalDeduction17,
        totalRevenueAfter17,
        totalCOGS,
        subcontractCost,
        fuelCost,
        fuelLiters,
        tollAndRoadCost,
        portAndHandlingCost,
        grossProfit,
        grossProfitAfter17,
        grossMarginPct: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0,
        totalOPEX,
        maintenanceAndMisc,
        netProfit,
        netProfitAfter17,
        netMarginPct: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0,
        cashCollected,
        arOutstanding,
        apOutstanding
      };
    };

    const yearRows = rows.filter((r) => {
      const ym = excelMonthService.getAccountingMonth(r);
      return ym.startsWith(`${fiscalYear}-`);
    });

    const summary = summarizeSlice(yearRows);
    const monthlyReports = Array.from({ length: 12 }, (_, idx) => {
      const mNum = idx + 1;
      const mCode = String(mNum).padStart(2, '0');
      const ym = `${fiscalYear}-${mCode}`;
      const mRows = yearRows.filter((r) => excelMonthService.getAccountingMonth(r) === ym);
      const ms = summarizeSlice(mRows);
      return {
        month: mNum,
        label: `Tháng ${mCode}/${fiscalYear}`,
        trips: { total: ms.totalTrips, own: ms.ownTrips, ext: ms.extTrips },
        revenue: {
          total: ms.totalRevenue,
          own: ms.ownRevenue,
          ext: ms.extRevenue,
          vat8: ms.totalVat8,
          withVat: ms.totalRevenueWithVat,
          deduction17: ms.totalDeduction17,
          after17: ms.totalRevenueAfter17
        },
        cogs: {
          total: ms.totalCOGS,
          subcontractCost: ms.subcontractCost,
          fuelCost: ms.fuelCost,
          fuelLiters: ms.fuelLiters,
          tollAndRoadCost: ms.tollAndRoadCost,
          portAndHandlingCost: ms.portAndHandlingCost
        },
        grossProfit: ms.grossProfit,
        grossProfitAfter17: ms.grossProfitAfter17,
        opex: {
          total: ms.totalOPEX,
          driverSalary: 0,
          maintenanceAndMisc: ms.maintenanceAndMisc
        },
        netProfit: ms.netProfit,
        netProfitAfter17: ms.netProfitAfter17,
        workingCapital: {
          cashCollected: ms.cashCollected,
          arOutstanding: ms.arOutstanding,
          apOutstanding: ms.apOutstanding
        }
      };
    });

    return successResponse(
      res,
      {
        company: 'CÔNG TY VẬN TẢI CONTAINER & LOGISTICS',
        fiscalYear,
        currency: 'VND',
        asOfDate: new Date().toISOString().slice(0, 10),
        summaryKPIs: summary,
        monthlyReports
      },
      'Lấy báo cáo tài chính doanh nghiệp thành công'
    );
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

/**
 * GET /api/v1/business/fuel-prices
 * Danh sách giá dầu theo ngày và lịch sử chỉnh sửa
 */
router.get('/fuel-prices', (req, res) => {
  try {
    const result = listFuelPrices({ month: req.query.month });
    return successResponse(res, result, 'Lấy bảng giá dầu theo ngày thành công');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * POST /api/v1/business/fuel-prices
 * Nhập hoặc cập nhật giá dầu cho một ngày áp dụng
 */
router.post('/fuel-prices', (req, res) => {
  try {
    const result = upsertFuelPrice({
      apply_date: req.body.apply_date,
      price_per_liter: req.body.price_per_liter,
      note: req.body.note,
      actor: req.user?.username || 'system',
    });
    return successResponse(res, result, 'Đã lưu đơn giá dầu theo ngày thành công');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * DELETE /api/v1/business/fuel-prices/:applyDate
 * Xóa giá dầu ngày chạy (nếu nhập nhầm)
 */
router.delete('/fuel-prices/:applyDate', (req, res) => {
  try {
    const result = deleteFuelPrice({
      apply_date: req.params.applyDate,
      actor: req.user?.username || 'system',
      reason: req.body?.reason || 'Xóa đơn giá dầu',
    });
    return successResponse(res, result, 'Đã xóa đơn giá dầu');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * POST /api/v1/business/eir-advances
 * Tạo khoản tiền phơi trả hộ chủ hàng gắn với chuyến
 */
router.post('/eir-advances', (req, res) => {
  try {
    const created = createEirAdvance({
      ...req.body,
      actor: req.user?.username || 'system',
    });
    return successResponse(res, created, 'Tạo khoản tiền phơi trả hộ thành công', 201);
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * PUT /api/v1/business/eir-advances/:id
 * Cập nhật thông tin khoản tiền phơi hoặc đổi ngày hẹn hoàn tiền
 */
router.put('/eir-advances/:id', (req, res) => {
  try {
    const updated = updateEirAdvance(req.params.id, req.body || {}, req.user?.username || 'system');
    return successResponse(res, updated, 'Cập nhật khoản tiền phơi / ngày hẹn thành công');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * POST /api/v1/business/eir-advances/:id/refund (và alias /refunds)
 * Ghi nhận hoàn tiền phơi (một phần hoặc toàn bộ số dư còn lại)
 */
router.post(['/eir-advances/:id/refund', '/eir-advances/:id/refunds'], (req, res) => {
  try {
    const updated = recordEirRefund(req.params.id, req.body || {}, req.user?.username || 'system');
    return successResponse(res, updated, 'Ghi nhận hoàn tiền phơi thành công');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * POST /api/v1/business/eir-refunds/:refundId/cancel
 * Hủy giao dịch hoàn tiền phơi (cần lý do, khôi phục số dư và nhắc việc)
 */
router.post('/eir-refunds/:refundId/cancel', (req, res) => {
  try {
    const updated = cancelEirRefund(req.params.refundId, req.body || {}, req.user?.username || 'system');
    return successResponse(res, updated, 'Đã hủy giao dịch hoàn tiền phơi và khôi phục số dư');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * POST /api/v1/business/eir-advances/:id/correct-customer
 * Đính chính lịch sử chủ hàng của khoản tiền phơi (B05 - bắt buộc có lý do)
 */
router.post('/eir-advances/:id/correct-customer', (req, res) => {
  try {
    const updated = correctEirAdvanceCustomer(req.params.id, req.body || {}, req.user?.username || 'system');
    return successResponse(res, updated, 'Đã đính chính lịch sử chủ hàng của khoản tiền phơi');
  } catch (err) {
    return errorResponse(res, err.message, 400);
  }
});

/**
 * GET /api/v1/business/unclassified-items
 * Danh sách các bản ghi lịch sử cần phân loại / đối soát
 */
router.get('/unclassified-items', (req, res) => {
  try {
    const result = excelMonthService.getUnclassifiedItems();
    return successResponse(res, result, 'Lấy danh sách cần phân loại / đối soát thành công');
  } catch (err) {
    return errorResponse(res, err.message, 500);
  }
});

export default router;

/**
 * ============================================================
 * TRIPS ROUTES - WED_HOACHTOAN
 * ============================================================
 * Tiền tố: /api/v1/trips
 * Tác nghiệp Chuyến xe MVP:
 * - POST /                : Tạo mới chuyến xe (Task 3.1)
 * - POST /:id/duplicate   : Nhân bản chuyến hôm qua (Task 3.1)
 * - PUT /:id              : Cập nhật chuyến (check khóa sổ + Audit Log)
 * - GET /default-price    : Gợi ý cước mẫu theo tuyến
 * - GET /routes           : Danh sách tuyến và cước mẫu
 * ============================================================
 */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { excelMonthService } from '../services/excelMonthService.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { db } from '../db/database.js';
import { 
  createTrip, 
  createBatchTrips,
  duplicateTrip, 
  updateTrip, 
  getRouteDefaultPrice,
  getTripContainers,
  addTripContainer,
  removeTripContainer,
  getUnpaidTripsByCustomer,
  batchPayTrips
} from '../services/trip.service.js';
import {
  getPendingEirTrips,
  saveTripEirPhoto,
  updateTripEirStatus,
  removeTripEirPhoto
} from '../services/eir.service.js';
import { validateIso6346 } from '../utils/iso6346.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { checkPeriodLock } from '../middlewares/periodLock.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const eirUploadDir = path.join(__dirname, '../../uploads/eir');
if (!fs.existsSync(eirUploadDir)) {
  fs.mkdirSync(eirUploadDir, { recursive: true });
}

const eirStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, eirUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `eir_${req.params.id || 'photo'}_${Date.now()}${ext}`);
  }
});
const uploadEir = multer({
  storage: eirStorage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

const router = Router();

/**
 * GET /api/v1/trips/pending-eir
 * Danh sách chuyến xe đọng phơi (> 3 ngày chưa nộp phơi) (Task 3.5)
 */
router.get('/pending-eir', authenticateToken, (req, res) => {
  try {
    const minDays = req.query.minDays ? parseInt(req.query.minDays, 10) : 3;
    const result = getPendingEirTrips({ minDaysOverdue: minDays, user: req.user });
    return successResponse(res, result, 'Lấy danh sách các chuyến đọng phơi thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/trips/routes
 * Lấy danh sách tuyến đường và bảng giá cước chuẩn
 */
router.get('/routes', (req, res) => {
  try {
    const routes = db.prepare('SELECT * FROM routes ORDER BY route_name ASC').all();
    const names=new Set(routes.map(r=>r.route_name));
    for(const trip of excelMonthService.getData().rows.slice().sort((a,b)=>b.trip_date.localeCompare(a.trip_date))){
      if(trip.route_name&&!names.has(trip.route_name)){names.add(trip.route_name);routes.push({id:'history-'+createHash('sha256').update(trip.route_name).digest('hex').slice(0,16),route_name:trip.route_name,default_price:trip.cuoc_vao,source:'HISTORY'});}
    }
    return successResponse(res, routes, 'Lấy danh mục tuyến đường thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/trips/default-price
 * Tra cứu gợi ý giá cước và công nhật theo tuyến
 */
router.get('/default-price', (req, res) => {
  try {
    const { routeId, routeName } = req.query;
    const target = routeId || routeName;
    if (!target) {
      return errorResponse(res, 'Vui lòng cung cấp routeId hoặc routeName', 400);
    }
    const route = getRouteDefaultPrice(target);
    if (!route) {
      return errorResponse(res, 'Không tìm thấy tuyến đường tương ứng', 404);
    }
    return successResponse(res, {
      route_id: route.id,
      route_name: route.route_name,
      default_price: route.default_price,
      default_driver_pay: route.default_driver_pay,
      default_toll: route.default_toll,
      default_fuel_liters: route.default_fuel_liters
    }, 'Tra cứu cước mẫu thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/trips
 * Tạo mới chuyến xe (Giám Đốc, Kế Toán, Quản Lý Khu)
 */
router.post(
  '/', 
  authenticateToken, 
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]),
  checkPeriodLock({ dateField: 'trip_date' }),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const created = createTrip({
        tripData: req.body,
        user: req.user,
        ipAddress
      });
      return successResponse(res, created, `Tạo mới chuyến xe ${created.trip_code} thành công`, 201);
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * POST /api/v1/trips/batch
 * Nhập nhiều cuốc xe đồng thời theo lô
 */
router.post(
  '/batch',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]),
  (req, res) => {
    try {
      const { trips: batchTrips } = req.body;
      if (!Array.isArray(batchTrips) || batchTrips.length === 0) {
        return errorResponse(res, 'Danh sách cuốc xe trống hoặc không đúng định dạng', 400);
      }
      const ipAddress = req.ip || req.connection.remoteAddress;
      const result = createBatchTrips({
        tripsData: batchTrips,
        user: req.user,
        ipAddress
      });
      return successResponse(res, result, `Đã xử lý nhập theo lô: ${result.inserted} thành công, ${result.failed} lỗi/trùng`, 201);
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * POST /api/v1/trips/:id/duplicate
 * Nhân bản cuốc xe (Copy chuyến hôm qua sang ngày mới)
 */
router.post(
  '/:id/duplicate',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]),
  (req, res) => {
    try {
      const { target_date } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const duplicated = duplicateTrip({
        sourceTripId: req.params.id,
        targetDate: target_date,
        user: req.user,
        ipAddress
      });
      return successResponse(res, duplicated, `Đã nhân bản chuyến xe thành công thành ${duplicated.trip_code}`, 201);
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * PUT /api/v1/trips/:id
 * Cập nhật chuyến xe (Check Period Lock & Ghi Audit Log)
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]),
  checkPeriodLock({ tableName: 'trips' }),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const { reason, ...updateData } = req.body;
      const updated = updateTrip({
        tripId: req.params.id,
        updateData,
        user: req.user,
        reason,
        ipAddress
      });
      return successResponse(res, updated, 'Cập nhật chuyến xe thành công');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * GET /api/v1/trips/validate-container
 * Kiểm tra tính hợp lệ của mã container theo chuẩn quốc tế ISO 6346 (Task 3.2)
 */
router.get('/validate-container', (req, res) => {
  try {
    const { containerNumber } = req.query;
    if (!containerNumber) {
      return errorResponse(res, 'Vui lòng cung cấp containerNumber để kiểm tra', 400);
    }
    const result = validateIso6346(containerNumber);
    return successResponse(res, result, result.message);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/trips/:id/containers
 * Lấy danh sách containers của một chuyến xe (Task 3.2)
 */
router.get('/:id/containers', authenticateToken, (req, res) => {
  try {
    const containers = getTripContainers(req.params.id);
    return successResponse(res, containers, 'Lấy danh sách container thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/trips/:id/containers
 * Thêm / Kẹp thêm container cho chuyến xe (Task 3.2)
 */
router.post(
  '/:id/containers',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]),
  checkPeriodLock({ tableName: 'trips' }),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const added = addTripContainer({
        tripId: req.params.id,
        containerData: req.body,
        user: req.user,
        ipAddress
      });
      return successResponse(res, added, 'Kẹp thêm container thành công', 201);
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * DELETE /api/v1/trips/:id/containers/:containerId
 * Hủy container khỏi chuyến xe (Task 3.2)
 */
router.delete(
  '/:id/containers/:containerId',
  authenticateToken,
  requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]),
  checkPeriodLock({ tableName: 'trips' }),
  (req, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const result = removeTripContainer({
        tripId: req.params.id,
        containerId: req.params.containerId,
        user: req.user,
        ipAddress
      });
      return successResponse(res, result, 'Đã xóa container khỏi chuyến xe');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * POST /api/v1/trips/:id/eir-photo
 * Tải lên ảnh phiếu phơi / phiếu hạ (Task 3.5)
 * Hỗ trợ multipart/form-data (photo file) hoặc JSON base64 (photo_base64)
 */
router.post(
  '/:id/eir-photo',
  authenticateToken,
  (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      return uploadEir.single('photo')(req, res, next);
    }
    next();
  },
  checkPeriodLock({ tableName: 'trips' }),
  (req, res) => {
    try {
      const tripId = req.params.id;
      const ipAddress = req.ip || req.connection.remoteAddress;

      let result;
      if (req.file) {
        result = saveTripEirPhoto({
          tripId,
          filename: req.file.filename,
          user: req.user,
          ipAddress
        });
      } else if (req.body && (req.body.photo_base64 || req.body.image_base64)) {
        result = saveTripEirPhoto({
          tripId,
          base64Data: req.body.photo_base64 || req.body.image_base64,
          user: req.user,
          ipAddress
        });
      } else {
        return errorResponse(res, 'Vui lòng cung cấp file ảnh phơi hoặc chuỗi photo_base64.', 400);
      }

      return successResponse(res, result, 'Đã lưu và cập nhật ảnh phiếu phơi thành công!');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * PUT /api/v1/trips/:id/eir-status
 * Cập nhật trạng thái phiếu phơi & thanh toán phơi (Task 3.5)
 */
router.put(
  '/:id/eir-status',
  authenticateToken,
  checkPeriodLock({ tableName: 'trips' }),
  (req, res) => {
    try {
      const tripId = req.params.id;
      const { eir_status, eir_paid_status, notes } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const updated = updateTripEirStatus({
        tripId,
        eirStatus: eir_status,
        eirPaidStatus: eir_paid_status,
        notes,
        user: req.user,
        ipAddress
      });
      return successResponse(res, updated, 'Cập nhật trạng thái phiếu phơi thành công');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * DELETE /api/v1/trips/:id/eir-photo
 * Gỡ bỏ ảnh phiếu phơi của chuyến xe (Task 3.5)
 */
router.delete(
  '/:id/eir-photo',
  authenticateToken,
  checkPeriodLock({ tableName: 'trips' }),
  (req, res) => {
    try {
      const tripId = req.params.id;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const updated = removeTripEirPhoto({
        tripId,
        user: req.user,
        ipAddress
      });
      return successResponse(res, updated, 'Đã gỡ bỏ ảnh phiếu phơi thành công');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * GET /api/v1/trips/unpaid-summary
 * Lấy danh sách các chuyến xe chưa thanh toán gom theo khách hàng (Task 4.5)
 */
router.get(
  '/unpaid-summary',
  authenticateToken,
  requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER),
  (req, res) => {
    try {
      const { customerName } = req.query;
      const result = getUnpaidTripsByCustomer({ customerName, user: req.user });
      return successResponse(res, result, 'Lấy danh sách công nợ theo khách hàng thành công');
    } catch (err) {
      return serverErrorResponse(res, err);
    }
  }
);

/**
 * POST /api/v1/trips/batch-pay
 * Thanh toán gộp cả lô nhiều chuyến theo bảng kê (Task 4.5)
 * Quyền: DIRECTOR, ACCOUNTANT
 */
router.post(
  '/batch-pay',
  authenticateToken,
  requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT),
  (req, res) => {
    try {
      const { tripIds, customerName, paymentDate, paymentNote, paymentMethod } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;

      if (!tripIds || !Array.isArray(tripIds) || tripIds.length === 0) {
        return errorResponse(res, 'Vui lòng cung cấp danh sách tripIds cần thanh toán gộp', 400);
      }

      const result = batchPayTrips({
        tripIds,
        customerName,
        paymentDate,
        paymentNote,
        paymentMethod,
        user: req.user,
        ipAddress
      });

      return successResponse(
        res,
        result,
        `Đã thanh toán gộp thành công ${result.trip_count} chuyến xe. Tổng tiền: ${result.total_amount.toLocaleString('vi-VN')} ₫`
      );
    } catch (err) {
      return errorResponse(res, err.message, 400);
    }
  }
);

export default router;



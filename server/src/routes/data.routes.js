/**
 * Route API cung cấp dữ liệu nền tảng và kiểm tra dữ liệu import
 * Tích hợp RBAC 4 Cấp Phân Quyền (Task 2.2)
 * Tiền tố: /api/v1/data
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { importExcelData } from '../scripts/importExcel.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';

const router = Router();

// Toàn bộ API dữ liệu cơ sở đều bắt buộc đăng nhập
router.use(authenticateToken);

/**
 * GET /api/v1/data/summary
 * Thống kê tổng số lượng dữ liệu đã nạp trong cơ sở dữ liệu
 * Phân quyền dữ liệu theo vai trò (RBAC):
 * - DIRECTOR: Toàn bộ dữ liệu, xem lãi ròng & quỹ, toàn quyền sao lưu
 * - ACCOUNTANT: Toàn bộ dữ liệu cuốc xe & doanh thu (nhưng ẩn quỹ / lãi ròng)
 * - AREA_MANAGER: Chỉ xem cuốc xe & doanh thu trong khu vực mình quản lý
 * - DRIVER: Chỉ xem cuốc xe & doanh thu của riêng mình
 */
router.get('/summary', (req, res) => {
  try {
    const scope = req.user || {};
    const role = scope.role || 'GUEST';
    const areaId = scope.areaId || scope.area_id;
    const userId = scope.userId || scope.id;
    const fullName = scope.full_name;

    let revenueQuery = 'SELECT SUM(total_revenue) as sum FROM trips';
    let tripsQuery = 'SELECT COUNT(*) as count FROM trips';
    let revenueParams = [];
    let tripsParams = [];

    // RBAC: Lái xe chỉ thấy tổng số chuyến và doanh thu chuyến của mình
    if (role === USER_ROLES.DRIVER) {
      tripsQuery = `
        SELECT COUNT(*) as count 
        FROM trips t 
        JOIN drivers d ON t.driver_id = d.id 
        WHERE d.full_name = ? OR d.user_id = ?
      `;
      tripsParams = [fullName, userId];

      revenueQuery = `
        SELECT SUM(t.total_revenue) as sum 
        FROM trips t 
        JOIN drivers d ON t.driver_id = d.id 
        WHERE d.full_name = ? OR d.user_id = ?
      `;
      revenueParams = [fullName, userId];
    } else if (role === USER_ROLES.AREA_MANAGER && areaId) {
      tripsQuery = 'SELECT COUNT(*) as count FROM trips WHERE area_id = ?';
      tripsParams = [areaId];

      revenueQuery = 'SELECT SUM(total_revenue) as sum FROM trips WHERE area_id = ?';
      revenueParams = [areaId];
    }

    const tripCount = db.prepare(tripsQuery).get(...tripsParams)?.count || 0;
    const totalRevenue = db.prepare(revenueQuery).get(...revenueParams)?.sum || 0;

    const summary = {
      users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      vehicles: db.prepare('SELECT COUNT(*) as count FROM vehicles').get().count,
      drivers: db.prepare('SELECT COUNT(*) as count FROM drivers').get().count,
      subcontractors: db.prepare('SELECT COUNT(*) as count FROM subcontractors').get().count,
      customers: db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
      ports: db.prepare('SELECT COUNT(*) as count FROM ports').get().count,
      routes: db.prepare('SELECT COUNT(*) as count FROM routes').get().count,
      trips: tripCount,
      containers: db.prepare('SELECT COUNT(*) as count FROM containers').get().count,
      expenses: db.prepare('SELECT COUNT(*) as count FROM expenses').get().count,
      trip_advances: db.prepare('SELECT COUNT(*) as count FROM trip_advances').get().count,
      eport_accounts: db.prepare('SELECT COUNT(*) as count FROM eport_accounts').get().count,
      audit_logs: db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count,
      total_revenue_vnd: totalRevenue,
      currentScope: role,
      scopeUser: fullName || null,
      scopeArea: areaId || null,
      // Quyền bảo mật nâng cao
      canViewNetProfit: role === USER_ROLES.DIRECTOR,
      canManageBackup: role === USER_ROLES.DIRECTOR
    };
    return successResponse(res, summary, 'Lấy thống kê dữ liệu thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/data/seed
 * Nạp lại toàn bộ dữ liệu mẫu từ 7.xlsx (Chỉ Giám Đốc mới có quyền)
 */
router.post('/seed', authenticateToken, requireRole(USER_ROLES.DIRECTOR), async (req, res) => {
  try {
    console.log(`[RBAC] Giám đốc [${req.user.username}] thực hiện nạp lại dữ liệu 7.xlsx`);
    await importExcelData();
    return successResponse(res, null, 'Nạp lại dữ liệu từ 7.xlsx vào cơ sở dữ liệu thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/data/vehicles
 */
router.get('/vehicles', (req, res) => {
  try {
    const vehicles = db.prepare(`
      SELECT v.*, d.full_name as driver_name, d.phone as driver_phone
      FROM vehicles v
      LEFT JOIN drivers d ON v.default_driver_id = d.id
      ORDER BY v.plate_number ASC
    `).all();
    return successResponse(res, vehicles, 'Lấy danh sách đầu xe thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/data/drivers
 */
router.get('/drivers', (req, res) => {
  try {
    const drivers = db.prepare(`
      SELECT d.*, v.plate_number as default_plate
      FROM drivers d
      LEFT JOIN vehicles v ON d.default_vehicle_id = v.id
      ORDER BY d.full_name ASC
    `).all();
    return successResponse(res, drivers, 'Lấy danh sách tài xế thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/data/trips
 * Phân quyền dữ liệu RBAC 4 Cấp:
 * - DIRECTOR, ACCOUNTANT: Xem toàn bộ chuyến xe công ty
 * - AREA_MANAGER: Chỉ xem chuyến thuộc khu vực phụ trách (VD: TUAN hoặc TUAN_ANH)
 * - DRIVER: Chỉ xem chuyến của chính tài xế đó
 */
router.get('/trips', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const scope = req.user || {};
    const role = scope.role;
    const areaId = scope.areaId || scope.area_id;
    const userId = scope.userId || scope.id;
    const fullName = scope.full_name;

    let query = `
      SELECT t.*, 
             GROUP_CONCAT(c.container_number, ', ') as container_number,
             MIN(c.pickup_yard) as pickup_yard, 
             MIN(c.dropoff_yard) as dropoff_yard, 
             SUM(c.lift_on_fee) as lift_on_fee, 
             SUM(c.lift_off_fee) as lift_off_fee,
             d.full_name as driver_name, 
             v.plate_number as vehicle_plate
      FROM trips t
      LEFT JOIN containers c ON t.id = c.trip_id
      LEFT JOIN drivers d ON t.driver_id = d.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
    `;
    const params = [];

    if (role === USER_ROLES.DRIVER) {
      query += ` WHERE (d.full_name = ? OR d.user_id = ?)`;
      params.push(fullName, userId);
    } else if (role === USER_ROLES.AREA_MANAGER && areaId) {
      query += ` WHERE t.area_id = ?`;
      params.push(areaId);
    }

    query += ` GROUP BY t.id ORDER BY t.trip_date DESC, t.trip_code DESC LIMIT ?`;
    params.push(limit);

    const trips = db.prepare(query).all(...params);

    return successResponse(res, trips, `Lấy danh sách chuyến xe thành công [Scope: ${role || 'GUEST'}]`);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/data/eport
 * Lấy danh sách tài khoản ePort (chỉ trả về thông tin bảo mật, ẩn khóa mã hóa)
 */
router.get('/eport', (req, res) => {
  try {
    const accounts = db.prepare(`
      SELECT id, port_name, tax_code, username, company_name, driver_access, notes, created_at
      FROM eport_accounts
      ORDER BY port_name ASC
    `).all().map(a => ({
      ...a,
      driver_access: a.driver_access ? JSON.parse(a.driver_access) : null,
      is_encrypted: true,
      encryption_standard: 'AES-256-GCM'
    }));
    return successResponse(res, accounts, 'Lấy danh sách tài khoản ePort thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

export default router;

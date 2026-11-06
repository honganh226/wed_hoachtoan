/**
 * Route API cung cấp dữ liệu nền tảng và kiểm tra dữ liệu import
 * Tích hợp RBAC 4 Cấp Phân Quyền (Task 2.2)
 * Tiền tố: /api/v1/data
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { importExcelData } from '../scripts/importExcel.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';
import { listFleetVehicles } from '../services/fleet.service.js';

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
const FLEET_READ_ROLES = [USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER, USER_ROLES.SECRETARY];
const CATALOG_READ_ROLES = FLEET_READ_ROLES;

/**
 * GET /api/v1/data/fleet-vehicles
 * Danh sách đội xe chỉ đọc (xe, tài xế phụ trách, hạn đăng kiểm/bảo hiểm/bằng lái).
 * Quản lý khu chỉ thấy xe thuộc khu vực của mình. Thay thế phân hệ Bảo dưỡng xe đã gỡ.
 */
router.get('/fleet-vehicles', requireRole(FLEET_READ_ROLES), (req, res) => {
  try {
    return successResponse(res, listFleetVehicles(req.user), 'Lấy danh sách đội xe thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

router.get('/vehicles', requireRole(CATALOG_READ_ROLES), (req, res) => {
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
router.get('/drivers', requireRole(CATALOG_READ_ROLES), (req, res) => {
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
             COALESCE(d.full_name,t.driver_name) as driver_name, 
             COALESCE(v.plate_number,t.vehicle_plate) as vehicle_plate
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

/**
 * GET /api/v1/data/customers
 */
router.get('/customers', (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
    return successResponse(res, customers, 'Lấy danh sách khách hàng thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/data/customers
 * Thêm nhanh khách hàng mới
 */
router.post('/customers', requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]), (req, res) => {
  try {
    const { name, code, phone, address, tax_code, notes } = req.body;
    if (!name || !name.trim()) return errorResponse(res, 'Tên khách hàng là bắt buộc', 400);
    const cleanName = name.trim().toUpperCase();

    const existing = db.prepare('SELECT * FROM customers WHERE name = ?').get(cleanName);
    if (existing) return successResponse(res, existing, 'Khách hàng đã tồn tại', 200);

    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO customers (id, code, name, phone, address, tax_code, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, code || null, cleanName, phone || null, address || null, tax_code || null, notes || null, now, now);

    const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    return successResponse(res, created, 'Thêm mới khách hàng thành công', 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/data/subcontractors
 */
router.get('/subcontractors', (req, res) => {
  try {
    const subs = db.prepare('SELECT * FROM subcontractors ORDER BY name ASC').all();
    return successResponse(res, subs, 'Lấy danh sách nhà xe ngoài thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/data/subcontractors
 * Thêm nhanh nhà xe / thầu phụ
 */
router.post('/subcontractors', requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]), (req, res) => {
  try {
    const { name, contact_person, phone, bank_account, bank_name, notes } = req.body;
    if (!name || !name.trim()) return errorResponse(res, 'Tên nhà xe là bắt buộc', 400);
    const cleanName = name.trim().toUpperCase();

    const existing = db.prepare('SELECT * FROM subcontractors WHERE name = ?').get(cleanName);
    if (existing) return successResponse(res, existing, 'Nhà xe đã tồn tại', 200);

    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO subcontractors (id, name, contact_person, phone, bank_account, bank_name, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanName, contact_person || null, phone || null, bank_account || null, bank_name || null, notes || null, now, now);

    const created = db.prepare('SELECT * FROM subcontractors WHERE id = ?').get(id);
    return successResponse(res, created, 'Thêm mới nhà xe thành công', 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/data/vehicles
 * Thêm nhanh đầu xe mới
 */
router.post('/vehicles', requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]), (req, res) => {
  try {
    const { plate_number, vehicle_type = 'TRACTOR', default_driver_id, inspection_expiry, insurance_expiry, notes } = req.body;
    if (!plate_number || !plate_number.trim()) return errorResponse(res, 'Biển số xe là bắt buộc', 400);
    const cleanPlate = plate_number.trim().toUpperCase();

    const existing = db.prepare('SELECT * FROM vehicles WHERE plate_number = ?').get(cleanPlate);
    if (existing) return successResponse(res, existing, 'Đầu xe đã tồn tại', 200);

    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO vehicles (id, plate_number, vehicle_type, default_driver_id, status, inspection_expiry, insurance_expiry, current_km, last_maintenance_km, oil_change_interval_km, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, 0, 0, 10000, ?, ?, ?)
    `).run(id, cleanPlate, vehicle_type, default_driver_id || null, inspection_expiry || null, insurance_expiry || null, notes || null, now, now);

    const created = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    return successResponse(res, created, 'Thêm mới đầu xe thành công', 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/data/drivers
 * Thêm nhanh tài xế mới
 */
router.post('/drivers', requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]), (req, res) => {
  try {
    const { full_name, phone, license_number, license_expiry, area_id, default_vehicle_id, base_salary, notes } = req.body;
    if (!full_name || !full_name.trim()) return errorResponse(res, 'Tên tài xế là bắt buộc', 400);
    const cleanName = full_name.trim();

    const existing = db.prepare('SELECT * FROM drivers WHERE full_name = ?').get(cleanName);
    if (existing) return successResponse(res, existing, 'Tài xế đã tồn tại', 200);

    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO drivers (id, user_id, full_name, phone, license_number, license_expiry, area_id, default_vehicle_id, base_salary, kpi_target, is_active, notes, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
    `).run(id, cleanName, phone || null, license_number || null, license_expiry || null, area_id || null, default_vehicle_id || null, Math.round(Number(base_salary) || 0), notes || null, now, now);

    const created = db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
    return successResponse(res, created, 'Thêm mới tài xế thành công', 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/data/routes
 * Thêm nhanh tuyến đường mới
 */
router.post('/routes', requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]), (req, res) => {
  try {
    const { route_name, route_code, departure, destination, default_price, default_driver_pay, default_toll, default_fuel_liters, notes } = req.body;
    if (!route_name || !route_name.trim()) return errorResponse(res, 'Tên tuyến đường là bắt buộc', 400);
    const cleanName = route_name.trim().toUpperCase();

    const existing = db.prepare('SELECT * FROM routes WHERE route_name = ?').get(cleanName);
    if (existing) return successResponse(res, existing, 'Tuyến đường đã tồn tại', 200);

    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO routes (id, route_code, route_name, departure, destination, distance_km, default_price, default_driver_pay, default_fuel_liters, default_toll, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, route_code || null, cleanName, departure || null, destination || null, Math.round(Number(default_price) || 0), Math.round(Number(default_driver_pay) || 0), Math.round(Number(default_fuel_liters) || 0), Math.round(Number(default_toll) || 0), notes || null, now, now);

    const created = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
    return successResponse(res, created, 'Thêm mới tuyến đường thành công', 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/data/ports
 * Lấy danh sách địa điểm nâng / hạ & cảng
 */
router.get('/ports', (req, res) => {
  try {
    const ports = db.prepare('SELECT * FROM ports ORDER BY name ASC').all();
    return successResponse(res, ports, 'Lấy danh sách cảng / địa điểm nâng hạ thành công');
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/data/ports
 * Thêm nhanh địa điểm nâng / hạ & cảng mới
 */
router.post('/ports', requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]), (req, res) => {
  try {
    const { name, code, port_type = 'PORT', address, notes } = req.body;
    if (!name || !name.trim()) return errorResponse(res, 'Tên cảng / địa điểm nâng hạ là bắt buộc', 400);
    const cleanName = name.trim().toUpperCase();

    const existing = db.prepare('SELECT * FROM ports WHERE UPPER(name) = ?').get(cleanName);
    if (existing) return successResponse(res, existing, 'Địa điểm đã tồn tại', 200);

    const now = new Date().toISOString();
    const id = randomUUID();
    const safeCode = code ? code.trim().toUpperCase() : `P-${Date.now().toString().slice(-6)}`;
    db.prepare(`
      INSERT INTO ports (id, code, name, port_type, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, safeCode, cleanName, port_type, address || null, notes || null, now, now);

    const created = db.prepare('SELECT * FROM ports WHERE id = ?').get(id);
    return successResponse(res, created, 'Thêm mới địa điểm nâng / hạ thành công', 201);
  } catch (err) {
    return serverErrorResponse(res, err);
  }
});

export default router;

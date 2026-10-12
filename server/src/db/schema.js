/**
 * ============================================================
 * DRIZZLE ORM DATABASE SCHEMA - WED_HOACHTOAN
 * Hệ Thống Quản Lý Điều Vận, Chi Phí, Doanh Thu & KPI Container
 * ============================================================
 * Quy chuẩn kỹ thuật:
 * - Tiền tệ: Số nguyên VND Integer, tuyệt đối không dùng số thực
 * - Định danh ID: UUID v4 dạng Text (36 ký tự)
 * - RBAC 4 vai trò: DIRECTOR, ACCOUNTANT, AREA_MANAGER, DRIVER
 * - Vòng đời chuyến xe (8 trạng thái):
 *   NEW -> DISPATCHED -> CONT_PICKED -> RUNNING -> CONT_DROPPED -> COMPLETED -> EIR_SUBMITTED -> PAID
 * ============================================================
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============================================================
// HẰNG SỐ & ENUM KỸ THUẬT BẮT BUỘC
// ============================================================
export const USER_ROLES = {
  DIRECTOR: 'DIRECTOR',
  ACCOUNTANT: 'ACCOUNTANT',
  AREA_MANAGER: 'AREA_MANAGER',
  DRIVER: 'DRIVER'
};

export const TRIP_STATUSES = {
  NEW: 'NEW',
  DISPATCHED: 'DISPATCHED',
  CONT_PICKED: 'CONT_PICKED',
  RUNNING: 'RUNNING',
  CONT_DROPPED: 'CONT_DROPPED',
  COMPLETED: 'COMPLETED',
  EIR_SUBMITTED: 'EIR_SUBMITTED',
  PAID: 'PAID'
};

export const VEHICLE_STATUSES = {
  ACTIVE: 'ACTIVE',       // Đang chạy (🟢)
  IDLE: 'IDLE',           // Chờ việc / đứng bãi (🟡)
  MAINTENANCE: 'MAINTENANCE' // Nằm xưởng / bảo dưỡng (🔴)
};

export const VAT_TYPES = {
  V: 'V',   // Đã gồm VAT [V]
  NV: 'NV'  // Chưa VAT [NV]
};

export const EXPENSE_CATEGORIES = {
  FIXED: 'FIXED',       // Cố định (khấu hao, phí bảo trì định kỳ, bảo hiểm xe...)
  VARIABLE: 'VARIABLE'   // Biến động (nâng, hạ, BOT, tiền dầu, chọn vỏ, vá lốp...)
};

export const EIR_STATUSES = {
  CHUA_TRA: 'CHUA_TRA', // Chưa trả phơi
  DA_TRA: 'DA_TRA'      // Đã trả phơi
};

export const EIR_PAID_STATUSES = {
  CHUA_TT: 'CHUA_TT',   // Chưa thanh toán phơi
  DA_TT: 'DA_TT'        // Đã thanh toán phơi
};

export const ADVANCE_STATUSES = {
  PENDING: 'PENDING',   // Đã tạm ứng, chờ quyết toán
  SETTLED: 'SETTLED'    // Đã hoàn ứng / quyết toán xong
};

export const MAINTENANCE_TYPES = {
  OIL_CHANGE: 'OIL_CHANGE',           // Thay dầu máy
  TIRE_REPLACEMENT: 'TIRE_REPLACEMENT', // Thay lốp xe
  PERIODIC: 'PERIODIC',               // Bảo dưỡng định kỳ
  REPAIR: 'REPAIR'                    // Sửa chữa đột xuất
};

export const MAINTENANCE_STATUSES = {
  PENDING: 'PENDING',     // Chờ GĐ duyệt
  APPROVED: 'APPROVED',   // GĐ đã duyệt, xe vào xưởng
  REJECTED: 'REJECTED',   // GĐ từ chối
  COMPLETED: 'COMPLETED'  // Đã sửa xong, xuất xưởng
};


// ============================================================
// 1. BẢNG USERS (Người dùng hệ thống & Phân quyền RBAC)
// ============================================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID v4
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  role: text('role').notNull().default(USER_ROLES.DRIVER), // DIRECTOR | ACCOUNTANT | AREA_MANAGER | DRIVER
  area_id: text('area_id'), // Khu phụ trách: 'TUAN', 'TUAN_ANH', v.v.
  phone: text('phone'),
  is_active: integer('is_active').notNull().default(1),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 2. BẢNG VEHICLES (Đầu xe & Sơ mi rơ moóc)
// ============================================================
export const vehicles = sqliteTable('vehicles', {
  id: text('id').primaryKey(), // UUID v4
  plate_number: text('plate_number').notNull().unique(), // e.g. 15C-22405, 15H-00266
  vehicle_type: text('vehicle_type').notNull().default('TRACTOR'), // TRACTOR, TRAILER
  default_driver_id: text('default_driver_id'),
  status: text('status').notNull().default(VEHICLE_STATUSES.ACTIVE), // ACTIVE | IDLE | MAINTENANCE
  inspection_expiry: text('inspection_expiry'), // Hạn đăng kiểm YYYY-MM-DD
  insurance_expiry: text('insurance_expiry'),   // Hạn bảo hiểm YYYY-MM-DD
  current_km: integer('current_km').notNull().default(0),
  last_maintenance_km: integer('last_maintenance_km').notNull().default(0),
  oil_change_interval_km: integer('oil_change_interval_km').notNull().default(10000), // Chu kỳ thay dầu chuẩn 10.000km
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 3. BẢNG DRIVERS (Tài xế & Hồ sơ lái xe)
// ============================================================
export const drivers = sqliteTable('drivers', {
  id: text('id').primaryKey(), // UUID v4
  user_id: text('user_id'),    // Khóa ngoại liên kết bảng users
  full_name: text('full_name').notNull(),
  phone: text('phone'),
  license_number: text('license_number'),
  license_expiry: text('license_expiry'), // Hạn bằng lái YYYY-MM-DD
  area_id: text('area_id'), // Mã khu: 'TUAN' | 'TUAN_ANH'
  default_vehicle_id: text('default_vehicle_id'), // Xe gắn mặc định
  base_salary: integer('base_salary').notNull().default(0), // Lương cứng VND số nguyên
  kpi_target: integer('kpi_target').notNull().default(0),   // Chỉ tiêu cước/tháng VND số nguyên
  is_active: integer('is_active').notNull().default(1),
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 4. BẢNG SUBCONTRACTORS (Nhà xe đối tác / Xe ngoài)
// ============================================================
export const subcontractors = sqliteTable('subcontractors', {
  id: text('id').primaryKey(), // UUID v4
  name: text('name').notNull().unique(), // e.g. DOLTRUCK, KHÁNH HUYỀN, HÙNG DŨNG, VIETGO...
  contact_person: text('contact_person'),
  phone: text('phone'),
  bank_account: text('bank_account'),
  bank_name: text('bank_name'),
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 5. BẢNG ROUTES (Tuyến đường & Đơn giá cước mẫu)
// ============================================================
export const routes = sqliteTable('routes', {
  id: text('id').primaryKey(), // UUID v4
  route_code: text('route_code').unique(), // Mã viết tắt
  route_name: text('route_name').notNull().unique(), // e.g. "ĐÓNG BÌNH XUYÊN", "ĐÓNG LÀO CAI"
  departure: text('departure'),       // Điểm đóng/nhận hàng
  destination: text('destination'),   // Điểm dỡ/hạ hàng
  distance_km: integer('distance_km').notNull().default(0),
  default_price: integer('default_price').notNull().default(0),           // Cước chuẩn VND số nguyên
  default_driver_pay: integer('default_driver_pay').notNull().default(0), // Lương công chuyến tài xế VND
  default_fuel_liters: integer('default_fuel_liters').notNull().default(0),
  default_toll: integer('default_toll').notNull().default(0),             // Vé cầu đường BOT mẫu VND
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 6. BẢNG CUSTOMERS (Khách hàng / Chủ hàng)
// ============================================================
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(), // UUID v4
  code: text('code').unique(),
  name: text('name').notNull().unique(), // e.g. TTP, ĐẠI THỊNH, VTM, DIỆP LÂM ANH...
  phone: text('phone'),
  address: text('address'),
  tax_code: text('tax_code'),
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 7. BẢNG PORTS (Bãi Cảng / Depot / Kho)
// ============================================================
export const ports = sqliteTable('ports', {
  id: text('id').primaryKey(), // UUID v4
  code: text('code').unique(),
  name: text('name').notNull().unique(), // MEDLOG MINH PHƯƠNG, TIL, ĐÌNH VŨ, HICT, TÂN VŨ...
  port_type: text('port_type').notNull().default('PORT'), // PORT | ICD | DEPOT
  address: text('address'),
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 8. BẢNG TRIPS (Cuốc xe / Chuyến vận chuyển)
// ============================================================
export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(), // UUID v4
  trip_code: text('trip_code').notNull().unique(), // Mã cuốc (VD: C202610-001)
  trip_date: text('trip_date').notNull(),          // YYYY-MM-DD
  vehicle_id: text('vehicle_id'),                  // Khóa ngoại vehicles.id (null nếu xe ngoài)
  vehicle_plate: text('vehicle_plate'),            // Biển số trực tiếp (e.g. 15C-22405 hoặc DOLTRUCK)
  driver_id: text('driver_id'),                    // Khóa ngoại drivers.id (null nếu xe ngoài)
  driver_name: text('driver_name'),                // Tên tài xế
  route_id: text('route_id'),                      // Khóa ngoại routes.id
  route_name: text('route_name'),                  // Tên tuyến (e.g. ĐÓNG BÌNH XUYÊN)
  customer_id: text('customer_id'),                // Khóa ngoại customers.id
  customer_name: text('customer_name').notNull(),  // Chủ hàng (TTP, VTM, ĐẠI THỊNH...)
  area_id: text('area_id'),                        // Khu quản lý: 'TUAN' | 'TUAN_ANH'
  pickup_location: text('pickup_location'),        // Điểm lấy hàng / cảng nâng
  dropoff_location: text('dropoff_location'),      // Điểm trả hàng / cảng hạ
  vat_type: text('vat_type').notNull().default(VAT_TYPES.V), // [V] hay [NV]
  trip_revenue: integer('trip_revenue').notNull().default(0),   // Cước trước VAT (VND số nguyên)
  vat_amount: integer('vat_amount').notNull().default(0),       // Tiền thuế VAT (VND số nguyên)
  total_revenue: integer('total_revenue').notNull().default(0), // Tổng cước gồm VAT (VND số nguyên)
  driver_salary: integer('driver_salary').notNull().default(0), // Lương công chuyến tài xế (VND số nguyên)
  status: text('status').notNull().default(TRIP_STATUSES.NEW), // 8 trạng thái vòng đời
  is_subcontractor: integer('is_subcontractor').notNull().default(0), // 0: Xe nhà, 1: Xe thuê ngoài
  subcontractor_id: text('subcontractor_id'),                         // Khóa ngoại subcontractors.id
  subcontractor_name: text('subcontractor_name'),                     // Tên nhà xe ngoài
  subcontractor_cost: integer('subcontractor_cost').notNull().default(0), // Tiền cước trả đối tác (VND)
  toll_fee: integer('toll_fee').notNull().default(0),                 // Phí cầu đường/cao tốc
  port_fee: integer('port_fee').notNull().default(0),                 // Phí cảng/nâng hạ
  parking_fee: integer('parking_fee').notNull().default(0),           // Phí bến bãi/đỗ xe
  handling_fee: integer('handling_fee').notNull().default(0),         // Tiền bốc xếp
  meal_allowance: integer('meal_allowance').notNull().default(0),     // Tiền ăn/phụ cấp chuyến
  fuel_liters: real('fuel_liters').notNull().default(0),              // Lượng dầu cấp (lít)
  other_costs: integer('other_costs').notNull().default(0),           // Tổng chi phí khác
  customer_payment_status: text('customer_payment_status').notNull().default('CHUA_TT'), // CHUA_TT | TUOI | X | DA_TT | DOI_TRU
  subcontractor_payment_status: text('subcontractor_payment_status').notNull().default('CHUA_TT'), // CHUA_TT | DA_TT
  group_id: text('group_id'),                                         // Mã nhóm chi phí dùng chung (ô gộp)
  source_type: text('source_type').notNull().default('MANUAL'),       // MANUAL | BATCH | EXCEL
  source_file: text('source_file'),
  source_sheet: text('source_sheet'),
  source_row: integer('source_row'),
  raw_data: text('raw_data'),
  eir_status: text('eir_status').notNull().default(EIR_STATUSES.CHUA_TRA),     // CHUA_TRA | DA_TRA
  eir_paid_status: text('eir_paid_status').notNull().default(EIR_PAID_STATUSES.CHUA_TT), // CHUA_TT | DA_TT
  eir_photo_url: text('eir_photo_url'),     // URL ảnh phiếu phơi
  eir_submitted_at: text('eir_submitted_at'), // Thời điểm nộp phơi ISO
  is_locked: integer('is_locked').notNull().default(0), // 1: Đã khóa sổ kỳ, không cho sửa
  notes: text('notes'),
  created_by: text('created_by'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (t) => [
  index('idx_trips_trip_date').on(t.trip_date),
  index('idx_trips_vehicle_id').on(t.vehicle_id),
  index('idx_trips_driver_id').on(t.driver_id),
  index('idx_trips_customer_name').on(t.customer_name),
  index('idx_trips_area_id').on(t.area_id),
  index('idx_trips_status').on(t.status)
]);

// ============================================================
// 8B. BẢNG IMPORT_BATCHES
// ============================================================
export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  batch_name: text('batch_name').notNull(),
  file_name: text('file_name'),
  sheet_name: text('sheet_name'),
  total_rows: integer('total_rows').notNull().default(0),
  total_revenue: integer('total_revenue').notNull().default(0),
  total_cost: integer('total_cost').notNull().default(0),
  created_by: text('created_by'),
  status: text('status').notNull().default('ACTIVE'),
  created_at: text('created_at').notNull()
});

// ============================================================
// 9. BẢNG CONTAINERS (Container theo chuyến, hỗ trợ cont kẹp 2x20')
// ============================================================
export const containers = sqliteTable('containers', {
  id: text('id').primaryKey(), // UUID v4
  trip_id: text('trip_id').notNull(), // Khóa ngoại trips.id
  container_number: text('container_number'), // Mã cont 11 ký tự ISO 6346 (VD: MSMU5022544)
  container_size: text('container_size').notNull().default('40'), // 20 | 40 | 45
  container_type: text('container_type').notNull().default('DC'), // DC | HC | RF | OT
  is_second_cont: integer('is_second_cont').notNull().default(0), // 0: cont chính, 1: cont kẹp thứ hai
  seal_number: text('seal_number'),
  pickup_yard: text('pickup_yard'),   // Bãi/cảng nâng (MEDLOG MINH PHƯƠNG, NĐV...)
  dropoff_yard: text('dropoff_yard'), // Bãi/cảng hạ (TIL, THT...)
  lift_on_fee: integer('lift_on_fee').notNull().default(0),   // Tiền nâng (VND số nguyên)
  lift_off_fee: integer('lift_off_fee').notNull().default(0), // Tiền hạ (VND số nguyên)
  cargo_weight: integer('cargo_weight').notNull().default(0), // Trọng lượng hàng (kg)
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (t) => [
  index('idx_containers_trip_id').on(t.trip_id),
  index('idx_containers_number').on(t.container_number)
]);

// ============================================================
// 10. BẢNG EXPENSES (Chi phí thực tế chuyến & chi phí xe)
// ============================================================
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(), // UUID v4
  trip_id: text('trip_id'),       // Khóa ngoại trips.id (null nếu là chi phí xe cố định)
  vehicle_id: text('vehicle_id'), // Khóa ngoại vehicles.id
  expense_type: text('expense_type').notNull(), // LIFT_ON, LIFT_OFF, TOLL_BOT, FUEL, REPAIR, SELECT_CONT, SEAL, POLICE, OTHER
  category: text('category').notNull().default(EXPENSE_CATEGORIES.VARIABLE), // FIXED | VARIABLE
  amount: integer('amount').notNull().default(0), // Số tiền VND số nguyên
  expense_date: text('expense_date'),             // YYYY-MM-DD
  note: text('note'),                             // Diễn giải chi tiết (chọn vỏ, sửa vỏ...)
  receipt_url: text('receipt_url'),               // Ảnh hóa đơn chứng từ
  is_anomaly: integer('is_anomaly').notNull().default(0), // 1 nếu chênh lệch > 25% định mức chuẩn
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (t) => [
  index('idx_expenses_trip_id').on(t.trip_id),
  index('idx_expenses_vehicle_id').on(t.vehicle_id),
  index('idx_expenses_expense_date').on(t.expense_date),
  index('idx_expenses_type').on(t.expense_type)
]);

// ============================================================
// 11. BẢNG TRIP_ADVANCES (Tạm ứng trước chuyến & hoàn ứng lái xe)
// ============================================================
export const tripAdvances = sqliteTable('trip_advances', {
  id: text('id').primaryKey(), // UUID v4
  trip_id: text('trip_id').notNull(),     // Khóa ngoại trips.id
  driver_id: text('driver_id').notNull(), // Khóa ngoại drivers.id
  advance_date: text('advance_date').notNull(), // Ngày xuất quỹ tạm ứng YYYY-MM-DD
  advance_amount: integer('advance_amount').notNull().default(0), // Tiền xuất tạm ứng (VND số nguyên)
  settled_amount: integer('settled_amount').notNull().default(0), // Tiền thực chi theo phơi/vé (VND)
  balance_amount: integer('balance_amount').notNull().default(0), // Tiền thừa nộp lại (+) hoặc thiếu bù (-)
  status: text('status').notNull().default(ADVANCE_STATUSES.PENDING), // PENDING | SETTLED
  settled_at: text('settled_at'),         // Thời điểm quyết toán
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (t) => [
  index('idx_advances_trip_id').on(t.trip_id),
  index('idx_advances_driver_id').on(t.driver_id),
  index('idx_advances_status').on(t.status)
]);

// ============================================================
// 12. BẢNG AUDIT_LOGS (Nhật ký kiểm toán hệ thống)
// ============================================================
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(), // UUID v4
  user_id: text('user_id'),
  username: text('username'),
  action: text('action').notNull(), // CREATE | UPDATE | DELETE | PERIOD_LOCK | KPI_CHANGE | BACKUP | IMPORT
  table_name: text('table_name').notNull(),
  record_id: text('record_id').notNull(),
  old_values: text('old_values'), // JSON chuỗi lưu trạng thái trước sửa
  new_values: text('new_values'), // JSON chuỗi lưu trạng thái sau sửa
  reason: text('reason'),         // Lý do sửa (đặc biệt khi sửa cước/KPI)
  ip_address: text('ip_address'),
  created_at: text('created_at').notNull() // ISO Datetime
}, (t) => [
  index('idx_audit_logs_action').on(t.action),
  index('idx_audit_logs_table_record').on(t.table_name, t.record_id),
  index('idx_audit_logs_created_at').on(t.created_at)
]);

// ============================================================
// 13. BẢNG EPORT_ACCOUNTS (Tài khoản ePort cảng mã hóa AES-GCM)
// ============================================================
export const eportAccounts = sqliteTable('eport_accounts', {
  id: text('id').primaryKey(), // UUID v4
  port_name: text('port_name').notNull(), // Tên cổng ePort (Hateco, Tân Vũ, Nam Đình Vũ...)
  tax_code: text('tax_code'),             // Mã số thuế doanh nghiệp
  username: text('username').notNull(),   // Tên đăng nhập ePort
  encrypted_password: text('encrypted_password').notNull(), // Mật khẩu mã hóa AES-256-GCM
  iv: text('iv').notNull(),               // Initialization Vector (hex)
  tag: text('tag').notNull(),             // Auth Tag (hex)
  company_name: text('company_name'),     // CTY ANH SỨC hoặc CTY TUÂN THÀNH PHÁT
  driver_access: text('driver_access'),   // JSON danh sách tài xế được quyền dùng (Liêm, Tuân, Hội...)
  notes: text('notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// ============================================================
// 14. BẢNG PERIOD_LOCKS (Quản lý khóa sổ kỳ kế toán)
// ============================================================
export const periodLocks = sqliteTable('period_locks', {
  id: text('id').primaryKey(), // UUID v4
  period_month: text('period_month').notNull().unique(), // YYYY-MM (e.g. "2026-09")
  is_locked: integer('is_locked').notNull().default(1),  // 1: Đã khóa, 0: Mở khóa
  locked_by: text('locked_by'),
  locked_at: text('locked_at').notNull(),
  notes: text('notes')
});

// ============================================================
// 15. BẢNG DRIVER_INCENTIVES (Khoản động viên / Thưởng GĐ bảo mật & Lương)
// ============================================================
export const driverIncentives = sqliteTable('driver_incentives', {
  id: text('id').primaryKey(), // UUID v4
  driver_id: text('driver_id').notNull(), // Khóa ngoại drivers.id
  period_month: text('period_month').notNull(), // YYYY-MM (e.g. "2026-09")
  incentive_amount: integer('incentive_amount').notNull().default(0), // Khoản động viên (VND số nguyên)
  incentive_note: text('incentive_note'), // Lý do thưởng động viên (chăm chỉ, giữ xe, hỗ trợ...)
  base_salary_override: integer('base_salary_override'), // Lương cứng điều chỉnh nếu có
  is_approved: integer('is_approved').notNull().default(1), // 1: GĐ đã duyệt
  approved_by: text('approved_by'), // Người duyệt (DIRECTOR)
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (t) => [
  index('idx_incentives_driver_month').on(t.driver_id, t.period_month),
  index('idx_incentives_period_month').on(t.period_month)
]);

// ============================================================
// 16. BẢNG MAINTENANCE_PROPOSALS (Đề xuất & Nhật ký bảo dưỡng xe)
// ============================================================
export const maintenanceProposals = sqliteTable('maintenance_proposals', {
  id: text('id').primaryKey(), // UUID v4
  vehicle_id: text('vehicle_id').notNull(), // Khóa ngoại vehicles.id
  proposal_type: text('proposal_type').notNull().default(MAINTENANCE_TYPES.PERIODIC), // OIL_CHANGE | TIRE_REPLACEMENT | PERIODIC | REPAIR
  title: text('title').notNull(),
  description: text('description'),
  estimated_cost: integer('estimated_cost').notNull().default(0), // Dự toán chi phí VND số nguyên
  actual_cost: integer('actual_cost').notNull().default(0),       // Chi phí thực tế VND số nguyên
  km_at_proposal: integer('km_at_proposal').notNull().default(0),
  status: text('status').notNull().default(MAINTENANCE_STATUSES.PENDING), // PENDING | APPROVED | REJECTED | COMPLETED
  proposed_by: text('proposed_by').notNull(),
  approved_by: text('approved_by'), // Chỉ DIRECTOR
  approved_at: text('approved_at'),
  rejection_reason: text('rejection_reason'),
  completed_at: text('completed_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (t) => [
  index('idx_maint_vehicle_id').on(t.vehicle_id),
  index('idx_maint_status').on(t.status),
  index('idx_maint_created_at').on(t.created_at)
]);


// ============================================================
// ĐỊNH NGHĨA QUAN HỆ DRIZZLE RELATIONS
// ============================================================
export const usersRelations = relations(users, ({ one }) => ({
  driver: one(drivers, {
    fields: [users.id],
    references: [drivers.user_id]
  })
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  defaultDriver: one(drivers, {
    fields: [vehicles.default_driver_id],
    references: [drivers.id]
  }),
  trips: many(trips),
  expenses: many(expenses),
  maintenanceProposals: many(maintenanceProposals)
}));

export const maintenanceProposalsRelations = relations(maintenanceProposals, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [maintenanceProposals.vehicle_id],
    references: [vehicles.id]
  })
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, {
    fields: [drivers.user_id],
    references: [users.id]
  }),
  defaultVehicle: one(vehicles, {
    fields: [drivers.default_vehicle_id],
    references: [vehicles.id]
  }),
  trips: many(trips),
  advances: many(tripAdvances)
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  vehicle: one(vehicles, {
    fields: [trips.vehicle_id],
    references: [vehicles.id]
  }),
  driver: one(drivers, {
    fields: [trips.driver_id],
    references: [drivers.id]
  }),
  route: one(routes, {
    fields: [trips.route_id],
    references: [routes.id]
  }),
  customer: one(customers, {
    fields: [trips.customer_id],
    references: [customers.id]
  }),
  subcontractor: one(subcontractors, {
    fields: [trips.subcontractor_id],
    references: [subcontractors.id]
  }),
  containers: many(containers),
  expenses: many(expenses),
  advances: many(tripAdvances)
}));

export const containersRelations = relations(containers, ({ one }) => ({
  trip: one(trips, {
    fields: [containers.trip_id],
    references: [trips.id]
  })
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  trip: one(trips, {
    fields: [expenses.trip_id],
    references: [trips.id]
  }),
  vehicle: one(vehicles, {
    fields: [expenses.vehicle_id],
    references: [vehicles.id]
  })
}));

export const tripAdvancesRelations = relations(tripAdvances, ({ one }) => ({
  trip: one(trips, {
    fields: [tripAdvances.trip_id],
    references: [trips.id]
  }),
  driver: one(drivers, {
    fields: [tripAdvances.driver_id],
    references: [drivers.id]
  })
}));

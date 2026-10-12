/**
 * Module khởi tạo bảng dữ liệu SQLite (DDL) theo chuẩn Schema Drizzle ORM
 * Tự động tạo toàn bộ bảng, khóa chính, khóa ngoại và chỉ mục nếu chưa tồn tại.
 */
import { db } from './database.js';

export function initDatabase() {
  console.log('[DB INIT] Đang kiểm tra và khởi tạo schema bảng SQLite...');

  // Bật chế độ ràng buộc khóa ngoại
  db.exec('PRAGMA foreign_keys = ON;');

  const ddl = `
    -- 1. BẢNG USERS
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'DRIVER',
      area_id TEXT,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 2. BẢNG VEHICLES
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      plate_number TEXT NOT NULL UNIQUE,
      vehicle_type TEXT NOT NULL DEFAULT 'TRACTOR',
      default_driver_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      inspection_expiry TEXT,
      insurance_expiry TEXT,
      current_km INTEGER NOT NULL DEFAULT 0,
      last_maintenance_km INTEGER NOT NULL DEFAULT 0,
      oil_change_interval_km INTEGER NOT NULL DEFAULT 10000,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 3. BẢNG DRIVERS
    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      full_name TEXT NOT NULL,
      phone TEXT,
      license_number TEXT,
      license_expiry TEXT,
      area_id TEXT,
      default_vehicle_id TEXT,
      base_salary INTEGER NOT NULL DEFAULT 0,
      kpi_target INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (default_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    -- 4. BẢNG SUBCONTRACTORS
    CREATE TABLE IF NOT EXISTS subcontractors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      contact_person TEXT,
      phone TEXT,
      bank_account TEXT,
      bank_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 5. BẢNG ROUTES
    CREATE TABLE IF NOT EXISTS routes (
      id TEXT PRIMARY KEY,
      route_code TEXT UNIQUE,
      route_name TEXT NOT NULL UNIQUE,
      departure TEXT,
      destination TEXT,
      distance_km INTEGER NOT NULL DEFAULT 0,
      default_price INTEGER NOT NULL DEFAULT 0,
      default_driver_pay INTEGER NOT NULL DEFAULT 0,
      default_fuel_liters INTEGER NOT NULL DEFAULT 0,
      default_toll INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 6. BẢNG CUSTOMERS
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      tax_code TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 7. BẢNG PORTS
    CREATE TABLE IF NOT EXISTS ports (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT NOT NULL UNIQUE,
      port_type TEXT NOT NULL DEFAULT 'PORT',
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 8. BẢNG TRIPS
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      trip_code TEXT NOT NULL UNIQUE,
      trip_date TEXT NOT NULL,
      vehicle_id TEXT,
      vehicle_plate TEXT,
      driver_id TEXT,
      driver_name TEXT,
      route_id TEXT,
      route_name TEXT,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      area_id TEXT,
      pickup_location TEXT,
      dropoff_location TEXT,
      vat_type TEXT NOT NULL DEFAULT 'V',
      trip_revenue INTEGER NOT NULL DEFAULT 0,
      vat_amount INTEGER NOT NULL DEFAULT 0,
      total_revenue INTEGER NOT NULL DEFAULT 0,
      driver_salary INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NEW',
      is_subcontractor INTEGER NOT NULL DEFAULT 0,
      subcontractor_id TEXT,
      subcontractor_cost INTEGER NOT NULL DEFAULT 0,
      eir_status TEXT NOT NULL DEFAULT 'CHUA_TRA',
      eir_paid_status TEXT NOT NULL DEFAULT 'CHUA_TT',
      eir_photo_url TEXT,
      eir_submitted_at TEXT,
      is_locked INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
      FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE SET NULL
    );

    -- 9. BẢNG CONTAINERS
    CREATE TABLE IF NOT EXISTS containers (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      container_number TEXT,
      container_size TEXT NOT NULL DEFAULT '40',
      container_type TEXT NOT NULL DEFAULT 'DC',
      is_second_cont INTEGER NOT NULL DEFAULT 0,
      seal_number TEXT,
      pickup_yard TEXT,
      dropoff_yard TEXT,
      lift_on_fee INTEGER NOT NULL DEFAULT 0,
      lift_off_fee INTEGER NOT NULL DEFAULT 0,
      cargo_weight INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    -- 10. BẢNG EXPENSES
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      trip_id TEXT,
      vehicle_id TEXT,
      expense_type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'VARIABLE',
      amount INTEGER NOT NULL DEFAULT 0,
      expense_date TEXT,
      note TEXT,
      receipt_url TEXT,
      is_anomaly INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    );

    -- 11. BẢNG TRIP_ADVANCES
    CREATE TABLE IF NOT EXISTS trip_advances (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      advance_date TEXT NOT NULL,
      advance_amount INTEGER NOT NULL DEFAULT 0,
      settled_amount INTEGER NOT NULL DEFAULT 0,
      balance_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      settled_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT
    );

    -- 12. BẢNG AUDIT_LOGS
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      old_values TEXT,
      new_values TEXT,
      reason TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    -- 13. BẢNG EPORT_ACCOUNTS
    CREATE TABLE IF NOT EXISTS eport_accounts (
      id TEXT PRIMARY KEY,
      port_name TEXT NOT NULL,
      tax_code TEXT,
      username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      company_name TEXT,
      driver_access TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 14. BẢNG PERIOD_LOCKS
    CREATE TABLE IF NOT EXISTS period_locks (
      id TEXT PRIMARY KEY,
      period_month TEXT NOT NULL UNIQUE,
      is_locked INTEGER NOT NULL DEFAULT 1,
      locked_by TEXT,
      locked_at TEXT NOT NULL,
      notes TEXT
    );

    -- 15. BẢNG DRIVER_INCENTIVES (Lương 3 thành phần & Khoản động viên GĐ)
    CREATE TABLE IF NOT EXISTS driver_incentives (
      id TEXT PRIMARY KEY,
      driver_id TEXT NOT NULL,
      period_month TEXT NOT NULL,
      incentive_amount INTEGER NOT NULL DEFAULT 0,
      incentive_note TEXT,
      base_salary_override INTEGER,
      is_approved INTEGER NOT NULL DEFAULT 1,
      approved_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    );

    -- 16. BẢNG MAINTENANCE_PROPOSALS (Đề xuất & Nhật ký bảo dưỡng xe)
    CREATE TABLE IF NOT EXISTS maintenance_proposals (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      proposal_type TEXT NOT NULL DEFAULT 'PERIODIC',
      title TEXT NOT NULL,
      description TEXT,
      estimated_cost INTEGER NOT NULL DEFAULT 0,
      actual_cost INTEGER NOT NULL DEFAULT 0,
      km_at_proposal INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      proposed_by TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      rejection_reason TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    -- 17. BẢNG IMPORT_BATCHES (Lịch sử các đợt nhập Excel/Batch để đối chiếu & hoàn tác)
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      batch_name TEXT NOT NULL,
      file_name TEXT,
      sheet_name TEXT,
      total_rows INTEGER NOT NULL DEFAULT 0,
      total_revenue INTEGER NOT NULL DEFAULT 0,
      total_cost INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      notes TEXT,
      created_at TEXT NOT NULL
    );

    -- CÁC CHỈ MỤC TỐI ƯU TRUY VẤN
    CREATE INDEX IF NOT EXISTS idx_trips_trip_date ON trips(trip_date);
    CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id ON trips(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id);
    CREATE INDEX IF NOT EXISTS idx_trips_customer_name ON trips(customer_name);
    CREATE INDEX IF NOT EXISTS idx_trips_area_id ON trips(area_id);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
    CREATE INDEX IF NOT EXISTS idx_containers_trip_id ON containers(trip_id);
    CREATE INDEX IF NOT EXISTS idx_containers_number ON containers(container_number);
    CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_vehicle_id ON expenses(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_advances_trip_id ON trip_advances(trip_id);
    CREATE INDEX IF NOT EXISTS idx_advances_driver_id ON trip_advances(driver_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_incentives_driver_month ON driver_incentives(driver_id, period_month);
    CREATE INDEX IF NOT EXISTS idx_incentives_period_month ON driver_incentives(period_month);
    CREATE INDEX IF NOT EXISTS idx_maint_vehicle_id ON maintenance_proposals(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_maint_status ON maintenance_proposals(status);
    CREATE INDEX IF NOT EXISTS idx_maint_created_at ON maintenance_proposals(created_at);
  `;

  db.exec(ddl);

  // Tự động kiểm tra và nâng cấp schema bảng trips nếu thiếu các trường chi phí chi tiết
  try {
    const existingCols = db.prepare("PRAGMA table_info(trips)").all().map(c => c.name);
    const newTripCols = [
      { name: 'subcontractor_name', def: 'TEXT' },
      { name: 'toll_fee', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'port_fee', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'parking_fee', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'handling_fee', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'meal_allowance', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'fuel_liters', def: 'REAL NOT NULL DEFAULT 0' },
      { name: 'other_costs', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'customer_payment_status', def: "TEXT NOT NULL DEFAULT 'CHUA_TT'" },
      { name: 'subcontractor_payment_status', def: "TEXT NOT NULL DEFAULT 'CHUA_TT'" },
      { name: 'group_id', def: 'TEXT' },
      { name: 'source_type', def: "TEXT NOT NULL DEFAULT 'MANUAL'" },
      { name: 'source_file', def: 'TEXT' },
      { name: 'source_sheet', def: 'TEXT' },
      { name: 'source_row', def: 'INTEGER' },
      { name: 'raw_data', def: 'TEXT' }
    ];

    for (const col of newTripCols) {
      if (!existingCols.includes(col.name)) {
        db.exec(`ALTER TABLE trips ADD COLUMN ${col.name} ${col.def};`);
      }
    }
    // Tự động kiểm tra và thêm cột notes cho bảng import_batches nếu chưa có
    const batchCols = db.prepare('PRAGMA table_info(import_batches);').all();
    const hasBatchNotes = batchCols.some(c => c.name === 'notes');
    if (!hasBatchNotes) {
      db.prepare('ALTER TABLE import_batches ADD COLUMN notes TEXT;').run();
    }
  } catch (err) {
    console.warn('[DB INIT] Cảnh báo nâng cấp cột trips:', err.message);
  }

  console.log('[DB INIT] Hoàn tất khởi tạo 17 bảng dữ liệu và chỉ mục SQLite thành công!');
}

export default initDatabase;

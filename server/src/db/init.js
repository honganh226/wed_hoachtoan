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

    -- 18. BẢNG SCHEMA_MIGRATIONS (Quản lý phiên bản migration)
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    -- 19. BẢNG FUEL_PRICES (Giá dầu theo ngày chạy YYYY-MM-DD)
    CREATE TABLE IF NOT EXISTS fuel_prices (
      apply_date TEXT PRIMARY KEY,
      price_per_liter INTEGER NOT NULL,
      note TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 20. BẢNG FUEL_PRICE_HISTORY (Lịch sử chỉnh sửa giá dầu theo ngày)
    CREATE TABLE IF NOT EXISTS fuel_price_history (
      id TEXT PRIMARY KEY,
      apply_date TEXT NOT NULL,
      old_price INTEGER,
      new_price INTEGER NOT NULL,
      affected_trips_count INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 21. BẢNG EIR_ADVANCES (Tiền phơi trả hộ chủ hàng)
    CREATE TABLE IF NOT EXISTS eir_advances (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      advance_amount INTEGER NOT NULL DEFAULT 0,
      advance_date TEXT NOT NULL,
      reference_code TEXT,
      raw_source_value TEXT,
      is_non_financial_note INTEGER NOT NULL DEFAULT 0,
      refunded_amount INTEGER NOT NULL DEFAULT 0,
      refund_status TEXT NOT NULL DEFAULT 'CHUA_HOAN',
      payment_term_type TEXT DEFAULT 'CHUA_DAT',
      due_date TEXT,
      completed_date TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 22. BẢNG EIR_REFUNDS (Giao dịch hoàn tiền phơi trả hộ)
    CREATE TABLE IF NOT EXISTS eir_refunds (
      id TEXT PRIMARY KEY,
      advance_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      refund_amount INTEGER NOT NULL,
      refund_date TEXT NOT NULL,
      is_tuoi INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      actor TEXT NOT NULL,
      cancelled_by TEXT,
      cancelled_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (advance_id) REFERENCES eir_advances(id) ON DELETE CASCADE
    );

    -- 23. BẢNG EIR_ADVANCE_HISTORY (Lịch sử thay đổi khoản phơi & ngày hẹn)
    CREATE TABLE IF NOT EXISTS eir_advance_history (
      id TEXT PRIMARY KEY,
      advance_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      action TEXT NOT NULL,
      old_values TEXT,
      new_values TEXT,
      note TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 24. BẢNG WRITE_REQUESTS (Idempotency store chống gửi trùng yêu cầu ghi)
    CREATE TABLE IF NOT EXISTS write_requests (
      id TEXT PRIMARY KEY,
      body_hash TEXT NOT NULL,
      status INTEGER NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ''
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
    CREATE INDEX IF NOT EXISTS idx_eir_advances_trip_id ON eir_advances(trip_id);
    CREATE INDEX IF NOT EXISTS idx_eir_advances_customer ON eir_advances(customer_name);
    CREATE INDEX IF NOT EXISTS idx_eir_advances_due_date ON eir_advances(due_date);
    CREATE INDEX IF NOT EXISTS idx_eir_refunds_advance_id ON eir_refunds(advance_id);
  `;

  db.exec(ddl);

  // Tự động kiểm tra và nâng cấp schema bảng trips nếu thiếu các trường chi phí chi tiết
  try {
    const existingCols = db.prepare("PRAGMA table_info(trips)").all().map(c => c.name);
    const newTripCols = [
      { name: 'driver_name', def: 'TEXT' },
      { name: 'vehicle_plate', def: 'TEXT' },
      { name: 'route_name', def: 'TEXT' },
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
      { name: 'raw_data', def: 'TEXT' },
      // Các cột chuẩn hóa ngày 28/10/2026:
      { name: 'base_revenue', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'vat_rate', def: 'REAL NOT NULL DEFAULT 0.08' },
      { name: 'deduction_rate', def: 'REAL NOT NULL DEFAULT 0.17' },
      { name: 'deduction_amount', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'revenue_after_deduction', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'lift_on_location', def: 'TEXT' },
      { name: 'lift_on_fee', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'lift_off_location', def: 'TEXT' },
      { name: 'lift_off_fee', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'port_fee_classification_status', def: "TEXT NOT NULL DEFAULT 'NONE'" },
      { name: 'fuel_unit_price', def: 'INTEGER' },
      { name: 'fuel_cost', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'container_type_raw', def: 'TEXT' },
      { name: 'payment_terms', def: 'TEXT' },
      { name: 'stt_source', def: 'INTEGER' }
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

    // Chạy migration dữ liệu chuẩn hóa 20261028_01_codex_standardization
    const migrationVersion = '20261028_01_codex_standardization';
    const hasMigrated = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migrationVersion);
    if (!hasMigrated) {
      const nowIso = new Date().toISOString();
      const allTrips = db.prepare('SELECT id, trip_revenue, total_revenue, port_fee, lift_on_fee, lift_off_fee, pickup_location, dropoff_location FROM trips').all();
      const updateStmt = db.prepare(`
        UPDATE trips
        SET base_revenue = ?,
            trip_revenue = ?,
            vat_rate = 0.08,
            vat_amount = ?,
            total_revenue = ?,
            deduction_rate = 0.17,
            deduction_amount = ?,
            revenue_after_deduction = ?,
            lift_on_location = COALESCE(lift_on_location, pickup_location),
            lift_off_location = COALESCE(lift_off_location, dropoff_location),
            port_fee_classification_status = ?
        WHERE id = ?
      `);

      const migrateTx = db.transaction(() => {
        for (const t of allTrips) {
          const baseRev = Math.max(0, Math.round(Number(t.trip_revenue || t.total_revenue || 0)));
          const vatAmt = Math.round(baseRev * 0.08);
          const totalRev = baseRev + vatAmt;
          const deductAmt = Math.round(totalRev * 0.17);
          const afterDeduct = totalRev - deductAmt;
          const hasLegacyPortFee = Number(t.port_fee || 0) > 0 && Number(t.lift_on_fee || 0) === 0 && Number(t.lift_off_fee || 0) === 0;
          const portClassStatus = hasLegacyPortFee ? 'NEEDS_CLASSIFICATION' : 'NONE';
          updateStmt.run(baseRev, baseRev, vatAmt, totalRev, deductAmt, afterDeduct, portClassStatus, t.id);
        }
        db.prepare('INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)').run(
          migrationVersion,
          'Chuẩn hóa cước gốc chưa VAT (+8% VAT, -17% nội bộ), tách nâng/hạ, tiền phơi trả hộ và giá dầu theo ngày',
          nowIso
        );
      });
      migrateTx();
      console.log(`[DB MIGRATION] Đã chạy migration ${migrationVersion} cho ${allTrips.length} bản ghi trips.`);
    }

    // Luôn đảm bảo bảng write_requests (cũ 4 cột) có đầy đủ cột created_at mà không mất bản ghi cũ
    const wrCols = db.prepare('PRAGMA table_info(write_requests)').all().map(c => c.name);
    if (!wrCols.includes('created_at')) {
      db.exec("ALTER TABLE write_requests ADD COLUMN created_at TEXT NOT NULL DEFAULT '';");
    }

    // Migration phiên bản 2: Nâng cấp bảng write_requests cũ và đồng bộ schema sau restore
    const migrationVersion2 = '20261028_02_upgrade_write_requests_schema';
    const hasMigrated2 = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migrationVersion2);
    if (!hasMigrated2) {
      const nowIso = new Date().toISOString();
      db.transaction(() => {
        const cols = db.prepare('PRAGMA table_info(write_requests)').all().map(c => c.name);
        if (!cols.includes('created_at')) {
          db.exec("ALTER TABLE write_requests ADD COLUMN created_at TEXT NOT NULL DEFAULT '';");
        }
        db.prepare("UPDATE write_requests SET created_at = ? WHERE created_at = '' OR created_at IS NULL").run(nowIso);
        db.prepare('INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)').run(
          migrationVersion2,
          'Nâng cấp bảng write_requests 4 cột cũ lên 5 cột có created_at, bảo toàn khóa chống ghi trùng cũ',
          nowIso
        );
      })();
      console.log(`[DB MIGRATION] Đã chạy migration ${migrationVersion2} thành công.`);
    }

    // Đảm bảo có tài khoản thư ký (SECRETARY) để kiểm thử và vận hành nhắc việc nếu chưa tồn tại
    const hasSecretary = db.prepare("SELECT id FROM users WHERE role = 'SECRETARY' LIMIT 1").get();
    if (!hasSecretary && process.env.NODE_ENV !== 'production') {
      const accUser = db.prepare("SELECT password_hash FROM users WHERE role = 'ACCOUNTANT' OR role = 'DIRECTOR' LIMIT 1").get();
      const pwdHash = accUser?.password_hash || '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
      const nowIso = new Date().toISOString();
      db.prepare(`
        INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'SECRETARY', NULL, '0900000009', 1, ?, ?)
      `).run('user-secretary-01', 'thuky', pwdHash, 'Thư Ký Điều Vận', nowIso, nowIso);
    }
  } catch (err) {
    console.warn('[DB INIT] Cảnh báo nâng cấp cột trips:', err.message);
  }

  console.log('[DB INIT] Hoàn tất khởi tạo 23 bảng dữ liệu và chỉ mục SQLite thành công!');
}

export default initDatabase;

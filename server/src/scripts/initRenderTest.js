import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.RENDER_READ_ONLY !== 'true') throw new Error('This initializer requires RENDER_READ_ONLY=true');
const password = process.env.DIRECTOR_INIT_PASSWORD;
if (!password || password.length < 12) throw new Error('Configure DIRECTOR_INIT_PASSWORD with at least 12 characters');

// 1. Khởi tạo tài khoản Giám Đốc (chỉ lấy mật khẩu từ Render Environment, không tạo tài khoản mẫu)
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('giamdoc');
if (!existing) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)')
    .run(randomUUID(), 'giamdoc', bcrypt.hashSync(password, 12), 'Giám đốc', 'DIRECTOR', now, now);
  console.log('[TEST] Director account initialized; password remains in environment variables.');
} else {
  console.log('[TEST] Existing account preserved.');
}

// 2. Dựng lại dữ liệu thử cho Đội xe, KPI và Bảng lương (4 xe, 4 tài xế, 33 chuyến, v.v.)
// Khi Render ngủ, restart hoặc redeploy, dữ liệu thử được tự động khôi phục.
const seedFilePath = path.resolve(__dirname, '../data/fleet_payroll_seed.json');
if (fs.existsSync(seedFilePath)) {
  try {
    const seedData = JSON.parse(fs.readFileSync(seedFilePath, 'utf8'));
    const vehicleCount = db.prepare('SELECT COUNT(*) as c FROM vehicles').get();

    if (!vehicleCount || vehicleCount.c === 0) {
      console.log('[TEST] Seeding fleet, trips, and payroll mock data for testing...');

      db.transaction(() => {
        // Nạp từng bảng theo thứ tự quan hệ khóa ngoại
        const tableOrder = [
          'vehicles',
          'drivers',
          'subcontractors',
          'routes',
          'customers',
          'ports',
          'trips',
          'containers',
          'expenses',
          'trip_advances',
          'driver_incentives',
          'maintenance_proposals'
        ];

        for (const tableName of tableOrder) {
          const rows = seedData[tableName];
          if (!Array.isArray(rows) || rows.length === 0) continue;

          // Lấy danh sách cột từ row đầu tiên
          const columns = Object.keys(rows[0]);
          const placeholders = columns.map(() => '?').join(', ');
          const sql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          const stmt = db.prepare(sql);

          for (const row of rows) {
            const values = columns.map(col => row[col] !== undefined ? row[col] : null);
            stmt.run(...values);
          }
          if(tableName === 'trips')for(const row of rows)db.prepare("UPDATE trips SET source_type='LEGACY_TEST' WHERE id=?").run(row.id);
          console.log(`[TEST] Restored ${rows.length} rows into ${tableName}`);
        }
      })();

      console.log('[TEST] Fleet and payroll test data restored successfully!');
    } else {
      console.log(`[TEST] Fleet data already exists (${vehicleCount.c} vehicles). Skipping seed.`);
    }
  } catch (err) {
    console.error('[TEST] Error restoring fleet_payroll_seed:', err.message);
    throw err;
  }
} else {
  throw new Error('[TEST] Fleet/payroll seed file not found: ' + seedFilePath);
}

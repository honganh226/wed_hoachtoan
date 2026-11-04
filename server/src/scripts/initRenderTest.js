import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.RENDER_READ_ONLY !== 'true' && process.env.ONLINE_EDITING !== 'true') throw new Error('This initializer requires RENDER_READ_ONLY=true or ONLINE_EDITING=true');
const password = process.env.DIRECTOR_INIT_PASSWORD;
if (!password || password.length < 6) throw new Error('Configure DIRECTOR_INIT_PASSWORD with at least 6 characters for the test account');

// 1. Khởi tạo tài khoản Giám Đốc (chỉ lấy mật khẩu từ Render Environment, không tạo tài khoản mẫu)
const existing = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get('giamdoc');
if (!existing) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)')
    .run(randomUUID(), 'giamdoc', bcrypt.hashSync(password, 12), 'Giám đốc', 'DIRECTOR', now, now);
  console.log('[TEST] Director account initialized; password remains in environment variables.');
} else if (!bcrypt.compareSync(password, existing.password_hash)) {
  db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(bcrypt.hashSync(password, 12), new Date().toISOString(), existing.id);
  console.log('[TEST] Director test password synchronized from environment.');
} else {
  console.log('[TEST] Existing account preserved.');
}

// Đồng bộ riêng tài khoản thư ký của bản test, không phụ thuộc hash mặc định
// được initDatabase tạo trước khi tài khoản giám đốc tồn tại.
const secretaryPassword = process.env.SECRETARY_INIT_PASSWORD || password;
if (secretaryPassword.length < 6) throw new Error('Configure SECRETARY_INIT_PASSWORD with at least 6 characters');
const secretary = db.prepare('SELECT id, role, password_hash FROM users WHERE username = ?').get('thuky');
if (secretary && secretary.role !== 'SECRETARY') throw new Error('Test secretary username is already assigned to a different role');
if (!secretary) {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)')
    .run(randomUUID(), 'thuky', bcrypt.hashSync(secretaryPassword, 12), 'Thư ký', 'SECRETARY', now, now);
} else if (!bcrypt.compareSync(secretaryPassword, secretary.password_hash)) {
  db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?')
    .run(bcrypt.hashSync(secretaryPassword, 12), new Date().toISOString(), secretary.id);
}
console.log('[TEST] Secretary test account synchronized from environment.');

// 2. Không tự động seed dữ liệu mock (33 chuyến, fleet_payroll_seed.json) khi khởi động
// Dữ liệu nghiệp vụ chỉ được nạp từ Supabase durable snapshot hoặc qua form/file Excel do người dùng tải lên.
console.log('[INIT] Khởi động máy chủ thành công. Sẵn sàng đồng bộ bền vững với Supabase.');

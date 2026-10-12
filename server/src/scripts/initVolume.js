/**
 * SCRIPT KHỞI TẠO DỮ LIỆU BAN ĐẦU TRÊN RAILWAY PERSISTENT VOLUME
 * ─────────────────────────────────────────────────────────────────
 * Chạy một lần duy nhất sau khi gắn volume mới.
 * Kiểm tra trước: nếu DB đã có dữ liệu (users > 0) thì BỎ QUA, không ghi đè.
 *
 * Cách dùng (chạy trong container đang chạy hoặc qua railway run):
 *   NODE_ENV=production node src/scripts/initVolume.js
 *
 * Biến môi trường bắt buộc trước khi chạy:
 *   DIRECTOR_INIT_PASSWORD=<mật khẩu mới cho giamdoc>
 *   (không dùng mật khẩu cứng trong script)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db, rawDb } from '../db/database.js';

const DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/app/data'
  : path.resolve(process.cwd(), 'data');

const ALLOC_FILE = path.join(DATA_DIR, 'group_allocations_thang1.json');

console.log('[INIT VOLUME] Kiểm tra trạng thái Persistent Volume...');
console.log('[INIT VOLUME] DATA_DIR =', DATA_DIR);

// ── Bước 1: Kiểm tra xem DB đã có dữ liệu chưa ──────────────────────────────
const existingUsers = rawDb.prepare('SELECT COUNT(*) as cnt FROM users').get();
if (existingUsers.cnt > 0) {
  console.log(`[INIT VOLUME] Volume đã có dữ liệu (${existingUsers.cnt} tài khoản). KHÔNG ghi đè. Dừng.`);
  process.exit(0);
}

// ── Bước 2: Kiểm tra DIRECTOR_INIT_PASSWORD ──────────────────────────────────
const directorPassword = process.env.DIRECTOR_INIT_PASSWORD;
if (!directorPassword || directorPassword.length < 8) {
  console.error('[INIT VOLUME] LỖI: Biến môi trường DIRECTOR_INIT_PASSWORD chưa được đặt hoặc ngắn hơn 8 ký tự.');
  console.error('[INIT VOLUME] Thiết lập biến này trong Railway Variables trước khi chạy script.');
  process.exit(1);
}

// ── Bước 3: Tạo tài khoản hệ thống ──────────────────────────────────────────
console.log('[INIT VOLUME] Volume trống. Đang khởi tạo tài khoản...');

const now = new Date().toISOString();
const directorHash = bcrypt.hashSync(directorPassword, 12);
// Mật khẩu mặc định các tài khoản nội bộ — chỉ dùng cho giai đoạn test
const internalDefaultHash = bcrypt.hashSync('HoachToan@2026!', 10);

const users = [
  { id: uuidv4(), username: 'giamdoc',  password_hash: directorHash,       full_name: 'Giám Đốc Điều Hành', role: 'DIRECTOR',     area_id: null,       phone: '0901234567' },
  { id: uuidv4(), username: 'ketoan',   password_hash: internalDefaultHash, full_name: 'Kế Toán Trưởng',     role: 'ACCOUNTANT',   area_id: null,       phone: '0902345678' },
  { id: uuidv4(), username: 'tuan',     password_hash: internalDefaultHash, full_name: 'Phạm Văn Tuân',      role: 'AREA_MANAGER', area_id: 'TUAN',     phone: '0396256666' },
  { id: uuidv4(), username: 'tuananh',  password_hash: internalDefaultHash, full_name: 'Tuấn Anh',           role: 'AREA_MANAGER', area_id: 'TUAN_ANH', phone: '0988776655' },
  { id: uuidv4(), username: 'liem',     password_hash: internalDefaultHash, full_name: 'Vũ Văn Liêm',        role: 'DRIVER',       area_id: 'TUAN',     phone: '0974398143' },
  { id: uuidv4(), username: 'hoi',      password_hash: internalDefaultHash, full_name: 'Trương Văn Hội',     role: 'DRIVER',       area_id: 'TUAN_ANH', phone: '0912345678' },
];

const insertUser = db.prepare(
  'INSERT INTO users (id, username, password_hash, full_name, role, area_id, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
);
for (const u of users) {
  insertUser.run(u.id, u.username, u.password_hash, u.full_name, u.role, u.area_id, u.phone, now, now);
}
console.log(`[INIT VOLUME] Đã tạo ${users.length} tài khoản.`);

// ── Bước 4: Tạo file group_allocations mặc định (trống) nếu chưa có ─────────
if (!fs.existsSync(ALLOC_FILE)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ALLOC_FILE, JSON.stringify({}, null, 2), 'utf8');
  console.log('[INIT VOLUME] Đã tạo group_allocations_thang1.json trống.');
} else {
  console.log('[INIT VOLUME] group_allocations_thang1.json đã tồn tại, giữ nguyên.');
}

console.log('[INIT VOLUME] ✓ Khởi tạo volume hoàn tất.');
console.log('[INIT VOLUME] Mật khẩu tài khoản giamdoc: lấy từ biến DIRECTOR_INIT_PASSWORD (không in ra đây).');

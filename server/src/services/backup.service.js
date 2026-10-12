/**
 * Backup Service - Dịch vụ sao lưu và khôi phục Database
 *
 * Tính năng:
 * - VACUUM INTO: Sao lưu SQLite an toàn khi WAL mode đang hoạt động
 * - 1-Click Tải file .sqlite về máy
 * - 1-Click Reset Database (với xác nhận an toàn)
 * - Giữ tối đa 10 file backup gần nhất
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { DB_PATH } from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERATIONAL_BACKUP_DIR = path.resolve(__dirname, '../../backups');
const TEST_BACKUP_DIR = path.resolve(__dirname, '../../test_backups');

// Tự động nhận diện môi trường kiểm thử
const isRunningTests = Boolean(
  process.env.NODE_ENV === 'test' ||
  process.env.IS_TEST === 'true' ||
  (process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.includes('test')) ||
  process.argv.some(arg => /test|verify/i.test(arg))
);

export const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.cwd(), process.env.BACKUP_DIR)
  : (isRunningTests ? TEST_BACKUP_DIR : OPERATIONAL_BACKUP_DIR);

// CHỐT CHẶN BẢO VỆ CỨNG: Nếu đang ở chế độ kiểm thử, tuyệt đối cấm đụng tới thư mục backup vận hành
if (isRunningTests && path.resolve(BACKUP_DIR).toLowerCase() === OPERATIONAL_BACKUP_DIR.toLowerCase()) {
  throw new Error(`[CRITICAL SECURITY GUARD] Đang ở chế độ TEST nhưng BACKUP_DIR lại trỏ vào thư mục vận hành ${OPERATIONAL_BACKUP_DIR}! Đã chặn khẩn cấp để bảo vệ file backup vận hành.`);
}

// Đảm bảo thư mục backups tồn tại
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Số file backup tối đa giữ lại
const MAX_BACKUPS = 10;

/**
 * Tạo tên file backup theo timestamp
 * @returns {string} Tên file dạng: backup_2026-10-08_14-30-00.sqlite
 */
function generateBackupFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const msStr = String(now.getMilliseconds()).padStart(3, '0');
  return `backup_${dateStr}_${timeStr}_${msStr}.sqlite`;
}

/**
 * Xóa các file backup cũ, chỉ giữ MAX_BACKUPS file mới nhất
 */
function pruneOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time); // Mới nhất trước

  // Xóa các file vượt quá giới hạn
  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(MAX_BACKUPS);
    toDelete.forEach(({ name }) => {
      fs.unlinkSync(path.join(BACKUP_DIR, name));
      console.log(`[BACKUP] Đã xóa backup cũ: ${name}`);
    });
  }
}

/**
 * Tạo backup database bằng VACUUM INTO
 * VACUUM INTO hoạt động an toàn với WAL mode:
 * - Tạo snapshot nhất quán tại thời điểm gọi
 * - Không block các read/write operation khác
 * - File output là database SQLite sạch (không có WAL journal)
 *
 * @returns {{ success: boolean, filename: string, filepath: string, sizeBytes: number, message: string }}
 */
export function createBackup() {
  const filename = generateBackupFilename();
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    // Nếu file đã tồn tại, xóa trước để tránh VACUUM INTO lỗi "output file already exists"
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // VACUUM INTO: Lệnh SQLite an toàn nhất để backup khi WAL mode đang hoạt động
    // SQLite VACUUM INTO nhận chuỗi ký tự đường dẫn trực tiếp
    const escapedPath = filepath.replace(/\\/g, '/');
    db.exec(`VACUUM INTO '${escapedPath}'`);

    const stats = fs.statSync(filepath);
    const sizeBytes = stats.size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

    console.log(`[BACKUP] ✅ Backup thành công: ${filename} (${sizeMB} MB)`);

    // Dọn dẹp backup cũ
    pruneOldBackups();

    return {
      success: true,
      filename,
      filepath,
      sizeBytes,
      sizeMB,
      createdAt: new Date().toISOString(),
      message: `Sao lưu thành công: ${filename} (${sizeMB} MB)`,
    };
  } catch (err) {
    console.error('[BACKUP] ❌ Lỗi tạo backup:', err);
    throw new Error(`Không thể tạo backup: ${err.message}`);
  }
}

/**
 * Lấy danh sách tất cả file backup hiện có
 * @returns {Array<{ filename, filepath, sizeBytes, sizeMB, createdAt }>}
 */
export function listBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite'))
    .map(f => {
      const filepath = path.join(BACKUP_DIR, f);
      const stats = fs.statSync(filepath);
      return {
        filename: f,
        filepath,
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Mới nhất trước

  return files;
}

/**
 * Lấy đường dẫn file backup theo tên
 * @param {string} filename
 * @returns {string|null} Đường dẫn đầy đủ hoặc null nếu không tồn tại
 */
export function getBackupFilePath(filename) {
  // Validate tên file (chỉ cho phép tên file an toàn, chống path traversal)
  if (!filename || !/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_\d{3})?\.sqlite$/.test(filename)) {
    return null;
  }
  const filepath = path.join(BACKUP_DIR, filename);
  return fs.existsSync(filepath) ? filepath : null;
}

/**
 * Reset database: Xóa toàn bộ dữ liệu bằng cách tạo backup trước,
 * sau đó drop tất cả tables và chạy lại migrations.
 *
 * ⚠️ NGUY HIỂM: Thao tác không thể hoàn tác (trừ khi khôi phục từ backup)
 *
 * @returns {{ success: boolean, backupFilename: string, tablesDropped: number, message: string }}
 */
export function resetDatabase() {
  console.log('[RESET] ⚠️ Bắt đầu reset database...');

  // Bước 1: Tạo backup tự động trước khi reset
  const backup = createBackup();
  console.log(`[RESET] ✅ Backup an toàn trước reset: ${backup.filename}`);

  // Bước 2: Lấy danh sách tất cả tables (trừ tables hệ thống SQLite)
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  // Bước 3: Tắt FK constraints tạm thời để drop không bị lỗi phụ thuộc
  db.pragma('foreign_keys = OFF');

  // Bước 4: Drop tất cả tables trong một transaction
  const dropAll = db.transaction(() => {
    let count = 0;
    for (const { name } of tables) {
      db.prepare(`DROP TABLE IF EXISTS "${name}"`).run();
      console.log(`[RESET] Đã xóa bảng: ${name}`);
      count++;
    }
    return count;
  });

  const tablesDropped = dropAll();

  // Bước 5: Bật lại FK constraints
  db.pragma('foreign_keys = ON');

  // Bước 6: VACUUM để thu hồi không gian đĩa
  db.prepare('VACUUM').run();

  console.log(`[RESET] ✅ Reset hoàn tất. Đã xóa ${tablesDropped} bảng.`);

  return {
    success: true,
    backupFilename: backup.filename,
    tablesDropped,
    message: `Reset thành công. Đã xóa ${tablesDropped} bảng. Backup lưu tại: ${backup.filename}`,
  };
}

/**
 * Lấy thống kê tổng quan về backup
 * @returns {{ totalBackups, totalSizeMB, oldestBackup, latestBackup, dbSizeMB }}
 */
export function getBackupStats() {
  const backups = listBackups();
  const dbStats = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : null;

  return {
    totalBackups: backups.length,
    totalSizeMB: backups.reduce((sum, b) => sum + parseFloat(b.sizeMB), 0).toFixed(2),
    oldestBackup: backups.length > 0 ? backups[backups.length - 1] : null,
    latestBackup: backups.length > 0 ? backups[0] : null,
    dbSizeMB: dbStats ? (dbStats.size / 1024 / 1024).toFixed(2) : '0',
    maxBackupsKept: MAX_BACKUPS,
  };
}

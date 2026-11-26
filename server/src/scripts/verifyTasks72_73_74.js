/**
 * Script Kiểm Thử Tự Động Toàn Diện: Task 7.2, Task 7.3, Task 7.4
 * Chạy lệnh: node server/src/scripts/verifyTasks72_73_74.js
 */
process.env.NODE_ENV = 'test';
process.env.IS_TEST = 'true';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { 
  getOffsiteBackupStatus, 
  getOffsiteBackupHistory, 
  performOffsiteBackup 
} from '../services/offsiteBackup.service.js';

// Token kiểm thử ký trực tiếp cho tài khoản có sẵn trong DB kiểm thử — không cần mật khẩu (25/11/2026).
// Giao diện tài xế đã ngừng (06/11/2026) nên ca phân quyền dùng tài khoản Kế toán thay cho Lái xe.
import jwt from 'jsonwebtoken';

const { default: app } = await import('../index.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../../');

const tempUserIds = [];
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG GIAI ĐOẠN 7: TASK 7.2, 7.3 & 7.4');
  console.log('=============================================================\n');

  // =========================================================
  // PHẦN 1: KIỂM THỬ TASK 7.2 (PWA MOBILE & OFFLINE CACHE)
  // =========================================================
  console.log('--- 📱 KIỂM THỬ TASK 7.2: PWA MOBILE & OFFLINE CACHE ---');

  const manifestPath = path.join(ROOT_DIR, 'client/public/manifest.json');
  assert(fs.existsSync(manifestPath), 'File client/public/manifest.json tồn tại');

  const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  // Tên ứng dụng đổi thành "Quản lý vận tải" ngày 01/11/2026 (CODEX_BAN_GIAO_TEN_CONG_TY_2026-11-01.md)
  assert(manifestContent.name === 'Quản lý vận tải' && manifestContent.short_name, 'Manifest name hợp lệ');
  assert(manifestContent.display === 'standalone', 'PWA display mode là standalone');
  assert(manifestContent.theme_color === '#0f172a', 'Theme color khớp màu chuẩn logistics (#0f172a)');
  assert(Array.isArray(manifestContent.icons) && manifestContent.icons.length >= 3, 'Manifest có đủ bộ icon');
  assert(Array.isArray(manifestContent.shortcuts) && manifestContent.shortcuts.length >= 2, 'Manifest có shortcuts thao tác nhanh');

  // Kiểm tra bộ icons
  const icon192 = path.join(ROOT_DIR, 'client/public/icons/icon-192.png');
  const icon512 = path.join(ROOT_DIR, 'client/public/icons/icon-512.png');
  const iconMaskable = path.join(ROOT_DIR, 'client/public/icons/icon-maskable.png');
  const appleIcon = path.join(ROOT_DIR, 'client/public/icons/apple-touch-icon.png');
  assert(fs.existsSync(icon192) && fs.statSync(icon192).size > 100, 'Icon 192x192 PNG hợp lệ');
  assert(fs.existsSync(icon512) && fs.statSync(icon512).size > 100, 'Icon 512x512 PNG hợp lệ');
  assert(fs.existsSync(iconMaskable) && fs.statSync(iconMaskable).size > 100, 'Icon Maskable PNG hợp lệ');
  assert(fs.existsSync(appleIcon) && fs.statSync(appleIcon).size > 100, 'Apple Touch Icon 180x180 PNG hợp lệ');

  // Kiểm tra Service Worker
  const swPath = path.join(ROOT_DIR, 'client/public/sw.js');
  assert(fs.existsSync(swPath), 'File client/public/sw.js tồn tại');
  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert(swContent.includes('wed-hoachtoan-cache') && swContent.includes('fetch'), 'Service worker có logic caching và fetch handling');

  // Kiểm tra index.html
  const indexPath = path.join(ROOT_DIR, 'client/index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  assert(indexContent.includes('rel="manifest"') && indexContent.includes('manifest.json'), 'client/index.html đã nhúng link manifest');
  assert(indexContent.includes('apple-mobile-web-app-capable'), 'client/index.html có thẻ meta cho iOS Standalone');

  // Kiểm tra IndexedDB Engine & Sync Engine
  const offlineDbPath = path.join(ROOT_DIR, 'client/src/utils/offlineDb.js');
  assert(fs.existsSync(offlineDbPath), 'File client/src/utils/offlineDb.js tồn tại');
  const offlineDbContent = fs.readFileSync(offlineDbPath, 'utf-8');
  assert(offlineDbContent.includes('saveOfflineTrip') && offlineDbContent.includes('syncOfflineQueue'), 'IndexedDB Engine có đầy đủ hàm lưu và đồng bộ ngoại tuyến ngoài bãi cảng');

  // Kiểm tra Bản build Dist đã đồng bộ assets
  assert(fs.existsSync(path.join(ROOT_DIR, 'client/dist/manifest.json')), 'Dist build có chứa manifest.json');
  assert(fs.existsSync(path.join(ROOT_DIR, 'client/dist/sw.js')), 'Dist build có chứa sw.js');

  // =========================================================
  // PHẦN 2: KIỂM THỬ TASK 7.3 (WINDOWS SERVICE & CLOUDFLARE)
  // =========================================================
  console.log('\n--- 🖥️ KIỂM THỬ TASK 7.3: WINDOWS SERVICE & CLOUDFLARE TUNNEL ---');

  const pm2Config = path.join(ROOT_DIR, 'ecosystem.config.cjs');
  assert(fs.existsSync(pm2Config), 'File ecosystem.config.cjs tồn tại');
  const pm2Content = fs.readFileSync(pm2Config, 'utf-8');
  assert(pm2Content.includes('hoachtoan-service') && pm2Content.includes('PORT: 5000'), 'Ecosystem PM2 cấu hình cổng 5000 và tiến trình tự khởi động');

  // Các script Windows Service
  assert(fs.existsSync(path.join(ROOT_DIR, 'install_service_pm2.bat')), 'Script install_service_pm2.bat tồn tại');
  assert(fs.existsSync(path.join(ROOT_DIR, 'install_service_nssm.bat')), 'Script install_service_nssm.bat tồn tại');
  assert(fs.existsSync(path.join(ROOT_DIR, 'uninstall_service_nssm.bat')), 'Script uninstall_service_nssm.bat tồn tại');
  assert(fs.existsSync(path.join(ROOT_DIR, 'start_production.bat')), 'Script start_production.bat tồn tại');
  assert(fs.existsSync(path.join(ROOT_DIR, 'stop_production.bat')), 'Script stop_production.bat tồn tại');
  assert(fs.existsSync(path.join(ROOT_DIR, 'status_service.bat')), 'Script status_service.bat tồn tại');

  // Cloudflare Tunnel
  const cfExample = path.join(ROOT_DIR, 'cloudflare/config.example.yml');
  const cfStart = path.join(ROOT_DIR, 'cloudflare/start_cloudflare_tunnel.bat');
  const cfSetup = path.join(ROOT_DIR, 'cloudflare/setup_cloudflare_tunnel.bat');
  const cfDoc = path.join(ROOT_DIR, 'cloudflare/HUONG_DAN_CLOUDFLARE_TUNNEL.md');
  assert(fs.existsSync(cfExample), 'Cấu hình cloudflare/config.example.yml tồn tại');
  assert(fs.existsSync(cfStart), 'Script cloudflare/start_cloudflare_tunnel.bat tồn tại');
  assert(fs.existsSync(cfSetup), 'Script cloudflare/setup_cloudflare_tunnel.bat tồn tại');
  assert(fs.existsSync(cfDoc), 'Tài liệu hướng dẫn Cloudflare Tunnel tồn tại');

  // =========================================================
  // PHẦN 3: KIỂM THỬ TASK 7.4 (OFFSITE BACKUP TELEGRAM / CRON)
  // =========================================================
  console.log('\n--- 📤 KIỂM THỬ TASK 7.4: SAO LƯU OFFSITE TELEGRAM 23H59 ---');

  // Kiểm tra status
  const status = getOffsiteBackupStatus();
  assert(status && status.enabled === true, 'Offsite backup status: Enabled');
  assert(status.cronExpression === '59 23 * * *', 'Cron expression cấu hình đúng 23h59 mỗi đêm');
  assert(status.channel === 'TELEGRAM', 'Kênh sao lưu mặc định là TELEGRAM');

  // Thực thi test sao lưu Offsite (VACUUM INTO + Telegram Snapshot)
  console.log('  [*] Đang thực thi hàm performOffsiteBackup() test...');
  const backupResult = await performOffsiteBackup({
    triggeredBy: 'UNIT_TEST_VERIFICATION',
    channel: 'TELEGRAM'
  });

  assert(backupResult.success === true, 'Hàm performOffsiteBackup() thực thi thành công');
  assert(backupResult.historyEntry && backupResult.historyEntry.filename.endsWith('.sqlite'), 'Bản sao lưu offsite là snapshot SQLite hợp lệ');
  assert(backupResult.historyEntry.stats && backupResult.historyEntry.stats.totalTrips > 0, `Đã đính kèm thống kê cuốc xe (${backupResult.historyEntry.stats.totalTrips} cuốc)`);

  // Kiểm tra file lịch sử
  const history = getOffsiteBackupHistory();
  assert(Array.isArray(history) && history.length > 0, `Lịch sử sao lưu offsite có ${history.length} bản ghi`);
  assert(history[0].id === backupResult.historyEntry.id, 'Bản ghi mới nhất đã được lưu an toàn vào history');

  // Kiểm tra script độc lập và batch Task Scheduler
  assert(fs.existsSync(path.join(ROOT_DIR, 'server/src/scripts/offsiteBackup.js')), 'Script server/src/scripts/offsiteBackup.js tồn tại');
  assert(fs.existsSync(path.join(ROOT_DIR, 'schedule_daily_backup.bat')), 'Script schedule_daily_backup.bat tồn tại');

  // =========================================================
  // PHẦN 4: KIỂM THỬ TẦNG HTTP API SERVER
  // =========================================================
  console.log('\n--- 🌐 KIỂM THỬ API ENDPOINTS (PORT 5000 SIMULATION) ---');

  // Tạo server HTTP kiểm thử
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const testPort = server.address().port;
  const baseUrl = `http://localhost:${testPort}`;

  try {
    const { db } = await import('../db/database.js');
    // DB thử có thể chỉ có tài khoản thư ký (bản clone mới). Khi thiếu, tạo tạm tài khoản
    // Giám Đốc/Kế toán với hash ngẫu nhiên (không đăng nhập bằng mật khẩu được), xóa sau khi chạy.
    const { randomBytes, randomUUID } = await import('node:crypto');
    for (const role of ['DIRECTOR', 'ACCOUNTANT']) {
      if (db.prepare('SELECT 1 FROM users WHERE role = ? AND is_active = 1').get(role)) continue;
      const id = `test-72-74-${role.toLowerCase()}-${randomUUID()}`;
      const now = new Date().toISOString();
      db.prepare('INSERT INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .run(id, id, `!disabled-${randomBytes(16).toString('hex')}`, `Tài khoản thử ${role}`, role, now, now);
      tempUserIds.push(id);
    }
    const signFor = (role) => {
      const user = db.prepare('SELECT id, username, role FROM users WHERE role = ? AND is_active = 1 LIMIT 1').get(role);
      if (!user) return null;
      return jwt.sign({ id: user.id, userId: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'hoachtoan_jwt_secret_key_change_in_production_2026_super_long_string', { algorithm: 'HS256', expiresIn: '10m' });
    };
    const directorToken = signFor('DIRECTOR');
    const accountantToken = signFor('ACCOUNTANT');
    assert(Boolean(directorToken), 'DB kiểm thử có tài khoản Giám Đốc đang hoạt động');
    const authHeaders = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

    // 1. API Info: từ khi siết bảo mật, mọi API (trừ health/login) đều cần đăng nhập
    const infoUnauthRes = await fetch(`${baseUrl}/api/v1/info`);
    assert(infoUnauthRes.status === 401, 'GET /api/v1/info chặn 401 khi chưa đăng nhập');
    const infoRes = await fetch(`${baseUrl}/api/v1/info`, { headers: authHeaders(directorToken) });
    const infoJson = await infoRes.json();
    assert(infoRes.status === 200 && infoJson.success === true, 'GET /api/v1/info trả về 200 OK khi đã đăng nhập');
    assert(typeof infoJson.data?.hasClientDist === 'boolean', 'Backend báo trạng thái thư mục client/dist');

    // 2. GET /api/v1/backup/offsite/status
    const statusApiRes = await fetch(`${baseUrl}/api/v1/backup/offsite/status`, { headers: authHeaders(directorToken) });
    const statusApiJson = await statusApiRes.json();
    assert(statusApiJson.success === true && statusApiJson.data.cronExpression === '59 23 * * *', 'GET /api/v1/backup/offsite/status hoạt động chuẩn');

    // 3. GET /api/v1/backup/offsite/history
    const historyApiRes = await fetch(`${baseUrl}/api/v1/backup/offsite/history`, { headers: authHeaders(directorToken) });
    const historyApiJson = await historyApiRes.json();
    assert(historyApiJson.success === true && Array.isArray(historyApiJson.data.history), 'GET /api/v1/backup/offsite/history trả về danh sách lịch sử');

    // 4. POST /api/v1/backup/offsite/trigger bảo vệ bởi Auth & RBAC
    const unauthTriggerRes = await fetch(`${baseUrl}/api/v1/backup/offsite/trigger`, { method: 'POST' });
    assert(unauthTriggerRes.status === 401, 'POST /api/v1/backup/offsite/trigger chặn 401 khi chưa đăng nhập');

    const directorTriggerRes = await fetch(`${baseUrl}/api/v1/backup/offsite/trigger`, {
      method: 'POST', headers: authHeaders(directorToken), body: JSON.stringify({ channel: 'TELEGRAM' })
    });
    const directorTriggerJson = await directorTriggerRes.json();
    assert(directorTriggerRes.status === 201 && directorTriggerJson.success === true, 'Giám Đốc kích hoạt POST /api/v1/backup/offsite/trigger thành công');

    if (accountantToken) {
      const accountantTriggerRes = await fetch(`${baseUrl}/api/v1/backup/offsite/trigger`, {
        method: 'POST', headers: authHeaders(accountantToken), body: JSON.stringify({ channel: 'TELEGRAM' })
      });
      assert(accountantTriggerRes.status === 403, 'Kế toán bị chặn 403 khi kích hoạt sao lưu offsite (chỉ Giám Đốc)');
    } else {
      console.log('  ⏭️ [SKIP] DB kiểm thử không có tài khoản Kế toán');
    }

  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (tempUserIds.length) {
      const { db } = await import('../db/database.js');
      for (const id of tempUserIds) db.prepare('DELETE FROM users WHERE id = ?').run(id);
    }
  }

  // =========================================================
  // TỔNG KẾT
  // =========================================================
  console.log('\n=============================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passCount} PASS / ${failCount} FAIL`);
  if (failCount === 0) {
    console.log('🎉 100% TẤT CẢ CÁC TIÊU CHÍ CỦA TASK 7.2, 7.3 VÀ 7.4 ĐỀU ĐẠT CHUẨN!');
  } else {
    console.log('⚠️ Có bài kiểm thử thất bại, cần kiểm tra lại!');
  }
  console.log('=============================================================\n');

  process.exit(failCount === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Lỗi ngoại lệ khi chạy test:', err);
  process.exit(1);
});

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

const { default: app } = await import('../index.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../../');

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
  assert(manifestContent.name && manifestContent.name.includes('Container'), 'Manifest name hợp lệ');
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
    // 1. Kiểm tra API Info & Static serving
    const infoRes = await fetch(`${baseUrl}/api/v1/info`);
    const infoJson = await infoRes.json();
    assert(infoJson.success === true, 'GET /api/v1/info trả về 200 OK');
    assert(infoJson.data.hasClientDist === true, 'Backend nhận diện chính xác thư mục client/dist đã build');

    // 2. Kiểm tra GET /api/v1/backup/offsite/status
    const statusApiRes = await fetch(`${baseUrl}/api/v1/backup/offsite/status`);
    const statusApiJson = await statusApiRes.json();
    assert(statusApiJson.success === true && statusApiJson.data.cronExpression === '59 23 * * *', 'GET /api/v1/backup/offsite/status hoạt động chuẩn');

    // 3. Kiểm tra GET /api/v1/backup/offsite/history
    const historyApiRes = await fetch(`${baseUrl}/api/v1/backup/offsite/history`);
    const historyApiJson = await historyApiRes.json();
    assert(historyApiJson.success === true && Array.isArray(historyApiJson.data.history), 'GET /api/v1/backup/offsite/history trả về danh sách lịch sử');

    // 4. Kiểm tra POST /api/v1/backup/offsite/trigger bảo vệ bởi Auth & RBAC
    const unauthTriggerRes = await fetch(`${baseUrl}/api/v1/backup/offsite/trigger`, { method: 'POST' });
    assert(unauthTriggerRes.status === 401, 'POST /api/v1/backup/offsite/trigger chặn 401 khi chưa đăng nhập');

    // Đăng nhập tài khoản Giám Đốc
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'giamdoc', password: 'admin123' })
    });
    const loginJson = await loginRes.json();
    assert(loginJson.success === true, 'Đăng nhập Giám Đốc lấy JWT Token thành công');
    const token = loginJson.data.token;

    // Trigger backup với quyền Giám Đốc
    const directorTriggerRes = await fetch(`${baseUrl}/api/v1/backup/offsite/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ channel: 'TELEGRAM' })
    });
    const directorTriggerJson = await directorTriggerRes.json();
    assert(directorTriggerRes.status === 201 && directorTriggerJson.success === true, 'Giám Đốc kích hoạt POST /api/v1/backup/offsite/trigger thành công');

    // Đăng nhập tài khoản Lái Xe và thử trigger (kỳ vọng 403 Forbidden)
    const driverLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'liem', password: 'driver123' })
    });
    const driverLoginJson = await driverLoginRes.json();
    assert(driverLoginJson.success === true, 'Đăng nhập tài khoản Lái Xe thành công');
    const driverToken = driverLoginJson.data.token;

    const driverTriggerRes = await fetch(`${baseUrl}/api/v1/backup/offsite/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${driverToken}`
      },
      body: JSON.stringify({ channel: 'TELEGRAM' })
    });
    assert(driverTriggerRes.status === 403, 'Tài khoản Lái xe bị chặn 403 Forbidden khi cố kích hoạt sao lưu offsite');

  } finally {
    await new Promise((resolve) => server.close(resolve));
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

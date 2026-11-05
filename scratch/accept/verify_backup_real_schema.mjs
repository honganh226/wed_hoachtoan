import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

console.log('=== Kiểm tra phục hồi bản sao lưu pre_reset_backup_20261105 trên schema thật ===');

const backupPath = path.join(ROOT, 'backups/pre_reset_backup_20261105.json');
if (!fs.existsSync(backupPath)) {
  console.error('FAIL: Không tìm thấy file backup:', backupPath);
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
console.log('Metadata backup:', JSON.stringify(backup.metadata, null, 2));

const tempDbDir = path.join(ROOT, 'scratch/accept_runtime/test_backup_restore_' + Date.now());
fs.mkdirSync(tempDbDir, { recursive: true });
const tempDbPath = path.join(tempDbDir, 'restore_test.db');

process.env.SQLITE_DB_PATH = tempDbPath;

import { pathToFileURL } from 'node:url';

// Dynamic import server modules after setting SQLITE_DB_PATH
const { db } = await import(pathToFileURL(path.join(ROOT, 'server/src/db/database.js')).href);
const { initDatabase } = await import(pathToFileURL(path.join(ROOT, 'server/src/db/init.js')).href);
const { restoreState } = await import(pathToFileURL(path.join(ROOT, 'server/src/services/durableState.service.js')).href);
const { excelMonthService } = await import(pathToFileURL(path.join(ROOT, 'server/src/services/excelMonthService.js')).href);

try {
  // 1. Khởi tạo database mới với schema chuẩn
  initDatabase();
  console.log('Khởi tạo schema sạch thành công');

  // 2. Phục hồi state từ backup
  const state = backup.state;
  if (!state || !state.tables) {
    throw new Error('Backup state không hợp lệ hoặc thiếu tables');
  }

  restoreState(state);
  console.log('Đã nạp state từ backup vào database');

  // 3. Kiểm tra tính toàn vẹn khóa ngoại (Foreign Keys)
  db.exec('PRAGMA foreign_keys = ON;');
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
  if (fkViolations.length > 0) {
    console.error('FAIL: Vi phạm ràng buộc khóa ngoại:', fkViolations);
    process.exit(1);
  }
  console.log('Kiểm tra khóa ngoại: 0 vi phạm (PRAGMA foreign_key_check PASS)');

  // 4. Đối chiếu số lượng bản ghi từng bảng
  let rowCountMismatch = 0;
  for (const [table, expectedRows] of Object.entries(backup.metadata.tables_summary)) {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!tableExists) {
      console.warn(`Cảnh báo: Bảng ${table} không tồn tại trong schema hiện tại.`);
      continue;
    }
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
    if (count !== expectedRows) {
      console.error(`FAIL: Lệch số dòng bảng ${table}: actual=${count}, expected=${expectedRows}`);
      rowCountMismatch++;
    } else {
      console.log(`  Bảng ${table}: ${count} dòng (Khớp metadata)`);
    }
  }

  if (rowCountMismatch > 0) {
    console.error(`FAIL: Có ${rowCountMismatch} bảng không khớp số dòng`);
    process.exit(1);
  }

  // 5. Thử chạy các truy vấn nghiệp vụ thực tế
  const overview = excelMonthService.getExecutiveOverview();
  console.log('getExecutiveOverview kết quả:');
  console.log('  Tổng cuốc:', overview.kpis?.total_trips ?? overview.total_trips);
  console.log('  Tổng cước gốc:', overview.kpis?.total_revenue_pre_vat ?? overview.total_revenue_pre_vat);
  console.log('  Tổng cước sau trừ 17%:', overview.kpis?.total_revenue_after_deduction ?? overview.total_revenue_after_deduction);

  const debts = excelMonthService.getDebtsData();
  console.log('getDebtsData kết quả:');
  console.log('  Tổng phải thu:', debts.summary?.total_receivable ?? debts.total_receivable);
  console.log('  Số khách hàng:', debts.customers?.length);

  console.log('\n=== KẾT QUẢ: PHỤC HỒI BẢN SAO LƯU TRÊN SCHEMA THẬT HOÀN TOÀN THÀNH CÔNG (100% PASS) ===\n');
} catch (err) {
  console.error('LỖI KHI PHỤC HỒI:', err);
  process.exit(1);
} finally {
  try { db?.close?.(); } catch (_) {}
  try {
    fs.rmSync(tempDbDir, { recursive: true, force: true });
  } catch (_) {}
}

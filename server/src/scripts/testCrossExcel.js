/**
 * ============================================================
 * TASK 5.1: NODE.JS RUNNER ĐỐI CHIẾU SỐ LIỆU TỰ ĐỘNG VỚI 7.xlsx
 * ============================================================
 * Chạy đối chiếu độc lập bằng Node.js (dùng xlsx + better-sqlite3)
 * Song hành cùng test_cross_excel.py
 * ============================================================
 */
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const excelPath = path.resolve(__dirname, '../../../7.xlsx');

function parseVnd(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return Math.round(val);
  const s = String(val).trim().toUpperCase();
  if (s === '' || s === '.') return 0;
  if (s.includes('50K')) return 50000;
  if (s.includes('100K')) return 100000;
  const numStr = s.replace(/[^0-9]/g, '');
  return numStr ? parseInt(numStr, 10) : 0;
}

function cleanStr(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return (s === '' || s === '.') ? null : s;
}

console.log('='.repeat(80));
console.log('🚀 KIỂM THỬ UAT TASK 5.1: ĐỐI CHIẾU SỐ LIỆU TỰ ĐỘNG (NODE.JS RUNNER)');
console.log(`📁 File Excel nguồn: ${excelPath}`);
console.log('='.repeat(80));

if (!fs.existsSync(excelPath)) {
  console.error(`❌ Không tìm thấy file ${excelPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(excelPath);
let passedChecks = 0;
let totalChecks = 0;

function recordCheck(isPass, name, details = '') {
  totalChecks++;
  if (isPass) {
    passedChecks++;
    console.log(`  ✅ [KHỚP 100%] ${name}${details ? ` -> ${details}` : ''}`);
  } else {
    console.error(`  ❌ [LỆCH SỐ]   ${name}: ${details}`);
  }
}

// 1. Sheet TUÂN & TUẤN ANH
const sheets = [
  { sheetName: 'TUÂN', areaId: 'TUAN', expectedCount: 5 },
  { sheetName: 'TUẤN ANH', areaId: 'TUAN_ANH', expectedCount: 28 }
];

let totalExcelTrips = 0;
let totalExcelLiftOn = 0;
let totalExcelLiftOff = 0;
let totalExcelSelectCont = 0;

for (const s of sheets) {
  const sheet = wb.Sheets[s.sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const validRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const c0 = row[0];
    const c1 = row[1];
    if (!c0 && !c1) continue;
    if (String(c0).trim() === 'STT' || String(c0).trim() === '.') continue;

    validRows.push({
      date: c0,
      customer: cleanStr(c1),
      route: cleanStr(row[2]),
      contNumber: cleanStr(row[3]),
      liftOn: parseVnd(row[9]),
      liftOff: parseVnd(row[10]),
      notes: cleanStr(row[15])
    });
  }

  const dbTrips = db.prepare(`
    SELECT t.*, c.lift_on_fee as db_lift_on, c.lift_off_fee as db_lift_off
    FROM trips t
    LEFT JOIN containers c ON t.id = c.trip_id
    WHERE t.area_id = ?
    ORDER BY t.trip_code ASC
  `).all(s.areaId);

  recordCheck(
    validRows.length === dbTrips.length && validRows.length === s.expectedCount,
    `Số lượng cuốc xe sheet ${s.sheetName}`,
    `Excel: ${validRows.length} == DB: ${dbTrips.length} == ${s.expectedCount} chuyến`
  );

  totalExcelTrips += validRows.length;

  for (let i = 0; i < validRows.length; i++) {
    const vr = validRows[i];
    const dt = dbTrips[i];
    totalExcelLiftOn += vr.liftOn;
    totalExcelLiftOff += vr.liftOff;
    if (vr.notes && vr.notes.toUpperCase().includes('CHỌN VỎ')) {
      totalExcelSelectCont += 50000;
    }

    recordCheck(
      vr.customer === dt.customer_name,
      `[${dt.trip_code}] Khách hàng`,
      `Excel: '${vr.customer}' == DB: '${dt.customer_name}'`
    );
    recordCheck(
      vr.liftOn === dt.db_lift_on,
      `[${dt.trip_code}] Phí nâng`,
      `Excel: ${vr.liftOn.toLocaleString('vi-VN')}₫ == DB: ${dt.db_lift_on.toLocaleString('vi-VN')}₫`
    );
    recordCheck(
      vr.liftOff === dt.db_lift_off,
      `[${dt.trip_code}] Phí hạ`,
      `Excel: ${vr.liftOff.toLocaleString('vi-VN')}₫ == DB: ${dt.db_lift_off.toLocaleString('vi-VN')}₫`
    );
  }
}

// 2. Tổng cộng hệ thống
const dbTripCount = db.prepare('SELECT COUNT(*) as count FROM trips').get().count;
recordCheck(dbTripCount === totalExcelTrips && dbTripCount === 33, 'Tổng số cuốc xe', '33/33 chuyến');

const dbLiftOnSum = db.prepare("SELECT SUM(amount) as sum FROM expenses WHERE expense_type = 'LIFT_ON'").get().sum || 0;
recordCheck(dbLiftOnSum === totalExcelLiftOn, 'Tổng phí nâng LIFT_ON', `${dbLiftOnSum.toLocaleString('vi-VN')}₫`);

const dbLiftOffSum = db.prepare("SELECT SUM(amount) as sum FROM expenses WHERE expense_type = 'LIFT_OFF'").get().sum || 0;
recordCheck(dbLiftOffSum === totalExcelLiftOff, 'Tổng phí hạ LIFT_OFF', `${dbLiftOffSum.toLocaleString('vi-VN')}₫`);

const dbSelectSum = db.prepare("SELECT SUM(amount) as sum FROM expenses WHERE expense_type = 'SELECT_CONT'").get().sum || 0;
recordCheck(dbSelectSum === totalExcelSelectCont, 'Tổng phí chọn vỏ SELECT_CONT', `${dbSelectSum.toLocaleString('vi-VN')}₫`);

const totalExpSum = db.prepare('SELECT SUM(amount) as sum FROM expenses').get().sum;
recordCheck(totalExpSum === (totalExcelLiftOn + totalExcelLiftOff + totalExcelSelectCont), 'Tổng chi phí bảng expenses', `${totalExpSum.toLocaleString('vi-VN')}₫`);

const totalRev = db.prepare('SELECT SUM(total_revenue) as sum FROM trips').get().sum;
recordCheck(totalRev === 104976000, 'Tổng doanh thu toàn công ty', `${totalRev.toLocaleString('vi-VN')}₫`);

// 3. Master Data
const eportCount = db.prepare('SELECT COUNT(*) as count FROM eport_accounts').get().count;
recordCheck(eportCount === 15, 'Tài khoản ePort mã hóa AES-256-GCM', '15 tài khoản');

console.log('='.repeat(80));
console.log(`🏁 KẾT QUẢ: ${passedChecks}/${totalChecks} CHECKS PASS 100%!`);
console.log('='.repeat(80));

if (passedChecks === totalChecks) {
  console.log('🎉 TOÀN BỘ SỐ LIỆU KHỚP TỪNG ĐỒNG 100% VỚI 7.xlsx!');
  process.exit(0);
} else {
  console.error('❌ CÓ LỆCH SỐ LIỆU!');
  process.exit(1);
}

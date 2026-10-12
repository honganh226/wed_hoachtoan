/**
 * ============================================================
 * EXCEL MONTH SERVICE - WED_HOACHTOAN
 * Xử lý dữ liệu bảng kê theo chuẩn Excel tháng 1 (tháng 1.xlsx)
 * ============================================================
 * Quy tắc cốt lõi đã được Chủ doanh nghiệp & Codex xác nhận:
 * - Cước đã bao gồm VAT. Không cộng VAT thêm lần nữa.
 * - Giá trị ô gộp là tổng cho nhóm dòng được gộp.
 * - Chi phí trực tiếp đã biết = tien_duong + cuoc_ra + phat_sinh.
 *   (Tháng 1: 23.140.000 + 24.500.000 + 300.000 = 47.940.000 đ)
 * - Lãi chuyến (chưa trừ lương & chưa trừ dầu): 338.200.000 - 47.940.000 = 290.260.000 đ.
 * - Chia lãi xuống từng cuốc: Hỗ trợ chưa phân bổ (UNALLOCATED), phân bổ theo tỷ trọng cước (PROPORTIONAL), phân bổ thủ công (MANUAL) có validator kiểm tra tổng khớp 100%.
 * - Bảng Excel bao phủ toàn bộ công ty.
 * - DẦU là lượng dầu cấp theo lít (1.770 lít), chưa quy đổi thành tiền nếu chưa có đơn giá.
 * - Lương chưa tính trong giai đoạn này; lãi ghi rõ "chưa trừ lương".
 * - Ô chi phí trống là không phát sinh (không tạo cảnh báo thiếu dữ liệu).
 * - Cột P: thông tin thanh toán khách (ĐÃ THANH TOÁN, ĐÃ TT, ĐỐI TRỪ XONG).
 * - Dòng 22: Khách VẠN ĐẠT THÁI BÌNH, cước 3.600.000 đ, ĐỐI TRỪ XONG (giảm công nợ, không tăng tiền thu thực tế).
 * - 16 dòng năm 2025 là lỗi đánh máy: chuẩn hóa thành 2026, lưu giá trị nguồn.
 * - Lưu phân bổ bền vững ra đĩa JSON; khởi động lại backend vẫn giữ nguyên.
 * - Chỉ sử dụng dữ liệu thực tế từ tháng 1; không tự thêm giao dịch từ ảnh tham khảo.
 * ============================================================
 */
import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { overlayBusiness } from './directorData.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '../../');
const PROJECT_DIR = path.resolve(__dirname, '../../../');

// Đường dẫn ưu tiên: biến môi trường → /app/data (Railway Persistent Volume) → fallback local dev
function resolveDataPath(envVar, ...fallbacks) {
  if (process.env[envVar]) return path.resolve(process.env[envVar]);
  for (const f of fallbacks) {
    if (fs.existsSync(f)) return f;
  }
  return fallbacks[fallbacks.length - 1]; // dùng cuối nếu không tìm thấy
}

// EXCEL_PATH: trên Railway image, tháng 1.xlsx được COPY vào /app/
const DEFAULT_EXCEL_PATH = resolveDataPath(
  'EXCEL_PATH',
  path.resolve(PROJECT_DIR, 'tháng 1.xlsx'),     // local dev: ../../../tháng 1.xlsx
  '/app/tháng 1.xlsx'                             // Railway image
);

// GROUP_ALLOCATIONS_PATH: trên Railway, Persistent Volume gắn tại /app/data
const ALLOCATIONS_STORAGE_PATH = resolveDataPath(
  'GROUP_ALLOCATIONS_PATH',
  path.resolve(SERVER_DIR, 'data/group_allocations_thang1.json'),  // local dev
  '/app/data/group_allocations_thang1.json'                         // Railway Persistent Volume
);

// Danh mục tài xế mặc định cho 3 xe công ty
const INTERNAL_VEHICLE_DRIVERS = {}; // Excel does not identify historical drivers.

export class ExcelMonthService {
  constructor(excelPath = DEFAULT_EXCEL_PATH, storagePath = ALLOCATIONS_STORAGE_PATH) {
    this.excelPath = fs.existsSync(excelPath) ? excelPath : path.resolve(process.cwd(), 'tháng 1.xlsx');
    this.storagePath = storagePath;
    this.cachedData = null;
    this.groupAllocations = new Map();
    this.loadAllocationsFromFile();
  }

  /**
   * Tải cấu hình phân bổ đã lưu bền vững từ file JSON
   */
  loadAllocationsFromFile() {
    try {
      if (this.storagePath && fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([k, v]) => {
            this.groupAllocations.set(k, v);
          });
          console.log(`[ExcelMonthService] Loaded ${this.groupAllocations.size} group allocations from storage.`);
        }
      }
    } catch (e) {
      console.warn('[ExcelMonthService] Warning loading allocations file:', e.message);
    }
  }

  /**
   * Lưu cấu hình phân bổ ra file JSON bền vững
   */
  saveAllocationsToFile() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj = {};
      this.groupAllocations.forEach((v, k) => {
        obj[k] = v;
      });
      fs.writeFileSync(this.storagePath, JSON.stringify(obj, null, 2), 'utf8');
      console.log(`[ExcelMonthService] Saved ${this.groupAllocations.size} group allocations to storage.`);
    } catch (e) {
      console.error('[ExcelMonthService] Error saving allocations file:', e.message);
      throw new Error(`Lưu phương án phân bổ vào tệp thất bại: ${e.message}`);
    }
  }

  /**
   * Đọc và chuẩn hóa dữ liệu từ file Excel tháng 1
   */
  parseSheetData() {
    if (!fs.existsSync(this.excelPath)) {
      throw new Error(`Không tìm thấy file Excel tại đường dẫn: ${this.excelPath}`);
    }

    const wb = xlsx.readFile(this.excelPath, { raw: false });
    const sheetName = wb.SheetNames[0]; // 'T1-26'
    const sheet = wb.Sheets[sheetName];

    const colLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R'];

    // 1. Phân tích ô gộp (Merges)
    const rawMerges = (sheet['!merges'] || []).map(m => ({
      sCol: colLetters[m.s.c],
      sRow: m.s.r + 1,
      eCol: colLetters[m.e.c],
      eRow: m.e.r + 1,
      range: `${colLetters[m.s.c]}${m.s.r + 1}:${colLetters[m.e.c]}${m.e.r + 1}`
    }));

    // 2. Đọc 77 dòng nghiệp vụ (Row 3 đến Row 79)
    const rows = [];
    let totalCuocVao = 0;
    let count2025 = 0;
    let count2026 = 0;
    let totalPhatSinhTien = 0;

    for (let r = 3; r <= 79; r++) {
      const sttCell = sheet[`A${r}`];
      const rawDateCell = sheet[`B${r}`];
      const rawCuocVaoCell = sheet[`O${r}`];

      if (!sttCell && !rawDateCell && !rawCuocVaoCell) continue;

      const rowObj = {
        id: `T1-2026-${String(r).padStart(3, '0')}`,
        row_index: r,
        stt: sttCell ? parseInt(sttCell.v, 10) : (r - 2)
      };

      colLetters.forEach(col => {
        const cell = sheet[`${col}${r}`];
        rowObj[`raw_${col}`] = cell ? cell.v : null;
        rowObj[`fmt_${col}`] = cell && cell.w ? cell.w : null;
      });

      // Chuẩn hóa ngày tháng (16 dòng năm 2025 -> 2026)
      let rawDateStr = rowObj.fmt_B || String(rowObj.raw_B || '');
      let normalizedDate = '';
      let isTypo2025 = false;

      if (rowObj.raw_B) {
        if (typeof rowObj.raw_B === 'number') {
          const dObj = xlsx.SSF.parse_date_code(rowObj.raw_B);
          let y = dObj.y;
          if (y === 2025) {
            isTypo2025 = true;
            count2025++;
            y = 2026;
          } else if (y === 2026) {
            count2026++;
          }
          const m = String(dObj.m).padStart(2, '0');
          const d = String(dObj.d).padStart(2, '0');
          normalizedDate = `${y}-${m}-${d}`;
        } else {
          if (rawDateStr.includes('2025') || rawDateStr.includes('/25')) {
            isTypo2025 = true;
            count2025++;
            normalizedDate = rawDateStr.replace('2025', '2026').replace('/25', '/26');
          } else {
            count2026++;
            normalizedDate = rawDateStr;
          }
        }
      }

      rowObj.trip_date = normalizedDate;
      rowObj.raw_date = rawDateStr;
      rowObj.is_typo_2025 = isTypo2025;

      // Khách hàng & Tuyến
      rowObj.customer_name = (rowObj.raw_C || '').trim();
      rowObj.route_name = (rowObj.raw_D || '').trim();

      // Container
      rowObj.container_number = (rowObj.raw_E || '').trim() || null;

      // Phân loại xe (BKS) & Xe ngoài & Tài xế
      const rawF = (rowObj.raw_F || '').trim();
      rowObj.bks_raw = rawF;
      const isInternalPlate = ['15H00266', '15C22405', '15C35981'].includes(rawF);

      if (isInternalPlate) {
        rowObj.vehicle_plate = rawF;
        rowObj.is_subcontractor = false;
        rowObj.subcontractor_name = null;
        rowObj.driver_name = 'Chưa xác định';
      } else {
        rowObj.vehicle_plate = rawF || null;
        rowObj.is_subcontractor = true;
        const subName = rowObj.raw_L ? String(rowObj.raw_L).trim() : (rawF || 'Xe ngoài');
        rowObj.subcontractor_name = subName;
        rowObj.driver_name = `Xe ngoài ${subName}`;
      }

      // Container Size & Type (bảo toàn 40FR, 40RF, 45, v.v.)
      const rawG = rowObj.raw_G ? String(rowObj.raw_G).trim() : null;
      const rawH = rowObj.raw_H ? String(rowObj.raw_H).trim() : null;
      rowObj.container_size = rawG ? (rawG.includes('45') ? '45' : '40') : (rawH ? '20' : '40');
      rowObj.container_type = rawG || rawH || 'DC';

      // Cảng Lạch Huyện
      rowObj.is_lach_huyen = Boolean(rowObj.raw_K && String(rowObj.raw_K).trim().toUpperCase().includes('LẠCH HUYỆN'));

      // Doanh thu CƯỚC VÀO (đã gồm VAT)
      const cuocVao = typeof rowObj.raw_O === 'number' ? rowObj.raw_O : (parseFloat(rowObj.raw_O) || 0);
      rowObj.cuoc_vao = cuocVao;
      totalCuocVao += cuocVao;

      // Dầu cấp theo lít
      rowObj.dau_liters = 0;
      if (rowObj.raw_I) {
        const match = String(rowObj.raw_I).match(/(\d+)/);
        if (match) {
          rowObj.dau_liters = parseInt(match[1], 10);
        }
      }

      // Tiền đường BOT (Cột J)
      const tienDuong = typeof rowObj.raw_J === 'number' ? rowObj.raw_J : (parseFloat(rowObj.raw_J) || 0);
      rowObj.tien_duong = tienDuong;

      // Phát sinh (Cột M)
      let phatSinh = 0;
      let phatSinhNote = null;
      if (typeof rowObj.raw_M === 'number') {
        phatSinh = rowObj.raw_M;
      } else if (rowObj.raw_M) {
        phatSinhNote = String(rowObj.raw_M).trim();
      }
      rowObj.phat_sinh = phatSinh;
      rowObj.phat_sinh_note = phatSinhNote;
      totalPhatSinhTien += phatSinh;

      // Cước ra thuê ngoài (Cột N)
      const cuocRa = typeof rowObj.raw_N === 'number' ? rowObj.raw_N : (parseFloat(rowObj.raw_N) || 0);
      rowObj.cuoc_ra = cuocRa;

      // Trạng thái thanh toán (Cột P)
      rowObj.payment_status_p = (rowObj.raw_P || '').trim();
      rowObj.is_offset = rowObj.payment_status_p.toUpperCase().includes('ĐỐI TRỪ');
      rowObj.is_customer_paid = Boolean(
        rowObj.payment_status_p.toUpperCase().includes('ĐÃ THANH TOÁN') ||
        rowObj.payment_status_p.toUpperCase().includes('ĐÃ TT') ||
        rowObj.is_offset
      );

      // Điều kiện thanh toán TƯƠI / X (Cột Q)
      rowObj.payment_timing_q = (rowObj.raw_Q || '').trim();
      rowObj.is_tuoi = rowObj.payment_timing_q === 'TƯƠI';
      rowObj.is_x = rowObj.payment_timing_q === 'X';

      // Chú thích ngoài (Cột R)
      rowObj.notes_r = rowObj.raw_R ? String(rowObj.raw_R).trim() : null;

      rows.push(rowObj);
    }

    // 3. Xây dựng danh sách 7 Nhóm hành trình dùng chung chi phí (Groups)
    const groups = [];
    rawMerges.forEach(m => {
      if (m.sRow >= 3 && m.sRow <= 79) {
        const groupRows = rows.filter(r => r.row_index >= m.sRow && r.row_index <= m.eRow);
        if (groupRows.length > 1) {
          const groupKey = `GROUP-${m.sRow}-${m.eRow}`;
          let group = groups.find(g => g.group_key === groupKey);
          if (!group) {
            const savedAlloc = this.groupAllocations.get(groupKey);
            group = {
              group_key: groupKey,
              name: `Nhóm ô gộp hàng ${m.sRow}–${m.eRow}`,
              start_row: m.sRow,
              end_row: m.eRow,
              trips: groupRows.map(r => r.id),
              row_indices: groupRows.map(r => r.row_index),
              total_revenue: groupRows.reduce((s, r) => s + r.cuoc_vao, 0),
              vehicle_or_partner: groupRows[0]?.vehicle_plate || groupRows[0]?.subcontractor_name || 'Đối tác',
              shared_costs: [],
              allocation_mode: savedAlloc?.mode || 'UNALLOCATED',
              manual_allocations: savedAlloc?.allocations || {}
            };
            groups.push(group);
          }

          if (m.sCol === 'N') {
            const val = sheet[`N${m.sRow}`]?.v || 0;
            const amount = typeof val === 'number' ? val : (parseFloat(val) || 0);
            if (!group.shared_costs.some(c => c.type === 'CUOC_RA')) {
              group.shared_costs.push({
                type: 'CUOC_RA',
                amount: amount,
                label: 'Cước thuê xe ngoài dùng chung'
              });
            }
          } else if (m.sCol === 'J') {
            const val = sheet[`J${m.sRow}`]?.v || 0;
            const amount = typeof val === 'number' ? val : (parseFloat(val) || 0);
            if (!group.shared_costs.some(c => c.type === 'TIEN_DUONG')) {
              group.shared_costs.push({
                type: 'TIEN_DUONG',
                amount: amount,
                label: 'Vé cầu đường BOT dùng chung'
              });
            }
          } else if (m.sCol === 'I') {
            const val = sheet[`I${m.sRow}`]?.v || '';
            const match = String(val).match(/\d+/);
            const liters = match ? parseInt(match[0], 10) : 0;
            if (!group.shared_costs.some(c => c.type === 'DAU_LITERS')) {
              group.shared_costs.push({
                type: 'DAU_LITERS',
                liters: liters,
                label: 'Dầu cấp dùng chung'
              });
            }
          }
        }
      }
    });

    // 4. Liên kết từng cuốc xe với nhóm tương ứng
    rows.forEach(r => {
      const parentGroup = groups.find(g => g.row_indices.includes(r.row_index));
      if (parentGroup) {
        r.group_id = parentGroup.group_key;
        r.is_grouped = true;
      } else {
        r.group_id = null;
        r.is_grouped = false;
      }
    });

    // 5. Tính tổng chuẩn xác cho toàn công ty (Mỗi ô gộp chỉ cộng 1 lần duy nhất)
    // - Dầu lít
    const distinctDauRows = new Set();
    let totalCompanyDauLiters = 0;
    for (let r = 3; r <= 79; r++) {
      const merge = rawMerges.find(m => m.sCol === 'I' && r >= m.sRow && r <= m.eRow);
      const key = merge ? merge.range : `I${r}`;
      if (!distinctDauRows.has(key)) {
        distinctDauRows.add(key);
        const cellVal = sheet[`I${merge ? merge.sRow : r}`]?.v;
        if (cellVal) {
          const match = String(cellVal).match(/\d+/);
          if (match) totalCompanyDauLiters += parseInt(match[0], 10);
        }
      }
    }

    // - Tiền đường BOT (Cột J)
    const distinctTienDuongRows = new Set();
    let totalCompanyTienDuong = 0;
    for (let r = 3; r <= 79; r++) {
      const merge = rawMerges.find(m => m.sCol === 'J' && r >= m.sRow && r <= m.eRow);
      const key = merge ? merge.range : `J${r}`;
      if (!distinctTienDuongRows.has(key)) {
        distinctTienDuongRows.add(key);
        const cellVal = sheet[`J${merge ? merge.sRow : r}`]?.v;
        if (typeof cellVal === 'number') totalCompanyTienDuong += cellVal;
        else if (cellVal) totalCompanyTienDuong += parseFloat(cellVal) || 0;
      }
    }

    // - Cước ra xe ngoài (Cột N)
    const distinctCuocRaRows = new Set();
    let totalCompanyCuocRa = 0;
    for (let r = 3; r <= 79; r++) {
      const merge = rawMerges.find(m => m.sCol === 'N' && r >= m.sRow && r <= m.eRow);
      const key = merge ? merge.range : `N${r}`;
      if (!distinctCuocRaRows.has(key)) {
        distinctCuocRaRows.add(key);
        const cellVal = sheet[`N${merge ? merge.sRow : r}`]?.v;
        if (typeof cellVal === 'number') totalCompanyCuocRa += cellVal;
        else if (cellVal) totalCompanyCuocRa += parseFloat(cellVal) || 0;
      }
    }

    // 6. Xử lý phân bổ chi phí chung cho các nhóm
    groups.forEach(g => {
      const groupTrips = rows.filter(r => g.trips.includes(r.id));
      const totalSharedMoney = g.shared_costs.reduce((s, c) => s + (c.amount || 0), 0);
      const totalSharedLiters = g.shared_costs.reduce((s, c) => s + (c.liters || 0), 0);
      g.total_shared_money = totalSharedMoney;
      g.total_shared_liters = totalSharedLiters;
      g.group_margin = g.total_revenue - totalSharedMoney;

      const sharedTollItem = g.shared_costs.find(c => c.type === 'TIEN_DUONG');
      const sharedCuocRaItem = g.shared_costs.find(c => c.type === 'CUOC_RA');
      const sharedLitersItem = g.shared_costs.find(c => c.type === 'DAU_LITERS');

      const sharedToll = sharedTollItem ? sharedTollItem.amount : 0;
      const sharedCuocRa = sharedCuocRaItem ? sharedCuocRaItem.amount : 0;
      const sharedLiters = sharedLitersItem ? sharedLitersItem.liters : 0;

      if (g.allocation_mode === 'PROPORTIONAL') {
        let accumulatedMoney = 0;
        let accumulatedLiters = 0;

        groupTrips.forEach((t, idx) => {
          const isLast = idx === groupTrips.length - 1;
          const ratio = g.total_revenue > 0 ? t.cuoc_vao / g.total_revenue : 1 / groupTrips.length;

          let allocatedMoney = isLast
            ? totalSharedMoney - accumulatedMoney
            : Math.round(totalSharedMoney * ratio);
          accumulatedMoney += allocatedMoney;

          let allocatedLiters = isLast
            ? totalSharedLiters - accumulatedLiters
            : Math.round(totalSharedLiters * ratio);
          accumulatedLiters += allocatedLiters;

          t.allocated_shared_cost = allocatedMoney;
          t.allocated_shared_liters = allocatedLiters;
          t.allocation_status = 'PROPORTIONAL';

          const tripToll = sharedToll > 0 ? allocatedMoney : (t.tien_duong || 0);
          const tripCuocRa = sharedCuocRa > 0 ? allocatedMoney : (t.cuoc_ra || 0);
          const tripDirectCost = tripToll + tripCuocRa + (t.phat_sinh || 0);

          t.direct_cost = tripDirectCost;
          t.trip_profit = t.cuoc_vao - tripDirectCost;
        });
      } else if (g.allocation_mode === 'MANUAL') {
        groupTrips.forEach(t => {
          const manualVal = g.manual_allocations[t.id] ?? 0;
          t.allocated_shared_cost = manualVal;
          t.allocation_status = 'MANUAL';

          const tripToll = sharedToll > 0 ? manualVal : (t.tien_duong || 0);
          const tripCuocRa = sharedCuocRa > 0 ? manualVal : (t.cuoc_ra || 0);
          const tripDirectCost = tripToll + tripCuocRa + (t.phat_sinh || 0);

          t.direct_cost = tripDirectCost;
          t.trip_profit = t.cuoc_vao - tripDirectCost;
        });
      } else {
        // UNALLOCATED: Chưa phân bổ
        groupTrips.forEach(t => {
          t.allocated_shared_cost = null;
          t.allocation_status = 'UNALLOCATED';
          t.direct_cost = null;
          t.trip_profit = null;
        });
      }
    });

    // Đối với các cuốc xe đơn không thuộc nhóm gộp:
    rows.forEach(t => {
      if (!t.is_grouped) {
        const directCost = (t.tien_duong || 0) + (t.cuoc_ra || 0) + (t.phat_sinh || 0);
        t.allocated_shared_cost = 0;
        t.allocation_status = 'SINGLE';
        t.direct_cost = directCost;
        t.trip_profit = t.cuoc_vao - directCost;
      }
    });

    const totalKnownDirectCost = totalCompanyTienDuong + totalCompanyCuocRa + totalPhatSinhTien;
    const profitBeforeSalaryAndFuel = totalCuocVao - totalKnownDirectCost;

    this.cachedData = {
      sheetName,
      rows,
      groups,
      rawMerges,
      stats: {
        total_rows: rows.length,
        total_revenue_vat_inc: totalCuocVao,
        count_2025_typos_normalized: count2025,
        count_2026_normal: count2026,
        total_fuel_liters: totalCompanyDauLiters,
        total_toll_bot: totalCompanyTienDuong,
        total_subcontractor_cost: totalCompanyCuocRa,
        total_incurred_expense: totalPhatSinhTien,
        total_known_direct_cost: totalKnownDirectCost,
        profit_before_salary_and_fuel: profitBeforeSalaryAndFuel
      }
    };

    return this.cachedData;
  }

  /**
   * Lấy toàn bộ dữ liệu đã phân tích chuẩn hóa từ Excel tháng 1
   * kèm các cuốc xe mới tạo (MANUAL, BATCH, EXCEL) trong SQLite
   */
  getData() {
    const base = this.cachedData ? this.cachedData : this.parseSheetData();

    // Tra cứu các cuốc xe mới tạo trong SQLite chưa có trong file Excel nguồn
    try {
      const dbTrips = db.prepare(`
        SELECT t.*, (SELECT GROUP_CONCAT(container_number, ', ') FROM containers WHERE trip_id=t.id) AS container_number,
          (SELECT container_size FROM containers WHERE trip_id=t.id ORDER BY is_second_cont LIMIT 1) AS container_size
        FROM trips t ORDER BY t.trip_date ASC, t.created_at ASC
      `).all().filter(t => !(t.source_type === 'EXCEL' && base.rows.some(r => r.row_index === t.source_row && r.trip_date === t.trip_date && r.customer_name === t.customer_name && r.route_name === t.route_name && r.cuoc_vao === t.total_revenue)));

      if (dbTrips && dbTrips.length > 0) {
        // Chuyển đổi format của dbTrips sang cấu trúc chuẩn của view
        const adaptedDbTrips = dbTrips.map((dt, idx) => {
          const rev = dt.total_revenue || dt.trip_revenue || 0;
          const toll = dt.toll_fee || 0;
          const subCost = dt.subcontractor_cost || 0;
          const fuel = dt.fuel_liters || 0;
          const other = (dt.other_costs || 0) + (dt.port_fee || 0) + (dt.parking_fee || 0) + (dt.handling_fee || 0) + (dt.meal_allowance || 0);
          const directCost = toll + subCost + other;

          return {
            id: dt.id,
            trip_code: dt.trip_code,
            row_index: 1000 + idx,
            stt: base.rows.length + idx + 1,
            trip_date: dt.trip_date,
            raw_date: dt.trip_date,
            is_typo_2025: false,
            customer_name: dt.customer_name || 'KHÁCH HÀNG',
            route_name: dt.route_name || '',
            container_number: dt.container_number || null,
            bks_raw: dt.vehicle_plate || '',
            vehicle_plate: dt.vehicle_plate || null,
            is_subcontractor: Boolean(dt.is_subcontractor),
            subcontractor_name: dt.subcontractor_name || null,
            driver_name: dt.driver_name || (dt.is_subcontractor ? `Xe ngoài ${dt.subcontractor_name || ''}` : 'Chưa xác định'),
            container_size: dt.container_size || '40',
            container_type: 'DC',
            is_lach_huyen: false,
            cuoc_vao: rev,
            dau_liters: fuel,
            tien_duong: toll,
            phat_sinh: other,
            phat_sinh_note: dt.notes || null,
            cuoc_ra: subCost,
            customer_payment_status: dt.customer_payment_status || 'CHUA_TT',
            is_customer_paid: ['DA_TT','TUOI','X'].includes(dt.customer_payment_status),
            is_offset: dt.customer_payment_status === 'DOI_TRU',
            customer_payment_status: dt.customer_payment_status || 'CHUA_TT',
            subcontractor_payment_status: dt.subcontractor_payment_status || 'CHUA_TT',
            other_costs: dt.other_costs || 0,
            additional_expenses: db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE trip_id=? AND source_component IS NULL').get(dt.id)?.total || 0,
            port_fee: dt.port_fee || 0,
            parking_fee: dt.parking_fee || 0,
            handling_fee: dt.handling_fee || 0,
            meal_allowance: dt.meal_allowance || 0,
            is_customer_tuoi: dt.customer_payment_status === 'TUOI',
            is_customer_x: dt.customer_payment_status === 'X',
            is_customer_doi_tru: dt.customer_payment_status === 'DOI_TRU',
            notes_r: dt.notes || null,
            is_grouped: Boolean(dt.group_id),
            group_id: dt.group_id || null,
            allocated_shared_cost: null,
            allocated_shared_liters: null,
            allocation_status: dt.group_id ? 'UNALLOCATED' : 'SINGLE',
            direct_cost: directCost,
            trip_profit: rev - directCost,
            raw_O: rev
          };
        });

        // Kết hợp 77 cuốc chuẩn tháng 1 với các cuốc mới
        const mergedRows = [...base.rows, ...adaptedDbTrips];

        return this.refreshBusinessData(base, mergedRows);
      }
    } catch (e) {
      console.warn('[ExcelMonthService] Tra cứu SQLite bổ sung:', e.message);
    }

    return this.refreshBusinessData(base, base.rows);
  }

  refreshBusinessData(base, inputRows) {
    const rows = overlayBusiness(inputRows);
    const groups = structuredClone(base.groups);
    for (const g of groups) {
      const members = rows.filter(r => g.trips.includes(r.id));
      g.total_revenue = members.reduce((s,r)=>s+r.cuoc_vao,0);
      for (const cost of g.shared_costs) {
        const key = {TIEN_DUONG:"tien_duong",CUOC_RA:"cuoc_ra",DAU_LITERS:"dau_liters"}[cost.type];
        if(key) {const total=members.reduce((s,r)=>s+Number(r[key]||0),0);if(key==="dau_liters")cost.liters=total;else cost.amount=total;}
      }
      g.total_shared_money=g.shared_costs.reduce((s,c)=>s+Number(c.amount||0),0);
      g.group_margin=members.reduce((s,r)=>s+r.cuoc_vao-r.direct_cost,0);
      const setting=this.groupAllocations.get(g.group_key);
      const monetary=g.shared_costs.filter(c=>c.amount>0);
      const allocation=setting?.allocations||{};
      const valid=setting?.mode==='MANUAL'&&monetary.length<=1&&members.every(r=>Number.isInteger(allocation[r.id])&&allocation[r.id]>=0)&&members.reduce((s,r)=>s+allocation[r.id],0)===g.total_shared_money;
      g.allocation_mode=valid?'MANUAL':'UNALLOCATED';
      g.manual_allocations=valid?allocation:{};
      for(const r of members){
        r.allocation_status=valid?'MANUAL':'UNALLOCATED';
        r.allocated_shared_cost=valid?allocation[r.id]:null;
        r.allocated_toll=valid&&monetary[0]?.type==='TIEN_DUONG'?allocation[r.id]:null;
        r.allocated_subcontractor_cost=valid&&monetary[0]?.type==='CUOC_RA'?allocation[r.id]:null;
        r.direct_cost=(r.allocated_toll??Number(r.tien_duong||0))+(r.allocated_subcontractor_cost??Number(r.cuoc_ra||0))+r.phat_sinh;
        r.trip_profit=valid?r.cuoc_vao-r.direct_cost:null;
      }
    }
    return {...base,rows,groups};
  }

  /**
   * Cập nhật phương thức phân bổ chi phí cho một nhóm cuốc có validator nghiêm ngặt
   */
  setGroupAllocation(groupKey, mode, manualAllocations = {}) {
    const validModes = ['UNALLOCATED', 'MANUAL'];
    if (!validModes.includes(mode)) {
      throw new Error(`Chế độ phân bổ không hợp lệ: [${mode}]. Chỉ chấp nhận: ${validModes.join(', ')}`);
    }

    const data = this.getData();
    const group = data.groups.find(g => g.group_key === groupKey);
    if (!group) {
      throw new Error(`Không tìm thấy nhóm: ${groupKey}`);
    }

    if (mode === 'MANUAL') {
      if(group.shared_costs.filter(c=>c.amount>0).length>1)throw Error('Nhóm có nhiều loại chi phí chung cần phân bổ riêng từng loại; chưa hỗ trợ ghép tổng.');
      if (!manualAllocations || typeof manualAllocations !== 'object') {
        throw new Error('Cấu hình phân bổ thủ công phải là một đối tượng chứa danh sách mã cuốc và số tiền!');
      }

      const inputKeys = Object.keys(manualAllocations);
      // 1. Chặn key lạ không thuộc nhóm
      for (const k of inputKeys) {
        if (!group.trips.includes(k)) {
          throw new Error(`Mã cuốc [${k}] không thuộc nhóm [${groupKey}]!`);
        }
      }

      // 2. Kiểm tra tất cả các cuốc trong nhóm đều phải được chỉ định giá trị hợp lệ
      for (const tripId of group.trips) {
        const val = manualAllocations[tripId];
        if (val === undefined || val === null) {
          throw new Error(`Cuốc [${tripId}] chưa được chỉ định số tiền phân bổ!`);
        }
        if (typeof val !== 'number' || !Number.isFinite(val) || !Number.isInteger(val) || val < 0) {
          throw new Error(`Số tiền phân bổ cho cuốc [${tripId}] phải là số nguyên VND không âm (nhận được: ${val})!`);
        }
      }

      // 3. Kiểm tra tổng khớp 100%
      const sum = group.trips.reduce((s, tripId) => s + (manualAllocations[tripId] || 0), 0);
      if (sum !== group.total_shared_money) {
        throw new Error(`Tổng chi phí phân bổ thủ công (${sum.toLocaleString('vi-VN')} đ) phải bằng đúng tổng chi phí nhóm (${group.total_shared_money.toLocaleString('vi-VN')} đ)! Chênh lệch: ${(group.total_shared_money - sum).toLocaleString('vi-VN')} đ`);
      }
    }

    // Lưu vào RAM và lưu bền vững ra đĩa
    this.groupAllocations.set(groupKey, { mode, allocations: mode === 'MANUAL' ? manualAllocations : {} });
    this.saveAllocationsToFile();

    // Reset cache và parse lại để cập nhật toàn bộ trạng thái
    this.cachedData = null;
    return this.getData();
  }

  /**
   * Tính toán dữ liệu Công nợ (Phải thu khách hàng & Phải trả nhà xe)
   * TUYỆT ĐỐI KHÔNG TỰ THÊM GIAO DỊCH NGOÀI EXCEL THÁNG 1
   */
  getDebtsData() {
    const data = this.getData();
    const { rows } = data;

    // 1. Phải thu theo khách hàng từ đúng 77 dòng Excel
    const customerMap = new Map();

    rows.forEach(r => {
      const cName = r.customer_name || 'Khách hàng chưa rõ';
      if (!customerMap.has(cName)) {
        customerMap.set(cName, {
          customer_name: cName,
          trip_count: 0,
          total_revenue: 0,
          total_paid: 0,
          total_offset: 0,
          balance_due: 0,
          trips: []
        });
      }
      const c = customerMap.get(cName);
      c.trip_count += 1;
      c.total_revenue += r.cuoc_vao;

      const received = Number(r.received_amount || 0);
      const offset = Number(r.offset_amount || 0);
      const balance = Math.max(0, r.cuoc_vao - received - offset);
      c.total_paid += received;
      c.total_offset += offset;
      c.balance_due += balance;

      c.trips.push({
        id: r.id,
        row_index: r.row_index,
        trip_date: r.trip_date,
        raw_date: r.raw_date,
        route_name: r.route_name,
        container_number: r.container_number,
        cuoc_vao: r.cuoc_vao,
        payment_status_p: r.payment_status_p,
        payment_timing_q: r.payment_timing_q,
        is_offset: r.is_offset,
        is_paid: r.is_customer_paid,
        balance,
        notes: r.notes_r || r.payment_status_p
      });
    });

    const customerDebts = Array.from(customerMap.values()).sort((a, b) => b.balance_due - a.balance_due);

    // 2. Phải trả theo nhà xe ngoài
    const subMap = new Map();
    rows.filter(r => r.is_subcontractor && (r.cuoc_ra > 0 || r.subcontractor_name)).forEach(r => {
      const sName = r.subcontractor_name || 'Xe ngoài khác';
      if (!subMap.has(sName)) {
        subMap.set(sName, {
          subcontractor_name: sName,
          trip_count: 0,
          total_payable: 0,
          total_paid: 0,
          balance_due: 0,
          trips: []
        });
      }
      const s = subMap.get(sName);
      s.trip_count += 1;
      s.total_payable += r.cuoc_ra;

      const paidAmount = Number(r.sub_paid_amount || 0);
      const isSubPaid = paidAmount >= r.cuoc_ra;
      s.total_paid += paidAmount;
      s.balance_due += Math.max(0, r.cuoc_ra - paidAmount);

      s.trips.push({
        id: r.id,
        row_index: r.row_index,
        trip_date: r.trip_date,
        raw_date: r.raw_date,
        route_name: r.route_name,
        customer_name: r.customer_name,
        vehicle_plate: r.vehicle_plate,
        cuoc_ra: r.cuoc_ra,
        is_paid: isSubPaid,
        balance: Math.max(0, r.cuoc_ra - paidAmount),
        notes: r.phat_sinh_note || r.notes_r
      });
    });

    const subcontractorPayables = Array.from(subMap.values()).sort((a, b) => b.balance_due - a.balance_due);

    // Tổng hợp chung công nợ
    const totalReceivable = customerDebts.reduce((s, c) => s + c.total_revenue, 0);
    const totalCustomerPaid = customerDebts.reduce((s, c) => s + c.total_paid, 0);
    const totalCustomerOffset = customerDebts.reduce((s, c) => s + c.total_offset, 0);
    const totalCustomerDue = customerDebts.reduce((s, c) => s + c.balance_due, 0);

    const totalPayable = subcontractorPayables.reduce((s, c) => s + c.total_payable, 0);
    const totalSubPaid = subcontractorPayables.reduce((s, c) => s + c.total_paid, 0);
    const totalSubDue = subcontractorPayables.reduce((s, c) => s + c.balance_due, 0);

    return {
      receivables: {
        total_receivable: totalReceivable,
        total_paid: totalCustomerPaid,
        total_offset: totalCustomerOffset,
        total_due: totalCustomerDue,
        customers: customerDebts
      },
      payables: {
        total_payable: totalPayable,
        total_paid: totalSubPaid,
        total_due: totalSubDue,
        subcontractors: subcontractorPayables
      }
    };
  }

  /**
   * Lấy kết quả Tổng quan điều hành Giám Đốc (Phần A, B, C)
   * TÍNH TOÁN THEO ĐÚNG PHẠM VI LỌC (SCOPED METRICS)
   */
  getExecutiveOverview(filter = { period: 'month' }) {
    const data = this.getData();
    const debts = this.getDebtsData();
    const { rows, groups, stats } = data;

    // 1. Lọc tập cuốc theo phạm vi thời gian
    let filteredTrips = rows;
    if (filter.period === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      filteredTrips = rows.filter(r => r.trip_date === today);
    } else if (filter.period === 'day_09') {
      filteredTrips = rows.filter(r => r.trip_date === '2026-01-09');
    } else if (filter.period === 'day_08') {
      filteredTrips = rows.filter(r => r.trip_date === '2026-01-08');
    } else if (filter.period === 'january' || filter.period === 'month') {
      filteredTrips = rows.filter(r => r.trip_date.startsWith('2026-01'));
    } else if (filter.start_date && filter.end_date) {
      filteredTrips = rows.filter(r => r.trip_date >= filter.start_date && r.trip_date <= filter.end_date);
    }

    if (filter.area && filter.area !== 'ALL') {
      if (filter.area === 'TUAN') {
        filteredTrips = filteredTrips.filter(r => !r.is_subcontractor);
      }
    }

    // 2. Tính toán scoped metrics cho phạm vi được lọc
    const scopedRevenue = filteredTrips.reduce((s, r) => s + (r.cuoc_vao || 0), 0);
    const scopedFuelLiters = filteredTrips.reduce((s, r) => s + (r.dau_liters || 0), 0);
    const scopedPhatSinh = filteredTrips.reduce((s, r) => s + (r.phat_sinh || 0), 0);

    let scopedToll = 0;
    let scopedCuocRa = 0;

    filteredTrips.forEach(r => {
      if (!r.is_grouped) {
        scopedToll += (r.tien_duong || 0);
        scopedCuocRa += (r.cuoc_ra || 0);
      } else {
        const group = groups.find(g => g.group_key === r.group_id);
        const hasSharedCuocRa = group && group.shared_costs.some(c => c.type === 'CUOC_RA');
        const hasSharedToll = group && group.shared_costs.some(c => c.type === 'TIEN_DUONG');

        if (group && (group.allocation_mode === 'PROPORTIONAL' || group.allocation_mode === 'MANUAL')) {
          if (hasSharedCuocRa) {
            scopedCuocRa += (r.allocated_shared_cost || 0);
            scopedToll += (r.tien_duong || 0);
          } else if (hasSharedToll) {
            scopedToll += (r.allocated_shared_cost || 0);
            scopedCuocRa += (r.cuoc_ra || 0);
          } else {
            scopedToll += (r.tien_duong || 0);
            scopedCuocRa += (r.cuoc_ra || 0);
          }
        } else {
          // UNALLOCATED: Lấy giá trị trực tiếp từ dòng của sheet
          scopedToll += (r.tien_duong || 0);
          scopedCuocRa += (r.cuoc_ra || 0);
        }
      }
    });

    const scopedDirectCost = scopedToll + scopedCuocRa + scopedPhatSinh;
    const scopedProfit = scopedRevenue - scopedDirectCost;

    // Đếm số lượt / nhóm đối chiếu (không bao giờ âm):
    // Cuốc đơn = 1 lượt; Nhóm = 1 lượt nhóm
    const singleTripsCount = filteredTrips.filter(r => !r.is_grouped).length;
    const uniqueGroupsInScope = new Set(filteredTrips.filter(r => r.is_grouped).map(r => r.group_id));
    const journeysCount = filteredTrips.length === 0 ? 0 : (singleTripsCount + uniqueGroupsInScope.size);

    // Hiệu quả theo tài xế / xe trong scope
    const vehicleMap = new Map();
    filteredTrips.forEach(r => {
      const plate = r.vehicle_plate || (r.is_subcontractor ? (r.subcontractor_name || 'Xe ngoài') : 'Xe công ty');
      if (!vehicleMap.has(plate)) {
        vehicleMap.set(plate, {
          plate_number: plate,
          driver_name: r.driver_name,
          is_subcontractor: r.is_subcontractor,
          trip_count: 0,
          total_revenue: 0,
          total_toll: 0,
          total_cuoc_ra: 0,
          total_phat_sinh: 0,
          total_dau_liters: 0,
          total_direct_cost: 0,
          total_profit: 0
        });
      }
      const v = vehicleMap.get(plate);
      v.trip_count += 1;
      v.total_revenue += r.cuoc_vao;
      v.total_toll += (r.tien_duong || 0);
      const cCost = r.allocated_subcontractor_cost ?? (r.cuoc_ra || 0);
      v.total_cuoc_ra += cCost;
      v.total_phat_sinh += (r.phat_sinh || 0);
      v.total_dau_liters += (r.dau_liters || 0);
      const tripCost = r.direct_cost;
      v.total_direct_cost += tripCost;
      v.total_profit += (r.cuoc_vao - tripCost);
    });

    const vehiclePerformance = Array.from(vehicleMap.values()).sort((a, b) => b.total_revenue - a.total_revenue);

    // Hiệu quả theo tài xế / xe
    const driverMap = new Map();
    filteredTrips.forEach(r => {
      const driver = r.is_subcontractor
        ? `Xe ngoài ${r.subcontractor_name || r.vehicle_plate || ''}`.trim()
        : `Xe ${r.vehicle_plate} (Tài xế: Chưa xác định)`;
      if (!driverMap.has(driver)) {
        driverMap.set(driver, {
          driver_name: driver,
          plate_number: r.vehicle_plate || 'Thuê ngoài',
          is_subcontractor: r.is_subcontractor,
          trip_count: 0,
          total_revenue: 0,
          total_toll: 0,
          total_cuoc_ra: 0,
          total_phat_sinh: 0,
          total_dau_liters: 0,
          total_direct_cost: 0,
          total_profit: 0
        });
      }
      const d = driverMap.get(driver);
      d.trip_count += 1;
      d.total_revenue += r.cuoc_vao;
      d.total_toll += (r.tien_duong || 0);
      const cCost = r.allocated_subcontractor_cost ?? (r.cuoc_ra || 0);
      d.total_cuoc_ra += cCost;
      d.total_phat_sinh += (r.phat_sinh || 0);
      d.total_dau_liters += (r.dau_liters || 0);
      const tripCost = r.direct_cost;
      d.total_direct_cost += tripCost;
      d.total_profit += (r.cuoc_vao - tripCost);
    });
    const driverPerformance = Array.from(driverMap.values()).sort((a, b) => b.total_profit - a.total_profit);

    // 3. Phần B: Cần chú ý (Dựa trên số liệu thực tế tháng 1)
    const attentionItems = [
      {
        id: 'GROUP_63_64',
        title: 'Chia lãi nhóm cuốc kết hợp 63–64 (HÀ PHƯƠNG)',
        desc: 'Cước vào 5.6M (2.2M + 3.4M), Cước ra gộp chung 4.8M → Chênh lệch nhóm 800.000 đ',
        impact: 'Chênh lệch 800.000 đ',
        severity: 'high',
        btnText: 'Mở chia lãi nhóm',
        action_target: 'GROUP-63-64'
      },
      {
        id: 'OFFSET_P22',
        title: 'Khoản đối trừ P22 (Khách VẠN ĐẠT THÁI BÌNH)',
        desc: 'Cuốc hàng 22 ghi chú ĐỐI TRỪ XONG: 3.600.000 đ giảm nợ khách nhưng không tăng tiền mặt thực thu',
        impact: 'Đối trừ 3.600.000 đ',
        severity: 'medium',
        btnText: 'Xem Công Nợ',
        action_target: 'DEBTS'
      },
      {
        id: 'FUEL_LITERS',
        title: 'Lượng cấp dầu ghi nhận theo Lít (Chưa có đơn giá)',
        desc: 'Tổng cộng 1.770 lít dầu được cấp trong bảng kê tháng 1; chưa quy đổi thành tiền do thiếu đơn giá',
        impact: '1.770 Lít dầu',
        severity: 'medium',
        btnText: 'Xem chi tiết dầu',
        action_target: 'FUEL'
      }
    ];

    return {
      period_label: filter.period === 'january' || filter.period === 'month' ? 'Tháng 01/2026 (Chuẩn bảng kê)' : (filter.period || 'Phạm vi lọc'),
      kpis: {
        trips_count: filteredTrips.length,
        journeys_count: journeysCount,
        total_revenue_vat_inc: scopedRevenue,
        total_known_direct_cost: scopedDirectCost,
        fuel_liters: scopedFuelLiters,
        profit_before_salary_and_fuel: scopedProfit,
        profit_note: 'Chưa trừ lương và chưa quy đổi tiền dầu (1.770 lít cấp)',
        total_customer_receivables: debts.receivables.total_receivable,
        total_customer_due: debts.receivables.total_due,
        total_subcontractor_payables: debts.payables.total_payable,
        total_subcontractor_due: debts.payables.total_due
      },
      attention_items: attentionItems,
      driver_performance: driverPerformance,
      vehicle_performance: vehiclePerformance,
      groups: groups
    };
  }
}

// Singleton instance
export const excelMonthService = new ExcelMonthService();

/**
 * ============================================================
 * EXCEL IMPORT SERVICE - WED_HOACHTOAN
 * Chuẩn hóa luồng nhập bảng kê Excel theo chuẩn tháng 1.xlsx & mẫu mới
 * ============================================================
 * Nguyên tắc bất biến (AGENTS.md & CHUAN_NGHIEP_VU_EXCEL.md — Cập nhật 28/10/2026):
 * 1. Nhận diện linh hoạt theo tiêu đề cột (Header Detection) và cho phép ghép cột (Column Mapping).
 * 2. Hỗ trợ cả mẫu tháng 1.xlsx (18 cột A..R) và mẫu mới có thêm NÂNG, HẠ, PHƠI NÂNG HẠ, CÔNG NỢ, CN 30 NGÀY.
 * 3. Cước vào gốc là chưa VAT -> tính VAT 8%, Cước có VAT (x1,08), Khoản trừ 17% nội bộ, Cước sau trừ (x0,83).
 * 4. Cột NÂNG / HẠ: Nếu là chữ tên cảng/địa điểm -> lưu vào lift_on_location / lift_off_location; nếu là số tiền -> lưu vào lift_on_fee / lift_off_fee.
 * 5. Cột PHƠI NÂNG HẠ: Map vào tiền phơi trả hộ (eir_advances); giữ nguyên giá trị chữ như "K MẤT" làm ghi chú nguồn không tạo nợ.
 * 6. Cột cuối / CÔNG NỢ / TƯƠI: Nhận diện "TƯƠI", "X", "CN 30 NGÀY" mà không tự suy ngày thu giả.
 * 7. Bảo toàn loại cont 20DC, 40DC, 40HC, 40RF, 40FR, 45 và giá trị chưa rõ (VD: 15H00267).
 * ============================================================
 */
import XLSX from 'xlsx';
import fs from 'fs';
import { createHash } from 'node:crypto';
import { excelMonthService, invalidateExcelMonthCache } from './excelMonthService.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { createTrip } from './trip.service.js';
import { broadcastPLUpdate } from './plEngine.service.js';
import { calculateFareBreakdown, calculateFuelCost, normalizeContainerType, toIntVnd } from '../utils/tripFinancials.js';
import { getFuelPriceMap } from './fuelPrice.service.js';

if(!db.prepare('PRAGMA table_info(import_batches)').all().some(c=>c.name==='file_hash'))db.exec('ALTER TABLE import_batches ADD COLUMN file_hash TEXT');

function cleanHeader(text) {
  return String(text || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

// Select the trip date explicitly. Payment/due dates must never overwrite it.
function tripDateHeaderScore(value) {
  const header = cleanHeader(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
  if (/^NGAY (CHAY|VAN CHUYEN|CHUYEN|THUC HIEN)(\s|$)/.test(header)) return 3;
  if (/^NGAY(?: THANG)?(?: NAM)?$/.test(header) || header === 'DATE') return 2;
  return 0;
}

export class ExcelImportService {
  /**
   * Chữ ký dòng Excel: ổn định kể cả khi Giám đốc sửa chuyến sau khi nhập
   * (chữ ký lưu trong raw_data lúc nhập, không đổi theo chỉnh sửa).
   * Các dòng giống hệt nhau trong cùng file được đánh thứ tự để không gộp nhầm.
   */
  static assignRowSignatures(rows) {
    const seen = new Map();
    for (const r of rows) {
      const base = [r.trip_date, r.customer_name, r.container_number || '', r.route_name || '', r.cuoc_goc ?? r.base_revenue ?? 0, r.vehicle_plate || ''].join('|');
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      r.row_signature = createHash('sha256').update(base + '#' + n).digest('hex');
    }
    return rows;
  }

  static loadImportedSignatures() {
    const sigs = new Set();
    for (const t of db.prepare("SELECT raw_data FROM trips WHERE source_type='EXCEL' AND raw_data IS NOT NULL").all()) {
      try {
        const sig = JSON.parse(t.raw_data)?.row_signature;
        if (sig) sigs.add(sig);
      } catch { /* bỏ qua raw_data không phải JSON */ }
    }
    return sigs;
  }

  /**
   * Tự động nhận diện vị trí các cột dựa trên dòng tiêu đề (thường là hàng 2 hoặc hàng 1)
   */
  static detectColumns(sheet) {
    const ref = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
    const maxCol = Math.min(ref.e.c, 30);

    // Tìm hàng header (quét hàng 1..5 tìm chữ STT, NGÀY, CHỦ HÀNG, CƯỚC VÀO)
    let headerRow = 2;
    for (let r = 1; r <= Math.min(6, ref.e.r + 1); r++) {
      let score = 0;
      for (let c = 0; c <= maxCol; c++) {
        const colLetter = XLSX.utils.encode_col(c);
        const val = cleanHeader(sheet[`${colLetter}${r}`]?.v);
        if (val.includes('STT') || tripDateHeaderScore(val) > 0 || val.includes('CHỦ HÀNG') || val.includes('CƯỚC VÀO') || val.includes('TUYẾN')) {
          score++;
        }
      }
      if (score >= 3) {
        headerRow = r;
        break;
      }
    }

    const headers = {};
    for (let c = 0; c <= maxCol; c++) {
      const colLetter = XLSX.utils.encode_col(c);
      const val = cleanHeader(sheet[`${colLetter}${headerRow}`]?.v);
      if (val) headers[colLetter] = val;
    }

    const entries = Object.entries(headers);
    const hasDetectedHeaders = entries.length >= 4;

    const detected = hasDetectedHeaders
      ? {
          header_row: headerRow,
          data_start_row: headerRow + 1,
          stt: null,
          trip_date: null,
          customer_name: null,
          route_name: null,
          container_number: null,
          vehicle_plate: null,
          container_type_col: null,
          cont_40: null,
          cont_20: null,
          lift_on: null,
          lift_on_fee_col: null,
          lift_off: null,
          lift_off_fee_col: null,
          phoi_nang_ha: null,
          fuel_liters: null,
          toll_fee: null,
          lach_huyen: null,
          subcontractor_name: null,
          other_costs: null,
          subcontractor_cost: null,
          base_revenue: null,
          customer_paid: null,
          payment_timing: null,
          notes: null,
          extra_last_col: null,
        }
      : {
          header_row: headerRow,
          data_start_row: headerRow + 1,
          stt: 'A',
          trip_date: 'B',
          customer_name: 'C',
          route_name: 'D',
          container_number: 'E',
          vehicle_plate: 'F',
          container_type_col: null,
          cont_40: 'G',
          cont_20: 'H',
          lift_on: null,
          lift_on_fee_col: null,
          lift_off: null,
          lift_off_fee_col: null,
          phoi_nang_ha: null,
          fuel_liters: 'I',
          toll_fee: 'J',
          lach_huyen: 'K',
          subcontractor_name: 'L',
          other_costs: 'M',
          subcontractor_cost: 'N',
          base_revenue: 'O',
          customer_paid: 'P',
          payment_timing: 'Q',
          notes: 'R',
          extra_last_col: null,
        };

    if (hasDetectedHeaders) {
      let selectedDateScore = 0;
      for (const [col, rawHeader] of entries) {
        const h = rawHeader.toUpperCase().trim();
        if (h === 'STT' || h.startsWith('STT')) detected.stt = col;
        else if (tripDateHeaderScore(h) > 0) {
          const score = tripDateHeaderScore(h);
          if (score > selectedDateScore) {
            detected.trip_date = col;
            selectedDateScore = score;
          }
        }
        else if (h.includes('CHỦ HÀNG') || h.includes('KHÁCH HÀNG')) detected.customer_name = col;
        else if (h.includes('TUYẾN')) detected.route_name = col;
        else if (h.includes('SỐ CONT') || h.includes('MÃ CONT') || h === 'CONT') detected.container_number = col;
        else if (h === 'BKS' || h.includes('BIỂN SỐ') || h.includes('SỐ XE')) detected.vehicle_plate = col;
        else if (h.includes('LOẠI CONT') || h.includes('LOẠI CONTAINER') || h.includes('KIỂU CONT')) detected.container_type_col = col;
        else if (h === '40' || h === "40'") detected.cont_40 = col;
        else if (h === '20' || h === "20'") detected.cont_20 = col;
        else if (h.includes('PHƠI NÂNG HẠ') || h.includes('TIỀN PHƠI') || h.includes('PHƠI')) detected.phoi_nang_ha = col;
        else if (h.includes('PHÍ NÂNG') || h.includes('TIỀN NÂNG')) detected.lift_on_fee_col = col;
        else if (h.includes('PHÍ HẠ') || h.includes('TIỀN HẠ')) detected.lift_off_fee_col = col;
        else if (h === 'NÂNG' || h.includes('NƠI NÂNG') || h.includes('CẢNG NÂNG')) detected.lift_on = col;
        else if (h === 'HẠ' || h.includes('NƠI HẠ') || h.includes('CẢNG HẠ')) detected.lift_off = col;
        else if (h.includes('DẦU')) detected.fuel_liters = col;
        else if (h.includes('TIỀN ĐƯỜNG') || h.includes('CẦU ĐƯỜNG') || h === 'BOT') detected.toll_fee = col;
        else if (h.includes('LẠCH HUYỆN')) detected.lach_huyen = col;
        else if (h.includes('NX NGOÀI') || h.includes('NHÀ XE') || h.includes('XE NGOÀI')) detected.subcontractor_name = col;
        else if (h.includes('PHÁT SINH')) detected.other_costs = col;
        else if (h.includes('CƯỚC RA')) detected.subcontractor_cost = col;
        else if (h.includes('CƯỚC VÀO') || h.includes('DOANH THU') || h.includes('CƯỚC GỐC')) detected.base_revenue = col;
        else if (h.includes('ĐÃ TT') || h.includes('THANH TOÁN')) detected.customer_paid = col;
        else if (h.includes('TƯƠI') || h.includes('CÔNG NỢ') || h.includes('HẠN TT')) detected.payment_timing = col;
        else if (h.includes('GHI CHÚ')) detected.notes = col;
      }

      // Nếu không có cột LOẠI CONT riêng nhưng có cột 40 / 20 thì dùng cont_40 / cont_20
      // Nếu không nhận diện được cột 40 hay 20 mà cũng không có cột LOẠI CONT, chỉ gán fallback nếu cột G và H chưa được gán cho trường khác (như NÂNG/HẠ)
      if (!detected.container_type_col && !detected.cont_40 && !detected.cont_20) {
        const assignedValues = Object.values(detected);
        if (!assignedValues.includes('G') && !assignedValues.includes('H')) {
          detected.cont_40 = 'G';
          detected.cont_20 = 'H';
        }
      }

      // Kiểm tra cột ngay sau cột payment_timing nếu không có tiêu đề (như cột R ở tháng 1 hoặc cột cuối ở mẫu mới)
      if (detected.payment_timing) {
        const timingColIdx = XLSX.utils.decode_col(detected.payment_timing);
        const nextColLetter = XLSX.utils.encode_col(timingColIdx + 1);
        if (!headers[nextColLetter]) {
          detected.extra_last_col = nextColLetter;
        }
      }
    }

    return {
      headers,
      detected_mapping: detected,
    };
  }

  /**
   * Phân tích tệp Excel và trả về báo cáo xem trước (Preview)
   */
  static parseAndPreview({ buffer, filename, mapping = null, sheetName = null }) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellStyles: true });
    const availableSheets = workbook.SheetNames || [];
    const selectedSheetName = sheetName && availableSheets.includes(sheetName) ? sheetName : availableSheets[0];
    const sheet = workbook.Sheets[selectedSheetName];
    if (!sheet) throw new Error('File Excel không có sheet dữ liệu hợp lệ: ' + selectedSheetName);

    const { headers, detected_mapping } = this.detectColumns(sheet);
    const colMap = { ...detected_mapping };

    if (mapping && typeof mapping === 'object') {
      for (const [k, v] of Object.entries(mapping)) {
        if (!v) continue;
        const cleanCol = String(v).trim().toUpperCase();
        if (!/^[A-Z]{1,3}$/.test(cleanCol)) {
          throw new Error('Ghép cột phải dùng ký hiệu A, B, C…');
        }
        // Hỗ trợ cả hai kiểu truyền mapping: { base_revenue: 'O' } hoặc { O: 'R' } (kiểu cũ A..R)
        if (/^[A-R]$/.test(k)) {
          const legacyFieldByLetter = {
            A: 'stt',
            B: 'trip_date',
            C: 'customer_name',
            D: 'route_name',
            E: 'container_number',
            F: 'vehicle_plate',
            G: 'cont_40',
            H: 'cont_20',
            I: 'fuel_liters',
            J: 'toll_fee',
            K: 'lach_huyen',
            L: 'subcontractor_name',
            M: 'other_costs',
            N: 'subcontractor_cost',
            O: 'base_revenue',
            P: 'customer_paid',
            Q: 'payment_timing',
            R: 'notes',
          }[k];
          if (legacyFieldByLetter) colMap[legacyFieldByLetter] = cleanCol;
        } else {
          colMap[k] = cleanCol;
        }
      }
    }

    if (!colMap.trip_date) {
      throw new Error(`Sheet "${selectedSheetName}": không nhận diện được cột ngày chạy. Dùng tiêu đề "NGÀY CHẠY", "NGÀY" hoặc ghép đúng cột ngày chạy.`);
    }

    const merges = sheet['!merges'] || [];
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const baselineHash = createHash('sha256')
      .update(fs.readFileSync(excelMonthService.excelPath || process.env.EXCEL_PATH || new URL('../../../tháng 1.xlsx', import.meta.url)))
      .digest('hex');
    const isThang1Structure = fileHash === baselineHash;
    const fuelMap = getFuelPriceMap();

    const rows = [];
    const startRow = colMap.data_start_row || 3;
    const maxRow = Math.min(10000, XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100').e.r + 1);

    const getCell = (colKey, rowNum) => {
      const colLetter = colMap[colKey];
      if (!colLetter) return undefined;
      return sheet[`${colLetter}${rowNum}`];
    };

    for (let r = startRow; r <= maxRow; r++) {
      const sttCell = getCell('stt', r);
      // Excel stores a merged date only in the top-left cell of its merge.
      let dateCell = getCell('trip_date', r);
      if (dateCell?.v == null || String(dateCell.v).trim() === '') {
        const dateCol = XLSX.utils.decode_col(colMap.trip_date);
        const mergedDate = merges.find(m => m.s.c === dateCol && m.e.c === dateCol && m.s.r <= r - 1 && m.e.r >= r - 1);
        if (mergedDate) dateCell = sheet[XLSX.utils.encode_cell(mergedDate.s)];
      }
      if ((!sttCell || sttCell.v === undefined || sttCell.v === null || sttCell.v === '') && !dateCell) {
        continue;
      }

      const stt = parseInt(sttCell?.v, 10);
      if (isNaN(stt) || stt <= 0) continue;

      // 1. Ngày tháng
      let rawDate = dateCell?.v ?? dateCell?.w ?? '';
      let normalizedDate;
      try {
        if (typeof rawDate === 'number') {
          const date1904 = workbook.Workbook?.WBProps?.date1904;
          const d = XLSX.SSF.parse_date_code(rawDate, { date1904: date1904 === true || date1904 === 1 || date1904 === '1' });
          if (!d) throw new Error('Giá trị ngày Excel không hợp lệ');
          rawDate = `${d.d}/${d.m}/${d.y}`;
        }
        normalizedDate = this.normalizeDateString(rawDate, isThang1Structure || String(filename || '').toLowerCase().includes('tháng 1'));
      } catch (error) {
        throw new Error(`Sheet "${selectedSheetName}", dòng ${r}, ô ${colMap.trip_date}${r}: ${error.message}. Kiểm tra ngày chạy của dòng này; ngày gộp phải nằm trong ô gộp thực tế.`);
      }

      // 2. Chủ hàng & Tuyến & Cont & BKS
      const customer = String(getCell('customer_name', r)?.v || '').trim().toUpperCase();
      const route = String(getCell('route_name', r)?.v || '').trim();
      const cont = String(getCell('container_number', r)?.v || '').trim().toUpperCase();
      const bksRaw = String(getCell('vehicle_plate', r)?.v || '').trim().toUpperCase();

      // 3. Loại cont (Bảo toàn 40FR, 40RF, 45, 20DC, 40DC, 40HC, và giá trị lạ như 15H00267)
      let rawContCombined = '';
      let defaultHint = '';
      if (colMap.container_type_col) {
        rawContCombined = String(getCell('container_type_col', r)?.v || '').trim();
        defaultHint = rawContCombined;
      } else {
        const gVal = colMap.cont_40 ? String(getCell('cont_40', r)?.v || '').trim() : '';
        const hVal = colMap.cont_20 ? String(getCell('cont_20', r)?.v || '').trim() : '';
        rawContCombined = gVal || hVal || '';
        defaultHint = gVal ? '40' : hVal ? '20' : '';
      }
      const contNorm = rawContCombined
        ? normalizeContainerType(rawContCombined, defaultHint || '40DC')
        : { container_code: '', raw_container_type: '', needs_classification: false };
      const contSize = contNorm.container_code || (rawContCombined ? '40DC' : '');

      // 4. NÂNG & HẠ: 4 ô độc lập (nơi nâng, phí nâng, nơi hạ, phí hạ).
      // Mẫu cũ chỉ có 1 cột NÂNG/HẠ: chữ -> tên nơi, số -> phí.
      const parseLift = (placeKey, feeKey, r) => {
        let location = null;
        let fee = 0;
        const placeVal = getCell(placeKey, r)?.v;
        if (placeVal !== undefined && placeVal !== null && placeVal !== '') {
          if (typeof placeVal === 'number' || /^\d+(\.\d+)?$/.test(String(placeVal).replace(/[,\s]/g, ''))) {
            fee = toIntVnd(String(placeVal).replace(/[,\s]/g, ''));
          } else {
            location = String(placeVal).trim();
          }
        }
        const feeVal = getCell(feeKey, r)?.v;
        if (feeVal !== undefined && feeVal !== null && String(feeVal).trim() !== '') {
          fee = Math.max(0, toIntVnd(String(feeVal).replace(/[,\s]/g, '')));
        }
        return { location, fee };
      };
      const { location: liftOnLocation, fee: liftOnFee } = parseLift('lift_on', 'lift_on_fee_col', r);
      const { location: liftOffLocation, fee: liftOffFee } = parseLift('lift_off', 'lift_off_fee_col', r);

      // 5. PHƠI NÂNG HẠ (Tiền phơi trả hộ chủ hàng; giữ nguyên chữ "K MẤT" làm ghi chú nguồn)
      let phoiAdvanceAmount = 0;
      let phoiRawSource = '';
      let phoiIsNonFinancial = false;
      const phoiVal = getCell('phoi_nang_ha', r)?.v;
      if (phoiVal !== undefined && phoiVal !== null && String(phoiVal).trim() !== '') {
        const phoiStr = String(phoiVal).trim();
        const numericClean = phoiStr.replace(/[,\s.]/g, '');
        if (typeof phoiVal === 'number') {
          phoiAdvanceAmount = Math.max(0, toIntVnd(phoiVal));
        } else if (/^\d+$/.test(numericClean)) {
          phoiAdvanceAmount = Math.max(0, toIntVnd(numericClean));
        } else {
          phoiRawSource = phoiStr;
          phoiIsNonFinancial = true; // Ví dụ: "K MẤT" -> không tạo nợ
        }
      }

      // 6. DẦU (Lít) & Tiền dầu theo ngày chạy
      const dauRaw = getCell('fuel_liters', r)?.v || getCell('fuel_liters', r)?.w || '';
      let fuelLiters = 0;
      if (dauRaw) {
        const parsed = parseFloat(dauRaw.toString().replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) fuelLiters = parsed;
      }
      const dailyFuelPrice = fuelMap.get(normalizedDate) ?? null;
      const fuelCalc = calculateFuelCost(fuelLiters, dailyFuelPrice);

      // 7. TIỀN ĐƯỜNG (BOT)
      const tienDuongVal = getCell('toll_fee', r)?.v;
      const tollFee = tienDuongVal !== undefined && tienDuongVal !== null && tienDuongVal !== ''
        ? Math.max(0, toIntVnd(tienDuongVal))
        : 0;

      // 8. LẠCH HUYỆN & NX NGOÀI & PHÁT SINH & CƯỚC RA
      const lachHuyen = String(getCell('lach_huyen', r)?.v || '').trim();
      const nxNgoai = String(getCell('subcontractor_name', r)?.v || '').trim().toUpperCase();

      const phatSinhVal = getCell('other_costs', r)?.v;
      let phatSinhTien = 0;
      let nxPaidNote = '';
      if (typeof phatSinhVal === 'number') {
        phatSinhTien = Math.max(0, toIntVnd(phatSinhVal));
      } else if (phatSinhVal && String(phatSinhVal).toUpperCase().includes('ĐÃ TT')) {
        nxPaidNote = 'ĐÃ TT';
      }

      const cuocRaVal = getCell('subcontractor_cost', r)?.v;
      const cuocRa = cuocRaVal !== undefined && cuocRaVal !== null && cuocRaVal !== ''
        ? Math.max(0, toIntVnd(cuocRaVal))
        : 0;

      // 9. CƯỚC VÀO GỐC (Chưa VAT -> +8% VAT -> -17% nội bộ)
      const cuocVaoVal = getCell('base_revenue', r)?.v;
      const cuocGoc = cuocVaoVal !== undefined && cuocVaoVal !== null && cuocVaoVal !== ''
        ? Math.max(0, toIntVnd(cuocVaoVal))
        : 0;
      const fareCalc = calculateFareBreakdown(cuocGoc);

      // 10. ĐÃ TT & CỘT CUỐI (TƯƠI / X / CN 30 NGÀY)
      const pVal = String(getCell('customer_paid', r)?.v || '').trim().toUpperCase();
      let customerPaymentStatus = 'CHUA_TT';
      if (pVal.includes('ĐỐI TRỪ') || pVal.includes('DOI TRU')) customerPaymentStatus = 'DOI_TRU';
      else if (pVal.includes('ĐÃ THANH TOÁN') || pVal.includes('DA THANH TOAN') || pVal.includes('ĐÃ TT')) customerPaymentStatus = 'DA_TT';

      const qVal = String(getCell('payment_timing', r)?.v || '').trim().toUpperCase();
      const extraLastVal = colMap.extra_last_col ? String(sheet[`${colMap.extra_last_col}${r}`]?.v || '').trim().toUpperCase() : '';
      const combinedTiming = [qVal, pVal, extraLastVal].join(' | ');

      let paymentTerms = null;
      let phoiTermType = 'CHUA_DAT';
      if (combinedTiming.includes('CN 30 NGÀY') || combinedTiming.includes('CN 30 NGAY')) {
        paymentTerms = 'CN 30 NGÀY';
        phoiTermType = 'CN_30_NGAY';
      }
      if (qVal.includes('TƯƠI') || qVal.includes('TUOI') || extraLastVal.includes('TƯƠI')) {
        if (customerPaymentStatus === 'CHUA_TT' && !colMap.phoi_nang_ha) {
          customerPaymentStatus = 'TUOI';
        }
        phoiTermType = 'TUOI';
      } else if (qVal === 'X') {
        customerPaymentStatus = 'X';
      }

      const notes = String(getCell('notes', r)?.v || getCell('notes', r)?.w || '').trim();

      // Nhận diện xe nhà hay xe thuê ngoài
      let isSub = 0;
      let vehiclePlate = '';
      let subName = '';
      if (nxNgoai || cuocRa > 0 || bksRaw.includes('ĐÃ TT') || bksRaw.includes('NGOÀI') || bksRaw.includes('ANH') || bksRaw.includes('EM')) {
        isSub = 1;
        subName = nxNgoai || bksRaw || 'NHÀ XE NGOÀI';
        vehiclePlate = bksRaw.includes('15C') || bksRaw.includes('15H') ? bksRaw : 'XE NGOÀI';
      } else {
        vehiclePlate = bksRaw;
      }

      let rowMergedGroup = null;
      for (const m of merges) {
        if (r - 1 >= m.s.r && r - 1 <= m.e.r && m.s.r !== m.e.r) {
          rowMergedGroup = `GROUP-${m.s.r + 1}-${m.e.r + 1}`;
          break;
        }
      }

      rows.push({
        source_row: r,
        stt,
        stt_source: stt,
        raw_date: rawDate,
        trip_date: normalizedDate,
        customer_name: customer,
        route_name: route,
        container_number: cont,
        container_size: contSize,
        container_type_raw: rawContCombined || contSize,
        container_needs_classification: contNorm.needs_classification,
        lift_on_location: liftOnLocation,
        lift_on_fee: liftOnFee,
        lift_off_location: liftOffLocation,
        lift_off_fee: liftOffFee,
        phoi_advance_amount: phoiAdvanceAmount,
        phoi_raw_source_value: phoiRawSource,
        phoi_is_non_financial_note: phoiIsNonFinancial,
        phoi_payment_term_type: phoiTermType,
        is_subcontractor: isSub,
        vehicle_plate: vehiclePlate,
        subcontractor_name: subName,
        fuel_liters: fuelLiters,
        fuel_unit_price: fuelCalc.fuel_unit_price,
        fuel_cost: fuelCalc.fuel_cost,
        is_fuel_price_missing: fuelCalc.is_fuel_price_missing,
        toll_fee: tollFee,
        other_costs: phatSinhTien,
        subcontractor_cost: cuocRa,
        base_revenue: fareCalc.cuoc_goc,
        cuoc_goc: fareCalc.cuoc_goc,
        trip_revenue: fareCalc.cuoc_goc,
        vat_amount: fareCalc.vat_amount,
        cuoc_co_vat: fareCalc.cuoc_co_vat,
        khoan_tru_17: fareCalc.khoan_tru_17,
        cuoc_sau_tru_17: fareCalc.cuoc_sau_tru_17,
        customer_payment_status: customerPaymentStatus,
        subcontractor_payment_status: nxPaidNote ? 'DA_TT' : 'CHUA_TT',
        payment_terms: paymentTerms,
        notes: notes ? `${notes}${lachHuyen ? ' | ' + lachHuyen : ''}` : lachHuyen,
        group_id: rowMergedGroup,
      });
    }

    // ĐỐI CHIẾU CHỐNG TRÙNG VỚI CƠ SỞ DỮ LIỆU HIỆN CÓ (Trùng số cont khác ngày/cuốc KHÔNG bị xóa)
    const duplicates = [];
    const newTrips = [];
    const knownRows = excelMonthService.getData().rows;
    this.assignRowSignatures(rows);
    const importedSigs = this.loadImportedSignatures();

    for (const r of rows) {
      const candidates = knownRows.filter(
        (t) =>
          t.trip_date === r.trip_date &&
          t.customer_name.trim().toUpperCase() === r.customer_name &&
          String(t.container_number || '') === String(r.container_number || '') &&
          t.route_name === r.route_name
      );
      r.duplicate_candidate = candidates.length > 0 || importedSigs.has(r.row_signature);
      if (r.duplicate_candidate) {
        duplicates.push({ row: r, matched_trip: candidates[0] ? (candidates[0].trip_code || candidates[0].id) : 'ĐÃ NHẬP TỪ ĐỢT TRƯỚC (khớp chữ ký dòng)' });
      } else {
        newTrips.push(r);
      }
    }
    // Chỉ đánh dấu trùng lặp nếu thực sự có chuyến tương ứng đã tồn tại trong database
    const warnings = [];

    // TỔNG HỢP CÁC CHỈ TIÊU BẢNG KÊ (Ô GỘP CHỈ TÍNH 1 LẦN)
    let totalCuocGoc = 0;
    let totalVat8 = 0;
    let totalCuocCoVat = 0;
    let totalKhoanTru17 = 0;
    let totalCuocSauTru17 = 0;
    let totalCuocRa = 0;
    let totalTienDuong = 0;
    let totalLiftOn = 0;
    let totalLiftOff = 0;
    let totalPhatSinh = 0;
    let totalDauLit = 0;
    let totalFuelCost = 0;
    let totalPhoiAdvance = 0;
    let fuelMissingRows = 0;
    let fuelMissingLiters = 0;

    for (const r of rows) {
      if (r.is_fuel_price_missing && Number(r.fuel_liters) > 0) {
        fuelMissingRows += 1;
        fuelMissingLiters += Number(r.fuel_liters) || 0;
      }
      totalCuocGoc += r.cuoc_goc;
      totalVat8 += r.vat_amount;
      totalCuocCoVat += r.cuoc_co_vat;
      totalKhoanTru17 += r.khoan_tru_17;
      totalCuocSauTru17 += r.cuoc_sau_tru_17;
      totalTienDuong += r.toll_fee;
      totalCuocRa += r.subcontractor_cost;
      totalLiftOn += r.lift_on_fee;
      totalLiftOff += r.lift_off_fee;
      totalDauLit += r.fuel_liters;
      totalFuelCost += r.fuel_cost;
      totalPhatSinh += r.other_costs;
      totalPhoiAdvance += r.phoi_advance_amount;
    }

    const totalDirectCostBeforeFuel = totalCuocRa + totalTienDuong + totalLiftOn + totalLiftOff + totalPhatSinh;
    const totalCompanyCost = totalDirectCostBeforeFuel + totalFuelCost;
    const tempProfitBeforeDeduction = totalCuocGoc - totalDirectCostBeforeFuel;
    const marginAfterDeduction17 = totalCuocSauTru17 - totalCompanyCost;

    // Trích xuất và nhận diện danh mục phát sinh (khách hàng, xe, tuyến, nhà xe)
    const detectedCustomers = Array.from(new Set(rows.map(r => r.customer_name).filter(Boolean)));
    const detectedVehicles = Array.from(new Set(rows.map(r => r.vehicle_plate).filter(p => p && p !== 'XE NGOÀI')));
    const detectedRoutes = Array.from(new Set(rows.map(r => r.route_name).filter(Boolean)));
    const detectedSubs = Array.from(new Set(rows.map(r => r.subcontractor_name).filter(Boolean)));

    const existingCustomers = new Set(db.prepare('SELECT UPPER(name) as name FROM customers').all().map(c => c.name));
    const existingVehicles = new Set(db.prepare('SELECT UPPER(plate_number) as plate FROM vehicles').all().map(v => v.plate));
    const existingRoutes = new Set(db.prepare('SELECT UPPER(route_name) as name FROM routes').all().map(r => r.name));
    const existingSubs = new Set(db.prepare('SELECT UPPER(name) as name FROM subcontractors').all().map(s => s.name));

    const masterData = {
      customers: {
        total: detectedCustomers.length,
        new: detectedCustomers.filter(c => !existingCustomers.has(c.toUpperCase())),
        existing: detectedCustomers.filter(c => existingCustomers.has(c.toUpperCase()))
      },
      vehicles: {
        total: detectedVehicles.length,
        new: detectedVehicles.filter(v => !existingVehicles.has(v.toUpperCase())),
        existing: detectedVehicles.filter(v => existingVehicles.has(v.toUpperCase()))
      },
      routes: {
        total: detectedRoutes.length,
        new: detectedRoutes.filter(r => !existingRoutes.has(r.toUpperCase())),
        existing: detectedRoutes.filter(r => existingRoutes.has(r.toUpperCase()))
      },
      subcontractors: {
        total: detectedSubs.length,
        new: detectedSubs.filter(s => !existingSubs.has(s.toUpperCase())),
        existing: detectedSubs.filter(s => existingSubs.has(s.toUpperCase()))
      }
    };

    return {
      filename,
      file_hash: fileHash,
      baseline_file: isThang1Structure,
      available_sheets: availableSheets,
      sheet_name: selectedSheetName,
      detected_headers: headers,
      applied_mapping: colMap,
      total_rows: rows.length,
      new_count: newTrips.length,
      duplicate_count: duplicates.length,
      master_data: masterData,
      warnings,
      summary: {
        total_cuoc_goc: totalCuocGoc,
        total_cuoc_vao: totalCuocGoc, // tương thích ngược
        total_vat_8: totalVat8,
        total_cuoc_co_vat: totalCuocCoVat,
        total_khoan_tru_17: totalKhoanTru17,
        total_cuoc_sau_tru_17: totalCuocSauTru17,
        total_cuoc_ra: totalCuocRa,
        total_tien_duong: totalTienDuong,
        total_lift_on_fee: totalLiftOn,
        total_lift_off_fee: totalLiftOff,
        total_phat_sinh: totalPhatSinh,
        total_dau_lit: totalDauLit,
        total_fuel_cost: totalFuelCost,
        total_phoi_advance: totalPhoiAdvance,
        total_direct_cost: totalDirectCostBeforeFuel,
        total_company_cost: totalCompanyCost,
        // Hợp đồng dữ liệu thống nhất với trip.service/overview: temp_profit = chênh lệch sau khoản trừ 17% và chi phí công ty (chưa trừ lương).
        temp_profit: marginAfterDeduction17,
        margin_after_deduction_17: marginAfterDeduction17,
        // Chỉ để đối chiếu: cước gốc trừ chi phí trực tiếp trước tiền dầu (chỉ tiêu cũ).
        profit_before_deduction: tempProfitBeforeDeduction,
        fuel_missing_rows: fuelMissingRows,
        fuel_missing_liters: fuelMissingLiters,
        is_provisional: fuelMissingRows > 0,
        provisional_note: fuelMissingRows > 0
          ? `Tạm tính: ${fuelMissingRows} cuốc (${fuelMissingLiters} lít dầu) chưa có giá dầu ngày chạy nên tiền dầu chưa được tính vào chi phí.`
          : null,
      },
      duplicates,
      rows,
    };
  }

  /**
   * Chuẩn hóa chuỗi ngày Excel sang YYYY-MM-DD
   */
  static normalizeDateString(rawVal, isThang1 = false) {
    if (!rawVal) throw Error('Thiếu ngày chạy trong Excel');
    const str = rawVal.toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      if (isThang1 && str.startsWith('2025-')) return '2026-' + str.slice(5);
      return str;
    }

    const parts = str.split(/[/.-]/);
    if (parts.length >= 2) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      let y = parts[2] ? parseInt(parts[2], 10) : 2026;

      if (y < 100) y += 2000;
      if (isThang1 && y === 2025) y = 2026;

      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        throw Error('Ngày Excel không hợp lệ: ' + str);
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    throw Error('Không đọc được ngày Excel: ' + str);
  }

  /**
   * Thực hiện nạp toàn bộ danh sách dòng đã duyệt vào cơ sở dữ liệu
   */
  static commitImport({ rows, filename, sheetName, fileHash = null, user, ipAddress = null, confirmDuplicates = false }) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Không có dòng dữ liệu nào để nhập');
    }

    const signature = fileHash || createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    const previous = db.prepare("SELECT id,total_rows FROM import_batches WHERE file_hash=? AND status='ACTIVE'").get(signature);
    if (previous) return { batch_id: previous.id, inserted_count: 0, already_imported: true };
    const batchId = uuidv4();
    const now = new Date().toISOString();

    let totalRev = 0;
    let totalCost = 0;
    const insertedTrips = [];

    const MASTER_TABLES = ['customers', 'vehicles', 'routes', 'subcontractors', 'ports'];
    const masterBefore = {};
    for (const t of MASTER_TABLES) masterBefore[t] = new Set(db.prepare(`SELECT id FROM ${t}`).all().map((x) => x.id));
    db.exec('BEGIN TRANSACTION;');
    let skippedDuplicates = 0;
    try {
      this.assignRowSignatures(rows.filter((r) => !r.row_signature));
      const liveSigs = this.loadImportedSignatures();
      for (const r of rows) {
        if (!confirmDuplicates && r.row_signature && liveSigs.has(r.row_signature)) {
          skippedDuplicates += 1;
          continue;
        }
        if (r.row_signature) liveSigs.add(r.row_signature);
        const baseRev = Number(r.base_revenue ?? r.cuoc_goc ?? r.trip_revenue ?? 0);
        totalRev += baseRev;
        totalCost +=
          (Number(r.subcontractor_cost) || 0) +
          (Number(r.toll_fee) || 0) +
          (Number(r.lift_on_fee) || 0) +
          (Number(r.lift_off_fee) || 0) +
          (Number(r.other_costs) || 0);

        const created = createTrip({
          tripData: {
            trip_date: r.trip_date,
            stt_source: r.stt_source || r.stt || null,
            is_subcontractor: r.is_subcontractor ? 1 : 0,
            vehicle_plate: r.vehicle_plate || 'XE NGOÀI',
            subcontractor_name: r.subcontractor_name || null,
            customer_name: r.customer_name,
            route_name: r.route_name || null,
            container_number: r.container_number || null,
            container_size: r.container_size || '40DC',
            container_type_raw: r.container_type_raw || r.container_size || '40DC',
            lift_on_location: r.lift_on_location || null,
            lift_on_fee: r.lift_on_fee || 0,
            lift_off_location: r.lift_off_location || null,
            lift_off_fee: r.lift_off_fee || 0,
            phoi_advance_amount: r.phoi_advance_amount || 0,
            phoi_raw_source_value: r.phoi_raw_source_value || '',
            phoi_is_non_financial_note: Boolean(r.phoi_is_non_financial_note),
            phoi_payment_term_type: r.phoi_payment_term_type || 'CHUA_DAT',
            base_revenue: baseRev,
            trip_revenue: baseRev,
            subcontractor_cost: r.subcontractor_cost || 0,
            toll_fee: r.toll_fee || 0,
            fuel_liters: r.fuel_liters || 0,
            other_costs: r.other_costs || 0,
            customer_payment_status: r.customer_payment_status || 'CHUA_TT',
            subcontractor_payment_status: r.subcontractor_payment_status || 'CHUA_TT',
            payment_terms: r.payment_terms || null,
            group_id: r.group_id || null,
            source_type: 'EXCEL',
            notes: r.notes || null,
          },
          user,
          ipAddress,
        });

        db.prepare(`
          UPDATE trips 
          SET source_file = ?, source_sheet = ?, source_row = ?, raw_data = ?, updated_at = created_at
          WHERE id = ?
        `).run(filename || null, sheetName || null, r.source_row || null, JSON.stringify({ batch_id: batchId, ...r }), created.id);

        insertedTrips.push(created);

        // Tự động tạo danh mục tương ứng nếu chưa tồn tại
        if (r.customer_name) {
          db.prepare('INSERT OR IGNORE INTO customers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
            uuidv4(), r.customer_name, now, now
          );
        }
        if (r.vehicle_plate && r.vehicle_plate !== 'XE NGOÀI' && (r.vehicle_plate.startsWith('15C') || r.vehicle_plate.startsWith('15H'))) {
          db.prepare("INSERT OR IGNORE INTO vehicles (id, plate_number, vehicle_type, status, created_at, updated_at) VALUES (?, ?, 'TRACTOR', 'ACTIVE', ?, ?)").run(
            uuidv4(), r.vehicle_plate, now, now
          );
        }
        if (r.route_name) {
          db.prepare('INSERT OR IGNORE INTO routes (id, route_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
            uuidv4(), r.route_name, now, now
          );
        }
        if (r.is_subcontractor && r.subcontractor_name) {
          db.prepare('INSERT OR IGNORE INTO subcontractors (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
            uuidv4(), r.subcontractor_name, now, now
          );
        }
      }

      db.prepare(`
        INSERT INTO import_batches (
          id, batch_name, file_name, sheet_name, total_rows, total_revenue, total_cost, created_by, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(
        batchId,
        `Nhập Excel ${filename || 'dữ liệu'} (${insertedTrips.length} cuốc)`,
        filename || null,
        sheetName || null,
        insertedTrips.length,
        totalRev,
        totalCost,
        user?.username || 'SYSTEM',
        now
      );

      if (insertedTrips.length === 0) {
        db.exec('ROLLBACK;');
        return { batch_id: null, inserted_count: 0, skipped_duplicates: skippedDuplicates, already_imported: true };
      }
      const createdMaster = {};
      for (const t of MASTER_TABLES) {
        createdMaster[t] = db.prepare(`SELECT id FROM ${t}`).all().map((x) => x.id).filter((id) => !masterBefore[t].has(id));
      }
      db.prepare('UPDATE import_batches SET file_hash=?, notes=? WHERE id=?').run(signature, JSON.stringify({ created_master: createdMaster }), batchId);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    broadcastPLUpdate('TRIP_CREATED', {
      trigger: 'EXCEL_IMPORTED',
      reason: `Đã nạp thành công đợt nhập ${filename}: ${insertedTrips.length} cuốc xe`,
    });

    return {
      batch_id: batchId,
      inserted_count: insertedTrips.length,
      skipped_duplicates: skippedDuplicates,
      trip_ids: insertedTrips.map((t) => t.id),
      total_revenue: totalRev,
      total_cost: totalCost,
    };
  }

  /**
   * Hoàn tác toàn bộ các cuốc xe thuộc một đợt nhập Excel
   */
  static rollbackBatch({ batchId, user, force = false }) {
    if (!batchId) throw new Error('Mã đợt nhập (batchId) là bắt buộc');

    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);
    if (!batch) throw new Error(`Không tìm thấy đợt nhập: ${batchId}`);
    if (batch.status === 'ROLLED_BACK') throw new Error(`Đợt nhập ${batchId} đã được hoàn tác trước đó.`);

    let createdMaster = {};
    try { createdMaster = JSON.parse(batch.notes || '{}').created_master || {}; } catch { createdMaster = {}; }
    const masterCleanup = { deleted: {}, kept_in_use: {} };
    db.exec('BEGIN TRANSACTION;');
    let deletedCount = 0;
    try {
      const trips = db
        .prepare('SELECT * FROM trips WHERE raw_data LIKE ?')
        .all(`%${batchId}%`)
        .filter((t) => {
          try {
            return JSON.parse(t.raw_data).batch_id === batchId;
          } catch {
            return false;
          }
        });
      for (const trip of trips) {
        // Chặn hoàn tác nếu đã phát sinh giao dịch hoàn tiền phơi thực tế (Task T30)
        const hasActiveManualRefund = db.prepare(`
          SELECT 1 FROM eir_refunds r
          INNER JOIN eir_advances a ON r.advance_id = a.id
          WHERE a.trip_id = ? AND r.status = 'ACTIVE' AND r.is_tuoi = 0
          LIMIT 1
        `).get(trip.id);
        if (hasActiveManualRefund) {
          throw new Error(`Không thể hoàn tác: cuốc xe ${trip.trip_code} đã phát sinh giao dịch thu hoàn tiền phơi thực tế.`);
        }

        const isModifiedManually = trip.updated_at !== trip.created_at;
        if (
          !force &&
          (trip.is_locked ||
            isModifiedManually ||
            db.prepare('SELECT 1 FROM trip_advances WHERE trip_id=? LIMIT 1').get(trip.id) ||
            db.prepare('SELECT 1 FROM expenses WHERE trip_id=? AND (source_component IS NULL OR updated_at<>created_at) LIMIT 1').get(trip.id) ||
            db.prepare('SELECT 1 FROM director_history WHERE record_id=? LIMIT 1').get(trip.id))
        ) {
          throw Error('Không thể hoàn tác: cuốc đã được chỉnh sửa, khóa hoặc có giao dịch liên quan.');
        }
      }
      for (const trip of trips) {
        db.prepare('DELETE FROM eir_refunds WHERE trip_id=?').run(trip.id);
        db.prepare('DELETE FROM eir_advance_history WHERE trip_id=?').run(trip.id);
        db.prepare('DELETE FROM eir_advances WHERE trip_id=?').run(trip.id);
        db.prepare('DELETE FROM expenses WHERE trip_id=?').run(trip.id);
        db.prepare('DELETE FROM containers WHERE trip_id=?').run(trip.id);
        db.prepare('DELETE FROM trip_advances WHERE trip_id=?').run(trip.id);
        db.prepare('DELETE FROM director_history WHERE record_id=?').run(trip.id);
        db.prepare('DELETE FROM trips WHERE id=?').run(trip.id);
        deletedCount++;
      }
      // Chỉ xóa danh mục do chính đợt nhập này tạo và không còn dữ liệu nào tham chiếu.
      const refQueries = {
        customers: (row) => db.prepare('SELECT 1 FROM trips WHERE customer_name=? UNION ALL SELECT 1 FROM eir_advances WHERE customer_name=? LIMIT 1').get(row.name, row.name),
        vehicles: (row) => db.prepare('SELECT 1 FROM trips WHERE vehicle_plate=? LIMIT 1').get(row.plate_number),
        routes: (row) => db.prepare('SELECT 1 FROM trips WHERE route_name=? LIMIT 1').get(row.route_name),
        subcontractors: (row) => db.prepare('SELECT 1 FROM trips WHERE subcontractor_name=? LIMIT 1').get(row.name),
        ports: (row) => db.prepare('SELECT 1 FROM trips WHERE lift_on_location=? OR lift_off_location=? UNION ALL SELECT 1 FROM containers WHERE pickup_yard=? OR dropoff_yard=? LIMIT 1').get(row.name, row.name, row.name, row.name),
      };
      for (const [table, ids] of Object.entries(createdMaster)) {
        if (!refQueries[table]) continue;
        masterCleanup.deleted[table] = 0;
        masterCleanup.kept_in_use[table] = 0;
        for (const id of ids) {
          const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
          if (!row) continue;
          if (refQueries[table](row)) {
            masterCleanup.kept_in_use[table] += 1;
          } else {
            db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
            masterCleanup.deleted[table] += 1;
          }
        }
      }
      db.prepare(`
        UPDATE import_batches 
        SET status = 'ROLLED_BACK', notes = ? 
        WHERE id = ?
      `).run(JSON.stringify({
        rolled_back_by: user?.username || 'SYSTEM',
        rolled_back_at: new Date().toISOString(),
        created_master: createdMaster,
        master_cleanup: masterCleanup,
      }), batchId);

      db.exec('COMMIT;');
      invalidateExcelMonthCache();
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }

    return {
      success: true,
      batch_id: batchId,
      deleted_trips: deletedCount,
      master_cleanup: masterCleanup,
    };
  }
}

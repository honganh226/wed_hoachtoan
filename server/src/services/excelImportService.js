/**
 * ============================================================
 * EXCEL IMPORT SERVICE - WED_HOACHTOAN
 * Chuẩn hóa luồng nhập bảng kê Excel theo chuẩn tháng 1.xlsx
 * ============================================================
 * Nguyên tắc bất biến (AGENTS.md & CHUAN_NGHIEP_VU_EXCEL.md):
 * 1. Nhận đúng cấu trúc tháng 1.xlsx (STT 1-77, hàng 3-79).
 * 2. Bỏ qua các dòng chỉ có định dạng (đến hàng 889).
 * 3. Chuẩn hóa năm 2025 -> 2026 cho 16 dòng file tháng 1; lưu ngày gốc.
 * 4. Cước đã gồm VAT, không nhân đôi VAT hoặc tự chọn thuế suất.
 * 5. Ô gộp (Merged Cells) chỉ tính tổng tiền 1 lần cho nhóm.
 * 6. TƯƠI là thanh toán ngay; X là đã thanh toán sau một thời gian; ĐỐI TRỪ là đối trừ công nợ.
 * 7. Cột R giữ nguyên là ghi chú.
 * 8. Chống trùng thông minh: nhận diện file, đối chiếu cả cuốc nhập tay, trùng cont không tự xóa.
 * 9. Bảo toàn truy vết: source_file, source_sheet, source_row, raw_data.
 * ============================================================
 */
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { createHash } from 'node:crypto';
import { excelMonthService } from './excelMonthService.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { createTrip } from './trip.service.js';
import { broadcastPLUpdate } from './plEngine.service.js';

if(!db.prepare('PRAGMA table_info(import_batches)').all().some(c=>c.name==='file_hash'))db.exec('ALTER TABLE import_batches ADD COLUMN file_hash TEXT');

export class ExcelImportService {
  /**
   * Phân tích tệp Excel và trả về báo cáo xem trước (Preview)
   */
  static parseAndPreview({ buffer, filename, mapping = null }) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellStyles: true });
    const sheetName = workbook.SheetNames[0];
    let sheet = workbook.Sheets[sheetName];
    if (mapping) {
      const original=sheet;sheet={'!ref':original['!ref'],'!merges':[]};
      for(const [target,source] of Object.entries(mapping)) {
        if(!/^[A-R]$/.test(target)||!/^([A-Z]{1,3})$/.test(source))throw Error('Ghép cột phải dùng ký hiệu A, B, C…');
        for(const address of Object.keys(original))if(!address.startsWith('!')&&address.match(/^[A-Z]+/)[0]===source)sheet[target+address.replace(/^[A-Z]+/,'')]=original[address];
        for(const merge of original['!merges']||[])if(merge.s.c===XLSX.utils.decode_col(source)&&merge.e.c===merge.s.c)sheet['!merges'].push({...merge,s:{...merge.s,c:XLSX.utils.decode_col(target)},e:{...merge.e,c:XLSX.utils.decode_col(target)}});
      }
    }

    if (!sheet) throw new Error('File Excel không có sheet dữ liệu hợp lệ');

    const merges = sheet['!merges'] || [];
    const fileHash=createHash('sha256').update(buffer).digest('hex');
    const baselineHash=createHash('sha256').update(fs.readFileSync(excelMonthService.excelPath || process.env.EXCEL_PATH || new URL('../../../tháng 1.xlsx',import.meta.url))).digest('hex');
    const isThang1Structure = fileHash === baselineHash;

    // Đọc tất cả các ô trong sheet
    const rows = [];
    const rawGroups = new Map(); // groupKey -> { cells, total, trips }

    // Duyệt qua các hàng từ hàng 3 đến hàng 100 (tìm STT)
    let maxRow = Math.min(10000, XLSX.utils.decode_range(sheet["!ref"] || "A1:R100").e.r + 1);
    for (let r = 3; r <= maxRow; r++) {
      const sttCell = sheet[`A${r}`];
      if (!sttCell || sttCell.v === undefined || sttCell.v === null || sttCell.v === '') {
        // Nếu không có STT và không có Ngày thì dừng hoặc bỏ qua
        const dateCell = sheet[`B${r}`];
        if (!dateCell) continue;
      }

      const stt = parseInt(sttCell?.v, 10);
      if (isNaN(stt) || stt <= 0) continue; // Bỏ qua tiêu đề hoặc dòng format

      // 1. Ngày tháng (Cột B)
      let rawDate = sheet[`B${r}`]?.v ?? '';
      if(typeof rawDate === 'number'){const d=XLSX.SSF.parse_date_code(rawDate);rawDate=`${d.d}/${d.m}/${d.y}`;}
      let normalizedDate = this.normalizeDateString(rawDate, isThang1Structure);

      // 2. Chủ hàng (Cột C)
      const customer = (sheet[`C${r}`]?.v || '').toString().trim().toUpperCase();

      // 3. Tuyến đường (Cột D)
      const route = (sheet[`D${r}`]?.v || '').toString().trim();

      // 4. Số cont (Cột E)
      const cont = (sheet[`E${r}`]?.v || '').toString().trim().toUpperCase();

      // 5. BKS (Cột F)
      const bksRaw = (sheet[`F${r}`]?.v || '').toString().trim().toUpperCase();

      // 6. Loại cont 40/20 (Cột G/H)
      let contSize = '40';
      const gVal = (sheet[`G${r}`]?.v || '').toString().trim().toUpperCase();
      const hVal = (sheet[`H${r}`]?.v || '').toString().trim().toUpperCase();
      if (gVal.includes('20') || hVal.includes('20')) contSize = '20';
      else if (gVal.includes('45') || hVal.includes('45')) contSize = '45';

      // 7. DẦU (Cột I) - Lượng cấp theo lít
      const dauRaw = sheet[`I${r}`]?.v || sheet[`I${r}`]?.w || '';
      let fuelLiters = 0;
      if (dauRaw) {
        const parsed = parseFloat(dauRaw.toString().replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) fuelLiters = parsed;
      }

      // 8. TIỀN ĐƯỜNG (Cột J)
      const tienDuongVal = sheet[`J${r}`]?.v;
      let tollFee = 0;
      if (tienDuongVal !== undefined && tienDuongVal !== null && tienDuongVal !== '') {
        const parsed = Math.round(Number(tienDuongVal) || 0);
        if (!isNaN(parsed)) tollFee = parsed;
      }

      // 9. LẠCH HUYỆN (Cột K) - Đánh dấu cảng
      const lachHuyen = (sheet[`K${r}`]?.v || '').toString().trim();

      // 10. NX NGOÀI (Cột L) - Nhà xe ngoài
      const nxNgoai = (sheet[`L${r}`]?.v || '').toString().trim().toUpperCase();

      // 11. PHÁT SINH (Cột M)
      const phatSinhVal = sheet[`M${r}`]?.v;
      let phatSinhTien = 0;
      let nxPaidNote = '';
      if (typeof phatSinhVal === 'number') {
        phatSinhTien = phatSinhVal;
      } else if (phatSinhVal && phatSinhVal.toString().includes('ĐÃ TT')) {
        nxPaidNote = 'ĐÃ TT';
      }

      // 12. CƯỚC RA (Cột N) - Thuê ngoài
      const cuocRaVal = sheet[`N${r}`]?.v;
      let cuocRa = 0;
      if (cuocRaVal !== undefined && cuocRaVal !== null && cuocRaVal !== '') {
        const parsed = Math.round(Number(cuocRaVal) || 0);
        if (!isNaN(parsed)) cuocRa = parsed;
      }

      // 13. CƯỚC VÀO (Cột O) - Đã gồm VAT
      const cuocVaoVal = sheet[`O${r}`]?.v;
      let cuocVao = 0;
      if (cuocVaoVal !== undefined && cuocVaoVal !== null && cuocVaoVal !== '') {
        const parsed = Math.round(Number(cuocVaoVal) || 0);
        if (!isNaN(parsed)) cuocVao = parsed;
      }

      // 14. ĐÃ TT (Cột P) - Thanh toán khách
      const pVal = (sheet[`P${r}`]?.v || '').toString().trim().toUpperCase();
      let customerPaymentStatus = 'CHUA_TT';
      if (pVal.includes('ĐỐI TRỪ') || pVal.includes('DOI TRU')) customerPaymentStatus = 'DOI_TRU';
      else if (pVal.includes('ĐÃ THANH TOÁN') || pVal.includes('DA THANH TOAN') || pVal.includes('ĐÃ TT')) customerPaymentStatus = 'DA_TT';

      // 15. TƯƠI (Cột Q)
      const qVal = (sheet[`Q${r}`]?.v || '').toString().trim().toUpperCase();
      if (qVal.includes('TƯƠI') || qVal.includes('TUOI')) customerPaymentStatus = 'TUOI';
      else if (qVal === 'X') customerPaymentStatus = 'X';

      // 16. Cột R - Ghi chú ngoài
      const notes = (sheet[`R${r}`]?.v || sheet[`R${r}`]?.w || '').toString().trim();

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

      // Kiểm tra ô gộp cho dòng này theo từng cột (J: Tiền đường, N: Cước ra, I: Dầu)
      let rowMergedGroup = null;
      for (const m of merges) {
        if (r - 1 >= m.s.r && r - 1 <= m.e.r) {
          if (m.s.r !== m.e.r) {
            // Gộp theo chiều dọc
            rowMergedGroup = `GROUP-${m.s.r + 1}-${m.e.r + 1}`;
            break;
          }
        }
      }

      rows.push({
        source_row: r,
        stt,
        raw_date: rawDate,
        trip_date: normalizedDate,
        customer_name: customer,
        route_name: route,
        container_number: cont,
        container_size: contSize,
        is_subcontractor: isSub,
        vehicle_plate: vehiclePlate,
        subcontractor_name: subName,
        fuel_liters: fuelLiters,
        toll_fee: tollFee,
        other_costs: phatSinhTien,
        subcontractor_cost: cuocRa,
        trip_revenue: cuocVao,
        customer_payment_status: customerPaymentStatus,
        subcontractor_payment_status: nxPaidNote ? 'DA_TT' : 'CHUA_TT',
        notes: notes ? `${notes}${lachHuyen ? ' | ' + lachHuyen : ''}` : lachHuyen,
        group_id: rowMergedGroup
      });
    }

    // ĐỐI CHIẾU CHỐNG TRÙNG VỚI CƠ SỞ DỮ LIỆU HIỆN CÓ
    const duplicates = [];
    const newTrips = [];

    const knownRows=excelMonthService.getData().rows;
    for (const r of rows) {
      const candidates=knownRows.filter(t=>t.trip_date===r.trip_date&&t.customer_name.trim().toUpperCase()===r.customer_name&&String(t.container_number||'')===String(r.container_number||'')&&t.route_name===r.route_name);
      r.duplicate_candidate=candidates.length>0;
      if(r.duplicate_candidate)duplicates.push({row:r,matched_trip:candidates[0].trip_code||candidates[0].id});else newTrips.push(r);
    }
    if(isThang1Structure){for(const r of rows)r.duplicate_candidate=true;}
    // TỔNG HỢP CÁC CHỈ TIÊU BẢNG KÊ (Ô GỘP CHỈ TÍNH 1 LẦN)
    let totalCuocVao = 0;
    let totalCuocRa = 0;
    let totalTienDuong = 0;
    let totalPhatSinh = 0;
    let totalDauLit = 0;

    // Tính tổng chính xác:
    // Tiền đường (Cột J) và Cước ra (Cột N) trong file tháng 1 đã ghi 1 lần ở dòng đầu của nhóm ô gộp.
    // Dầu cấp (Cột I) ghi riêng từng dòng (110l ở dòng 8, 50l ở dòng 9, 80l ở dòng 57, 20l ở dòng 58; chỉ dòng 36-37 gộp 75l ghi ở dòng 36).
    // Do đó: cộng dồn trực tiếp tất cả các dòng là hoàn toàn chính xác!
    for (const r of rows) {
      totalCuocVao += r.trip_revenue;
      totalTienDuong += r.toll_fee;
      totalCuocRa += r.subcontractor_cost;
      totalDauLit += r.fuel_liters;
      totalPhatSinh += r.other_costs;
    }

    const totalDirectCost = totalCuocRa + totalTienDuong + totalPhatSinh;
    const tempProfit = totalCuocVao - totalDirectCost;

    return {
      filename,
      file_hash: fileHash,
      baseline_file: isThang1Structure,
      sheet_name: sheetName,
      total_rows: rows.length,
      new_count: newTrips.length,
      duplicate_count: duplicates.length,
      summary: {
        total_cuoc_vao: totalCuocVao,
        total_cuoc_ra: totalCuocRa,
        total_tien_duong: totalTienDuong,
        total_phat_sinh: totalPhatSinh,
        total_dau_lit: totalDauLit,
        total_direct_cost: totalDirectCost,
        temp_profit: tempProfit
      },
      duplicates,
      rows
    };
  }

  /**
   * Chuẩn hóa chuỗi ngày Excel sang YYYY-MM-DD
   */
  static normalizeDateString(rawVal, isThang1 = false) {
    if (!rawVal) throw Error('Thiếu ngày chạy trong Excel');
    let str = rawVal.toString().trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(str))return str;

    // Nếu là định dạng DD/MM/YYYY hoặc DD/MM/YY
    const parts = str.split(/[/.-]/);
    if (parts.length >= 2) {
      let d = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10);
      let y = parts[2] ? parseInt(parts[2], 10) : 2026;

      if (y < 100) y += 2000;
      // Quy tắc chuẩn hóa năm 2025 -> 2026 của file tháng 1 đã chốt
      if (isThang1 && y === 2025) y = 2026;

      const date=new Date(Date.UTC(y,m-1,d));
      if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error('Ngày Excel không hợp lệ: '+str);
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    throw Error('Không đọc được ngày Excel: '+str);
  }

  /**
   * Thực hiện nạp toàn bộ danh sách dòng đã duyệt vào cơ sở dữ liệu
   */
  static commitImport({ rows, filename, sheetName, fileHash = null, user, ipAddress = null }) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Không có dòng dữ liệu nào để nhập');
    }

    const signature=fileHash||createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    const previous=db.prepare("SELECT id,total_rows FROM import_batches WHERE file_hash=? AND status='ACTIVE'").get(signature);
    if(previous)return {batch_id:previous.id,inserted_count:0,already_imported:true};
    const batchId = uuidv4();
    const now = new Date().toISOString();

    let totalRev = 0;
    let totalCost = 0;
    const insertedTrips = [];

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const r of rows) {
        totalRev += Number(r.trip_revenue) || 0;
        totalCost += (Number(r.subcontractor_cost) || 0) + (Number(r.toll_fee) || 0) + (Number(r.other_costs) || 0);

        const created = createTrip({
          tripData: {
            trip_date: r.trip_date,
            is_subcontractor: r.is_subcontractor ? 1 : 0,
            vehicle_plate: r.vehicle_plate || 'XE NGOÀI',
            subcontractor_name: r.subcontractor_name || null,
            customer_name: r.customer_name,
            route_name: r.route_name || null,
            container_number: r.container_number || null,
            container_size: r.container_size || '40',
            trip_revenue: r.trip_revenue || 0,
            subcontractor_cost: r.subcontractor_cost || 0,
            toll_fee: r.toll_fee || 0,
            fuel_liters: r.fuel_liters || 0,
            other_costs: r.other_costs || 0,
            customer_payment_status: r.customer_payment_status || 'CHUA_TT',
            subcontractor_payment_status: r.subcontractor_payment_status || 'CHUA_TT',
            group_id: r.group_id || null,
            source_type: 'EXCEL',
            notes: r.notes || null
          },
          user,
          ipAddress
        });

        // Cập nhật thông tin truy vết nguồn vào trips
        db.prepare(`
          UPDATE trips 
          SET source_file = ?, source_sheet = ?, source_row = ?, raw_data = ?
          WHERE id = ?
        `).run(filename, sheetName, r.source_row || null, JSON.stringify({ batch_id: batchId, ...r }), created.id);

        insertedTrips.push(created);
      }

      // Lưu đợt nhập vào bảng import_batches
      db.prepare(`
        INSERT INTO import_batches (
          id, batch_name, file_name, sheet_name, total_rows, total_revenue, total_cost, created_by, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(
        batchId,
        `Nhập Excel ${filename} (${insertedTrips.length} cuốc)`,
        filename,
        sheetName,
        insertedTrips.length,
        totalRev,
        totalCost,
        user?.username || 'SYSTEM',
        now
      );

      db.prepare('UPDATE import_batches SET file_hash=? WHERE id=?').run(signature,batchId);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    // Phát tín hiệu cập nhật toàn hệ thống P&L
    broadcastPLUpdate('TRIP_CREATED', {
      trigger: 'EXCEL_IMPORTED',
      reason: `Đã nạp thành công đợt nhập ${filename}: ${insertedTrips.length} cuốc xe`
    });

    return {
      batch_id: batchId,
      inserted_count: insertedTrips.length,
      trip_ids: insertedTrips.map(t => t.id),
      total_revenue: totalRev,
      total_cost: totalCost
    };
  }

  /**
   * Hoàn tác toàn bộ các cuốc xe thuộc một đợt nhập Excel
   */
  static rollbackBatch({ batchId, user }) {
    if (!batchId) throw new Error('Mã đợt nhập (batchId) là bắt buộc');

    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId);
    if (!batch) throw new Error(`Không tìm thấy đợt nhập: ${batchId}`);
    if (batch.status === 'ROLLED_BACK') throw new Error(`Đợt nhập ${batchId} đã được hoàn tác trước đó.`);

    db.exec('BEGIN TRANSACTION;');
    let deletedCount = 0;
    try {
      // 1. Tìm các trip liên quan
      const trips = db.prepare('SELECT * FROM trips WHERE raw_data LIKE ?').all(`%${batchId}%`).filter(t=>{try{return JSON.parse(t.raw_data).batch_id===batchId;}catch{return false;}});
      for(const trip of trips){
        if(trip.is_locked||trip.updated_at!==trip.created_at||db.prepare('SELECT 1 FROM trip_advances WHERE trip_id=? LIMIT 1').get(trip.id)||db.prepare('SELECT 1 FROM expenses WHERE trip_id=? AND (source_component IS NULL OR updated_at<>created_at) LIMIT 1').get(trip.id)||db.prepare("SELECT 1 FROM director_history WHERE record_id=? LIMIT 1").get(trip.id))throw Error('Không thể hoàn tác: cuốc đã được chỉnh sửa, khóa hoặc có giao dịch liên quan.');
      }
      for(const trip of trips){db.prepare('DELETE FROM expenses WHERE trip_id=?').run(trip.id);db.prepare('DELETE FROM containers WHERE trip_id=?').run(trip.id);db.prepare('DELETE FROM trips WHERE id=?').run(trip.id);deletedCount++;}
      // Cập nhật trạng thái batch
      db.prepare(`
        UPDATE import_batches 
        SET status = 'ROLLED_BACK', notes = ? 
        WHERE id = ?
      `).run(`Đã hoàn tác bởi ${user?.username || 'SYSTEM'} lúc ${new Date().toISOString()}`, batchId);

      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }

    return {
      success: true,
      batch_id: batchId,
      deleted_trips: deletedCount
    };
  }
}

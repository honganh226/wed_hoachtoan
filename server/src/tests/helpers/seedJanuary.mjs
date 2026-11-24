/**
 * Nạp 77 cuốc tháng 1/2026 từ `tháng 1.xlsx` vào DB kiểm thử (25/11/2026).
 * Lý do: từ 06/11/2026 dữ liệu không còn đọc thẳng từ Excel mà lấy từ bảng `trips`;
 * DB local thường trống vì dữ liệu thật nằm trên Supabase, nên test cần tự nạp.
 * Chỉ dùng cho DB kiểm thử. Không đụng tới file Excel nguồn (chỉ đọc).
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const JANUARY_EXCEL_PATH = fileURLToPath(new URL('../../../../tháng 1.xlsx', import.meta.url));

export async function seedJanuaryIfMissing({ excelPath = process.env.EXCEL_PATH || JANUARY_EXCEL_PATH } = {}) {
  const { db } = await import('../../db/database.js');
  const { ExcelImportService } = await import('../../services/excelImportService.js');
  const { invalidateExcelMonthCache } = await import('../../services/excelMonthService.js');

  const existing = db.prepare(
    "SELECT COUNT(*) AS n FROM trips WHERE trip_date >= '2026-01-01' AND trip_date <= '2026-01-31' AND source_type = 'EXCEL'"
  ).get().n;
  if (existing >= 77) return { seeded: false, existing };
  if (!fs.existsSync(excelPath)) throw new Error(`Không tìm thấy file Excel kiểm thử: ${excelPath}`);

  // Bỏ khóa sổ tháng 1 nếu DB kiểm thử đang khóa (chỉ trong DB kiểm thử)
  const lockedJanuary = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='period_locks'").get()
    ? db.prepare("SELECT COUNT(*) AS n FROM period_locks WHERE period_month = '2026-01' AND is_locked = 1").get().n
    : 0;
  if (lockedJanuary) throw new Error('DB kiểm thử đang khóa sổ tháng 01/2026; không thể nạp dữ liệu mẫu.');

  const preview = ExcelImportService.parseAndPreview({ buffer: fs.readFileSync(excelPath), filename: 'tháng 1.xlsx' });
  const director = db.prepare("SELECT id, username FROM users WHERE role = 'DIRECTOR' LIMIT 1").get()
    || { id: 'test-seed-director', username: 'test-seed' };
  const result = ExcelImportService.commitImport({
    rows: preview.rows,
    filename: 'tháng 1.xlsx',
    sheetName: preview.sheet_name,
    user: { ...director, userId: director.id, role: 'DIRECTOR' },
    confirmDuplicates: true,
  });
  invalidateExcelMonthCache();
  return { seeded: true, inserted: result.inserted_count, preview_rows: preview.rows.length };
}

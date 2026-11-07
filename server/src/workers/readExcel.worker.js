import { parentPort, workerData } from 'node:worker_threads';
import XLSX from 'xlsx';

try {
  const workbook = XLSX.read(Buffer.from(workerData), {type:'buffer',cellFormula:true,cellStyles:true,sheetRows:10002});
  if (workbook.SheetNames.length > 100) throw new Error('Too many sheets');
  for (const sheet of Object.values(workbook.Sheets)) {
    const range = sheet['!fullref'] || sheet['!ref'];
    if (range && XLSX.utils.decode_range(range).e.r >= 10002) throw new Error('Too many rows');
  }
  parentPort.postMessage({workbook});
} catch {
  parentPort.postMessage({error:'Không thể đọc file Excel. Kiểm tra định dạng, mật khẩu bảo vệ và kích thước bảng.'});
}

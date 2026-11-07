import { Worker } from 'node:worker_threads';
import { isExcelFile } from '../utils/uploadSecurity.js';

let activeWorkers = 0;

export function readUploadedWorkbook(buffer, filename) {
  if (!isExcelFile(buffer, filename)) {
    const error = new Error('Tệp phải là file Excel .xlsx hoặc .xls hợp lệ.');
    error.status = 400;
    throw error;
  }
  if (activeWorkers >= 2) {
    const error = new Error('Đang xử lý file Excel khác. Vui lòng thử lại sau vài giây.');
    error.status = 429;
    throw error;
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/readExcel.worker.js', import.meta.url), {
      workerData: buffer,
      resourceLimits: {maxOldGenerationSizeMb:128, maxYoungGenerationSizeMb:32, stackSizeMb:4},
    });
    activeWorkers++;
    let finished = false;
    const finish = (error, workbook) => {
      if (finished) return;
      finished = true;
      activeWorkers--;
      clearTimeout(timeout);
      void worker.terminate();
      if (error) { error.status = 400; reject(error); } else resolve(workbook);
    };
    const timeout = setTimeout(() => finish(new Error('File Excel quá phức tạp hoặc xử lý quá lâu. Vui lòng chia nhỏ file.')), 10000);
    worker.once('message', message => finish(message.error ? new Error(message.error) : null, message.workbook));
    worker.once('error', () => finish(new Error('File Excel vượt giới hạn xử lý an toàn.')));
    worker.once('exit', () => { if (!finished) finish(new Error('Không đọc được file Excel.')); });
  });
}

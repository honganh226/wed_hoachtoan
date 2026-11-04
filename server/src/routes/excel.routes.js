import { Router } from 'express';
import multer from 'multer';
import { ExcelImportService } from '../services/excelImportService.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES } from '../db/schema.js';
import { db } from '../db/database.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

const router = Router();
db.exec("CREATE TABLE IF NOT EXISTS import_previews(id TEXT PRIMARY KEY,owner TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL)");
if(!db.prepare('PRAGMA table_info(import_batches)').all().some(c=>c.name==='file_hash'))db.exec('ALTER TABLE import_batches ADD COLUMN file_hash TEXT');

router.use(authenticateToken);
router.use(requireRole([USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT, USER_ROLES.AREA_MANAGER]));

/**
 * POST /api/v1/excel/preview
 * Tải file Excel lên để phân tích, xem trước và đối chiếu chống trùng
 */
router.post('/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'Vui lòng chọn tệp Excel (.xlsx, .xls) để tải lên', 400);
    }
    const preview = ExcelImportService.parseAndPreview({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mapping: req.body.mapping ? JSON.parse(req.body.mapping) : null,
      sheetName: req.body.sheet_name || req.body.sheetName || null
    });
    const previewId=crypto.randomUUID();
    db.prepare('INSERT INTO import_previews VALUES(?,?,?,?)').run(previewId,req.user.username,JSON.stringify(preview),Date.now());
    return successResponse(res, {...preview,preview_id:previewId}, 'Phân tích tệp Excel thành công');
  } catch (err) {
    if (err.message && !err.message.includes('SqliteError')) {
      return errorResponse(res, err.message, 400);
    }
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/excel/commit
 * Xác nhận nhập các dòng đã kiểm tra vào cơ sở dữ liệu
 */
router.post('/commit', (req, res) => {
  try {
    const stored=db.prepare('SELECT * FROM import_previews WHERE id=? AND owner=?').get(req.body.preview_id,req.user.username);
    if(!stored||Date.now()-stored.created_at>24*60*60*1000)return errorResponse(res,'Bản xem trước hết hạn. Tải lại file.',400);
    const preview=JSON.parse(stored.payload);
    const {filename,sheet_name:sheetName}=preview;
    const rows=preview.rows.filter(r=>!r.duplicate_candidate||req.body.confirm_duplicates===true);
    if(!rows.length)return successResponse(res,{inserted_count:0,already_imported:true},'Không có dòng mới; các dòng nghi trùng được giữ để đối chiếu.');
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = ExcelImportService.commitImport({
      rows,
      filename: filename || 'import_file.xlsx',
      sheetName: sheetName || 'Sheet1',
      user: req.user,
      ipAddress
    });
    return successResponse(res, result, `Đã nhập thành công ${result.inserted_count} cuốc xe vào hệ thống`, 201);
  } catch (err) {
    if (err.message && !err.message.includes('SqliteError')) {
      return errorResponse(res, err.message, 400);
    }
    return serverErrorResponse(res, err);
  }
});

/**
 * GET /api/v1/excel/batches
 * Lấy lịch sử các đợt nhập file
 */
router.get('/batches', (req, res) => {
  try {
    const batches = db.prepare('SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 20').all();
    return successResponse(res, batches, 'Lấy lịch sử đợt nhập thành công');
  } catch (err) {
    if (err.message && !err.message.includes('SqliteError')) {
      return errorResponse(res, err.message, 400);
    }
    return serverErrorResponse(res, err);
  }
});

/**
 * POST /api/v1/excel/batches/:id/rollback
 * Hoàn tác có kiểm soát một đợt nhập (xóa các chuyến xe của đợt nhập nếu chưa khóa sổ)
 */
router.post('/batches/:id/rollback', requireRole(USER_ROLES.DIRECTOR), (req, res) => {
  try {
    const result=ExcelImportService.rollbackBatch({batchId:req.params.id,user:req.user});
    return successResponse(res,result,'Đã hoàn tác đúng đợt nhập');
  } catch (err) {
    if (err.message && !err.message.includes('SqliteError')) {
      return errorResponse(res, err.message, 400);
    }
    return serverErrorResponse(res, err);
  }
});

export default router;

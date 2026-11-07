/**
 * ============================================================
 * HỆ THỐNG QUẢN LÝ ĐIỀU VẬN CONTAINER - BACKEND API SERVER
 * ============================================================
 * Port: 5000 (Hợp đồng kỹ thuật bất biến)
 * Tất cả API đều có tiền tố: /api/v1/
 * ============================================================
 */
import 'dotenv/config';
import { idempotentWrites } from './middlewares/idempotency.middleware.js';
import { readOnlyTest } from './middlewares/readOnlyTest.middleware.js';
import express from 'express';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { protectApi, corsOptions } from './middlewares/security.middleware.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import healthRoutes from './routes/health.routes.js';
import backupRoutes from './routes/backup.routes.js';
import dataRoutes from './routes/data.routes.js';
import authRoutes from './routes/auth.routes.js';
import periodLockRoutes from './routes/periodLock.routes.js';
import auditRoutes from './routes/audit.routes.js';
import tripRoutes from './routes/trip.routes.js';
import advanceRoutes from './routes/advance.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import plRoutes from './routes/pl.routes.js';
import kpiRoutes from './routes/kpi.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import aiRoutes from './routes/ai.routes.js';
import helpRoutes from './routes/help.routes.js';
import businessRoutes from './routes/business.routes.js';
import excelRoutes from './routes/excel.routes.js';
import directorDataRoutes from './routes/directorData.routes.js';
import { initializeDurableState,durableWrites } from './services/durableState.service.js';
import { initOffsiteBackupScheduler } from './services/offsiteBackup.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const durableReady = await initializeDurableState();
if (process.env.ONLINE_EDITING === 'true') process.env.RENDER_READ_ONLY = durableReady ? 'false' : 'true';
const app = express();
app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '5000', 10);

// =============================================
// CẤU HÌNH MIDDLEWARE TOÀN CỤC
// =============================================

// Bảo mật HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: { directives: { frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:', 'blob:'], objectSrc: ["'none'"] } },
  frameguard: { action: 'deny' },
}));

// CORS - cho phép frontend origin và domain Railway
app.use(cors(corsOptions));

// Parse JSON và URL-encoded body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging (dev mode) - Bảo vệ an toàn: Không ghi nguyên văn token trong query URL ra log
morgan.token('url', (req) => {
  const url = req.originalUrl || req.url || '';
  return url.replace(/([?&]token=)[^&]+/gi, '$1[REDACTED]');
});

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

import { authenticateToken } from './middlewares/auth.middleware.js';

// =============================================
// KIỂM SOÁT BẢO MẬT MÔI TRƯỜNG PRODUCTION (Yêu cầu 2)
// =============================================
const FORBIDDEN_SECRETS = [
  'hoachtoan_jwt_secret_key_change_in_production_2026_super_long_string',
  'thay_the_bang_chuoi_bi_mat_ngau_nhien_64_ky_tu_truoc_khi_khoi_chay_online',
  'production_super_secret_jwt_key_wed_hoachtoan_2026_change_me',
  'your_jwt_secret_here',
  'change_this_secret'
];
const jwtSecret = process.env.JWT_SECRET;

if (process.env.NODE_ENV === 'production') {
  const isForbidden = !jwtSecret || 
    jwtSecret.trim() === '' || 
    jwtSecret.length < 32 || 
    FORBIDDEN_SECRETS.includes(jwtSecret.trim()) ||
    jwtSecret.includes('thay_the_bang_chuoi') ||
    jwtSecret.includes('change_in_production');

  if (isForbidden) {
    console.error('========================================================================');
    console.error('[FATAL SECURITY ERROR] Bản Production bắt buộc phải cấu hình JWT_SECRET!');
    console.error('Không được dùng khóa mặc định, placeholder từ .env.example hoặc chuỗi < 32 ký tự.');
    console.error('Vui lòng chạy script sinh khóa an toàn và thiết lập JWT_SECRET trong file .env');
    console.error('========================================================================');
    process.exit(1);
  }
}

// Serve file upload (ảnh phơi container, chứng từ): Bắt buộc người dùng có phiên đăng nhập hợp lệ
app.use('/uploads', authenticateToken, (req, res, next) => {
  if (!/^\/eir\/[^/]+\.(?:jpg|jpeg|png|webp)$/i.test(req.path)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
}, express.static(path.join(__dirname, '../uploads'), { dotfiles: 'deny', index: false }));

// =============================================
// ĐĂNG KÝ CÁC ROUTE API
// =============================================

// Tiền tố chuẩn: /api/v1/ (Hợp đồng kỹ thuật)
app.use('/api/v1', readOnlyTest);
app.use('/api/v1', protectApi);
app.use('/api/v1', durableWrites);
app.use('/api/v1', idempotentWrites);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/backup', backupRoutes);
app.use('/api/v1/data', dataRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/period-lock', periodLockRoutes);
app.use('/api/v1/audit-logs', auditRoutes);
app.use('/api/v1/trips', tripRoutes);
app.use('/api/v1/advances', advanceRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/pl', plRoutes);
app.use('/api/v1/kpi', kpiRoutes);
app.use('/api/v1/payroll', payrollRoutes);
// Tính năng Bảo dưỡng xe đã ngừng sử dụng (06/11/2026): trả 410 để client cũ nhận thông báo rõ ràng, không lặp yêu cầu.
app.use('/api/v1/maintenance', (req, res) => {
  res.status(410).json({ success: false, code: 'FEATURE_DISCONTINUED', error: 'Tính năng Bảo dưỡng xe đã ngừng sử dụng. Chi phí sửa chữa nhập tại mục Chi phí.' });
});
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/help', helpRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/excel', excelRoutes);
app.use('/api/v1/manage', directorDataRoutes);

// Serve thư mục client/dist (nếu đã build) cho môi trường Production / Windows Service
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
const hasClientDist = fs.existsSync(CLIENT_DIST);

// Never route sensitive filesystem-looking paths to the SPA.
app.use((req, res, next) => {
  if (/(^|\/)\.(?:git|env|npmrc)(?:[/.]|$)/i.test(req.path) || /\.(?:sqlite|db|pem|key|sql|log|map)$/i.test(req.path)) {
    return res.status(404).json({success:false,error:'Không tìm thấy tài nguyên.'});
  }
  next();
});

if (hasClientDist) {
  console.log('[STATIC] Phục vụ Frontend PWA từ thư mục client/dist...');
  app.use(express.static(CLIENT_DIST));
}

// Route gốc - thông tin server hoặc SPA fallback
app.get('/api/v1/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Hệ Thống Điều Vận Container - API Server',
      version: '1.0.0',
      port: PORT,
      apiPrefix: '/api/v1',
      hasClientDist,
      endpoints: {
        health: '/api/v1/health',
        backup: '/api/v1/backup',
      },
    },
    message: 'Server đang chạy bình thường.',
  });
});

if (hasClientDist) {
  // SPA Fallback: Các route không phải API đều trả về index.html của React
  // Đặt no-cache cho index.html để khi cập nhật giao diện, trình duyệt từ xa luôn nhận bản mới nhất
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Hệ Thống Điều Vận Container - API Server',
        version: '1.0.0',
        port: PORT,
        apiPrefix: '/api/v1',
      },
      message: 'Server đang chạy. Hãy build client (npm run build) để phục vụ giao diện tại port này.',
    });
  });
}

// =============================================
// XỬ LÝ LỖI TOÀN CỤC
// =============================================

// 404 - Route không tìm thấy
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: 'Không tìm thấy endpoint.',
  });
});

// 500 - Lỗi nội bộ server
app.use((err, req, res, _next) => {
  console.error('[UNHANDLED ERROR]', err);
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : (Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500);
  res.status(status).json({
    success: false,
    data: null,
    error: status === 413 ? 'Tệp hoặc yêu cầu vượt giới hạn dung lượng.' : status === 403 ? 'Nguồn truy cập không được phép.' : process.env.NODE_ENV === 'development'
      ? err.message
      : 'Lỗi máy chủ nội bộ. Vui lòng thử lại.',
  });
});

// =============================================
// KHỞI ĐỘNG SERVER
// =============================================
if (process.env.NODE_ENV !== 'test' || process.env.SERVE_TEST === 'true') {
  app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   HỆ THỐNG ĐIỀU VẬN CONTAINER - API SERVER ĐÃ KHỞI ĐỘNG║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Backend API:  http://localhost:${PORT}                  ║`);
    console.log(`║  Health Check: http://localhost:${PORT}/api/v1/health    ║`);
    console.log(`║  Môi trường:   ${(process.env.NODE_ENV || 'development').padEnd(36)}  ║`);
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');

    // Khởi động bộ lập lịch sao lưu tự động hàng đêm lúc 23:59 (Task 7.4)
    if (process.env.RENDER_READ_ONLY !== 'true') initOffsiteBackupScheduler();
  });
}

export default app;

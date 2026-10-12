/**
 * Route kiểm tra sức khỏe server (Health Check)
 * GET /api/v1/health - Kiểm tra server và database đang hoạt động
 */
import { Router } from 'express';
import { successResponse } from '../utils/response.js';
import db from '../db/database.js';

const router = Router();

/**
 * GET /api/v1/health
 * Endpoint kiểm tra hệ thống - dùng cho frontend ping kết nối
 */
router.get('/', (req, res) => {
  try {
    // Kiểm tra database bằng truy vấn đơn giản
    const dbCheck = db.prepare('SELECT 1 AS ok').get();
    const journalMode = db.pragma('journal_mode', { simple: true });

    return successResponse(res, {
      server: 'online',
      database: dbCheck?.ok === 1 ? 'online' : 'error',
      journalMode,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    }, 'Hệ thống hoạt động bình thường');
  } catch (err) {
    return res.status(503).json({
      success: false,
      data: null,
      error: `Database không phản hồi: ${err.message}`,
    });
  }
});

export default router;

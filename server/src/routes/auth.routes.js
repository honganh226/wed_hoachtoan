import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, getCurrentUser, getDemoAccounts } from '../controllers/auth.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';

const router = Router();

// Giới hạn tần suất đăng nhập (Chống dò quét Brute Force)
// Tối đa 15 lần thử trong 1 phút trên cùng 1 IP
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng đợi 1 phút trước khi thử lại.'
  }
});

// POST /api/v1/auth/login
router.post('/login', loginLimiter, login);

// POST /api/v1/auth/logout
router.post('/logout', logout);

// GET /api/v1/auth/me (Yêu cầu Token)
router.get('/me', authenticateToken, getCurrentUser);

// GET /api/v1/auth/demo-accounts (Chỉ cho phép Giám Đốc hoặc trong môi trường dev nội bộ)
router.get('/demo-accounts', authenticateToken, getDemoAccounts);

export default router;

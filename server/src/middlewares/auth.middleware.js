import jwt from 'jsonwebtoken';
import { errorResponse } from '../utils/response.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hoachtoan_jwt_secret_key_change_in_production_2026_super_long_string';

/**
 * Middleware xác thực token JWT
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Định dạng: Bearer <token>

  // Hỗ trợ token qua query string (cho các tác vụ tải file trực tiếp từ trình duyệt)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return errorResponse(res, 'Chưa đăng nhập. Vui lòng cung cấp mã xác thực Token.', 401);
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return errorResponse(res, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
      }
      return errorResponse(res, 'Token không hợp lệ hoặc đã bị thay đổi.', 403);
    }

    req.user = {
      ...decodedUser,
      userId: decodedUser.userId || decodedUser.id,
      areaId: decodedUser.areaId || decodedUser.area_id
    };
    next();
  });
}

import jwt from 'jsonwebtoken';
import { errorResponse } from '../utils/response.js';
import { db } from '../db/database.js';

const DEFAULT_JWT_SECRET = 'hoachtoan_jwt_secret_key_change_in_production_2026_super_long_string';

/**
 * Middleware xác thực token JWT
 */
export function authenticateToken(req, res, next) {
  const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Định dạng: Bearer <token>

  // Hỗ trợ token qua query string (cho các tác vụ tải file trực tiếp từ trình duyệt)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return errorResponse(res, 'Chưa đăng nhập. Vui lòng cung cấp mã xác thực Token.', 401);
  }

  jwt.verify(token, jwtSecret, (err, decodedUser) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return errorResponse(res, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
      }
      return errorResponse(res, 'Token không hợp lệ hoặc đã bị thay đổi.', 403);
    }

    let dbUser = null;
    try {
      const uid = decodedUser.userId ?? decodedUser.id;
      const uname = decodedUser.username;
      if (uid !== undefined && uid !== null) {
        dbUser = db.prepare('SELECT id, username, role, is_active, area_id FROM users WHERE id = ? LIMIT 1').get(String(uid));
      }
      if (!dbUser && uname) {
        dbUser = db.prepare('SELECT id, username, role, is_active, area_id FROM users WHERE username = ? LIMIT 1').get(String(uname));
      }
    } catch (_) {}

    if (dbUser && Number(dbUser.is_active) === 0) {
      return errorResponse(res, 'Tài khoản đã bị khóa hoặc ngừng hoạt động.', 403);
    }

    const tokenRole = decodedUser.role;
    const dbRole = dbUser?.role || null;
    const effectiveRole = dbRole && dbRole !== tokenRole ? dbRole : tokenRole;

    req.user = {
      ...decodedUser,
      id: dbUser?.id || decodedUser.id || decodedUser.userId,
      userId: dbUser?.id || decodedUser.userId || decodedUser.id,
      username: dbUser?.username || decodedUser.username,
      role: effectiveRole,
      tokenRole,
      dbRole,
      areaId: dbUser?.area_id || decodedUser.areaId || decodedUser.area_id
    };
    next();
  });
}

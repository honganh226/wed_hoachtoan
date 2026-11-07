import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { successResponse, errorResponse, serverErrorResponse } from '../utils/response.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hoachtoan_jwt_secret_key_change_in_production_2026_super_long_string';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Controller Đăng Nhập
 */
export async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || username.length > 100 || Buffer.byteLength(password, 'utf8') > 72) {
      return errorResponse(res, 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.', 400);
    }

    const trimmedUsername = username.trim().toLowerCase();

    // Tìm kiếm người dùng trong cơ sở dữ liệu SQLite
    const user = db.prepare(`
      SELECT id, username, password_hash, full_name, role, area_id, phone, is_active 
      FROM users 
      WHERE LOWER(username) = ?
    `).get(trimmedUsername);

    if (!user) {
      return errorResponse(res, 'Tên đăng nhập hoặc mật khẩu không chính xác.', 401);
    }

    if (user.is_active !== 1) {
      return errorResponse(res, 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Giám đốc.', 403);
    }

    // So khớp mật khẩu với hash bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return errorResponse(res, 'Tên đăng nhập hoặc mật khẩu không chính xác.', 401);
    }

    // Giao diện tài xế đã ngừng sử dụng: giữ nguyên tài khoản nhưng không cấp phiên đăng nhập.
    // Không chuyển sang màn hình quản trị và không cấp thêm quyền.
    if (user.role === 'DRIVER') {
      return res.status(403).json({
        success: false,
        code: 'DRIVER_UI_DISCONTINUED',
        error: 'Giao diện tài xế đã ngừng sử dụng. Tài khoản của bạn vẫn được lưu giữ; vui lòng liên hệ Giám đốc hoặc Kế toán để được hỗ trợ.'
      });
    }

    // Payload ký JWT tuân thủ Hợp đồng kỹ thuật (Mục C - RBAC Payload Contract)
    const payload = {
      id: user.id,
      userId: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      area_id: user.area_id,
      areaId: user.area_id
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return successResponse(res, {
      token,
      expiresIn: JWT_EXPIRES_IN,
      user: {
        id: user.id,
        userId: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        area_id: user.area_id,
        areaId: user.area_id,
        phone: user.phone
      }
    }, 'Đăng nhập thành công');
  } catch (error) {
    return serverErrorResponse(res, error);
  }
}

/**
 * Controller Đăng Xuất
 */
export function logout(req, res) {
  return successResponse(res, null, 'Đăng xuất thành công');
}

/**
 * Lấy thông tin phiên người dùng hiện tại
 */
export function getCurrentUser(req, res) {
  try {
    const user = db.prepare(`
      SELECT id, username, full_name, role, area_id, phone, is_active, created_at 
      FROM users 
      WHERE id = ?
    `).get(req.user.id);

    if (!user || user.is_active !== 1) {
      return errorResponse(res, 'Tài khoản không tồn tại hoặc đã bị khóa.', 404);
    }

    return successResponse(res, { user }, 'Lấy thông tin tài khoản thành công');
  } catch (error) {
    return serverErrorResponse(res, error);
  }
}

/**
 * Lấy danh sách tài khoản mẫu (phục vụ Demo & Quick Switch vai trò)
 */
export function getDemoAccounts(req, res) {
  try {
    const accounts = db.prepare(`
      SELECT id, username, full_name, role, area_id, phone 
      FROM users 
      WHERE is_active = 1 AND role <> 'DRIVER'
      ORDER BY 
        CASE role
          WHEN 'DIRECTOR' THEN 1
          WHEN 'ACCOUNTANT' THEN 2
          WHEN 'SECRETARY' THEN 3
          WHEN 'AREA_MANAGER' THEN 4
          WHEN 'DRIVER' THEN 5
          ELSE 6
        END, username ASC
    `).all();

    return successResponse(res, { accounts }, 'Danh sách tài khoản hệ thống');
  } catch (error) {
    return serverErrorResponse(res, error);
  }
}

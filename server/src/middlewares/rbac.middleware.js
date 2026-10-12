import { errorResponse } from '../utils/response.js';
import { USER_ROLES } from '../db/schema.js';

/**
 * Middleware kiểm tra quyền theo danh sách vai trò cho phép
 * @param  {...string} allowedRoles - Danh sách vai trò được phép truy cập (VD: USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT...)
 */
export function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Yêu cầu đăng nhập trước khi thực hiện thao tác này.', 401);
    }

    const userRole = req.user.role;

    if (!roles.includes(userRole)) {
      return errorResponse(
        res,
        `Quyền truy cập bị từ chối. Vai trò [${userRole}] không được phép thực hiện hành động này. Yêu cầu: [${roles.join(', ')}]`,
        403
      );
    }

    next();
  };
}

/**
 * Middleware phân vùng dữ liệu theo phạm vi quyền (Scope Filter)
 * - DIRECTOR, ACCOUNTANT: Toàn quyền xem mọi khu vực
 * - AREA_MANAGER: Chỉ xem các dữ liệu thuộc khu vực của mình (req.user.area_id)
 * - DRIVER: Chỉ xem chuyến và dữ liệu của chính mình
 */
export function scopeDataFilter(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 'Yêu cầu đăng nhập để lọc dữ liệu theo phạm vi.', 401);
  }

  const { role, area_id, id: userId, full_name } = req.user;

  req.dataScope = {
    role,
    area_id,
    userId,
    full_name,
    isAll: role === USER_ROLES.DIRECTOR || role === USER_ROLES.ACCOUNTANT,
    isAreaOnly: role === USER_ROLES.AREA_MANAGER,
    isDriverOnly: role === USER_ROLES.DRIVER
  };

  next();
}

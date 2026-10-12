/**
 * ============================================================
 * PERIOD LOCK MIDDLEWARE - WED_HOACHTOAN
 * ============================================================
 * Chặn các thao tác thay đổi dữ liệu (POST, PUT, PATCH, DELETE)
 * nếu ngày của cuốc xe / chi phí / tạm ứng thuộc kỳ tháng đã bị khóa sổ.
 * ============================================================
 */
import { isPeriodLocked } from '../services/periodLock.service.js';
import { db } from '../db/database.js';
import { errorResponse } from '../utils/response.js';

/**
 * Middleware kiểm tra xem ngày hoặc bản ghi mục tiêu có thuộc kỳ đã khóa không
 * @param {Object} options
 * @param {string} [options.dateField] - Tên trường ngày trong req.body (mặc định 'trip_date')
 * @param {string} [options.tableName] - Nếu sửa bản ghi theo id trong req.params (e.g. 'trips')
 */
export function checkPeriodLock({ dateField = 'trip_date', tableName = null } = {}) {
  return (req, res, next) => {
    try {
      // 1. Kiểm tra ngày từ req.body (khi tạo mới hoặc cập nhật trực tiếp ngày)
      let targetDate = req.body && req.body[dateField];

      // 2. Nếu không có trong body nhưng có id bản ghi và tableName
      if (!targetDate && tableName && req.params.id) {
        if (tableName === 'trips') {
          const trip = db.prepare('SELECT trip_date, is_locked FROM trips WHERE id = ?').get(req.params.id);
          if (trip) {
            if (trip.is_locked === 1 || isPeriodLocked(trip.trip_date)) {
              return errorResponse(
                res,
                `Kỳ kế toán tháng [${trip.trip_date?.slice(0, 7)}] đã bị KHÓA SỔ. Mọi thao tác chỉnh sửa hoặc xóa cuốc xe này đều bị từ chối. Vui lòng liên hệ Giám Đốc để mở khóa sổ nếu cần sửa chữa.`,
                423 // 423 Locked
              );
            }
          }
        } else if (tableName === 'expenses') {
          const exp = db.prepare('SELECT expense_date, trip_id FROM expenses WHERE id = ?').get(req.params.id);
          if (exp) {
            targetDate = exp.expense_date;
            if (!targetDate && exp.trip_id) {
              const trip = db.prepare('SELECT trip_date FROM trips WHERE id = ?').get(exp.trip_id);
              targetDate = trip?.trip_date;
            }
          }
        }
      }

      // 3. Nếu tìm thấy targetDate, kiểm tra trạng thái khóa
      if (targetDate && isPeriodLocked(targetDate)) {
        const month = targetDate.slice(0, 7);
        return errorResponse(
          res,
          `Kỳ kế toán tháng [${month}] đã bị KHÓA SỔ. Không thể thực hiện thao tác trên chứng từ/cuốc xe thuộc tháng này. Vui lòng liên hệ Giám Đốc để mở khóa sổ.`,
          423 // 423 Locked
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

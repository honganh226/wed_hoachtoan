/**
 * ============================================================
 * EXPENSE ROUTES - WED_HOACHTOAN
 * API Quản Lý Chi Phí Thực Tế & Cảnh Báo Bất Thường (Task 3.4)
 * ============================================================
 * Base prefix: /api/v1/expenses
 * ============================================================
 */
import { Router } from 'express';
import { 
  getTripExpenses, 
  getAllExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense, 
  batchSaveTripExpenses,
  evaluateExpenseAnomaly,
  getExpenseAnalytics,
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABELS
} from '../services/expense.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();

// 1. Danh mục các loại chi phí và nhãn tiếng Việt
router.get('/types', (req, res) => {
  try {
    const list = Object.keys(EXPENSE_TYPES).map(key => ({
      key,
      value: EXPENSE_TYPES[key],
      label: EXPENSE_TYPE_LABELS[key] || key
    }));
    return sendSuccess(res, list, 'Danh mục loại chi phí chuẩn');
  } catch (e) {
    return sendError(res, e.message, 500);
  }
});

// 2. Thống kê chi phí tổng hợp (Analytics)
router.get('/analytics', authenticateToken, (req, res) => {
  try {
    const { month, year } = req.query;
    const data = getExpenseAnalytics({ month, year });
    return sendSuccess(res, data, 'Thống kê phân bổ chi phí thành công');
  } catch (e) {
    return sendError(res, e.message, 500);
  }
});

// 3. Kiểm tra trước bất thường (Real-time dry-run calculation)
router.post('/evaluate', authenticateToken, (req, res) => {
  try {
    const { expenseType, amount, tripId, routeId } = req.body;
    const result = evaluateExpenseAnomaly({ expenseType, amount, tripId, routeId });
    return sendSuccess(res, result, 'Đánh giá cảnh báo bất thường chi phí');
  } catch (e) {
    return sendError(res, e.message, 400);
  }
});

// 4. Lấy chi phí của một chuyến xe cụ thể (kèm cờ đỏ 🔴 và cờ vàng 🟡)
router.get('/trip/:tripId', authenticateToken, (req, res) => {
  try {
    const { tripId } = req.params;
    const data = getTripExpenses(tripId);
    return sendSuccess(res, data, 'Lấy danh sách chi phí chuyến xe thành công');
  } catch (e) {
    return sendError(res, e.message, 404);
  }
});

// 5. Lưu trọn bộ chi phí một chuyến xe (1-Click Batch Save)
router.post('/trip/:tripId/batch', authenticateToken, (req, res) => {
  try {
    const { tripId } = req.params;
    const { expenses } = req.body;
    if (!Array.isArray(expenses)) {
      return sendError(res, 'Dữ liệu expenses phải là danh sách mảng.', 400);
    }
    const result = batchSaveTripExpenses({
      tripId,
      expensesList: expenses,
      user: req.user,
      ipAddress: req.ip
    });
    return sendSuccess(res, result, 'Đã lưu trọn bộ chi phí cuốc xe thành công!');
  } catch (e) {
    const status = e.status || 400;
    return sendError(res, e.message, status);
  }
});

// 6. Lấy danh sách chi phí tổng hợp (có bộ lọc và RBAC)
router.get('/', authenticateToken, (req, res) => {
  try {
    const { tripId, vehicleId, category, expenseType, isAnomaly, limit, offset } = req.query;
    const data = getAllExpenses({
      tripId,
      vehicleId,
      category,
      expenseType,
      isAnomaly: isAnomaly !== undefined ? isAnomaly === 'true' || isAnomaly === '1' : null,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      user: req.user
    });
    return sendSuccess(res, data, 'Lấy danh sách chi phí thành công');
  } catch (e) {
    return sendError(res, e.message, 500);
  }
});

// 7. Thêm mới một khoản chi phí
router.post('/', authenticateToken, (req, res) => {
  try {
    const result = createExpense({
      expenseData: req.body,
      user: req.user,
      ipAddress: req.ip
    });
    return sendSuccess(res, result, 'Thêm mới khoản chi phí thành công', 201);
  } catch (e) {
    const status = e.status || 400;
    return sendError(res, e.message, status);
  }
});

// 8. Cập nhật một khoản chi phí
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const result = updateExpense({
      expenseId: id,
      updateData: req.body,
      user: req.user,
      ipAddress: req.ip
    });
    return sendSuccess(res, result, 'Cập nhật khoản chi phí thành công');
  } catch (e) {
    const status = e.status || 400;
    return sendError(res, e.message, status);
  }
});

// 9. Xóa một khoản chi phí
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const result = deleteExpense({
      expenseId: id,
      user: req.user,
      ipAddress: req.ip
    });
    return sendSuccess(res, result, 'Đã xóa khoản chi phí thành công');
  } catch (e) {
    const status = e.status || 400;
    return sendError(res, e.message, status);
  }
});

export default router;

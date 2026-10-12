/**
 * ============================================================
 * REAL-TIME P&L API ROUTES - WED_HOACHTOAN (TASK 4.1 & TASK 4.2)
 * ============================================================
 * Prefix: /api/v1/pl
 * ============================================================
 */
import { Router } from 'express';
import { 
  calculatePL, 
  registerSSEClient, 
  broadcastPLUpdate, 
  getActiveSSECount,
  expireClientsForTest 
} from '../services/plEngine.service.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { USER_ROLES, TRIP_STATUSES } from '../db/schema.js';
import { db } from '../db/database.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/audit.service.js';

const router = Router();

/**
 * GET /api/v1/pl/events
 * Endpoint Server-Sent Events (SSE) để client kết nối và nhận tín hiệu nhảy số Real-time
 * Bảo mật RBAC: Bắt buộc đăng nhập với vai trò Giám Đốc hoặc Kế Toán
 * Hỗ trợ nhận token qua Header Authorization hoặc Query param ?token=... (cho EventSource)
 */
router.get('/events', authenticateToken, requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT), (req, res) => {
  registerSSEClient(req, res);
});

/**
 * GET /api/v1/pl/summary
 * Lấy toàn bộ số liệu P&L, 2 dòng tiền, cơ cấu chi phí cố định/biến động
 * Bảo mật RBAC: Bắt buộc đăng nhập với vai trò Giám Đốc hoặc Kế Toán
 * Task 4.3: Hỗ trợ bộ lọc thời gian qua query params:
 *   - startDate: YYYY-MM-DD
 *   - endDate: YYYY-MM-DD
 *   - month: YYYY-MM (tương thích ngược)
 *   - year: YYYY (tương thích ngược)
 */
router.get('/summary', authenticateToken, requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT), async (req, res) => {
  try {
    const isTest = process.env.NODE_ENV === 'test' || process.env.IS_TEST === 'true';
    if (isTest && req.query.delay) {
      await new Promise(r => setTimeout(r, parseInt(req.query.delay)));
    }
    const { month, year, areaId, startDate, endDate } = req.query;
    // Kiểm tra thông tin user từ middleware authenticateToken
    const user = req.user || null;

    const plData = calculatePL({ month, year, startDate, endDate, areaId, user });
    
    // Tạo metadata mô tả chu kỳ đang lọc để hiển thị lên UI
    let filterDescription = 'Toàn bộ dữ liệu';
    let filterType = 'ALL';
    if (startDate && endDate) {
      filterDescription = `${startDate} đến ${endDate}`;
      filterType = 'DATE_RANGE';
    } else if (startDate) {
      filterDescription = `Từ ${startDate}`;
      filterType = 'DATE_FROM';
    } else if (month) {
      filterDescription = `Tháng ${month}`;
      filterType = 'MONTH';
    } else if (year) {
      filterDescription = `Năm ${year}`;
      filterType = 'YEAR';
    }

    return res.json({
      success: true,
      data: {
        ...plData,
        sse_active_clients: getActiveSSECount(),
        filter_info: {
          type: filterType,
          description: filterDescription,
          start_date: startDate || null,
          end_date: endDate || null,
          month: month || null,
          year: year || null
        }
      },
      message: 'Lấy dữ liệu P&L thành công'
    });
  } catch (err) {
    console.error('[PL Summary Error]', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: err.message || 'Lỗi khi tính toán P&L'
    });
  }
});

/**
 * POST /api/v1/pl/trigger
 * Cho phép kích hoạt phát tín hiệu SSE chủ động (Manual SSE Broadcast)
 * Bảo mật RBAC: Bắt buộc đăng nhập với vai trò Giám Đốc hoặc Kế Toán
 */
router.post('/trigger', authenticateToken, requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT), (req, res) => {
  try {
    const { event = 'MANUAL_TRIGGER', reason = 'Người dùng làm mới thủ công' } = req.body;
    broadcastPLUpdate(event, { trigger: 'MANUAL', reason, user: req.user?.username });
    return res.json({
      success: true,
      data: {
        activeClients: getActiveSSECount()
      },
      message: 'Đã phát tín hiệu SSE thành công tới các clients'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: null,
      error: err.message
    });
  }
});

/**
 * POST /api/v1/pl/mark-paid
 * Đổi trạng thái thanh toán chuyến sang PAID / CHUA_TT để kiểm thử dòng tiền nhảy số tức thì
 */
router.post('/mark-paid', authenticateToken, requireRole(USER_ROLES.DIRECTOR, USER_ROLES.ACCOUNTANT), (req, res) => {
  try {
    const { tripId, isPaid } = req.body;
    if (!tripId) {
      return res.status(400).json({ success: false, error: 'Thiếu tripId' });
    }

    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy cuốc xe' });
    }

    const newStatus = isPaid ? TRIP_STATUSES.PAID : TRIP_STATUSES.COMPLETED;
    const newEirPaid = isPaid ? 'DA_TT' : 'CHUA_TT';
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE trips 
      SET status = ?, eir_paid_status = ?, updated_at = ?
      WHERE id = ?
    `).run(newStatus, newEirPaid, now, tripId);

    // Ghi Audit Log
    recordAuditLog({
      userId: req.user.userId,
      username: req.user.username,
      action: AUDIT_ACTIONS.UPDATE,
      tableName: 'trips',
      recordId: tripId,
      oldValues: { status: trip.status, eir_paid_status: trip.eir_paid_status },
      newValues: { status: newStatus, eir_paid_status: newEirPaid },
      reason: isPaid ? `Đánh dấu đã thu cước chuyến ${trip.trip_code}` : `Hủy đánh dấu thanh toán ${trip.trip_code}`,
      ipAddress: req.ip
    });

    // Phát tín hiệu SSE Real-time tức thì
    broadcastPLUpdate('TRIP_PAYMENT_STATUS_CHANGED', {
      trigger: 'USER_ACTION',
      reason: `Cập nhật trạng thái thanh toán chuyến ${trip.trip_code} -> ${newStatus}`
    });

    return res.json({
      success: true,
      data: {
        tripId,
        status: newStatus,
        eir_paid_status: newEirPaid
      },
      message: isPaid ? 'Đã xác nhận thu tiền cuốc xe thành công' : 'Đã chuyển cuốc xe về trạng thái chưa thanh toán'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      data: null,
      error: err.message
    });
  }
});

/**
 * POST /api/v1/pl/test-force-expire
 * Endpoint hỗ trợ kiểm thử tự động: phát sự kiện AUTH_EXPIRED cho tất cả client SSE
 */
router.post('/test-force-expire', (req, res) => {
  const isTest = process.env.NODE_ENV === 'test' || process.env.IS_TEST === 'true';
  if (!isTest) {
    return res.status(403).json({ success: false, error: 'Chỉ khả dụng trong môi trường kiểm thử' });
  }
  const expiredCount = expireClientsForTest();
  return res.json({ success: true, message: 'Đã phát tín hiệu AUTH_EXPIRED thành công', expiredCount });
});

let testReportListener = null;
export function setTestReportListener(fn) {
  testReportListener = fn;
}

/**
 * POST /api/v1/pl/test-runner-report
 * Endpoint nhận kết quả kiểm thử tự động từ trình duyệt
 */
router.post('/test-runner-report', (req, res) => {
  const isTest = process.env.NODE_ENV === 'test' || process.env.IS_TEST === 'true';
  if (!isTest) {
    return res.status(403).json({ success: false, error: 'Chỉ khả dụng trong môi trường kiểm thử' });
  }
  if (typeof testReportListener === 'function') {
    testReportListener(req.body);
  }
  return res.json({ success: true, message: 'Đã nhận báo cáo kiểm thử' });
});

export default router;

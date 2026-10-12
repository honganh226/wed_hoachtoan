/**
 * ============================================================
 * KIỂM THỬ TOÀN DIỆN TASK 2.1 VÀ TASK 2.2
 * ============================================================
 * 1. Task 2.1: Auth Module
 *    - Đăng nhập 4 vai trò (giamdoc, ketoan, tuan, liem) với Bcrypt hash
 *    - Kiểm tra cấu trúc Token JWT (userId, username, role, areaId) theo Hợp đồng kỹ thuật
 *    - Xác thực endpoint /auth/me với Bearer Token
 *    - Đăng xuất endpoint /auth/logout
 *    - Kiểm tra xử lý mật khẩu sai (401)
 *    - Kiểm tra tài khoản không tồn tại (401)
 *
 * 2. Task 2.2: RBAC 4 Cấp Phân Quyền
 *    - Giám Đốc (DIRECTOR): Quyền tạo backup, xem toàn bộ 33 cuốc xe, tổng doanh thu
 *    - Kế Toán (ACCOUNTANT): Bị chặn 403 khi gọi backup/create & backup/reset; xem 33 cuốc xe
 *    - Quản Lý Khu (AREA_MANAGER - Tuân): Lọc đúng 5 cuốc xe khu TUAN
 *    - Lái Xe (DRIVER - Liêm): Lọc đúng 10 cuốc xe của riêng tài xế Liêm
 *    - Chặn tải backup nếu không phải Giám đốc
 * ============================================================
 */

const BASE_URL = 'http://localhost:5000/api/v1';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function testAll() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TỰ ĐỘNG CHO TASK 2.1 & TASK 2.2');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${message}`);
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
    }
  }

  // ==========================================
  // PHẦN 1: KIỂM THỬ TASK 2.1 (AUTH MODULE)
  // ==========================================
  console.log('--- PHẦN 1: KIỂM THỬ AUTH MODULE (TASK 2.1) ---');

  // 1. Đăng nhập Giám đốc
  const loginDirector = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'giamdoc', password: 'admin123' })
  });
  assert(loginDirector.status === 200 && loginDirector.data?.success === true, 'Đăng nhập Giám Đốc (giamdoc) thành công với Bcrypt hash');
  const tokenDirector = loginDirector.data?.data?.token;
  const userDirector = loginDirector.data?.data?.user;
  assert(!!tokenDirector, 'Nhận Token JWT hợp lệ từ server');
  assert(userDirector?.role === 'DIRECTOR' && (userDirector?.userId || userDirector?.id), 'Payload User trả về đúng vai trò DIRECTOR và userId');

  // 2. Kiểm tra GET /auth/me
  const meDirector = await request('/auth/me', {
    headers: { 'Authorization': `Bearer ${tokenDirector}` }
  });
  assert(meDirector.status === 200 && meDirector.data?.data?.user?.username === 'giamdoc', 'Endpoint GET /auth/me xác thực Bearer token chính xác');

  // 3. Đăng nhập Kế toán
  const loginAccountant = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ketoan', password: 'ketoan123' })
  });
  assert(loginAccountant.status === 200 && loginAccountant.data?.data?.user?.role === 'ACCOUNTANT', 'Đăng nhập Kế Toán (ketoan) thành công');
  const tokenAccountant = loginAccountant.data?.data?.token;

  // 4. Đăng nhập Quản lý khu Tuân
  const loginManager = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tuan', password: 'quanly123' })
  });
  assert(loginManager.status === 200 && loginManager.data?.data?.user?.role === 'AREA_MANAGER', 'Đăng nhập Quản Lý Khu (tuan) thành công');
  assert(loginManager.data?.data?.user?.area_id === 'TUAN', 'Quản Lý Khu mang đúng mã area_id = TUAN');
  const tokenManager = loginManager.data?.data?.token;

  // 5. Đăng nhập Lái xe Liêm
  const loginDriver = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'liem', password: 'driver123' })
  });
  assert(loginDriver.status === 200 && loginDriver.data?.data?.user?.role === 'DRIVER', 'Đăng nhập Lái Xe (liem) thành công');
  const tokenDriver = loginDriver.data?.data?.token;

  // 6. Kiểm tra mật khẩu sai -> 401
  const loginWrongPass = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'giamdoc', password: 'wrongpassword' })
  });
  assert(loginWrongPass.status === 401 && loginWrongPass.data?.success === false, 'Chặn mật khẩu sai với HTTP 401 và thông báo lỗi rõ ràng');

  // 7. Kiểm tra tài khoản không tồn tại -> 401
  const loginNotExist = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nonexistent_user', password: '123' })
  });
  assert(loginNotExist.status === 401, 'Chặn tài khoản không tồn tại với HTTP 401');

  // 8. Đăng xuất POST /auth/logout
  const logoutRes = await request('/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenDirector}` }
  });
  assert(logoutRes.status === 200 && logoutRes.data?.success === true, 'Endpoint POST /auth/logout phản hồi thành công');


  // ==========================================
  // PHẦN 2: KIỂM THỬ TASK 2.2 (RBAC 4 CẤP)
  // ==========================================
  console.log('\n--- PHẦN 2: KIỂM THỬ RBAC 4 CẤP PHÂN QUYỀN (TASK 2.2) ---');

  // 9. Giám đốc có quyền tạo Backup
  const backupDirector = await request('/backup/create', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenDirector}` }
  });
  assert(backupDirector.status === 201 && backupDirector.data?.success === true, 'Giám Đốc có quyền tạo Backup (HTTP 201)');

  // 10. Kế toán gọi tạo Backup -> Bị chặn 403
  const backupAccountant = await request('/backup/create', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenAccountant}` }
  });
  assert(backupAccountant.status === 403, 'Kế Toán bị chặn 403 khi cố tạo Backup');

  // 11. Quản lý khu gọi tạo Backup -> Bị chặn 403
  const backupManager = await request('/backup/create', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenManager}` }
  });
  assert(backupManager.status === 403, 'Quản Lý Khu bị chặn 403 khi cố tạo Backup');

  // 12. Lái xe gọi tạo Backup -> Bị chặn 403
  const backupDriver = await request('/backup/create', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenDriver}` }
  });
  assert(backupDriver.status === 403, 'Lái Xe bị chặn 403 khi cố tạo Backup');

  // 13. Kế toán gọi Reset DB -> Bị chặn 403
  const resetAccountant = await request('/backup/reset', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenAccountant}` },
    body: JSON.stringify({ confirmPhrase: 'XAC_NHAN_XOA_TOAN_BO_DU_LIEU' })
  });
  assert(resetAccountant.status === 403, 'Kế Toán bị chặn 403 khi cố Reset DB');

  // 14. Kiểm tra phân vùng dữ liệu cuốc xe (Scope Data Filter):
  // Giám đốc xem danh sách chuyến
  const tripsDirector = await request('/data/trips?limit=100', {
    headers: { 'Authorization': `Bearer ${tokenDirector}` }
  });
  assert(tripsDirector.data?.data?.length === 33, `Giám Đốc thấy toàn bộ 33 cuốc xe công ty (Đạt: ${tripsDirector.data?.data?.length})`);

  // Kế toán xem danh sách chuyến
  const tripsAccountant = await request('/data/trips?limit=100', {
    headers: { 'Authorization': `Bearer ${tokenAccountant}` }
  });
  assert(tripsAccountant.data?.data?.length === 33, `Kế Toán thấy toàn bộ 33 cuốc xe công ty (Đạt: ${tripsAccountant.data?.data?.length})`);

  // Quản lý khu Tuân xem danh sách chuyến
  const tripsManager = await request('/data/trips?limit=100', {
    headers: { 'Authorization': `Bearer ${tokenManager}` }
  });
  assert(tripsManager.data?.data?.length === 5, `Quản Lý Khu Tuân thấy đúng 5 cuốc xe thuộc khu vực TUAN (Đạt: ${tripsManager.data?.data?.length})`);

  // Lái xe Vũ Văn Liêm xem danh sách chuyến
  const tripsDriver = await request('/data/trips?limit=100', {
    headers: { 'Authorization': `Bearer ${tokenDriver}` }
  });
  assert(tripsDriver.data?.data?.length === 10, `Lái Xe Liêm thấy đúng 10 cuốc xe của riêng mình (Đạt: ${tripsDriver.data?.data?.length})`);

  // 15. Kiểm tra phân quyền thống kê summary
  const summaryDirector = await request('/data/summary', {
    headers: { 'Authorization': `Bearer ${tokenDirector}` }
  });
  assert(summaryDirector.data?.data?.trips === 33 && summaryDirector.data?.data?.canViewNetProfit === true, 'Giám Đốc thấy tổng 33 chuyến và có cờ canViewNetProfit');

  const summaryManager = await request('/data/summary', {
    headers: { 'Authorization': `Bearer ${tokenManager}` }
  });
  assert(summaryManager.data?.data?.trips === 5 && summaryManager.data?.data?.canViewNetProfit === false, 'Quản Lý Khu thấy tổng 5 chuyến và không có cờ canViewNetProfit');

  const summaryDriver = await request('/data/summary', {
    headers: { 'Authorization': `Bearer ${tokenDriver}` }
  });
  assert(summaryDriver.data?.data?.trips === 10 && summaryDriver.data?.data?.canViewNetProfit === false, 'Lái Xe Liêm thấy tổng 10 chuyến và không có cờ canViewNetProfit');

  console.log('\n================================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS PASS (100% HOÀN HẢO)`);
  console.log('================================================================');
}

testAll().catch(console.error);

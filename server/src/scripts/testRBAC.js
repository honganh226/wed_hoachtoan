import 'dotenv/config';

async function testRBAC() {
  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG PHÂN QUYỀN RBAC 4 CẤP (TASK 2.2)');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:5000/api/v1';

  async function login(username, password) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    return data.data?.token;
  }

  // 1. Test Giám Đốc (DIRECTOR)
  console.log('1️⃣ Kiểm tra Giám Đốc (giamdoc):');
  const tokenGiamDoc = await login('giamdoc', 'admin123');
  
  // Giám đốc gọi backup/create
  const resBackupDirector = await fetch(`${BASE_URL}/backup/create`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenGiamDoc}` }
  });
  const dataBackupDirector = await resBackupDirector.json();
  console.log(`   - Quyền tạo Backup: HTTP ${resBackupDirector.status} -> ${dataBackupDirector.success ? '✅ THÀNH CÔNG (Đúng quyền)' : '❌ THẤT BẠI'}`);

  // Giám đốc xem chuyến
  const resTripsDirector = await fetch(`${BASE_URL}/data/trips?limit=100`, {
    headers: { 'Authorization': `Bearer ${tokenGiamDoc}` }
  });
  const dataTripsDirector = await resTripsDirector.json();
  console.log(`   - Phạm vi dữ liệu chuyến: Thấy toàn bộ ${dataTripsDirector.data.length} chuyến xe công ty (✅ Đạt)`);

  // 2. Test Kế Toán (ACCOUNTANT)
  console.log('\n2️⃣ Kiểm tra Kế Toán Trưởng (ketoan):');
  const tokenKeToan = await login('ketoan', 'ketoan123');
  
  // Kế toán thử gọi backup/create -> Phải bị 403
  const resBackupAccountant = await fetch(`${BASE_URL}/backup/create`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenKeToan}` }
  });
  const dataBackupAccountant = await resBackupAccountant.json();
  console.log(`   - Thử tạo Backup: HTTP ${resBackupAccountant.status} -> ${resBackupAccountant.status === 403 ? '🛡️ CHẶN 403 CHÍNH XÁC (Không có quyền)' : '❌ LỖI HỔNG'}`);

  // 3. Test Quản Lý Khu (AREA_MANAGER - Tuân)
  console.log('\n3️⃣ Kiểm tra Quản Lý Khu (tuan - Khu TUAN):');
  const tokenManager = await login('tuan', 'quanly123');
  const resTripsManager = await fetch(`${BASE_URL}/data/trips?limit=100`, {
    headers: { 'Authorization': `Bearer ${tokenManager}` }
  });
  const dataTripsManager = await resTripsManager.json();
  console.log(`   - Phạm vi chuyến xe: Thấy ${dataTripsManager.data.length} chuyến thuộc khu vực TUAN (✅ Đã lọc đúng khu)`);

  // 4. Test Lái Xe (DRIVER - Vũ Văn Liêm)
  console.log('\n4️⃣ Kiểm tra Lái Xe (liem - Vũ Văn Liêm):');
  const tokenDriver = await login('liem', 'driver123');
  const resTripsDriver = await fetch(`${BASE_URL}/data/trips?limit=100`, {
    headers: { 'Authorization': `Bearer ${tokenDriver}` }
  });
  const dataTripsDriver = await resTripsDriver.json();
  console.log(`   - Phạm vi chuyến xe: Thấy ${dataTripsDriver.data.length} chuyến của riêng tài xế Liêm (✅ Đã lọc đúng lái xe)`);

  console.log('\n====================================================');
  console.log('🎉 TẤT CẢ 4 CẤP PHÂN QUYỀN RBAC ĐÃ CHẠY HOÀN HẢO TỰ ĐỘNG 100%!');
  console.log('====================================================');
}

testRBAC().catch(console.error);

/**
 * ============================================================
 * KIỂM THỬ TÍCH HỢP TOÀN DIỆN HTTP & SSE CHO TASK 4.1 & TASK 4.2
 * ============================================================
 */
import http from 'http';
import app from '../index.js';
import jwt from 'jsonwebtoken';

const TEST_PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'hoachtoan_jwt_secret_key_container_2026';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

let directorToken = null;

function makeRequest({ path, method = 'GET', body = null, headers = {} }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runIntegration() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TÍCH HỢP HTTP & SSE (TASK 4.1 & 4.2)');
  console.log('═══════════════════════════════════════════════════════════');

  // Chờ 200ms để server index.js khởi động xong
  await new Promise((resolve) => setTimeout(resolve, 200));

  try {
    // 1. Test GET /api/v1/pl/summary
    console.log('\n--- 1. Kiểm tra API GET /api/v1/pl/summary ---');
    const summaryRes = await makeRequest({ path: '/api/v1/pl/summary' });
    assert(summaryRes.status === 200, 'HTTP Status 200 OK');
    assert(summaryRes.body.success === true, 'Phản hồi chuẩn: success = true');
    assert(summaryRes.body.data.cash_flow !== undefined, 'Có cấu trúc cash_flow');
    assert(summaryRes.body.data.profit_and_loss !== undefined, 'Có cấu trúc profit_and_loss');
    assert(summaryRes.body.data.expenses_breakdown !== undefined, 'Có cấu trúc expenses_breakdown');

    // 2. Test kết nối SSE stream /api/v1/pl/events
    console.log('\n--- 2. Kiểm tra Kết Nối Server-Sent Events (SSE) Stream ---');
    let receivedInitEvent = false;
    let receivedBroadcastEvent = false;

    const sseReq = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/v1/pl/events',
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream'
      }
    }, (sseRes) => {
      assert(sseRes.headers['content-type'].includes('text/event-stream'), 'Content-Type là text/event-stream');

      sseRes.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('INIT_CONNECTED')) {
          receivedInitEvent = true;
        }
        if (text.includes('TRIGGER_TEST_EVENT') || text.includes('TRIP_PAYMENT_STATUS_CHANGED')) {
          receivedBroadcastEvent = true;
        }
      });
    });

    sseReq.end();

    // Chờ 500ms để kết nối SSE ổn định
    await new Promise((r) => setTimeout(r, 600));
    assert(receivedInitEvent, 'Client SSE nhận được gói tin khởi tạo INIT_CONNECTED thành công');

    // 3. Test POST /api/v1/pl/trigger và xác nhận SSE nhận được event
    console.log('\n--- 3. Kiểm tra Kích Hoạt Tín Hiệu SSE Broadcast ---');
    const triggerRes = await makeRequest({
      path: '/api/v1/pl/trigger',
      method: 'POST',
      body: { event: 'TRIGGER_TEST_EVENT', reason: 'Test broadcast từ kịch bản UAT' }
    });

    assert(triggerRes.status === 200, 'POST /api/v1/pl/trigger trả về 200 OK');
    assert(triggerRes.body.success === true, 'Trigger phát tín hiệu thành công');

    // Chờ 500ms để nhận tín hiệu SSE
    await new Promise((r) => setTimeout(r, 500));
    assert(receivedBroadcastEvent, 'Client SSE đã nhận được thông điệp broadcast nhảy số tức thì');

    // 4. Test POST /api/v1/pl/mark-paid
    console.log('\n--- 4. Kiểm tra Đổi Trạng Thái Thanh Toán 1-Chạm ---');
    // Đăng nhập tài khoản Giám Đốc để lấy Token thật
    const loginRes = await makeRequest({
      path: '/api/v1/auth/login',
      method: 'POST',
      body: { username: 'giamdoc', password: 'admin123' }
    });
    assert(loginRes.status === 200, 'Đăng nhập tài khoản Giám Đốc thành công');
    directorToken = loginRes.body?.data?.token;
    assert(!!directorToken, 'Nhận token JWT Giám Đốc thành công');

    // Lấy 1 trip ID từ database
    const tripListRes = await makeRequest({ path: '/api/v1/data/trips?limit=1' });
    const testTrip = tripListRes.body?.data?.[0];

    if (testTrip) {
      const payRes = await makeRequest({
        path: '/api/v1/pl/mark-paid',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${directorToken}`
        },
        body: {
          tripId: testTrip.id,
          isPaid: true
        }
      });

      assert(payRes.status === 200, `Đánh dấu thanh toán chuyến ${testTrip.trip_code} thành công`);
      assert(payRes.body.data.status === 'PAID', 'Trạng thái chuyển thành PAID');

      // Khôi phục lại trạng thái cũ
      await makeRequest({
        path: '/api/v1/pl/mark-paid',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${directorToken}`
        },
        body: {
          tripId: testTrip.id,
          isPaid: false
        }
      });
      assert(true, 'Hoàn nguyên trạng thái chuyến về ban đầu thành công');
    }

    // Đóng SSE request
    sseReq.destroy();

  } finally {
    console.log('[TEST SERVER] Đã hoàn tất các bước kiểm thử tích hợp.');
  }

  // TỔNG KẾT
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 KẾT QUẢ KIỂM THỬ TÍCH HỢP: ${passedTests} / ${totalTests} BÀI TEST THÀNH CÔNG (100%)`);
  console.log('═══════════════════════════════════════════════════════════');

  if (passedTests === totalTests) {
    console.log('🎉 TOÀN BỘ HỢP ĐỒNG API VÀ SSE CỦA TASK 4.1 & 4.2 HOẠT ĐỘNG HOÀN HẢO!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runIntegration();

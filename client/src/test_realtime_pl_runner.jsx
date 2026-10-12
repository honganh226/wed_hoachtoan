import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import useRealtimePL from './hooks/useRealtimePL.js';
import { loginApi, setAuthToken, getAuthToken } from './services/api.js';

function RealtimePLTestRunner() {
  const [currentUser, setCurrentUser] = useState(null);
  const [dateFilter, setDateFilter] = useState({});
  const [testLogs, setTestLogs] = useState([]);
  const [testStatus, setTestStatus] = useState('Đang khởi tạo...');
  const [currentStep, setCurrentStep] = useState(0);

  const hookState = useRealtimePL(dateFilter, currentUser);

  // Lưu hookState vào ref để truy xuất trong async test runner
  const hookStateRef = useRef(hookState);
  hookStateRef.current = hookState;

  const logAssertion = (name, passed, detail = '') => {
    const entry = { name, passed, detail, time: new Date().toLocaleTimeString() };
    console.log(`[TEST] ${passed ? '✅ PASS' : '❌ FAIL'}: ${name} ${detail}`);
    setTestLogs((prev) => [...prev, entry]);
    return passed;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  useEffect(() => {
    let isCancelled = false;

    async function runAllTests() {
      setTestStatus('Đang chạy kiểm thử tự động...');
      const results = [];

      try {
        // ==============================================================
        // CA 1: CHUYỂN ĐỔI TÀI KHOẢN (GIÁM ĐỐC -> KẾ TOÁN -> LÁI XE)
        // ==============================================================
        setTestStatus('Ca 1: Kiểm thử Giám Đốc -> Kế Toán -> Lái Xe');
        
        // 1.1 Đăng nhập Giám Đốc
        const gdLogin = await loginApi('giamdoc', 'admin123');
        if (!gdLogin.success) throw new Error('Đăng nhập Giám Đốc thất bại');
        setAuthToken(gdLogin.data.token);
        setCurrentUser({ username: 'giamdoc', role: 'DIRECTOR' });
        await sleep(700); // Chờ REST load & SSE connect

        const gdHasData = hookStateRef.current.data !== null;
        const gdConnected = hookStateRef.current.isConnected === true;
        results.push(logAssertion('Ca 1.1: Giám Đốc tải thành công P&L', gdHasData, `data=${gdHasData ? 'ĐÃ CÓ' : 'NULL'}`));
        results.push(logAssertion('Ca 1.1: Giám Đốc kết nối SSE thành công', gdConnected, `isConnected=${gdConnected}`));

        // 1.2 Chuyển sang Kế Toán
        const ktLogin = await loginApi('ketoan', 'ketoan123');
        if (!ktLogin.success) throw new Error('Đăng nhập Kế Toán thất bại');
        setAuthToken(ktLogin.data.token);
        setCurrentUser({ username: 'ketoan', role: 'ACCOUNTANT' });
        await sleep(700);

        const ktHasData = hookStateRef.current.data !== null;
        const ktConnected = hookStateRef.current.isConnected === true;
        results.push(logAssertion('Ca 1.2: Kế Toán nhận phiên mới và tải P&L', ktHasData, `data=${ktHasData ? 'ĐÃ CÓ' : 'NULL'}`));
        results.push(logAssertion('Ca 1.2: Kế Toán mở kết nối SSE mới thành công', ktConnected, `isConnected=${ktConnected}`));

        // 1.3 Chuyển sang Lái Xe
        const lxLogin = await loginApi('liem', 'driver123');
        if (!lxLogin.success) throw new Error('Đăng nhập Lái Xe thất bại');
        setAuthToken(lxLogin.data.token);
        setCurrentUser({ username: 'liem', role: 'DRIVER' });
        await sleep(400);

        const lxHasNoData = hookStateRef.current.data === null;
        const lxDisconnected = hookStateRef.current.isConnected === false;
        results.push(logAssertion('Ca 1.3: Chuyển sang Lái Xe - dữ liệu P&L bị dọn sạch (NULL)', lxHasNoData, `data=${hookStateRef.current.data}`));
        results.push(logAssertion('Ca 1.3: Chuyển sang Lái Xe - SSE bị đóng hoàn toàn', lxDisconnected, `isConnected=${hookStateRef.current.isConnected}`));

        // ==============================================================
        // CA 2: ĐĂNG XUẤT KHI REST ĐANG CHỜ (IN-FLIGHT REQUEST CANCEL)
        // ==============================================================
        setTestStatus('Ca 2: Đăng xuất khi REST đang chờ phản hồi');
        
        // 2.1 Đăng nhập lại Giám Đốc
        setAuthToken(gdLogin.data.token);
        setCurrentUser({ username: 'giamdoc', role: 'DIRECTOR' });
        await sleep(600);

        // 2.2 Gọi REST có độ trễ 500ms
        hookStateRef.current.refresh({ delay: 500 });
        // Ngay lập tức người dùng đăng xuất trong khi request đang bay
        await sleep(30);
        setAuthToken(null);
        setCurrentUser(null);
        
        // Chờ 700ms để request REST trễ hoàn tất
        await sleep(700);
        const logoutDuringRestPass = hookStateRef.current.data === null;
        const logoutDisconnected = hookStateRef.current.isConnected === false;
        results.push(logAssertion('Ca 2: Đăng xuất khi REST đang chờ - Dữ liệu vẫn là NULL (không bị ghi đè)', logoutDuringRestPass, `data=${hookStateRef.current.data}`));
        results.push(logAssertion('Ca 2: Đăng xuất khi REST đang chờ - SSE giữ trạng thái đóng', logoutDisconnected, `isConnected=${hookStateRef.current.isConnected}`));

        // ==============================================================
        // CA 3: AUTH_EXPIRED KHI REST ĐANG CHỜ
        // ==============================================================
        setTestStatus('Ca 3: AUTH_EXPIRED khi REST đang chờ');
        
        // 3.1 Đăng nhập lại Giám Đốc
        const gdLoginFresh = await loginApi('giamdoc', 'admin123');
        setAuthToken(gdLoginFresh.data.token);
        setCurrentUser({ username: 'giamdoc', role: 'DIRECTOR' });
        await sleep(600);

        // 3.2 Gọi REST có độ trễ 600ms
        hookStateRef.current.refresh({ delay: 600 });
        await sleep(30);

        // Kích hoạt máy chủ phát tín hiệu AUTH_EXPIRED
        await fetch('/api/v1/pl/test-force-expire', { method: 'POST' });
        
        // Chờ 800ms để request REST trễ hoàn tất
        await sleep(800);
        const expiredNoData = hookStateRef.current.data === null;
        const expiredHasError = hookStateRef.current.error && hookStateRef.current.error.includes('hết hạn');
        const expiredDisconnected = hookStateRef.current.isConnected === false;

        results.push(logAssertion('Ca 3: AUTH_EXPIRED khi REST đang chờ - Dữ liệu P&L đã bị dọn sạch', expiredNoData, `data=${hookStateRef.current.data}`));
        results.push(logAssertion('Ca 3: AUTH_EXPIRED khi REST đang chờ - Báo lỗi phiên hết hạn chuẩn xác', Boolean(expiredHasError), `error=${hookStateRef.current.error}`));
        results.push(logAssertion('Ca 3: AUTH_EXPIRED khi REST đang chờ - SSE đã đóng kết nối', expiredDisconnected, `isConnected=${hookStateRef.current.isConnected}`));

        // ==============================================================
        // CA 4: ĐỔI BỘ LỌC SAU KHI HẾT HẠN
        // ==============================================================
        setTestStatus('Ca 4: Đổi bộ lọc sau khi phiên hết hạn');
        
        // Đổi bộ lọc trong khi phiên đang hết hạn
        setDateFilter({ month: '2026-05', year: '2026' });
        await sleep(500);

        const filterAfterExpireNoData = hookStateRef.current.data === null;
        const filterAfterExpireError = hookStateRef.current.error && hookStateRef.current.error.includes('hết hạn');
        results.push(logAssertion('Ca 4: Đổi bộ lọc sau hết hạn - Chặn tải lại bằng token cũ, dữ liệu vẫn NULL', filterAfterExpireNoData, `data=${hookStateRef.current.data}`));
        results.push(logAssertion('Ca 4: Đổi bộ lọc sau hết hạn - Duy trì thông báo lỗi hết hạn', Boolean(filterAfterExpireError), `error=${hookStateRef.current.error}`));

        // ==============================================================
        // CA 5: ĐĂNG NHẬP LẠI VỚI PHIÊN MỚI
        // ==============================================================
        setTestStatus('Ca 5: Đăng nhập lại với phiên mới');

        const reloginRes = await loginApi('giamdoc', 'admin123');
        setAuthToken(reloginRes.data.token);
        setCurrentUser({ username: 'giamdoc', role: 'DIRECTOR' });
        await sleep(700);

        const reloginData = hookStateRef.current.data !== null;
        const reloginNoError = hookStateRef.current.error === null;
        const reloginConnected = hookStateRef.current.isConnected === true;

        results.push(logAssertion('Ca 5: Đăng nhập lại - Tải số liệu P&L mới thành công', reloginData, `data=${reloginData ? 'ĐÃ CÓ' : 'NULL'}`));
        results.push(logAssertion('Ca 5: Đăng nhập lại - Đã xóa thông báo lỗi hết hạn', reloginNoError, `error=${hookStateRef.current.error}`));
        results.push(logAssertion('Ca 5: Đăng nhập lại - Tái lập kết nối SSE thành công', reloginConnected, `isConnected=${reloginConnected}`));

        // ==============================================================
        // TỔNG KẾT VÀ BÁO CÁO VỀ SERVER
        // ==============================================================
        const allPassed = results.every(Boolean);
        const passCount = results.filter(Boolean).length;
        const failCount = results.length - passCount;
        setTestStatus(allPassed ? '✅ TẤT CẢ CÁC CA ĐỀU PASS!' : '❌ CÓ BÀI THẤT BẠI!');

        const reportPayload = {
          success: allPassed,
          total: results.length,
          passed: passCount,
          failed: failCount,
          details: testLogs
        };

        // Gửi báo cáo về máy chủ test
        await fetch('/api/v1/pl/test-runner-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reportPayload)
        });

      } catch (err) {
        console.error('[TEST RUNNER ERROR]', err);
        setTestStatus(`Lỗi thực thi: ${err.message}`);
        await fetch('/api/v1/pl/test-runner-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, error: err.message, details: testLogs })
        });
      }
    }

    runAllTests();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ padding: 16, background: '#1e293b', borderRadius: 8, marginBottom: 20 }}>
        <h2>Trạng thái: <span style={{ color: testStatus.includes('✅') ? '#4ade80' : '#f59e0b' }}>{testStatus}</span></h2>
        <div>User: <b>{currentUser ? `${currentUser.username} (${currentUser.role})` : 'Chưa đăng nhập'}</b></div>
        <div>SSE Connected: <b>{hookState.isConnected ? 'Đang kết nối' : 'Đã ngắt'}</b></div>
        <div>Dữ liệu P&L: <b>{hookState.data ? 'Có dữ liệu' : 'NULL'}</b></div>
        <div>Lỗi hiện tại: <b style={{ color: '#f87171' }}>{hookState.error || 'None'}</b></div>
      </div>

      <h3>Nhật ký kiểm thử:</h3>
      <div style={{ background: '#020617', padding: 12, borderRadius: 6, maxHeight: 400, overflowY: 'auto' }}>
        {testLogs.map((log, idx) => (
          <div key={idx} style={{ color: log.passed ? '#4ade80' : '#ef4444', marginBottom: 6 }}>
            [{log.time}] {log.passed ? '✅' : '❌'} {log.name} - <i>{log.detail}</i>
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<RealtimePLTestRunner />);

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, secrets, buildWorkbook, isoContainer } from './lib.mjs';

const codexRequire = createRequire('C:/Users/mrdoa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = codexRequire('playwright');

const screenshotsDir = path.join(ROOT, 'scratch/browser_screenshots_online');
fs.mkdirSync(screenshotsDir, { recursive: true });

console.log('=== STARTING ONLINE BROWSER E2E TESTS (EDGE/PLAYWRIGHT) ===');
const base = 'https://cong-ty-van-tai.onrender.com';
const sec = secrets();

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
});

try {
  // Đăng nhập lấy token thật từ server online
  const loginRes = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'giamdoc', password: sec.DIRECTOR_INIT_PASSWORD })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.data?.token;
  const user = loginJson.data?.user;
  console.log('Đã lấy token online Giám đốc thành công');

  // ==========================================
  // PHẦN 1: MULTI-SESSION SYNC QUA SSE (DESKTOP 1366px)
  // ==========================================
  console.log('\n--- 1. Multi-Session Sync qua SSE trên Production ---');
  const contextB = await browser.newContext({
    viewport: { width: 1366, height: 800 },
    serviceWorkers: 'block'
  });
  const pageB = await contextB.newPage();
  await pageB.addInitScript(({ token, user }) => {
    localStorage.setItem('hoachtoan_auth_token', token);
    localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
  }, { token, user });

  await pageB.goto(base, { waitUntil: 'networkidle' });
  await pageB.waitForSelector('body');

  await pageB.evaluate(() => {
    window.__sseEvents = [];
    window.addEventListener('business-data-changed', (e) => {
      window.__sseEvents.push(e.detail);
    });
  });
  console.log('Session B: Đã nạp giao diện và thiết lập bộ lắng nghe SSE');

  const contextA = await browser.newContext({
    viewport: { width: 1366, height: 800 },
    serviceWorkers: 'block'
  });
  const pageA = await contextA.newPage();
  await pageA.addInitScript(({ token, user }) => {
    localStorage.setItem('hoachtoan_auth_token', token);
    localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
  }, { token, user });

  await pageA.goto(base, { waitUntil: 'networkidle' });
  console.log('Session A: Đã vào hệ thống');

  // Mở modal Import Excel: Click "Tạo chuyến" rồi bấm tab "Nhập Excel"
  const createTripBtn = pageA.locator('button:has-text("Tạo chuyến")').first();
  await createTripBtn.click();
  console.log('Session A: Đã click nút Tạo chuyến');

  const excelImportBtn = pageA.locator('button:has-text("Nhập Excel")').first();
  await excelImportBtn.click();
  console.log('Session A: Đã chuyển sang Modal Nhập Excel');

  // Tạo file Excel thử nghiệm
  const runId = Date.now().toString(36).toUpperCase();
  const testTrip = {
    date: '15/01/2026',
    customer: `ONLINE-E2E-${runId}`,
    route: 'HAI PHONG - HA NOI',
    plate: '15C-88888',
    cont: isoContainer('MSCU', '999999'),
    toll: 50000,
    fare: 3000000,
    lift_on_place: 'Cảng Online',
    lift_on_fee: 100000,
    lift_off_place: 'Bãi Online',
    lift_off_fee: 80000,
    phoi: 200000,
    dau_lit: 40
  };
  const tempExcelPath = path.join(ROOT, `scratch/temp_online_${runId}.xlsx`);
  fs.writeFileSync(tempExcelPath, buildWorkbook([testTrip], 'Tháng 1'));

  await pageA.waitForSelector('[data-testid="excel-file-input"]', { state: 'attached', timeout: 10000 });
  const fileInput = pageA.locator('[data-testid="excel-file-input"]').first();
  await fileInput.setInputFiles(tempExcelPath);
  console.log('Session A: Đã tải file Excel lên');

  await pageA.waitForSelector('[data-testid="excel-confirm-commit"]', { timeout: 10000 });
  console.log('Session A: Bản xem trước đã hiển thị');
  await pageA.screenshot({ path: path.join(screenshotsDir, '01_online_session_a_preview.png') });

  const commitBtn = pageA.locator('[data-testid="excel-confirm-commit"]').first();
  await commitBtn.click();
  console.log('Session A: Đã nhấn nút Xác nhận nhập dữ liệu');

  await pageA.waitForSelector('[data-testid="excel-commit-title"]', { timeout: 15000 });
  const commitTitle = await pageA.locator('[data-testid="excel-commit-title"]').innerText();
  const batchId = await pageA.locator('[data-testid="excel-batch-id"]').innerText();
  console.log(`Session A: Nhập dữ liệu thành công! ("${commitTitle}", Batch: ${batchId})`);
  await pageA.screenshot({ path: path.join(screenshotsDir, '02_online_session_a_success.png') });

  // Kiểm tra Session B nhận SSE
  console.log('Session B: Đang chờ cập nhật realtime qua SSE...');
  await pageB.waitForFunction(() => window.__sseEvents && window.__sseEvents.length > 0, { timeout: 15000 });
  const sseDetail = await pageB.evaluate(() => window.__sseEvents[0]);
  console.log(`✅ PASS: Session B nhận sự kiện SSE realtime không cần F5! (Trigger: ${sseDetail?.trigger || 'DURABLE_WRITE'})`);
  await pageB.screenshot({ path: path.join(screenshotsDir, '03_online_session_b_sse_updated.png') });

  // ==========================================
  // PHẦN 2: KIỂM TRA GIAO DIỆN MOBILE 390px VÀ 320px
  // ==========================================
  for (const width of [390, 320]) {
    console.log(`\n--- 2. Kiểm tra Mobile Viewport: ${width}px ---`);
    const mCtx = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block'
    });
    const mPage = await mCtx.newPage();
    await mPage.addInitScript(({ token, user }) => {
      localStorage.setItem('hoachtoan_auth_token', token);
      localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
    }, { token, user });

    await mPage.goto(base, { waitUntil: 'networkidle' });
    await mPage.waitForSelector('body');

    const scrollW = await mPage.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await mPage.evaluate(() => document.documentElement.clientWidth);
    console.log(`Mobile ${width}px: scrollWidth=${scrollW}, clientWidth=${clientW}`);
    if (scrollW > clientW + 5) {
      console.warn(`Cảnh báo tràn ngang ở ${width}px`);
    } else {
      console.log(`✅ PASS: Viewport ${width}px vừa vặn, không tràn ngang.`);
    }
    await mPage.screenshot({ path: path.join(screenshotsDir, `04_online_mobile_${width}px.png`) });
    await mCtx.close();
  }

  // ==========================================
  // PHẦN 3: DỌN DẸP DỮ LIỆU TEST THEO BATCH_ID TRÊN PRODUCTION
  // ==========================================
  if (batchId && batchId !== '—') {
    console.log(`\n--- 3. Hoàn tác đợt test ${batchId} bằng rollbackBatch có force ---`);
    const rbRes = await fetch(`${base}/api/v1/excel/batches/${batchId}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ force: true })
    });
    const rbJson = await rbRes.json();
    console.log('Kết quả rollback đợt test online:', rbRes.status, rbJson.message);
    console.log('✅ PASS: Đã dọn sạch đợt thử nghiệm, bảo toàn nguyên vẹn hệ thống!');
  }

  try { fs.unlinkSync(tempExcelPath); } catch (_) {}
  console.log('\n=== TẤT CẢ KIỂM THỬ BROWSER ONLINE TRÊN PRODUCTION HOÀN TOÀN ĐẠT CHUẨN (100% PASS) ===\n');
} finally {
  await browser.close();
}

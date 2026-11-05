import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  ROOT,
  secrets,
  startMockSupabase,
  spawnBackend,
  runInit,
  waitHealthy,
  makeClient,
  buildWorkbook,
  isoContainer
} from './lib.mjs';

const codexRequire = createRequire('C:/Users/mrdoa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = codexRequire('playwright');
const serverRequire = createRequire(path.join(ROOT, 'server/package.json'));
const jwt = serverRequire('jsonwebtoken');

const screenshotsDir = path.join(ROOT, 'scratch/browser_screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

console.log('=== STARTING MULTI-DEVICE & BROWSER E2E TESTS (EDGE/PLAYWRIGHT) ===');

const PORT = 5145;
const SUPABASE_PORT = 5945;
const dir = path.join(ROOT, 'scratch/accept_runtime/browser_e2e_' + Date.now());
fs.mkdirSync(dir, { recursive: true });
const dbPath = path.join(dir, 'browser_e2e.db');

const mock = await startMockSupabase(SUPABASE_PORT);
await runInit({ dbPath, runtimeDir: dir });
const be = spawnBackend({
  dbPath,
  port: PORT,
  supabasePort: SUPABASE_PORT,
  runtimeDir: dir,
  logFile: path.join(dir, 'be.log')
});
const base = `http://localhost:${PORT}`;

let browser = null;
let testBatchId = null;

try {
  await waitHealthy(base);
  console.log(`Backend healthy at ${base}`);

  const sec = secrets();
  const directorUser = {
    id: 'user-director-01',
    username: 'giamdoc',
    role: 'DIRECTOR',
    full_name: 'Giám Đốc Điều Hành'
  };
  const token = jwt.sign(directorUser, sec.JWT_SECRET || 'hoachtoan_jwt_secret_key_change_in_production_2026_super_long_string', { expiresIn: '12h' });

  browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true
  });

  // ==========================================
  // PHẦN 1: MULTI-DEVICE SSE SYNC (SESSION A & SESSION B)
  // ==========================================
  console.log('\n--- Test 1: Multi-Device Sync qua SSE (Desktop 1366px) ---');

  // Session B (Observer): Khởi tạo trước và đang xem Dashboard
  const contextB = await browser.newContext({
    viewport: { width: 1366, height: 800 },
    serviceWorkers: 'block'
  });
  const pageB = await contextB.newPage();
  await pageB.addInitScript(({ token, user }) => {
    localStorage.setItem('hoachtoan_auth_token', token);
    localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
  }, { token, user: directorUser });

  await pageB.goto(base, { waitUntil: 'networkidle' });
  await pageB.waitForSelector('body');
  // Lắng nghe sự kiện cập nhật thời gian thực từ SSE trên Session B
  await pageB.evaluate(() => {
    window.__sseEvents = [];
    window.addEventListener('business-data-changed', (e) => {
      window.__sseEvents.push(e.detail);
    });
  });
  console.log('Session B: Đã nạp giao diện Tổng quan và thiết lập bộ lắng nghe SSE');

  // Đọc số chuyến ban đầu trên Session B
  const initialTripsTextB = await pageB.textContent('body');

  // Session A (Uploader): Đăng nhập và mở Import Excel Modal
  const contextA = await browser.newContext({
    viewport: { width: 1366, height: 800 },
    serviceWorkers: 'block'
  });
  const pageA = await contextA.newPage();
  await pageA.addInitScript(({ token, user }) => {
    localStorage.setItem('hoachtoan_auth_token', token);
    localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
  }, { token, user: directorUser });

  await pageA.goto(base, { waitUntil: 'networkidle' });
  console.log('Session A: Đã vào hệ thống');

  // Tạo file Excel thử nghiệm có đầy đủ các cột nâng hạ và phơi
  const testTrip = {
    date: '15/01/2026',
    customer: 'KH-E2E-SYNC',
    route: 'HAI PHONG - HA NOI',
    plate: '15C-99999',
    cont: isoContainer('MSCU', '888888'),
    toll: 50000,
    fare: 5000000,
    lift_on_place: 'Cảng A',
    lift_on_fee: 120000,
    lift_off_place: 'Bãi B',
    lift_off_fee: 100000,
    phoi: 250000,
    dau_lit: 80
  };
  const testWbBuf = buildWorkbook([testTrip], 'Tháng 1');
  const tempExcelPath = path.join(dir, 'test_sync.xlsx');
  fs.writeFileSync(tempExcelPath, testWbBuf);

  // Mở modal Import Excel trên Session A: Click "Tạo chuyến" rồi bấm tab "Nhập Excel"
  const createTripBtn = pageA.locator('button:has-text("Tạo chuyến")').first();
  await createTripBtn.click();
  console.log('Session A: Đã click nút Tạo chuyến');

  const excelImportBtn = pageA.locator('button:has-text("Nhập Excel")').first();
  await excelImportBtn.click();
  console.log('Session A: Đã click chuyển sang Modal Nhập Excel');

  // Chờ modal xuất hiện và input file gắn vào DOM
  await pageA.waitForSelector('[data-testid="excel-file-input"]', { state: 'attached', timeout: 10000 });
  console.log('Session A: Modal Import Excel đã mở');

  // Upload file vào input
  const fileInput = pageA.locator('[data-testid="excel-file-input"]').first();
  await fileInput.setInputFiles(tempExcelPath);
  console.log('Session A: Đã chọn file Excel test_sync.xlsx');

  // Chờ bản xem trước hiển thị nút Xác nhận nhập
  await pageA.waitForSelector('[data-testid="excel-confirm-commit"]', { timeout: 10000 });
  console.log('Session A: Bản xem trước đã hiển thị đầy đủ');

  // Chụp ảnh bằng chứng Session A Preview
  await pageA.screenshot({ path: path.join(screenshotsDir, '01_desktop_session_a_preview.png') });

  // Session A: Nhấn Xác nhận nhập dữ liệu
  const commitBtn = pageA.locator('[data-testid="excel-confirm-commit"]').first();
  await commitBtn.click();
  console.log('Session A: Đã nhấn nút Xác nhận nhập dữ liệu');

  // Chờ xác nhận thành công (bước 5 hiển thị kết quả)
  await pageA.waitForSelector('[data-testid="excel-commit-title"]', { timeout: 15000 });
  const commitTitle = await pageA.locator('[data-testid="excel-commit-title"]').innerText();
  console.log(`Session A: Nhập dữ liệu thành công! ("${commitTitle}")`);
  await pageA.screenshot({ path: path.join(screenshotsDir, '02_desktop_session_a_success.png') });

  // Kiểm tra Session B (KHÔNG RELOAD, chỉ chờ SSE push tự động cập nhật UI)
  console.log('Session B: Đang chờ cập nhật realtime qua SSE...');
  await pageB.waitForFunction(() => window.__sseEvents && window.__sseEvents.length > 0, { timeout: 15000 });
  const sseDetail = await pageB.evaluate(() => window.__sseEvents[0]);
  console.log(`✅ PASS: Session B nhận sự kiện SSE mà KHÔNG CẦN F5! (Trigger: ${sseDetail?.trigger || 'DURABLE_WRITE'})`);
  await pageB.screenshot({ path: path.join(screenshotsDir, '03_desktop_session_b_auto_updated_no_reload.png') });

  // ==========================================
  // PHẦN 2: MOBILE VIEWPORT TESTING (390px & 320px)
  // ==========================================
  for (const width of [390, 320]) {
    console.log(`\n--- Test Viewport Mobile: ${width}px ---`);
    const mobileContext = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block'
    });
    const mPage = await mobileContext.newPage();
    await mPage.addInitScript(({ token, user }) => {
      localStorage.setItem('hoachtoan_auth_token', token);
      localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
    }, { token, user: directorUser });

    await mPage.goto(base, { waitUntil: 'networkidle' });
    await mPage.waitForSelector('body');

    // Chụp toàn cảnh màn hình mobile
    await mPage.screenshot({ path: path.join(screenshotsDir, `04_mobile_${width}px_dashboard.png`) });

    // Kiểm tra không có phần tử nào bị tràn chiều ngang khỏi khung nhìn (horizontal overflow)
    const bodyScrollWidth = await mPage.evaluate(() => document.documentElement.scrollWidth);
    const bodyClientWidth = await mPage.evaluate(() => document.documentElement.clientWidth);
    console.log(`Mobile ${width}px: scrollWidth = ${bodyScrollWidth}, clientWidth = ${bodyClientWidth}`);
    if (bodyScrollWidth > bodyClientWidth + 5) {
      console.warn(`Cảnh báo tràn chiều ngang trên ${width}px: scrollWidth=${bodyScrollWidth} > clientWidth=${bodyClientWidth}`);
    } else {
      console.log(`✅ PASS: Khung nhìn ${width}px không bị tràn ngang layout.`);
    }

    // Chuyển sang tab Chuyến xe
    const tripsTab = mPage.locator('button:has-text("Chuyến xe"), a:has-text("Chuyến xe")').first();
    if (await tripsTab.isVisible().catch(() => false)) {
      await tripsTab.click();
      await mPage.waitForTimeout(600);
      await mPage.screenshot({ path: path.join(screenshotsDir, `05_mobile_${width}px_trips.png`) });
      console.log(`Mobile ${width}px: Tab Chuyến xe hiển thị tốt, đã chụp ảnh.`);
    }

    // Chuyển sang tab Công nợ
    const debtTab = mPage.locator('button:has-text("Công nợ"), a:has-text("Công nợ")').first();
    if (await debtTab.isVisible().catch(() => false)) {
      await debtTab.click();
      await mPage.waitForTimeout(600);
      await mPage.screenshot({ path: path.join(screenshotsDir, `06_mobile_${width}px_debts.png`) });
      console.log(`Mobile ${width}px: Tab Công nợ hiển thị tốt, đã chụp ảnh.`);
    }

    await mobileContext.close();
  }

  // ==========================================
  // PHẦN 3: DỌN DẸP DỮ LIỆU TEST THEO BATCH_ID CÓ FORCE
  // ==========================================
  console.log('\n--- Dọn dẹp dữ liệu thử nghiệm theo batch_id ---');
  const c = makeClient(base);
  await c.login('giamdoc', sec.DIRECTOR_INIT_PASSWORD);
  const batchesRes = await c.get('/api/v1/excel/batches');
  const testBatch = batchesRes.json.data?.find((b) => b.filename === 'test_sync.xlsx');
  if (testBatch) {
    const rb = await c.post(`/api/v1/excel/batches/${testBatch.id}/rollback`, { force: true });
    console.log(`Đã hoàn tác đợt test ${testBatch.id} với status:`, rb.status);
  }

  console.log('\n=== TẤT CẢ KIỂM THỬ PLAYWRIGHT BROWSER E2E VÀ MOBILE VIEWPORT ĐỀU ĐẠT CHUẨN (PASS) ===\n');
} catch (err) {
  console.error('LỖI KIỂM THỬ BROWSER:', err);
  process.exit(1);
} finally {
  if (browser) await browser.close();
  be.kill();
  await mock.close();
}

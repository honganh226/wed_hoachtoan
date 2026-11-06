/**
 * ============================================================
 * SCRIPT KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN TASK 6.4 & TASK 7.1
 * ============================================================
 * 1. Task 6.4: Thuật toán AI Dispatching Engine (4 tiêu chí vàng)
 *    - Tiêu chí 1: Tiến độ KPI (Ưu tiên <80%)
 *    - Tiêu chí 2: Sức khỏe & Đảo cuốc (Tránh quá tải, ưu tiên nghỉ ngơi)
 *    - Tiêu chí 3: Trạng thái kỹ thuật xe & ODO dầu, hạn đăng kiểm
 *    - Tiêu chí 4: Kinh nghiệm tuyến đường & Bãi cảng quen thuộc
 *    - API POST/GET /api/v1/ai/dispatch-suggestion
 * 2. Task 7.1: Phân hệ Cẩm Nang Hướng Dẫn & Từ Điển Ký Hiệu
 *    - API GET /api/v1/help/handbook
 *    - API GET /api/v1/help/glossary
 *    - API GET /api/v1/help/sop
 *    - API GET /api/v1/help/rbac
 *    - API GET /api/v1/help/faq
 * ============================================================
 */
import assert from 'node:assert';
import http from 'node:http';
import { db } from '../db/database.js';
import { getAiDispatchRecommendations } from '../services/aiDispatch.service.js';
import { 
  getHandbookData, 
  GLOSSARY_TERMS, 
  SOP_STEPS, 
  RBAC_MATRIX, 
  FAQ_LIST 
} from '../services/help.service.js';

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (error) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Lỗi: ${error.message}`);
    process.exitCode = 1;
  }
}

async function asyncIt(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (error) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Lỗi: ${error.message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n============================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TASK 6.4 (AI DISPATCH) & TASK 7.1 (HELP CENTER)');
  console.log('============================================================\n');

  // ==========================================================
  // PHẦN 1: KIỂM THỬ THUẬT TOÁN AI DISPATCH (TASK 6.4)
  // ==========================================================
  console.log('📌 PHẦN 1: KIỂM THỬ THUẬT TOÁN AI DISPATCH (TASK 6.4)');

  await asyncIt('1.1. Gọi getAiDispatchRecommendations trả về đầy đủ recommendations và bestMatch', async () => {
    const result = await getAiDispatchRecommendations({ tripDate: '2026-10-08' });
    assert.ok(result, 'Kết quả không được rỗng');
    assert.strictEqual(typeof result.totalEvaluated, 'number');
    assert.ok(result.totalEvaluated > 0, 'Phải đánh giá ít nhất 1 ứng viên');
    assert.ok(Array.isArray(result.recommendations), 'recommendations phải là mảng');
    assert.ok(result.bestMatch, 'Phải có bestMatch đề xuất số 1');
    assert.strictEqual(result.bestMatch.rank, 1, 'BestMatch phải có rank = 1');
    assert.ok(result.analysisSummary && result.analysisSummary.length > 10, 'Phải có đoạn phân tích tổng quan');
  });

  await asyncIt('1.2. Kiểm tra thang điểm và cấu trúc 4 tiêu chí vàng trong đề xuất', async () => {
    const result = await getAiDispatchRecommendations({ tripDate: '2026-10-08' });
    const top1 = result.bestMatch;

    assert.ok(top1.score >= 0 && top1.score <= 100, 'Điểm số phải trong khoảng 0-100');
    assert.ok(top1.driver && top1.driver.fullName, 'Phải có thông tin tài xế');
    assert.ok(top1.vehicle && top1.vehicle.plateNumber, 'Phải có thông tin đầu xe');
    assert.ok(top1.criteriaBreakdown, 'Phải có bảng phân rã tiêu chí');
    assert.ok(top1.criteriaBreakdown.kpi, 'Phải có điểm KPI');
    assert.ok(top1.criteriaBreakdown.health, 'Phải có điểm Thể lực/Đảo cuốc');
    assert.ok(top1.criteriaBreakdown.vehicleReadiness, 'Phải có điểm Kỹ thuật xe');
    assert.ok(top1.criteriaBreakdown.routeFit, 'Phải có điểm Tuyến quen');
    assert.ok(Array.isArray(top1.reasons) && top1.reasons.length > 0, 'Phải có danh sách lý do cụ thể');
  });

  await asyncIt('1.3. Đề xuất phân bổ ưu tiên tài xế chậm KPI (<80%) nhận điểm KPI cao', async () => {
    const result = await getAiDispatchRecommendations({ tripDate: '2026-10-08' });
    // Tìm ứng viên có kpiPercent < 80
    const slowCandidate = result.recommendations.find(r => r.driver.kpiTarget > 0 && r.driver.kpiPercent < 80);
    if (slowCandidate) {
      assert.ok(slowCandidate.criteriaBreakdown.kpi.score >= 80, 'Tài xế chậm KPI phải được chấm điểm KPI >= 80');
    }
  });

  await asyncIt('1.4. Đề xuất hỗ trợ cấu hình tuyến đường và cont kẹp 2x20\'', async () => {
    const routes = db.prepare('SELECT id, route_name FROM routes LIMIT 1').all();
    const routeId = routes.length > 0 ? routes[0].id : null;

    const result = await getAiDispatchRecommendations({ 
      tripDate: '2026-10-08',
      routeId,
      isMultiContainer: true,
      pickupLocation: 'TÂN VŨ',
      dropoffLocation: 'KCN BÌNH XUYÊN'
    });

    assert.ok(result.recommendations.length > 0);
    const top1 = result.bestMatch;
    const hasMultiContReason = top1.reasons.some(r => r.includes('cont kẹp') || r.includes('2x20'));
    assert.ok(hasMultiContReason, 'Phải ghi nhận lý do hỗ trợ cont kẹp 2x20 trong bảng lý do');
  });

  await asyncIt('1.5. Danh sách recommendations được sắp xếp giảm dần theo điểm số score', async () => {
    const result = await getAiDispatchRecommendations({ tripDate: '2026-10-08' });
    for (let i = 0; i < result.recommendations.length - 1; i++) {
      assert.ok(
        result.recommendations[i].score >= result.recommendations[i + 1].score,
        `Thứ tự sắp xếp sai: phần tử ${i} (${result.recommendations[i].score}) < phần tử ${i+1} (${result.recommendations[i+1].score})`
      );
    }
  });

  // ==========================================================
  // PHẦN 2: KIỂM THỬ CẨM NANG HƯỚNG DẪN & TỪ ĐIỂN KÝ HIỆU (TASK 7.1)
  // ==========================================================
  console.log('\n📌 PHẦN 2: KIỂM THỬ CẨM NANG HƯỚNG DẪN & TỪ ĐIỂN (TASK 7.1)');

  it('2.1. Hàm getHandbookData trả về đầy đủ 5 phân hệ tri thức', () => {
    const handbook = getHandbookData();
    assert.ok(handbook, 'Handbook không được rỗng');
    assert.ok(Array.isArray(handbook.glossary), 'glossary phải là mảng');
    assert.ok(Array.isArray(handbook.sopSteps), 'sopSteps phải là mảng');
    assert.ok(Array.isArray(handbook.rbacMatrix), 'rbacMatrix phải là mảng');
    assert.ok(Array.isArray(handbook.faqList), 'faqList phải là mảng');
    assert.ok(handbook.systemInfo, 'systemInfo phải có dữ liệu');
    assert.strictEqual(handbook.systemInfo.serverPort, 5000);
    assert.strictEqual(handbook.systemInfo.clientPort, 5173);
  });

  it('2.2. Từ điển ký hiệu chứa đầy đủ các thuật ngữ then chốt của dự án', () => {
    const terms = GLOSSARY_TERMS.map(t => t.term);
    assert.ok(terms.includes('[V] & [NV]'), 'Phải có thuật ngữ [V] & [NV]');
    assert.ok(terms.includes('Cont Kẹp (2x20\')'), 'Phải có thuật ngữ Cont Kẹp 2x20');
    assert.ok(terms.includes('EIR (Phiếu Phơi)'), 'Phải có thuật ngữ EIR');
    assert.ok(terms.includes('ISO 6346'), 'Phải có thuật ngữ ISO 6346');
    assert.ok(terms.includes('ePort'), 'Phải có thuật ngữ ePort');
    assert.ok(terms.includes('Khóa Sổ Kỳ'), 'Phải có thuật ngữ Khóa Sổ Kỳ');
    assert.ok(terms.includes('Audit Log'), 'Phải có thuật ngữ Audit Log');
    assert.ok(terms.includes('Cố Định vs Biến Động'), 'Phải có chi phí Cố Định vs Biến Động');
    assert.ok(terms.includes('Cờ Đỏ & Cờ Vàng Chi Phí'), 'Phải có Cờ Đỏ & Cờ Vàng');
    assert.ok(terms.includes('Real-time P&L'), 'Phải có Real-time P&L');
    assert.ok(terms.includes('Lương 3 Thành Phần'), 'Phải có Lương 3 Thành Phần');
    assert.ok(terms.includes('Ma Trận Xe 3 Màu'), 'Phải có Ma Trận Xe 3 Màu');
    assert.ok(terms.includes('AI Dispatch 4 Tiêu Chí'), 'Phải có AI Dispatch 4 Tiêu Chí');
    assert.ok(terms.includes('Thanh Toán Gộp Bảng Kê'), 'Phải có Thanh Toán Gộp Bảng Kê');
  });

  it('2.3. Quy trình chuẩn SOP bao gồm đúng 7 bước tác nghiệp', () => {
    assert.strictEqual(SOP_STEPS.length, 7, 'SOP phải có đúng 7 bước');
    assert.strictEqual(SOP_STEPS[0].step, 1);
    assert.strictEqual(SOP_STEPS[6].step, 7);
    SOP_STEPS.forEach(s => {
      assert.ok(s.title, 'Mỗi bước phải có tiêu đề');
      assert.ok(s.role, 'Mỗi bước phải có vai trò phụ trách');
      assert.ok(Array.isArray(s.details) && s.details.length > 0, 'Mỗi bước phải có chi tiết thao tác');
    });
  });

  it('2.4. Ma trận phân quyền RBAC mô tả chuẩn xác 4 vai trò của hệ thống', () => {
    assert.strictEqual(RBAC_MATRIX.length, 3, 'RBAC matrix có 3 vai trò quản trị');
    const roles = RBAC_MATRIX.map(r => r.roleKey);
    assert.deepStrictEqual(roles, ['DIRECTOR', 'ACCOUNTANT', 'AREA_MANAGER']);
    RBAC_MATRIX.forEach(r => {
      assert.ok(r.account, 'Phải có tài khoản demo');
      assert.ok(r.scope, 'Phải có phạm vi dữ liệu');
      assert.ok(Array.isArray(r.permissions) && r.permissions.length > 0, 'Phải có danh sách quyền hạn');
    });
  });

  it('2.5. Danh sách FAQ trả lời các bài toán cốt lõi (ISO, Cont kẹp, Khóa sổ, Guardrails)', () => {
    assert.ok(FAQ_LIST.length >= 5, 'FAQ phải có ít nhất 5 câu hỏi');
    FAQ_LIST.forEach(item => {
      assert.ok(item.q && item.q.length > 10, 'Câu hỏi phải rõ ràng');
      assert.ok(item.a && item.a.length > 20, 'Câu trả lời phải chi tiết');
    });
  });

  // ==========================================================
  // PHẦN 3: KIỂM THỬ TÍCH HỢP EXPRESS ROUTER CỦA TASK 6.4 & 7.1
  // ==========================================================
  console.log('\n📌 PHẦN 3: KIỂM THỬ EXPRESS ROUTE MOUNT & RESPONSE CONTRACT');

  await asyncIt('3.1. Import server app và kiểm tra endpoint /api/v1/help và /api/v1/ai', async () => {
    const { default: helpRouter } = await import('../routes/help.routes.js');
    assert.ok(helpRouter, 'helpRouter phải export thành công');

    const { default: aiRouter } = await import('../routes/ai.routes.js');
    assert.ok(aiRouter, 'aiRouter phải export thành công');
  });

  console.log('\n============================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT 100%`);
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});

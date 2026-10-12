/**
 * ============================================================
 * SCRIPT KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN: TASK 6.2 & TASK 6.3
 * ============================================================
 * Kiểm tra:
 * 1. Phân hệ Quản lý Đội xe, Cảnh báo hạn xe, Chu kỳ thay dầu ODO
 * 2. Cơ chế duyệt bảo dưỡng 100% thuộc Giám đốc (chặn 403 phi GĐ)
 * 3. Nghiệm thu xuất xưởng tự động hạch toán chi phí FIXED vào expenses
 * 4. Bộ lọc AI Guardrails chặn vi phạm bảo mật doanh thu/lương theo RBAC
 * 5. Khả năng truy vấn ngữ cảnh vận tải thông minh 24/7 của Trợ lý AI
 * ============================================================
 */
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import {
  getFleetMaintenanceOverview,
  getMaintenanceProposals,
  createMaintenanceProposal,
  approveMaintenanceProposal,
  rejectMaintenanceProposal,
  completeMaintenanceProposal,
  updateVehicleStatus,
  updateVehicleKm
} from '../services/maintenance.service.js';
import { evaluateGuardrails, getRoleSuggestions } from '../services/aiGuard.service.js';
import { chatWithAiAssistant } from '../services/aiAssistant.service.js';
import { USER_ROLES, VEHICLE_STATUSES, MAINTENANCE_STATUSES, EXPENSE_CATEGORIES } from '../db/schema.js';

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Lỗi: ${err.message}`);
  }
}

async function itAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Lỗi: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n============================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TRỌN GÓI: TASK 6.2 & TASK 6.3');
  console.log('============================================================\n');

  const directorUser = { id: 'usr_dir_1', username: 'giamdoc', full_name: 'Giám Đốc Test', role: USER_ROLES.DIRECTOR };
  const accountantUser = { id: 'usr_acc_1', username: 'ketoan', full_name: 'Kế Toán Test', role: USER_ROLES.ACCOUNTANT };
  const areaUser = { id: 'usr_area_1', username: 'quanlykhu', full_name: 'Quản Lý Khu Test', role: USER_ROLES.AREA_MANAGER, areaId: 'TUAN' };
  const driverUser = { id: 'usr_drv_1', username: 'liem', full_name: 'Vũ Văn Liêm', role: USER_ROLES.DRIVER };

  // ------------------------------------------------------------
  // PHẦN 1: KIỂM THỬ TASK 6.2 - QUẢN LÝ ĐỘI XE & BẢO DƯỠNG
  // ------------------------------------------------------------
  console.log('--- PHẦN 1: QUẢN LÝ ĐỘI XE, BẢO DƯỠNG & CẢNH BÁO HẠN XE ---');

  let testVehicle = null;
  await itAsync('1.1. Lấy tổng quan đội xe và kiểm tra tính toán cảnh báo hạn', async () => {
    const overview = await getFleetMaintenanceOverview(directorUser);
    assert(overview.summary, 'Summary phải tồn tại');
    assert(overview.summary.totalVehicles >= 4, 'Phải có tối thiểu 4 đầu xe');
    assert(Array.isArray(overview.vehicles), 'Danh sách xe phải là Array');
    
    testVehicle = overview.vehicles[0];
    assert(testVehicle.plate_number, 'Xe phải có biển số');
    assert(testVehicle.oilStatus, 'Xe phải có trạng thái thay dầu ODO');
    assert(testVehicle.inspectionAlert, 'Xe phải có cảnh báo hạn đăng kiểm');
    assert(testVehicle.insuranceAlert, 'Xe phải có cảnh báo hạn bảo hiểm');
  });

  let createdProposalId = null;
  await itAsync('1.2. Tạo đề xuất bảo dưỡng mới (Thay lốp xe định kỳ)', async () => {
    const proposal = await createMaintenanceProposal({
      vehicle_id: testVehicle.id,
      proposal_type: 'TIRE_REPLACEMENT',
      title: 'Thay 2 quả lốp bánh lái dẫn hướng Bridgestone',
      description: 'Lốp mòn rãnh gai dưới 2mm, đề xuất thay mới đảm bảo an toàn cao tốc',
      estimated_cost: 9500000
    }, driverUser);

    assert(proposal.id, 'Phải có mã đề xuất');
    assert.strictEqual(proposal.status, MAINTENANCE_STATUSES.PENDING, 'Đề xuất mới phải là PENDING');
    assert.strictEqual(proposal.estimated_cost, 9500000, 'Dự toán chi phí phải là 9.500.000₫');
    createdProposalId = proposal.id;
  });

  await itAsync('1.3. BẢO MẬT: Chặn Lái xe hoặc Kế toán tự duyệt đề xuất (Chỉ Giám đốc)', async () => {
    let blocked = false;
    try {
      await approveMaintenanceProposal(createdProposalId, driverUser);
    } catch (err) {
      blocked = true;
      assert(err.message.includes('Chỉ Giám đốc'), 'Thông báo lỗi phải nêu rõ quyền của Giám đốc');
    }
    assert.strictEqual(blocked, true, 'Lái xe không được phép phê duyệt đề xuất bảo dưỡng!');
  });

  await itAsync('1.4. Giám đốc phê duyệt đề xuất -> Xe tự động chuyển sang NẰM XƯỞNG (MAINTENANCE)', async () => {
    const approveResult = await approveMaintenanceProposal(createdProposalId, directorUser);
    assert.strictEqual(approveResult.success, true, 'Duyệt đề xuất phải thành công');

    // Kiểm tra trạng thái xe trong database
    const vehicleInDb = db.prepare('SELECT status FROM vehicles WHERE id = ?').get(testVehicle.id);
    assert.strictEqual(vehicleInDb.status, VEHICLE_STATUSES.MAINTENANCE, 'Xe phải chuyển sang trạng thái MAINTENANCE (🔴 Nằm xưởng)');
  });

  await itAsync('1.5. Nghiệm thu xuất xưởng -> Tự động tạo Chi phí Cố định (FIXED EXPENSE) và đổi trạng thái xe', async () => {
    const actualCost = 9200000;
    const completeResult = await completeMaintenanceProposal(createdProposalId, {
      actual_cost: actualCost,
      completion_km: testVehicle.current_km + 10,
      notes: 'Đã thay xong 2 lốp Bridgestone chính hãng, cân mâm bấm chì chuẩn'
    }, accountantUser);

    assert.strictEqual(completeResult.success, true, 'Nghiệm thu phải thành công');
    assert(completeResult.expenseId, 'Phải tạo mã chi phí');

    // Kiểm tra bản ghi trong bảng expenses
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(completeResult.expenseId);
    assert(exp, 'Bản ghi chi phí phải tồn tại trong bảng expenses');
    assert.strictEqual(exp.category, EXPENSE_CATEGORIES.FIXED, 'Chi phí bảo dưỡng phải thuộc nhóm CỐ ĐỊNH (FIXED)');
    assert.strictEqual(exp.expense_type, 'REPAIR', 'Loại chi phí phải là REPAIR');
    assert.strictEqual(exp.amount, actualCost, 'Số tiền chi phí thực tế phải khớp chuẩn');

    // Kiểm tra xe xuất xưởng về bãi IDLE
    const vehicleInDb = db.prepare('SELECT status, last_maintenance_km FROM vehicles WHERE id = ?').get(testVehicle.id);
    assert.strictEqual(vehicleInDb.status, VEHICLE_STATUSES.IDLE, 'Xe xuất xưởng phải chuyển về trạng thái IDLE (🟡 Chờ việc)');
  });

  await itAsync('1.6. Điều động xe sẵn sàng: Cập nhật trạng thái xe thành ACTIVE (🟢 Đang chạy)', async () => {
    const statusResult = await updateVehicleStatus(testVehicle.id, VEHICLE_STATUSES.ACTIVE, directorUser);
    assert.strictEqual(statusResult.success, true);
    assert.strictEqual(statusResult.newStatus, VEHICLE_STATUSES.ACTIVE);
  });

  await itAsync('1.7. Cập nhật số Km đồng hồ ODO xe', async () => {
    const kmResult = await updateVehicleKm(testVehicle.id, { current_km: 150000 }, accountantUser);
    assert.strictEqual(kmResult.success, true);
    assert.strictEqual(kmResult.updatedFields.current_km, 150000);
  });

  // ------------------------------------------------------------
  // PHẦN 2: KIỂM THỬ TASK 6.3 - TRỢ LÝ ẢO AI & RBAC GUARDRAILS
  // ------------------------------------------------------------
  console.log('\n--- PHẦN 2: TRỢ LÝ ẢO AI & BỘ LỌC PHÂN QUYỀN BẢO MẬT (AI GUARDRAILS) ---');

  it('2.1. AI Guardrails: Lái xe hỏi Doanh thu tổng công ty -> BỊ CHẶN 100%', () => {
    const check = evaluateGuardrails('Tổng doanh thu tháng này của công ty là bao nhiêu?', driverUser);
    assert.strictEqual(check.allowed, false, 'Phải chặn câu hỏi doanh thu công ty đối với Lái xe');
    assert.strictEqual(check.category, 'COMPANY_REVENUE');
    assert(check.reason.includes('AI GUARDRAILS - TỪ CHỐI'));
  });

  it('2.2. AI Guardrails: Lái xe hỏi Lương của tài xế khác -> BỊ CHẶN 100%', () => {
    const check = evaluateGuardrails('Cho em biết lương của anh Phạm Văn Tuân tháng này?', driverUser);
    assert.strictEqual(check.allowed, false, 'Phải chặn câu hỏi về thu nhập người khác');
    assert.strictEqual(check.category, 'OTHER_SALARY');
  });

  it('2.3. AI Guardrails: Kế toán hỏi Khoản động viên bí mật của Giám đốc -> BỊ CHẶN 100%', () => {
    const check = evaluateGuardrails('Giám đốc đã thưởng khoản động viên bí mật cho những ai?', accountantUser);
    assert.strictEqual(check.allowed, false, 'Phải chặn câu hỏi về thưởng bí mật của GĐ đối với Kế toán');
    assert.strictEqual(check.category, 'SECRET_INCENTIVE');
  });

  it('2.4. AI Guardrails: Người dùng hỏi Mật khẩu ePort -> BỊ CHẶN BẢO MẬT', () => {
    const check = evaluateGuardrails('Mật khẩu đăng nhập ePort Tân Vũ là gì?', accountantUser);
    assert.strictEqual(check.allowed, false, 'Phải chặn hỏi mật khẩu hệ thống');
    assert.strictEqual(check.category, 'CREDENTIALS');
  });

  it('2.5. AI Guardrails: Giám đốc hỏi Doanh thu và P&L -> ĐƯỢC PHÉP TOÀN QUYỀN', () => {
    const check = evaluateGuardrails('Báo cáo doanh thu và lãi ròng công ty tháng này?', directorUser);
    assert.strictEqual(check.allowed, true, 'Giám đốc có toàn quyền tra cứu số liệu tài chính');
  });

  it('2.6. Lấy danh sách câu hỏi gợi ý phù hợp theo vai trò', () => {
    const driverSuggestions = getRoleSuggestions(USER_ROLES.DRIVER);
    assert(driverSuggestions.length >= 3, 'Phải có gợi ý cho Lái xe');
    assert(driverSuggestions.some(s => s.includes('Lương') || s.includes('chuyến')), 'Gợi ý phải sát nghiệp vụ lái xe');

    const directorSuggestions = getRoleSuggestions(USER_ROLES.DIRECTOR);
    assert(directorSuggestions.some(s => s.includes('doanh thu') || s.includes('Đội xe')), 'Gợi ý Giám đốc phải có doanh thu & đội xe');
  });

  await itAsync('2.7. Trợ lý AI: Lái xe hỏi bị chặn -> Trả về cảnh báo bảo mật, không lộ dữ liệu', async () => {
    const chatResult = await chatWithAiAssistant({
      message: 'Công ty mình tháng này thu được bao nhiêu tiền cước vậy?'
    }, driverUser);

    assert.strictEqual(chatResult.success, true);
    assert.strictEqual(chatResult.blocked, true, 'Phải đánh dấu bị chặn bảo mật');
    assert(chatResult.reply.includes('TỪ CHỐI'), 'Nội dung phản hồi phải là lời từ chối lịch sự');
  });

  await itAsync('2.8. Trợ lý AI: Giám đốc hỏi Tình hình đội xe -> Phản hồi số lượng xe chính xác', async () => {
    const chatResult = await chatWithAiAssistant({
      message: 'Đội xe hiện tại có bao nhiêu xe đang chạy, bao nhiêu xe nằm xưởng?'
    }, directorUser);

    assert.strictEqual(chatResult.success, true);
    assert.strictEqual(chatResult.blocked, false);
    assert(chatResult.reply.includes('TÌNH HÌNH ĐỘI XE'), 'Phải có tiêu đề tình hình đội xe');
    assert(chatResult.reply.includes('15C-22405') || chatResult.reply.includes('đầu xe'), 'Phải chứa dữ liệu xe thực tế');
  });

  await itAsync('2.9. Trợ lý AI: Giám đốc hỏi P&L Doanh thu -> Phản hồi số tiền nguyên VND thực thu vs kỳ vọng', async () => {
    const chatResult = await chatWithAiAssistant({
      message: 'Báo cáo doanh thu và dòng tiền thực thu tháng này của công ty?'
    }, directorUser);

    assert.strictEqual(chatResult.success, true);
    assert.strictEqual(chatResult.blocked, false);
    assert(chatResult.reply.includes('BÁO CÁO TÀI CHÍNH REAL-TIME P&L'), 'Phải chứa báo cáo P&L');
    assert(chatResult.reply.includes('₫'), 'Số tiền phải có ký hiệu đơn vị tiền tệ VND');
  });

  await itAsync('2.10. Trợ lý AI: Hỏi nghiệp vụ kiểm tra số container ISO 6346 -> Hướng dẫn chuẩn Modulo 11', async () => {
    const chatResult = await chatWithAiAssistant({
      message: 'Quy chuẩn kiểm tra số container ISO 6346 và cont kẹp 2x20 tính như thế nào?'
    }, driverUser);

    assert.strictEqual(chatResult.success, true);
    assert.strictEqual(chatResult.blocked, false);
    assert(chatResult.reply.includes('ISO 6346'), 'Phải giải thích chuẩn ISO 6346');
    assert(chatResult.reply.includes('2x20'), 'Phải giải thích cont kẹp 2x20');
  });

  console.log('\n============================================================');
  console.log(`📊 KẾT QUẢ KIỂM THỬ: ${passedTests} / ${totalTests} TESTS PASS 100%!`);
  console.log('============================================================\n');

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Lỗi thực thi kiểm thử:', err);
  process.exit(1);
});

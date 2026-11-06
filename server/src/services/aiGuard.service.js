/**
 * ============================================================
 * AI GUARD SERVICE - BỘ LỌC PHÂN QUYỀN BẢO MẬT (AI GUARDRAILS)
 * ============================================================
 * Task 6.3: Chặn câu hỏi lộ bí mật doanh thu/lương ở tầng Backend API
 * theo chuẩn phân quyền RBAC 4 vai trò.
 * ============================================================
 */
import { USER_ROLES } from '../db/schema.js';

// Các từ khóa nhạy cảm theo từng nhóm thông tin
const RESTRICTED_TOPICS = {
  // Doanh thu, lợi nhuận cấp công ty, dòng tiền toàn hệ thống
  COMPANY_REVENUE: [
    'doanh thu cong ty', 'doanh thu toan bo', 'tong doanh thu', 'tong tien cty',
    'lai rong', 'loi nhuan', 'quy tien mat', 'p&l', 'ket qua kinh doanh',
    'doanh thu thang', 'thuc thu toan bo', 'doanh so cty', 'doanh so',
    'tien cuoc cong ty', 'tien cuoc cty', 'thu duoc bao nhieu tien cuoc',
    'thu duoc bao nhieu tien', 'tong thu nhap cong ty', 'tong tien cuoc', 'doanh thu'
  ],
  // Lương, thưởng, thu nhập của người khác
  OTHER_SALARY: [
    'luong cua', 'luong tai xe khac', 'luong anh', 'thuong dong vien',
    'tien thuong cua', 'bang luong toan bo', 'luong nguoi khac',
    'tai xe kiem duoc bao nhieu', 'thu nhap cua lai xe'
  ],
  // Thưởng động viên bí mật của Giám đốc (Secret Director Incentive)
  SECRET_INCENTIVE: [
    'tien dong vien', 'thuong rieng', 'thuong bi mat', 'khoan dong vien',
    'giam doc thuong bao nhieu', 'incentive'
  ],
  // Công nợ toàn công ty / bí mật khách hàng
  COMPANY_DEBT: [
    'tong cong no', 'cong no toan bo', 'khach nao no nhieu nhat',
    'danh sach cong no cty', 'so tien khach chua tra'
  ],
  // ePort mật khẩu
  CREDENTIALS: [
    'mat khau eport', 'pass eport', 'password', 'khoa ma hoa', 'mat khau dang nhap'
  ]
};

/**
 * Chuẩn hóa chuỗi tiếng Việt không dấu để quét từ khóa
 */
export function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  // Xóa các ký tự đặc biệt
  str = str.replace(/[^a-z0-9\s]/g, ' ');
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Kiểm tra câu hỏi của người dùng có vi phạm quy định bảo mật RBAC hay không
 * @param {string} prompt Câu hỏi của người dùng
 * @param {object} user Thông tin tài khoản đăng nhập (role, userId, username, area_id)
 * @returns {object} { allowed: boolean, reason: string | null, category: string | null }
 */
export function evaluateGuardrails(prompt, user = {}) {
  const role = user.role || USER_ROLES.DRIVER;
  const normalized = removeVietnameseTones(prompt);

  // 1. GIÁM ĐỐC (DIRECTOR): Toàn quyền truy vấn 100%, không bị chặn bất kỳ thông tin nào
  if (role === USER_ROLES.DIRECTOR) {
    return {
      allowed: true,
      reason: null,
      role
    };
  }

  // 2. Chặn hỏi mật khẩu hệ thống / credential đối với tất cả vai trò phi Giám đốc
  const askingCredentials = RESTRICTED_TOPICS.CREDENTIALS.some((kw) => normalized.includes(kw));
  if (askingCredentials) {
    return {
      allowed: false,
      reason: '⚠️ [BẢO MẬT HỆ THỐNG]: Mật khẩu và thông tin xác thực ePort được mã hóa AES-256-GCM và không được phép cung cấp qua kênh AI theo chính sách bảo mật nội bộ.',
      category: 'CREDENTIALS',
      role
    };
  }

  // 3. VAI TRÒ LÁI XE (DRIVER): Kiểm soát chặt chẽ nhất
  if (role === USER_ROLES.DRIVER) {
    // Chặn hỏi doanh thu công ty
    const askingCompanyRevenue = RESTRICTED_TOPICS.COMPANY_REVENUE.some((kw) => normalized.includes(kw));
    if (askingCompanyRevenue) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Tài khoản Lái xe không được phân quyền xem báo cáo Doanh thu & Lợi nhuận của công ty theo quy định bảo mật RBAC.',
        category: 'COMPANY_REVENUE',
        role
      };
    }

    // Chặn hỏi lương / thưởng của người khác
    const askingOtherSalary = RESTRICTED_TOPICS.OTHER_SALARY.some((kw) => normalized.includes(kw));
    if (askingOtherSalary) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Bạn chỉ có thể tra cứu thông tin lương và chuyến xe của chính mình. Dữ liệu thu nhập của các tài xế khác được bảo mật tuyệt đối.',
        category: 'OTHER_SALARY',
        role
      };
    }

    // Chặn hỏi công nợ công ty
    const askingCompanyDebt = RESTRICTED_TOPICS.COMPANY_DEBT.some((kw) => normalized.includes(kw));
    if (askingCompanyDebt) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Thông tin công nợ khách hàng thuộc phạm vi nghiệp vụ của Kế toán và Ban Giám đốc.',
        category: 'COMPANY_DEBT',
        role
      };
    }

    // Chặn hỏi khoản động viên riêng
    const askingIncentives = RESTRICTED_TOPICS.SECRET_INCENTIVE.some((kw) => normalized.includes(kw));
    if (askingIncentives) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Khoản động viên của Ban Giám đốc là thông tin khen thưởng nội bộ bảo mật, vui lòng liên hệ trực tiếp Giám đốc để biết chi tiết.',
        category: 'SECRET_INCENTIVE',
        role
      };
    }
  }

  // 4. VAI TRÒ QUẢN LÝ KHU (AREA_MANAGER):
  if (role === USER_ROLES.AREA_MANAGER) {
    // Chặn hỏi tổng lãi ròng / quỹ tiền mặt riêng toàn cty
    const askingCompanyPL = ['lai rong', 'quy tien mat', 'p&l', 'ket qua kinh doanh'].some((kw) => normalized.includes(kw));
    if (askingCompanyPL) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Quản lý khu vực chỉ được theo dõi vận hành chuyến xe và KPI trong khu vực phụ trách. Chỉ tiêu Lãi ròng và Quỹ tiền mặt thuộc quyền riêng của Ban Giám đốc.',
        category: 'COMPANY_REVENUE',
        role
      };
    }

    // Chặn hỏi khoản động viên bảo mật của GĐ
    const askingSecretIncentive = RESTRICTED_TOPICS.SECRET_INCENTIVE.some((kw) => normalized.includes(kw));
    if (askingSecretIncentive) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Khoản động viên của Giám đốc dành cho lái xe là thông tin khen thưởng bảo mật cấp điều hành cao nhất.',
        category: 'SECRET_INCENTIVE',
        role
      };
    }
  }

  // 5. VAI TRÒ KẾ TOÁN (ACCOUNTANT):
  if (role === USER_ROLES.ACCOUNTANT) {
    // Chặn hỏi Khoản động viên bí mật của GĐ
    const askingSecretIncentive = RESTRICTED_TOPICS.SECRET_INCENTIVE.some((kw) => normalized.includes(kw));
    if (askingSecretIncentive) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Khoản động viên khen thưởng đặc biệt của Giám đốc được mã hóa bảo mật và chỉ Giám đốc mới có thẩm quyền tra cứu.',
        category: 'SECRET_INCENTIVE',
        role
      };
    }

    // Chặn hỏi Quỹ tiền mặt riêng / Lãi ròng nội bộ bí mật
    const askingSecretFund = ['quy tien mat rieng', 'lai rong noi bo', 'quy giam doc'].some((kw) => normalized.includes(kw));
    if (askingSecretFund) {
      return {
        allowed: false,
        reason: '⚠️ [AI GUARDRAILS - TỪ CHỐI]: Dữ liệu Quỹ riêng của Giám đốc được bảo vệ ở tầng bảo mật cao nhất, Kế toán chỉ quản lý doanh thu, chi phí và công nợ tác nghiệp.',
        category: 'COMPANY_REVENUE',
        role
      };
    }
  }

  // Hợp lệ, thông qua Guardrails
  return {
    allowed: true,
    reason: null,
    role
  };
}

/**
 * Danh sách câu hỏi gợi ý phù hợp cho từng vai trò người dùng
 */
export function getRoleSuggestions(role = USER_ROLES.DRIVER) {
  switch (role) {
    case USER_ROLES.DIRECTOR:
      return [
        '📊 Tổng hợp doanh thu, thực thu và công nợ tháng này?',,
        '⚠️ Có xe nào quá hạn hoặc sắp hết hạn đăng kiểm / bảo hiểm không?',,
        '🎯 Tài xế nào đang chậm tiến độ KPI cần nhắc nhở?'
      ];

    case USER_ROLES.ACCOUNTANT:
      return [
        '💰 Khách hàng nào đang có công nợ lớn nhất cần thu tiền?',
        '📑 Danh sách các chuyến xe chưa nộp phiếu phơi EIR quá 3 ngày?',
        '⛽ Chi phí nâng hạ và tiền dầu tháng này như thế nào?',
        '📋 Kiểm tra các cuốc xe có chi phí bất thường (>25%)?',
        '🚚 Các chuyến xe hôm qua đã được kế toán chốt cước chưa?'
      ];

    case USER_ROLES.AREA_MANAGER:
      return [
        '🚛 Tình trạng các xe và tài xế trong khu vực phụ trách?',
        '🎯 Tiến độ hoàn thành KPI cuốc xe của các anh em lái xe?',
        '📦 Tuyến đường nào đang có nhiều cuốc xe nhất tuần này?'
      ];

    case USER_ROLES.DRIVER:
    default:
      return [
        '💵 Lương công chuyến và tạm ứng tháng này của tôi là bao nhiêu?',
        '📅 Tôi đã chạy được bao nhiêu chuyến trong tháng này?',
        '🪪 Hạn bằng lái xe của tôi còn bao nhiêu ngày?',
        '🚚 Xe của tôi đang gắn biển số nào và số ODO hiện tại bao nhiêu?',
        '📖 Cách kiểm tra tính hợp lệ của số container ISO 6346?'
      ];
  }
}

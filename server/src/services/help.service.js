/**
 * ============================================================
 * HELP SERVICE - CẨM NANG HƯỚNG DẪN & TỪ ĐIỂN KÝ HIỆU (TASK 7.1)
 * ============================================================
 * Cung cấp toàn bộ tài liệu cẩm nang tra cứu vận tải container nội bộ:
 * 1. Từ điển ký hiệu nội bộ & Thuật ngữ ngành vận tải container
 * 2. Quy trình vận hành chuẩn 7 bước (SOP - Standard Operating Procedure)
 * 3. Ma trận phân quyền 4 cấp bậc (RBAC Matrix)
 * 4. Quy định kỹ thuật & tài chính (Số nguyên VND, ISO 6346, Cont Kẹp 2x20', P&L SSE)
 * 5. Các câu hỏi thường gặp (FAQ)
 * ============================================================
 */

export const GLOSSARY_TERMS = [
  {
    id: 'vat_symbol',
    term: '[V] & [NV]',
    name: 'Ký hiệu nhận diện VAT trong giá cước',
    category: 'ký_hiệu',
    badge: 'Tài chính & Thuế',
    shortDesc: 'Quy ước phân loại cước đã bao gồm thuế GTGT hoặc chưa có thuế.',
    fullDesc: 'Tại WED_HOACHTOAN, mọi chuyến xe đều được gắn cờ ký hiệu VAT rõ ràng: [V] thể hiện giá cước đã bao gồm 8% thuế giá trị gia tăng (VAT); [NV] thể hiện giá cước thuần (Net/chưa VAT). Kế toán và Giám đốc có thể đối chiếu chính xác doanh thu trước và sau thuế mà không bị sai lệch số liệu.',
    formula: 'Nếu [V]: Thuế VAT = Round((Tổng cước * 8) / 108). Doanh thu thuần = Tổng cước - Thuế VAT.',
    example: 'Cuốc đóng KCN Bình Xuyên 3.200.000 ₫ gắn cờ [V] -> Tiền thuế VAT = 237.037 ₫, Doanh thu thuần = 2.962.963 ₫.'
  },
  {
    id: 'double_cont',
    term: 'Cont Kẹp (2x20\')',
    name: 'Kẹp 2 vỏ container 20 feet trên 1 rơ-mooc',
    category: 'ký_hiệu',
    badge: 'Điều vận bãi cảng',
    shortDesc: 'Chạy đồng thời 2 container 20ft trên cùng 1 đầu kéo mooc sàn.',
    fullDesc: 'Cho phép gán 2 số container độc lập, 2 địa điểm nâng/hạ khác nhau và cộng dồn doanh thu cước của cả 2 vỏ cont vào 1 cuốc xe. Hệ thống tự động tách riêng chi phí nâng, hạ và phụ cấp công chuyến kẹp cho tài xế.',
    formula: 'Tổng doanh thu cuốc = Cước Cont 1 (Base) + Cước Cont 2 (Extra). Tổng nâng hạ = Nâng Cont 1 + Nâng Cont 2 + Hạ Cont 1 + Hạ Cont 2.',
    example: 'Mooc chở 2 cont 20ft: Cont 1 nâng Tân Vũ (600.000 ₫ cước 3.200.000 ₫), Cont 2 nâng Đình Vũ (600.000 ₫ cước 2.500.000 ₫) -> Tổng cước = 5.700.000 ₫.'
  },
  {
    id: 'eir_receipt',
    term: 'EIR (Phiếu Phơi)',
    name: 'Equipment Interchange Receipt - Phiếu Giao Nhận Container',
    category: 'chứng_từ',
    badge: 'Bãi cảng & Hải quan',
    shortDesc: 'Biên lai xác nhận giao nhận vỏ container tại bãi cảng/kho khách.',
    fullDesc: 'Chứng từ gốc bắt buộc khi xe ra vào cổng cảng hoặc bàn giao hàng tại kho khách. Tài xế dùng ứng dụng di động chụp ảnh phơi gửi về hệ thống (tự nén Canvas ~200KB). Hệ thống theo dõi 2 trạng thái: Đã trả / Chưa trả phơi, và tự động bật cảnh báo 🔴 Đỏ nếu tài xế ngâm đọng phơi quá 3 ngày chưa nộp.',
    formula: 'Thời gian đọng = (Ngày hiện tại - Ngày hoàn thành chuyến). Nếu đọng > 3 ngày -> Cảnh báo Đọng Phơi.',
    example: 'Xe hoàn thành giao hàng ngày 01/10 nhưng đến ngày 05/10 chưa nộp phơi gốc -> Hệ thống gắn cờ đọng phơi 4 ngày.'
  },
  {
    id: 'iso_6346',
    term: 'ISO 6346',
    name: 'Tiêu chuẩn quốc tế định dạng số hiệu Container',
    category: 'quy_chuẩn',
    badge: 'Chuẩn quốc tế',
    shortDesc: 'Quy chuẩn mã container gồm 4 chữ cái + 6 chữ số + 1 số kiểm tra Check Digit.',
    fullDesc: 'Thuật toán kiểm tra Modulo 11 tự động phát hiện lỗi gõ nhầm số container ngay khi nhập liệu. Cấu trúc gồm: 3 chữ cái mã chủ sở hữu (Owner code), 1 chữ cái phân loại (U: Freight container), 6 chữ số sê-ri và 1 số kiểm tra cuối cùng.',
    formula: 'Check Digit = (Tổng trọng số modulo 11) % 10.',
    example: 'MSMU5022544: 4 ký tự chủ MSMU, 6 số sê-ri 502254, số kiểm tra chuẩn là 4. Nếu người dùng gõ MSMU5022545 hệ thống sẽ lập tức báo cờ đỏ sai check digit.'
  },
  {
    id: 'eport_account',
    term: 'ePort',
    name: 'Cổng dịch vụ cảng điện tử & Mã hóa bí mật',
    category: 'công_nghệ',
    badge: 'Hải Phòng Cảng',
    shortDesc: 'Tài khoản đăng ký làm lệnh, thanh toán nâng hạ qua mạng tại các cảng.',
    fullDesc: 'Quản lý tài khoản ePort của 15 bãi cảng (Tân Vũ, Đình Vũ, VIP Green, Nam Đình Vũ...). Mật khẩu tài khoản ePort được mã hóa cấp quân sự AES-256-GCM với Secret Key lưu độc lập ngoài Database SQLite, chống tuyệt đối nguy cơ rò rỉ tài khoản kế toán.',
    formula: 'Ciphertext = AES-256-GCM(Password, MasterKey, IV) kèm Authentication Tag.',
    example: 'Tài khoản ePort Tân Vũ của lái xe Tuân được bảo vệ 24/7, người dùng không thể xem trộm mật khẩu thô từ database.'
  },
  {
    id: 'period_lock',
    term: 'Khóa Sổ Kỳ',
    name: 'Chốt số liệu kế toán tháng cũ (Period Lock)',
    category: 'kế_toán',
    badge: 'Kiểm soát nội bộ',
    shortDesc: 'Tính năng khóa quyền chỉnh sửa toàn bộ chuyến xe và chi phí của tháng đã chốt.',
    fullDesc: 'Sau khi kế toán và Giám đốc đã đối soát xong số liệu tháng, Giám đốc kích hoạt Khóa Sổ Kỳ. Khi một tháng đã khóa, bất kỳ thao tác Sửa/Xóa cuốc xe, chi phí, tạm ứng nào sẽ bị Backend từ chối với mã lỗi HTTP 423 Locked. Chỉ duy nhất Giám đốc mới có quyền mở khóa.',
    formula: 'Check: IF (Tháng của chuyến <= Tháng đã khóa) AND (User != DIRECTOR) -> Throw 423 Locked.',
    example: 'Tháng 09/2026 đã chốt khóa sổ -> Kế toán viên không thể sửa tiền cước của chuyến ngày 25/09/2026.'
  },
  {
    id: 'audit_log',
    term: 'Audit Log',
    name: 'Nhật ký kiểm toán vết dữ liệu bất biến',
    category: 'kế_toán',
    badge: 'Bảo mật hệ thống',
    shortDesc: 'Ghi vết tự động mọi thao tác sửa cước, xóa chuyến, duyệt chi phí, sửa KPI.',
    fullDesc: 'Bảng nhật ký lưu trữ: Ai thao tác, thời gian, IP máy, mã chuyến, giá trị cũ (Old Data) và giá trị mới (New Data) dưới dạng JSON. Dữ liệu này không thể bị xóa sửa thủ công, đảm bảo tính minh bạch tuyệt đối.',
    formula: 'INSERT INTO audit_logs (id, user_id, action, target_table, old_values, new_values, created_at).',
    example: 'GĐ sửa KPI của Lái xe Liêm từ 40 triệu lên 45 triệu -> Audit log ghi nhận chính xác 1 dòng lịch sử.'
  },
  {
    id: 'fixed_variable_expenses',
    term: 'Cố Định vs Biến Động',
    name: 'Phân loại chi phí vận hành (Fixed vs Variable Expenses)',
    category: 'tài_chính',
    badge: 'P&L Quản trị',
    shortDesc: 'Chi phí cố định (sửa chữa xe, bến bãi, đăng kiểm) vs Chi phí biến động (dầu, BOT, nâng hạ).',
    fullDesc: 'Chi phí cố định (FIXED): Phân bổ dài hạn như tiền thuê bãi, sửa chữa đại tu máy móc, bảo hiểm, đăng kiểm; Chi phí biến động (VARIABLE): Gắn liền trực tiếp theo từng cuốc xe cụ thể như tiền dầu, vé trạm thu phí BOT, phí nâng vỏ, hạ vỏ, tiền chọn vỏ đẹp.',
    formula: 'Tổng chi phí = Chi phí cố định + Chi phí biến động. Tỷ suất biến động = (Chi phí biến động / Tổng chi phí) * 100.',
    example: 'Chuyến xe đi Lào Cai: Dầu 2.500.000 ₫ + BOT 850.000 ₫ là Chi phí biến động; Tiền thay dầu máy 1.800.000 ₫ là Chi phí cố định.'
  },
  {
    id: 'expense_alerts',
    term: 'Cờ Đỏ & Cờ Vàng Chi Phí',
    name: 'Cảnh báo bất thường chi phí thực tế (>25%)',
    category: 'kế_toán',
    badge: 'Giám sát chi phí',
    shortDesc: 'Thuật toán phát hiện gian lận hoặc sai lệch tiền vé trạm, tiền dầu.',
    fullDesc: 'Hệ thống tự động so sánh chi phí thực tế lái xe nộp với định mức chuẩn của tuyến đường. Nếu chênh lệch vượt quá 25% (như tiền BOT cao bất thường), hệ thống bật Cờ Đỏ 🔴 Đỏ. Nếu chuyến chạy tuyến dài nhưng không có chi phí nâng hạ hoặc dầu, hệ thống bật Cờ Vàng 🟡 Vàng (nghi ngờ quên nhập).',
    formula: 'Độ lệch = |(Chi phí thực tế - Định mức tuyến)| / Định mức tuyến. IF Độ lệch > 0.25 -> Flag RED.',
    example: 'Định mức BOT tuyến Bình Xuyên là 320.000 ₫. Lái xe nộp vé 450.000 ₫ (+40.6%) -> Cảnh báo Cờ Đỏ bất thường.'
  },
  {
    id: 'realtime_pl',
    term: 'Real-time P&L',
    name: 'Báo cáo Lợi nhuận và Lỗ lãi tức thời (SSE Pulse)',
    category: 'tài_chính',
    badge: 'Executive Dashboard',
    shortDesc: 'Động cơ Server-Sent Events tự động nhảy số doanh thu, chi phí, lợi nhuận gộp theo giây.',
    fullDesc: 'Mỗi khi kế toán bấm Lưu chuyến, thủ quỹ xuất Tạm ứng, hoặc Giám đốc nhập chi phí, Backend phát ngay tín hiệu broadcast SSE qua endpoint /api/v1/pl/events. Dashboard Giám đốc tự động cập nhật số liệu mà không cần tải lại trang.',
    formula: 'Lợi nhuận gộp = Doanh thu thuần - Tổng chi phí thực tế. Biên lợi nhuận (%) = (Lợi nhuận gộp / Doanh thu) * 100.',
    example: 'Kế toán vừa nhập cước cuốc xe 3.500.000 ₫ -> Màn hình Giám đốc lập tức tăng số tiền kỳ vọng và lợi nhuận tương ứng.'
  },
  {
    id: 'salary_3_parts',
    term: 'Lương 3 Thành Phần',
    name: 'Cơ chế tính lương tài xế toàn diện',
    category: 'nhân_sự',
    badge: 'Chính sách đãi ngộ',
    shortDesc: 'Lương = Lương cứng + Lương chuyến + Thưởng động viên (Khoản mật) - Tạm ứng.',
    fullDesc: 'Chính sách lương minh bạch: 1. Lương cứng (Base salary định kỳ hàng tháng); 2. Lương chuyến (Tính theo định mức từng tuyến đường, kẹp cont thêm phụ cấp); 3. Khoản động viên (Incentive do riêng Giám đốc phê duyệt, ẩn bảo mật với kế toán và lái xe khác); Trừ đi khoản Tạm ứng chưa hoàn ứng.',
    formula: 'Thực lĩnh = Lương cứng + Tổng lương chuyến + Khoản động viên - Dư nợ tạm ứng.',
    example: 'Lái xe Liêm: Cứng 6.000.000 ₫ + 10 cuốc xe (5.500.000 ₫) + Thưởng năng suất 1.000.000 ₫ - Đã ứng 2.000.000 ₫ = Thực nhận 10.500.000 ₫.'
  },
  {
    id: 'vehicle_status_3_colors',
    term: 'Trạng Thái Xe',
    name: 'Trạng thái hoạt động đội xe trực quan',
    category: 'đội_xe',
    badge: 'Điều độ phương tiện',
    shortDesc: '🟢 ACTIVE (Đang chạy) • 🟡 IDLE (Đứng bãi).',
    fullDesc: 'Đội xe được phân loại theo trạng thái: Màu Xanh lá (Xe đang chạy trên đường, có cuốc DISPATCHED hoặc RUNNING); Màu Vàng (Xe rảnh đứng bãi, sẵn sàng nhận lệnh điều phối).',
    formula: 'Trạng thái được cập nhật tự động theo vòng đời cuốc xe hoặc thủ công bởi Giám đốc/Quản lý bãi.',
    example: 'Xe 15C-22405 đang hoàn thành chuyến và về bãi Đình Vũ -> Hệ thống chuyển trạng thái sang Vàng (IDLE).'
  },
  {
    id: 'ai_dispatch_4_criteria',
    term: 'AI Dispatch 4 Tiêu Chí',
    name: 'Thuật toán gợi ý phân bổ xe & tài xế thông minh',
    category: 'công_nghệ',
    badge: 'Trí tuệ nhân tạo',
    shortDesc: 'Tự động quét: KPI chậm (35%) • Thể lực (25%) • Kỹ thuật xe rảnh (25%) • Tuyến quen (15%).',
    fullDesc: 'Khi tạo chuyến xe mới, nút [🤖 AI Gợi Ý Phân Bổ Nhanh] sẽ chạy thuật toán chấm điểm 0-100 cho toàn bộ tài xế và đầu xe, ưu tiên tài xế chậm tiến độ để bù thu nhập, tránh tài xế quá tải đường dài và chọn xe an toàn đăng kiểm.',
    formula: 'Score = 0.35 * KPI_Score + 0.25 * Health_Score + 0.25 * Vehicle_Score + 0.15 * Route_Score.',
    example: 'Tài xế Tuân chậm KPI (mới đạt 20%) và có xe 15C-35981 rảnh đứng bãi -> Đạt điểm đề xuất 89/100, xếp Top 1 gợi ý.'
  },
  {
    id: 'batch_payment',
    term: 'Thanh Toán Gộp Bảng Kê',
    name: 'Quyết toán công nợ theo lô (Batch Payment)',
    category: 'kế_toán',
    badge: 'Quản trị công nợ',
    shortDesc: 'Tích chọn nhiều chuyến của 1 khách hàng và xác nhận thu tiền theo số UNC ủy nhiệm chi.',
    fullDesc: 'Thay vì thu tiền lẻ tẻ từng cuốc, kế toán mở Bảng kê công nợ, chọn khách hàng (vd TTP, VTM), tích chọn danh sách 5-10 cuốc xe đã hoàn thành, nhập số Ủy nhiệm chi / Bảng kê ngân hàng và bấm xác nhận. Hệ thống cập nhật trạng thái PAID cho toàn bộ lô chỉ với 1 giao dịch an toàn SQLite.',
    formula: 'Tổng thanh toán = Sum(Doanh thu các chuyến được tích chọn).',
    example: 'Khách hàng TTP chuyển khoản 35.000.000 ₫ thanh toán cho 11 cuốc xe tháng 9 theo UNC-2026-098.'
  }
];

export const SOP_STEPS = [
  {
    step: 1,
    title: 'Tiếp Nhận Đơn Hàng & Tạo Chuyến Xe',
    role: 'Quản lý khu / Kế toán / Giám đốc',
    shortDesc: 'Ghi nhận thông tin vận chuyển, kiểm tra ISO 6346 và sử dụng AI phân bổ xe.',
    details: [
      'Chọn ngày chuyến, nhập tên khách hàng / chủ hàng (vd: TTP, VTM, Đại Thịnh).',
      'Bấm nút [🤖 AI Gợi Ý Phân Bổ Nhanh] để hệ thống quét 4 tiêu chí đề xuất xe và lái xe tối ưu nhất.',
      'Chọn tuyến đường tiêu chuẩn để hệ thống tự điền giá cước mẫu và lương chuyến quy định.',
      'Nhập số container. Hệ thống tự động kiểm tra số kiểm tra Modulo 11 theo chuẩn quốc tế ISO 6346.',
      'Nếu là cont kẹp, bấm nút [+ Kẹp Thêm Cont 20 Thứ Hai] để nhập vỏ thứ 2 và cộng gộp doanh thu.',
      'Gắn ký hiệu VAT [V] hoặc [NV] đúng thỏa thuận hợp đồng.'
    ]
  },
  {
    step: 2,
    title: 'Xuất Tạm Ứng Trước Chuyến Cho Lái Xe',
    role: 'Kế toán / Thủ quỹ',
    shortDesc: 'Cấp tiền tạm ứng cho tài xế phục vụ chi phí đi đường, dầu nhớt và vé cầu phà.',
    details: [
      'Vào phân hệ Tạm Ứng từ thanh tác nghiệp hoặc mở từ cuốc xe vừa tạo.',
      'Nhập số tiền xuất quỹ (số nguyên VND), ghi rõ lý do tạm ứng (vd: Tiền dầu tuyến Lào Cai + Vé BOT cao tốc).',
      'Hệ thống lưu vết ngày giờ xuất quỹ và ghi nhận vào công nợ tạm ứng của riêng lái xe đó.'
    ]
  },
  {
    step: 3,
    title: 'Điều Xe Xuất Bãi & Giám Sát Hành Trình',
    role: 'Điều độ / Quản lý khu',
    shortDesc: 'Chuyển trạng thái cuốc xe từ NEW sang DISPATCHED và RUNNING.',
    details: [
      'Đầu xe chuyển từ trạng thái 🟡 IDLE (Đứng bãi) sang 🟢 ACTIVE (Đang chạy).',
      'Lái xe nhận lệnh điều vận, di chuyển xe vào bãi cảng (Tân Vũ, Đình Vũ...) để nâng vỏ cont.',
      'Chuyển trạng thái CONT_PICKED khi đã nâng cont lên mooc sàn an toàn.',
      'Lăn bánh giao hàng đến kho nhà máy hoặc hạ hàng tại KCN chỉ định.'
    ]
  },
  {
    step: 4,
    title: 'Chụp Ảnh Phiếu Phơi EIR Bằng Điện Thoại',
    role: 'Điều độ bãi / Kế toán',
    shortDesc: 'Ghi lại biên lai hạ vỏ container tại bãi cảng, chống đọng chứng từ.',
    details: [
      'Nhân viên điều độ / kế toán nhận phiếu phơi EIR từ lái xe, chụp bằng điện thoại và tải lên hệ thống.',
      'Hệ thống tự động nén ảnh chất lượng cao xuống ~200KB bằng Canvas, tiết kiệm 95% dung lượng lưu trữ.',
      'Cập nhật trạng thái phiếu phơi: Đã trả / Chưa trả.',
      'Hệ thống theo dõi tự động: Nếu sau 3 ngày kể từ khi trả hàng mà chưa có ảnh phơi, cảnh báo 🔴 Đỏ đọng phơi sẽ nổi lên trên Dashboard.'
    ]
  },
  {
    step: 5,
    title: 'Nhập Chi Phí Thực Tế & Quyết Toán Hoàn Ứng',
    role: 'Kế toán / Lái xe',
    shortDesc: 'Quyết toán tiền tạm ứng, nhập hóa đơn chi phí và kiểm tra cảnh báo bất thường.',
    details: [
      'Lái xe bàn giao cuống vé BOT, hóa đơn dầu, biên lai nâng hạ cont về cho kế toán.',
      'Kế toán mở màn hình Quyết Toán Hoàn Ứng: Nhập thực chi. Hệ thống tự động tính: Tiền thừa lái xe nộp lại quỹ hoặc Tiền thiếu quỹ bù thêm.',
      'Nhập các khoản chi phí thực tế: Tiền dầu (1 ô nhập duy nhất), BOT, Phí nâng, Phí hạ, Tiền chọn vỏ, Sửa vỏ.',
      'Thuật toán tự động kích hoạt: Nếu chi phí lệch > 25% so với tuyến chuẩn -> Bật Cờ Đỏ 🔴; Nếu nghi quên nhập -> Bật Cờ Vàng 🟡.'
    ]
  },
  {
    step: 6,
    title: 'Nghiệm Thu Hoàn Thành & Nhảy Số Real-time P&L',
    role: 'Kế toán / Giám đốc',
    shortDesc: 'Chốt hoàn thành chuyến xe, phát tín hiệu SSE nhảy số tức thì.',
    details: [
      'Khi chi phí và chứng từ đã đầy đủ, cuốc xe chuyển sang trạng thái COMPLETED.',
      'Engine P&L Real-time tự động phát sóng tín hiệu Server-Sent Events (SSE) đến toàn bộ màn hình đang mở.',
      'Dashboard Giám đốc tự động nhảy số: Doanh thu kỳ vọng, Chi phí biến động, Lợi nhuận gộp và Tỷ suất biên lợi nhuận.'
    ]
  },
  {
    step: 7,
    title: 'Xuất Bảng Kê & Thu Tiền Khách Hàng',
    role: 'Kế toán / Giám đốc',
    shortDesc: 'Tập hợp các cuốc đã hoàn thành, xuất hóa đơn và xác nhận thanh toán gộp.',
    details: [
      'Kế toán lọc danh sách các chuyến chưa thanh toán của từng khách hàng theo kỳ (MTD, Quý, Tháng).',
      'Mở màn hình [📑 Thanh Toán Bảng Kê (Batch Payment)] -> Chọn khách hàng -> Tích chọn danh sách các chuyến trong kỳ.',
      'Nhập số chứng từ Ủy nhiệm chi (UNC) / Số hợp đồng thanh toán.',
      'Bấm [Xác nhận thanh toán cả lô]: Trạng thái chuyến chuyển sang PAID, dòng tiền chuyển từ Tiền sẽ nhận (Công nợ) sang Thực thu (Tiền đã về quỹ).'
    ]
  }
];

export const RBAC_MATRIX = [
  {
    roleKey: 'DIRECTOR',
    roleName: '👑 Giám Đốc (Director)',
    badgeColor: 'amber',
    account: 'giamdoc / admin123',
    scope: 'Toàn hệ thống 100% (Full quyền)',
    permissions: [
      'Xem và điều hành toàn bộ 100% chuyến xe, doanh thu, lợi nhuận ròng P&L và quỹ tiền mặt.',
      'Quyền ĐỘC QUYỀN phê duyệt khoản thưởng động viên bí mật trong bảng lương tài xế.',
      'Quyền kích hoạt và mở Khóa Sổ Kỳ (Period Lock) kế toán.',
      'Quyền 1-Click Sao Lưu Database (.sqlite) và 1-Click Reset Database dữ liệu.',
      'Sửa đổi chỉ tiêu KPI tài xế và xem toàn bộ nhật ký Audit Log hệ thống.'
    ]
  },
  {
    roleKey: 'ACCOUNTANT',
    roleName: '💼 Kế Toán (Accountant)',
    badgeColor: 'emerald',
    account: 'ketoan / ketoan123',
    scope: 'Tác nghiệp tài chính toàn khu (Ẩn quỹ & Thưởng mật)',
    permissions: [
      'Tạo chuyến xe, áp giá cước theo hợp đồng, gắn ký hiệu VAT [V]/[NV].',
      'Xuất phiếu tạm ứng, quyết toán hoàn ứng và nhập chi phí thực tế (dầu, BOT, nâng hạ).',
      'Xác nhận thanh toán gộp theo bảng kê (Batch Payment) cho khách hàng.',
      'Xem tiến độ nộp phiếu phơi EIR và giám sát cảnh báo đọng phơi > 3 ngày.',
      'Bị CHẶN: Không xem được quỹ tiền mặt, không thấy khoản thưởng động viên bảo mật của Giám đốc, không được Reset DB.'
    ]
  },
  {
    roleKey: 'AREA_MANAGER',
    roleName: '📍 Quản Lý Khu (Area Manager)',
    badgeColor: 'blue',
    account: 'tuan / tuan123 (Khu Tuân) & tuanh / tuanh123 (Khu Tuấn Anh)',
    scope: 'Phân vùng dữ liệu chỉ thấy các xe và tài xế thuộc khu vực mình phụ trách',
    permissions: [
      'Tạo chuyến xe và điều phối đầu xe, tài xế trong khu phụ trách (vd: Khu Tuân).',
      'Theo dõi tiến độ giao nhận cont, hỗ trợ tài xế nộp ảnh phiếu phơi EIR.',
      'Bị CHẶN: Tuyệt đối không nhìn thấy cuốc xe, doanh thu hay chi phí của khu vực khác.'
    ]
  }
];

export const FAQ_LIST = [
  {
    q: 'Làm thế nào để hệ thống tự động kiểm tra số container gõ đúng hay sai?',
    a: 'Hệ thống tích hợp thuật toán ISO 6346 Modulo 11 theo tiêu chuẩn quốc tế. Ngay khi bạn nhập số cont (gồm 4 chữ cái và 7 chữ số), hệ thống sẽ lập tức tính toán số kiểm tra (check digit). Nếu số cuối cùng bạn gõ không khớp với thuật toán, huy hiệu màu Đỏ 🔴 Sai Check Digit sẽ hiện lên cảnh báo ngay để tránh nhầm lẫn khi làm thủ tục cảng.'
  },
  {
    q: 'Khi chạy cont kẹp 2x20\', doanh thu và chi phí được hạch toán như thế nào?',
    a: 'Khi bấm nút [+ Kẹp Thêm Cont 20 Thứ Hai], hệ thống mở thêm các ô nhập cho cont thứ 2 (số cont, nơi nâng, nơi hạ, cước cont 2 và phụ cấp kẹp cont cho tài xế). Doanh thu chuyến sẽ tự động cộng dồn 2 vỏ cont. Chi phí nâng hạ sẽ tính cho cả 2 vỏ (tổng 4 lượt nâng hạ). Lương công chuyến của tài xế được tự động cộng thêm phụ cấp kẹp cont.'
  },
  {
    q: 'Tại sao sau khi Giám đốc Khóa Sổ Kỳ, kế toán không thể sửa được tiền cước tháng cũ?',
    a: 'Đây là tính năng bảo vệ số liệu kế toán (Period Lock). Khi tháng đã được chốt, Backend API sẽ chặn toàn bộ các lệnh PUT/DELETE với mã lỗi 423 Locked. Điều này ngăn chặn việc vô tình hoặc cố ý sửa đổi số liệu tài chính đã báo cáo thuế. Chỉ duy nhất Giám đốc mới có quyền mở khóa sổ.'
  },
  {
    q: 'Trợ lý ảo AI có làm lộ bí mật lương và doanh thu khi tài xế đặt câu hỏi không?',
    a: 'Tuyệt đối không! Hệ thống đã trang bị bộ lọc bảo mật AI Guardrails ở tầng Backend API. Trước khi gửi câu hỏi đến AI, hệ thống kiểm tra vai trò người dùng (RBAC). Nếu tài xế hỏi về doanh thu công ty, cước khách hàng, hay lương của tài xế khác, AI Guardrails sẽ lập tức chặn lại và từ chối cung cấp dữ liệu bí mật.'
  },
  {
    q: 'Thuật toán [🤖 AI Gợi Ý Phân Bổ Nhanh] hoạt động trên những tiêu chí nào?',
    a: 'Hệ thống chấm điểm theo 4 tiêu chí vàng có trọng số: 1. Tiến độ KPI (35% - ưu tiên tài xế chậm chỉ tiêu <80% để bù sản lượng); 2. Thể lực & Đảo cuốc (25% - ưu tiên tài xế đã nghỉ ngơi >= 1 ngày, tránh tài xế vừa chạy liên tiếp tuyến đường dài); 3. Trạng thái kỹ thuật xe (25% - xe rảnh đứng bãi, hạn đăng kiểm và ODO dầu an toàn); 4. Tuyến quen (15% - ưu tiên người có kinh nghiệm chạy tuyến đường này).'
  },
  {
    q: 'Dữ liệu tiền tệ trong toàn bộ hệ thống được quy ước như thế nào?',
    a: 'Toàn bộ hệ thống tuân thủ Hợp đồng kỹ thuật bất biến: Mọi trường tiền tệ (cước, lương, chi phí, tạm ứng, doanh thu, P&L) đều lưu trữ dưới dạng Số nguyên VND (Integer), tuyệt đối không lưu số thập phân (float/double) để triệt tiêu hoàn toàn lỗi làm tròn số thực trong kế toán.'
  }
];

/**
 * Trả về toàn bộ cẩm nang hướng dẫn
 */
export function getHandbookData() {
  return {
    glossary: GLOSSARY_TERMS,
    sopSteps: SOP_STEPS,
    rbacMatrix: RBAC_MATRIX,
    faqList: FAQ_LIST,
    systemInfo: {
      appName: 'WED_HOACHTOAN',
      version: '2.3',
      serverPort: 5000,
      clientPort: 5173,
      currency: 'VND Integer (Số nguyên)',
      architecture: 'Express.js + Vite React + SQLite WAL (better-sqlite3) + Drizzle ORM'
    }
  };
}

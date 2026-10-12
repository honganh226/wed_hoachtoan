/**
 * Dữ liệu minh họa kiểm soát được của công ty vận tải
 * Dùng chung cho: Tổng quan kinh doanh, Phân tích chuyên sâu và Quản lý công việc
 */

export const formatVnd = (amount) => {
  if (amount === undefined || amount === null) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
};

export const formatTrieuDong = (amount) => {
  if (amount === undefined || amount === null) return '0 tr đ';
  const valInMil = amount / 1000000;
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(valInMil) + ' tr đ';
};

export const MOCK_TRIPS_DATA = [
  // --- NGÀY HÔM NAY (2026-10-09) ---
  {
    id: 'TRIP-20261009-001',
    trip_code: 'C20261009-001',
    trip_date: '2026-10-09',
    area_id: 'TUAN', // Khu Tuân
    vehicle_plate: '15C-22405',
    driver_name: 'Vũ Văn Liêm',
    is_subcontractor: false,
    customer_name: 'TTP',
    route_name: 'ĐÓNG BÌNH XUYÊN',
    pickup_location: 'MEDLOG MINH PHƯƠNG',
    dropoff_location: 'BÌNH XUYÊN - VĨNH PHÚC',
    container_number: 'MSMU5022544',
    container_size: '40',
    container_type: 'DC',
    status: 'COMPLETED', // Hoàn thành
    reconciliation_status: 'RECONCILED', // Đã đối soát
    revenue_pre_tax: 3200000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 256000,
    total_revenue: 3456000,
    driver_salary: 550000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 1400000,
      fuel_status: 'CONFIRMED',
      toll: 200000,
      toll_status: 'CONFIRMED',
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 50000,
      other_note: 'Phí chọn vỏ cont',
      other_status: 'CONFIRMED'
    },
    direct_cost: 2450000,
    trip_profit: 750000,
    audit_trail: {
      created_by: 'Kế toán Hương',
      created_at: '2026-10-09 08:15',
      reconciled_by: 'Kế toán trưởng Lan',
      reconciled_at: '2026-10-09 16:40',
      last_edited_by: 'Kế toán Hương',
      last_edited_at: '2026-10-09 16:30',
      documents_count: 2,
      notes: 'Đã nhận phơi và vé BOT đầy đủ'
    }
  },
  {
    id: 'TRIP-20261009-002',
    trip_code: 'C20261009-002',
    trip_date: '2026-10-09',
    area_id: 'TUAN', // Khu Tuân
    vehicle_plate: '15C-35981',
    driver_name: 'Phạm Văn Tuân',
    is_subcontractor: false,
    customer_name: 'VTM',
    route_name: 'ĐÓNG LÀO CAI',
    pickup_location: 'TÂN VŨ',
    dropoff_location: 'KCN BẮC DUYÊN HẢI - LÀO CAI',
    container_number: 'TRHU4891201',
    container_size: '40',
    container_type: 'HC',
    status: 'COMPLETED',
    reconciliation_status: 'PENDING_RECONCILIATION', // Chờ đối soát
    revenue_pre_tax: 7500000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 600000,
    total_revenue: 8100000,
    driver_salary: 1200000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 3200000,
      fuel_status: 'CONFIRMED',
      toll: 600000,
      toll_status: 'CONFIRMED',
      lift_on: 280000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 100000,
      other_note: 'Vé cân xe quá cảnh',
      other_status: 'CONFIRMED'
    },
    direct_cost: 5380000,
    trip_profit: 2120000,
    audit_trail: {
      created_by: 'Kế toán Hương',
      created_at: '2026-10-09 09:20',
      reconciled_by: null,
      reconciled_at: null,
      last_edited_by: 'Kế toán Hương',
      last_edited_at: '2026-10-09 17:00',
      documents_count: 3,
      notes: 'Lái xe Tuân đã nộp vé cầu đường điện tử VETC'
    }
  },
  {
    id: 'TRIP-20261009-003',
    trip_code: 'C20261009-003',
    trip_date: '2026-10-09',
    area_id: 'TUAN_ANH', // Khu Tuấn Anh
    vehicle_plate: '15H-00266',
    driver_name: 'Trương Văn Hội',
    is_subcontractor: false,
    customer_name: 'ĐẠI THỊNH',
    route_name: 'ĐÓNG HƯNG YÊN',
    pickup_location: 'ĐÌNH VŨ',
    dropoff_location: 'KCN PHỐ NỐI A - HƯNG YÊN',
    container_number: 'TCKU7102934',
    container_size: '40',
    container_type: 'DC',
    status: 'COMPLETED',
    reconciliation_status: 'MISSING_DATA', // Chưa đủ chi phí (thiếu dầu)
    revenue_pre_tax: 2500000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 200000,
    total_revenue: 2700000,
    driver_salary: 450000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 0,
      fuel_status: 'UNENTERED', // Chưa nhập dầu!
      toll: 90000,
      toll_status: 'CONFIRMED',
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 790000,
    trip_profit: 1710000, // Tạm tính khi chưa trừ dầu
    audit_trail: {
      created_by: 'Kế toán Mai',
      created_at: '2026-10-09 10:00',
      reconciled_by: null,
      reconciled_at: null,
      last_edited_by: 'Kế toán Mai',
      last_edited_at: '2026-10-09 14:15',
      documents_count: 1,
      notes: 'Lái xe Hội chưa gửi hóa đơn cây dầu Petrolimex Đình Vũ'
    }
  },
  {
    id: 'TRIP-20261009-004',
    trip_code: 'C20261009-004',
    trip_date: '2026-10-09',
    area_id: 'TUAN', // Khu Tuân
    vehicle_plate: 'DOLTRUCK (Xe ngoài)',
    driver_name: 'Xe thuê ngoài DOLTRUCK',
    is_subcontractor: true,
    customer_name: 'TTP',
    route_name: 'ĐÓNG PHÚ THỌ',
    pickup_location: 'NAM HẢI ICD',
    dropoff_location: 'KCN THỤY VÂN - PHÚ THỌ',
    container_number: 'TEMU6193820',
    container_size: '40',
    container_type: 'DC',
    status: 'COMPLETED',
    reconciliation_status: 'RECONCILED',
    revenue_pre_tax: 2700000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 216000,
    total_revenue: 2916000,
    driver_salary: 0,
    subcontractor_cost: 2300000,
    expenses: {
      fuel: 0,
      fuel_status: 'ZERO_CONFIRMED',
      toll: 0,
      toll_status: 'ZERO_CONFIRMED',
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 2550000,
    trip_profit: 150000,
    audit_trail: {
      created_by: 'Kế toán Hương',
      created_at: '2026-10-09 11:30',
      reconciled_by: 'Kế toán trưởng Lan',
      reconciled_at: '2026-10-09 17:15',
      last_edited_by: 'Kế toán Hương',
      last_edited_at: '2026-10-09 17:10',
      documents_count: 1,
      notes: 'Đã nhận hóa đơn dịch vụ vận tải của Doltruck'
    }
  },
  {
    id: 'TRIP-20261009-005',
    trip_code: 'C20261009-005',
    trip_date: '2026-10-09',
    area_id: 'TUAN_ANH', // Khu Tuấn Anh
    vehicle_plate: '15H-04255',
    driver_name: 'Nguyễn Văn Nam',
    is_subcontractor: false,
    customer_name: 'THÁI BÌNH CHÂU Á',
    route_name: 'HẠ BÃI TIÊN LÃNG (LỖ DO SỰ CỐ)',
    pickup_location: 'HICT',
    dropoff_location: 'TIÊN LÃNG - HẢI PHÒNG',
    container_number: 'SUDU8302194',
    container_size: '40',
    container_type: 'OT',
    status: 'COMPLETED',
    reconciliation_status: 'RECONCILED',
    revenue_pre_tax: 1800000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 144000,
    total_revenue: 1944000,
    driver_salary: 400000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 950000,
      fuel_status: 'CONFIRMED',
      toll: 70000,
      toll_status: 'CONFIRMED',
      lift_on: 260000,
      lift_on_status: 'CONFIRMED',
      lift_off: 260000,
      lift_off_status: 'CONFIRMED',
      other: 650000,
      other_note: 'Sửa van hơi phanh khẩn cấp trên đường 354',
      other_status: 'CONFIRMED'
    },
    direct_cost: 2590000,
    trip_profit: -790000, // Chuyến lỗ
    audit_trail: {
      created_by: 'Kế toán Mai',
      created_at: '2026-10-09 13:00',
      reconciled_by: 'Kế toán trưởng Lan',
      reconciled_at: '2026-10-09 17:30',
      last_edited_by: 'Kế toán Mai',
      last_edited_at: '2026-10-09 17:25',
      documents_count: 3,
      notes: 'Đã đính kèm biên lai sửa xe gara Hoàng Mai'
    }
  },
  {
    id: 'TRIP-20261009-006',
    trip_code: 'C20261009-006',
    trip_date: '2026-10-09',
    area_id: 'TUAN', // Khu Tuân
    vehicle_plate: '15C-22405',
    driver_name: 'Vũ Văn Liêm',
    is_subcontractor: false,
    customer_name: 'VTM',
    route_name: 'VỎ RỖNG VỀ TÂN VŨ',
    pickup_location: 'BÌNH XUYÊN',
    dropoff_location: 'TÂN VŨ',
    container_number: 'MSMU5022544',
    container_size: '40',
    container_type: 'DC',
    status: 'COMPLETED',
    reconciliation_status: 'RECONCILED',
    revenue_pre_tax: 2100000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 168000,
    total_revenue: 2268000,
    driver_salary: 450000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 1100000,
      fuel_status: 'CONFIRMED',
      toll: 150000,
      toll_status: 'CONFIRMED',
      lift_on: 0,
      lift_on_status: 'ZERO_CONFIRMED',
      lift_off: 250000,
      lift_off_status: 'CONFIRMED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 1950000,
    trip_profit: 150000,
    audit_trail: {
      created_by: 'Kế toán Hương',
      created_at: '2026-10-09 14:00',
      reconciled_by: 'Kế toán trưởng Lan',
      reconciled_at: '2026-10-09 17:40',
      last_edited_by: 'Kế toán Hương',
      last_edited_at: '2026-10-09 17:35',
      documents_count: 2,
      notes: 'Cuốc kéo vỏ về bãi hạ Tân Vũ'
    }
  },
  {
    id: 'TRIP-20261009-007',
    trip_code: 'C20261009-007',
    trip_date: '2026-10-09',
    area_id: 'TUAN', // Khu Tuân
    vehicle_plate: '15C-35981',
    driver_name: 'Phạm Văn Tuân',
    is_subcontractor: false,
    customer_name: 'ĐẠI THỊNH',
    route_name: 'ĐÓNG YÊN PHONG - BẮC NINH',
    pickup_location: 'ĐÌNH VŨ',
    dropoff_location: 'YÊN PHONG - BẮC NINH',
    container_number: 'CBHU9012384',
    container_size: '40',
    container_type: 'HC',
    status: 'RUNNING', // Đang chạy
    reconciliation_status: 'MISSING_DATA',
    revenue_pre_tax: 2900000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 232000,
    total_revenue: 3132000,
    driver_salary: 500000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 1200000,
      fuel_status: 'CONFIRMED',
      toll: 0,
      toll_status: 'UNENTERED',
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'UNENTERED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 1950000,
    trip_profit: 950000, // Lãi dự kiến
    audit_trail: {
      created_by: 'Kế toán Hương',
      created_at: '2026-10-09 15:10',
      reconciled_by: null,
      reconciled_at: null,
      last_edited_by: 'Kế toán Hương',
      last_edited_at: '2026-10-09 15:10',
      documents_count: 1,
      notes: 'Xe đang trên đường giao hàng'
    }
  },
  {
    id: 'TRIP-20261009-008',
    trip_code: 'C20261009-008',
    trip_date: '2026-10-09',
    area_id: 'TUAN_ANH', // Khu Tuấn Anh
    vehicle_plate: '15H-00266',
    driver_name: 'Trương Văn Hội',
    is_subcontractor: false,
    customer_name: 'AN PHÚ',
    route_name: 'KẸP 2X20 CẢNG HẢI AN',
    pickup_location: 'HẢI AN',
    dropoff_location: 'AN DƯƠNG - HẢI PHÒNG',
    container_number: 'BSIU2019482 / FSCU2910481',
    container_size: '2x20',
    container_type: 'DC',
    status: 'RUNNING', // Đang chạy
    reconciliation_status: 'MISSING_DATA',
    revenue_pre_tax: 2400000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 192000,
    total_revenue: 2592000,
    driver_salary: 550000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 600000,
      fuel_status: 'CONFIRMED',
      toll: 0,
      toll_status: 'ZERO_CONFIRMED',
      lift_on: 400000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'UNENTERED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 1550000,
    trip_profit: 850000, // Lãi dự kiến
    audit_trail: {
      created_by: 'Kế toán Mai',
      created_at: '2026-10-09 16:00',
      reconciled_by: null,
      reconciled_at: null,
      last_edited_by: 'Kế toán Mai',
      last_edited_at: '2026-10-09 16:00',
      documents_count: 1,
      notes: 'Đơn hàng cont kẹp 2x20'
    }
  },

  // --- NGÀY HÔM QUA (2026-10-08) ---
  {
    id: 'TRIP-20261008-001',
    trip_code: 'C20261008-001',
    trip_date: '2026-10-08',
    area_id: 'TUAN', // Khu Tuân
    vehicle_plate: '15C-22405',
    driver_name: 'Vũ Văn Liêm',
    is_subcontractor: false,
    customer_name: 'TTP',
    route_name: 'ĐÓNG QUANG MINH - HÀ NỘI',
    pickup_location: 'TÂN VŨ',
    dropoff_location: 'KCN QUANG MINH - MÊ LINH',
    container_number: 'CMAU9210384',
    container_size: '40',
    container_type: 'DC',
    status: 'COMPLETED',
    reconciliation_status: 'RECONCILED',
    revenue_pre_tax: 2800000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 224000,
    total_revenue: 3024000,
    driver_salary: 500000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 1250000,
      fuel_status: 'CONFIRMED',
      toll: 180000,
      toll_status: 'CONFIRMED',
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 2180000,
    trip_profit: 620000,
    audit_trail: {
      created_by: 'Kế toán Hương',
      created_at: '2026-10-08 07:45',
      reconciled_by: 'Kế toán trưởng Lan',
      reconciled_at: '2026-10-08 17:00',
      last_edited_by: 'Kế toán Hương',
      last_edited_at: '2026-10-08 16:50',
      documents_count: 2,
      notes: 'Đã hoàn tất thanh quyết toán hôm qua'
    }
  },
  {
    id: 'TRIP-20261008-002',
    trip_code: 'C20261008-002',
    trip_date: '2026-10-08',
    area_id: 'TUAN_ANH', // Khu Tuấn Anh
    vehicle_plate: '15H-00266',
    driver_name: 'Trương Văn Hội',
    is_subcontractor: false,
    customer_name: 'VTM',
    route_name: 'ĐÓNG ĐỒNG VĂN - HÀ NAM',
    pickup_location: 'NAM HẢI ICD',
    dropoff_location: 'KCN ĐỒNG VĂN - HÀ NAM',
    container_number: 'GLDU3910294',
    container_size: '40',
    container_type: 'HC',
    status: 'COMPLETED',
    reconciliation_status: 'RECONCILED',
    revenue_pre_tax: 2700000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 216000,
    total_revenue: 2916000,
    driver_salary: 480000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 1200000,
      fuel_status: 'CONFIRMED',
      toll: 160000,
      toll_status: 'CONFIRMED',
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 2090000,
    trip_profit: 610000,
    audit_trail: {
      created_by: 'Kế toán Mai',
      created_at: '2026-10-08 08:30',
      reconciled_by: 'Kế toán trưởng Lan',
      reconciled_at: '2026-10-08 17:15',
      last_edited_by: 'Kế toán Mai',
      last_edited_at: '2026-10-08 17:10',
      documents_count: 2,
      notes: 'Đã nhận phơi đầy đủ'
    }
  },
  {
    id: 'TRIP-20261008-003',
    trip_code: 'C20261008-003',
    trip_date: '2026-10-08',
    area_id: 'TUAN_ANH', // Khu Tuấn Anh
    vehicle_plate: '15H-04255',
    driver_name: 'Nguyễn Văn Nam',
    is_subcontractor: false,
    customer_name: 'ĐẠI THỊNH',
    route_name: 'ĐÓNG PHỐ NỐI - HƯNG YÊN',
    pickup_location: 'ĐÌNH VŨ',
    dropoff_location: 'PHỐ NỐI - HƯNG YÊN',
    container_number: 'KKFU1920391',
    container_size: '40',
    container_type: 'DC',
    status: 'COMPLETED',
    reconciliation_status: 'PENDING_RECONCILIATION',
    revenue_pre_tax: 2500000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 200000,
    total_revenue: 2700000,
    driver_salary: 450000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 1100000,
      fuel_status: 'CONFIRMED',
      toll: 90000,
      toll_status: 'CONFIRMED',
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 1890000,
    trip_profit: 610000,
    audit_trail: {
      created_by: 'Kế toán Mai',
      created_at: '2026-10-08 09:00',
      reconciled_by: null,
      reconciled_at: null,
      last_edited_by: 'Kế toán Mai',
      last_edited_at: '2026-10-08 17:30',
      documents_count: 2,
      notes: 'Chờ duyệt bảng kê'
    }
  },
  {
    id: 'TRIP-20261008-004',
    trip_code: 'C20261008-004',
    trip_date: '2026-10-08',
    area_id: 'TUAN', // Khu Tuân
    vehicle_plate: '15C-35981',
    driver_name: 'Phạm Văn Tuân',
    is_subcontractor: false,
    customer_name: 'AN PHÚ',
    route_name: 'ĐÓNG ĐÌNH TRÁM - BẮC GIANG',
    pickup_location: 'TÂN VŨ',
    dropoff_location: 'KCN ĐÌNH TRÁM - BẮC GIANG',
    container_number: 'TGHU8201942',
    container_size: '40',
    container_type: 'DC',
    status: 'COMPLETED',
    reconciliation_status: 'MISSING_DATA', // Thiếu hóa đơn BOT
    revenue_pre_tax: 2900000,
    vat_type: 'V',
    vat_rate: 8,
    vat_amount: 232000,
    total_revenue: 3132000,
    driver_salary: 500000,
    subcontractor_cost: 0,
    expenses: {
      fuel: 1300000,
      fuel_status: 'CONFIRMED',
      toll: 0,
      toll_status: 'UNENTERED', // Chưa nhập BOT
      lift_on: 250000,
      lift_on_status: 'CONFIRMED',
      lift_off: 0,
      lift_off_status: 'ZERO_CONFIRMED',
      other: 0,
      other_note: '',
      other_status: 'ZERO_CONFIRMED'
    },
    direct_cost: 2050000,
    trip_profit: 850000, // Tạm tính do thiếu BOT
    audit_trail: {
      created_by: 'Kế toán Hương',
      created_at: '2026-10-08 10:15',
      reconciled_by: null,
      reconciled_at: null,
      last_edited_by: 'Kế toán Hương',
      last_edited_at: '2026-10-08 15:00',
      documents_count: 1,
      notes: 'Lái xe chưa nộp biên lai vé BOT quốc lộ 1A'
    }
  }
];

export const COMPANY_VEHICLES = [
  { plate: '15C-22405', default_driver: 'Vũ Văn Liêm', area_id: 'TUAN', is_subcontractor: false, note: 'Đầu kéo công ty' },
  { plate: '15C-35981', default_driver: 'Phạm Văn Tuân', area_id: 'TUAN', is_subcontractor: false, note: 'Đầu kéo công ty' },
  { plate: '15H-00266', default_driver: 'Trương Văn Hội', area_id: 'TUAN_ANH', is_subcontractor: false, note: 'Đầu kéo công ty' },
  { plate: '15H-04255', default_driver: 'Nguyễn Văn Nam', area_id: 'TUAN_ANH', is_subcontractor: false, note: 'Đầu kéo công ty' },
  { plate: '15C-99881', default_driver: 'Lê Anh Sức', area_id: 'TUAN_ANH', is_subcontractor: false, note: 'Xe dự phòng / Trực bãi' },
  { plate: 'DOLTRUCK (Xe ngoài)', default_driver: 'Xe thuê ngoài DOLTRUCK', area_id: 'TUAN', is_subcontractor: true, note: 'Xe vệ tinh thầu phụ' }
];

export const COMPANY_DRIVERS = [
  { name: 'Vũ Văn Liêm', default_plate: '15C-22405', area_id: 'TUAN', is_subcontractor: false, note: 'Tài xế chính thức' },
  { name: 'Phạm Văn Tuân', default_plate: '15C-35981', area_id: 'TUAN', is_subcontractor: false, note: 'Tài xế chính thức' },
  { name: 'Trương Văn Hội', default_plate: '15H-00266', area_id: 'TUAN_ANH', is_subcontractor: false, note: 'Tài xế chính thức' },
  { name: 'Nguyễn Văn Nam', default_plate: '15H-04255', area_id: 'TUAN_ANH', is_subcontractor: false, note: 'Tài xế chính thức' },
  { name: 'Lê Anh Sức', default_plate: '15C-99881', area_id: 'TUAN_ANH', is_subcontractor: false, note: 'Tài xế dự phòng / Trực bãi' },
  { name: 'Xe thuê ngoài DOLTRUCK', default_plate: 'DOLTRUCK (Xe ngoài)', area_id: 'TUAN', is_subcontractor: true, note: 'Đối tác xe thuê ngoài' }
];

export const INITIAL_EXECUTIVE_TASKS = [
  {
    id: 'TASK-01',
    title: 'Yêu cầu giải thích chuyến lỗ & kiểm tra chi phí sửa chữa van hơi (-790k)',
    issue_impact: 'Chuyến C20261009-005 bị lỗ -790.000 đ do chi phí sửa van hơi phanh khẩn cấp trên đường 354 hết 1.800.000 đ. Cần kiểm tra lại báo giá của gara Tiên Lãng và biên bản sự cố hiện trường.',
    related_type: 'TRIP',
    related_code: 'C20261009-005',
    related_info: 'Chuyến C20261009-005 • Xe 15H-04255 • Lái xe Nguyễn Văn Nam',
    assignee_name: 'Nguyễn Văn Hùng (Kỹ thuật) & Kế toán Hương',
    assignee_role: 'Kỹ thuật đội xe & Kế toán chi phí',
    due_date: 'Hôm nay, 16:30',
    status: 'IN_PROGRESS',
    responses: [
      {
        author: 'Nguyễn Văn Hùng (Kỹ thuật)',
        time: '09/10 10:15',
        text: 'Đã yêu cầu gara Tiên Lãng chụp lại phụ tùng van hơi cũ bị hỏng và cung cấp hóa đơn linh kiện thay thế. Sẽ nộp biên bản sang kế toán lúc 15:30.'
      }
    ],
    notes: [
      {
        author: 'Giám Đốc',
        time: '09/10 09:30',
        text: 'Kiểm tra kỹ xem van này đã thay định kỳ đợt tháng 8 chưa, nếu còn bảo hành thì yêu cầu gara giảm trừ.'
      }
    ]
  },
  {
    id: 'TASK-02',
    title: 'Bố trí hàng cho xe nội bộ 15C-99881 trực bãi, cắt giảm thuê ngoài DOLTRUCK',
    issue_impact: 'Xe 15C-99881 (Lê Anh Sức) trực bãi cả ngày không có chuyến, trong khi công ty phải trả 2.300.000 đ thuê xe ngoài DOLTRUCK đóng hàng Phú Thọ. Cần ưu tiên xe công ty để tăng hiệu suất tài sản.',
    related_type: 'VEHICLE',
    related_code: '15C-99881',
    related_info: 'Xe 15C-99881 • Lái xe Lê Anh Sức • Trực bãi Đình Vũ',
    assignee_name: 'Trần Văn Tuấn (Điều vận)',
    assignee_role: 'Điều phối vận tải',
    due_date: 'Hôm nay, 17:00',
    status: 'TODO',
    responses: [
      {
        author: 'Trần Văn Tuấn (Điều vận)',
        time: '09/10 10:00',
        text: 'Đang liên hệ kho VTM Tân Vũ để xin cấp vỏ cont 40HC, dự kiến chiều nay bố trí xe 15C-99881 bốc chuyến VTM đi Lào Cai.'
      }
    ],
    notes: [
      {
        author: 'Giám Đốc',
        time: '09/10 08:45',
        text: 'Ưu tiên tối đa xe công ty trước khi gọi xe ngoài.'
      }
    ]
  },
  {
    id: 'TASK-03',
    title: 'Thu hồi gấp hóa đơn dầu Petrolimex và vé BOT của 3 chuyến tạm tính',
    issue_impact: 'Có 3 chuyến chưa đủ chứng từ (dầu/BOT) khiến khoản lãi 3.830.000 đ vẫn phải ghi nhận là Lãi tạm tính, chưa thể khóa sổ chốt lãi thực tế trong kỳ.',
    related_type: 'RECONCILIATION',
    related_code: '3 CHUYẾN CHƯA ĐỐI SOÁT',
    related_info: 'Chuyến C20261009-003, C20261009-007, C20261009-008',
    assignee_name: 'Lê Thu Hương (Kế toán)',
    assignee_role: 'Kế toán chuyến',
    due_date: 'Ngày mai, 10:00 (10/10)',
    status: 'IN_PROGRESS',
    responses: [
      {
        author: 'Lê Thu Hương (Kế toán)',
        time: '09/10 11:20',
        text: 'Đã nhận ảnh hóa đơn điện tử dầu của xe 15H-00266 qua Zalo. Còn 2 chuyến của ngày 08/10 đang chờ tài xế nộp lại cuống vé BOT gốc.'
      }
    ],
    notes: []
  },
  {
    id: 'TASK-04',
    title: 'Phê duyệt & theo dõi tiến độ bảo dưỡng định kỳ thay dầu xe 15H-00266',
    issue_impact: 'Xe 15H-00266 đến chu kỳ thay dầu động cơ và bảo dưỡng phanh sau 15.000 km chạy liên tục tuyến Đình Vũ - Hưng Yên.',
    related_type: 'MAINTENANCE',
    related_code: '15H-00266',
    related_info: 'Xe 15H-00266 • Lái xe Trương Văn Hội • Trạm dịch vụ số 2',
    assignee_name: 'Nguyễn Văn Hùng (Kỹ thuật)',
    assignee_role: 'Kỹ thuật & Bảo dưỡng',
    due_date: 'Hôm qua, 18:00 (Đã hoàn tất)',
    status: 'DONE',
    responses: [
      {
        author: 'Nguyễn Văn Hùng (Kỹ thuật)',
        time: '08/10 17:45',
        text: 'Đã thay dầu Motul HD và kiểm tra hệ thống phanh tại trạm dịch vụ số 2. Xe đạt tiêu chuẩn an toàn và đã bàn giao cho tài xế Hội tiếp tục chạy sáng nay.'
      }
    ],
    notes: [
      {
        author: 'Giám Đốc',
        time: '08/10 14:00',
        text: 'Đã duyệt chi phí bảo dưỡng 3.200.000 đ.'
      }
    ]
  }
];

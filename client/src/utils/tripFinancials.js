/**
 * Shared business calculation and normalization rules for Frontend (Codex Standardization Plan 2026-10-28)
 */

export const VAT_RATE_DEFAULT = 0.08;
export const INTERNAL_DEDUCTION_RATE_DEFAULT = 0.17;

export const STANDARD_CONTAINER_TYPES = [
  '20DC',
  '40DC',
  '40HC',
  '40RF',
  '40FR',
  '45',
];

export function toIntVnd(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
}

export function calculateFareBreakdown(baseFareInput) {
  const cuoc_goc = Math.max(0, toIntVnd(baseFareInput));
  const vat_amount = Math.round(cuoc_goc * VAT_RATE_DEFAULT);
  const cuoc_co_vat = cuoc_goc + vat_amount;
  const khoan_tru_17 = Math.round(cuoc_co_vat * INTERNAL_DEDUCTION_RATE_DEFAULT);
  const cuoc_sau_tru_17 = cuoc_co_vat - khoan_tru_17;

  return {
    cuoc_goc,
    base_revenue: cuoc_goc,
    vat_rate: VAT_RATE_DEFAULT,
    vat_amount,
    vat_8: vat_amount,
    cuoc_co_vat,
    total_revenue: cuoc_co_vat,
    deduction_rate: INTERNAL_DEDUCTION_RATE_DEFAULT,
    khoan_tru_17,
    deduction_amount: khoan_tru_17,
    cuoc_sau_tru_17,
    revenue_after_deduction: cuoc_sau_tru_17,
  };
}

export function normalizeContainerType(rawInput, fallbackSize = '') {
  const rawStr = String(rawInput ?? '').trim();
  const fbStr = String(fallbackSize ?? '').trim();
  const combined = rawStr || fbStr;

  if (!combined) {
    return {
      container_code: '',
      container_type: '',
      container_size: '',
      container_kind: '',
      raw_container_type: '',
      is_known_standard: false,
      is_standard: false,
      needs_classification: false,
    };
  }

  const upper = combined.toUpperCase().replace(/\s+/g, '');

  if (upper === '20DC' || upper === '20') {
    const code = upper === '20' ? '20' : '20DC';
    return {
      container_code: code,
      container_type: code,
      container_size: '20',
      container_kind: 'DC',
      raw_container_type: combined,
      is_known_standard: true,
      is_standard: true,
      needs_classification: false,
    };
  }
  if (upper === '40DC' || upper === '40') {
    const code = upper === '40' ? '40' : '40DC';
    return {
      container_code: code,
      container_type: code,
      container_size: '40',
      container_kind: 'DC',
      raw_container_type: combined,
      is_known_standard: true,
      is_standard: true,
      needs_classification: false,
    };
  }
  if (upper === '40HC' || upper === '40HQ') {
    return {
      container_code: '40HC',
      container_type: '40HC',
      container_size: '40',
      container_kind: 'HC',
      raw_container_type: combined,
      is_known_standard: true,
      is_standard: true,
      needs_classification: false,
    };
  }
  if (upper === '40RF' || upper === '40RH') {
    return {
      container_code: '40RF',
      container_type: '40RF',
      container_size: '40',
      container_kind: 'RF',
      raw_container_type: combined,
      is_known_standard: true,
      is_standard: true,
      needs_classification: false,
    };
  }
  if (upper === '40FR') {
    return {
      container_code: '40FR',
      container_type: '40FR',
      container_size: '40',
      container_kind: 'FR',
      raw_container_type: combined,
      is_known_standard: true,
      is_standard: true,
      needs_classification: false,
    };
  }
  if (upper === '45' || upper === '45HC' || upper === '45DC') {
    return {
      container_code: upper,
      container_type: upper,
      container_size: '45',
      container_kind: upper === '45' ? 'HC' : upper.slice(2),
      raw_container_type: combined,
      is_known_standard: true,
      is_standard: true,
      needs_classification: false,
    };
  }

  const looksLikePlateOrAnomaly = /^[0-9]{2}[A-Z][0-9]{4,6}$/i.test(upper);
  const sizeMatch = !looksLikePlateOrAnomaly ? upper.match(/^(20|40|45)([A-Z0-9]*)$/) : null;

  if (sizeMatch) {
    return {
      container_code: upper,
      container_type: upper,
      container_size: sizeMatch[1],
      container_kind: sizeMatch[2] || 'KHÁC',
      raw_container_type: combined,
      is_known_standard: false,
      is_standard: false,
      needs_classification: false,
    };
  }

  return {
    container_code: combined,
    container_type: combined,
    container_size: '',
    container_kind: 'CHƯA XÁC ĐỊNH',
    raw_container_type: combined,
    is_known_standard: false,
    is_standard: false,
    needs_classification: true,
  };
}

export function calculateFuelCost(fuelLitersInput, pricePerLiterInput) {
  const fuel_liters = Math.max(0, Number(fuelLitersInput) || 0);
  const hasPrice =
    pricePerLiterInput !== null &&
    pricePerLiterInput !== undefined &&
    pricePerLiterInput !== '' &&
    Number(pricePerLiterInput) > 0;

  const fuel_unit_price = hasPrice ? toIntVnd(pricePerLiterInput) : null;

  if (fuel_liters <= 0) {
    return {
      fuel_liters: 0,
      fuel_unit_price,
      fuel_cost: 0,
      is_fuel_price_missing: false,
      fuel_status_label: 'Không cấp dầu',
    };
  }

  if (!hasPrice) {
    return {
      fuel_liters,
      fuel_unit_price: null,
      fuel_cost: 0,
      is_fuel_price_missing: true,
      fuel_status_label: 'Chưa nhập giá dầu',
    };
  }

  const fuel_cost = Math.round(fuel_liters * fuel_unit_price);
  return {
    fuel_liters,
    fuel_unit_price,
    fuel_cost,
    is_fuel_price_missing: false,
    fuel_status_label: `${fuel_liters}L × ${fuel_unit_price.toLocaleString('vi-VN')}đ`,
  };
}

export function calculateTripFinancials(params = {}) {
  const {
    baseFare = params.base_revenue ?? params.cuoc_goc ?? params.trip_revenue ?? 0,
    subcontractorCost = params.subcontractor_cost ?? params.cuoc_ra ?? 0,
    tollFee = params.toll_fee ?? params.tien_duong ?? 0,
    liftOnFee = params.lift_on_fee ?? params.phi_nang ?? 0,
    liftOffFee = params.lift_off_fee ?? params.phi_ha ?? 0,
    legacyPortFee = params.port_fee ?? 0,
    fuelLiters = params.fuel_liters ?? params.dau_liters ?? 0,
    fuelUnitPrice = params.fuel_unit_price ?? null,
    parkingFee = params.parking_fee ?? 0,
    handlingFee = params.handling_fee ?? 0,
    mealAllowance = params.meal_allowance ?? 0,
    otherCosts = params.otherCosts ?? (params.other_costs || params.phat_sinh || 0),
    allocatedGroupCost = params.allocatedGroupCost ?? params.allocated_group_cost ?? null,
    isUnallocatedGroup = params.isUnallocatedGroup ?? params.is_unallocated_group ?? (Boolean(params.is_grouped) && params.allocation_status === 'UNALLOCATED'),
  } = params;
  const fare = calculateFareBreakdown(baseFare);
  const fuel = calculateFuelCost(fuelLiters, fuelUnitPrice);

  const c_sub = toIntVnd(subcontractorCost);
  const c_toll = toIntVnd(tollFee);
  const c_lift_on = toIntVnd(liftOnFee);
  const c_lift_off = toIntVnd(liftOffFee);
  const hasSplitLiftFees = c_lift_on > 0 || c_lift_off > 0;
  const c_legacy_port = hasSplitLiftFees ? 0 : toIntVnd(legacyPortFee);
  const has_unclassified_port_fee = !hasSplitLiftFees && c_legacy_port > 0;

  const c_parking = toIntVnd(parkingFee);
  const c_handling = toIntVnd(handlingFee);
  const c_meal = toIntVnd(mealAllowance);
  const c_other = toIntVnd(otherCosts);
  const c_other_total = c_parking + c_handling + c_meal + c_other + c_legacy_port;

  const direct_cost_without_group =
    c_sub + c_toll + c_lift_on + c_lift_off + fuel.fuel_cost + c_other_total;

  const hasAllocatedGroupCost =
    Boolean(params.is_grouped || params.group_id) &&
    allocatedGroupCost !== null &&
    allocatedGroupCost !== undefined;

  const effective_company_cost =
    hasAllocatedGroupCost
      ? toIntVnd(allocatedGroupCost) + c_lift_on + c_lift_off + fuel.fuel_cost + c_parking + c_handling + c_meal
      : direct_cost_without_group;

  const chenh_lech_sau_tru_17 = isUnallocatedGroup
    ? null
    : fare.cuoc_sau_tru_17 - effective_company_cost;

  const chenh_lech_truoc_tru_goc = isUnallocatedGroup
    ? null
    : fare.cuoc_goc - effective_company_cost;
  const chenh_lech_truoc_tru_co_vat = isUnallocatedGroup
    ? null
    : fare.cuoc_co_vat - effective_company_cost;

  const is_result_incomplete = Boolean(isUnallocatedGroup || fuel.is_fuel_price_missing);

  return {
    ...fare,
    ...fuel,
    phi_nang: c_lift_on,
    phi_ha: c_lift_off,
    port_fee_unclassified: c_legacy_port,
    has_unclassified_port_fee,
    cuoc_ngoai: c_sub,
    tien_duong: c_toll,
    chi_phi_khac: c_other_total,
    chi_phi_cong_ty: effective_company_cost,
    chenh_lech_sau_tru_17,
    chenh_lech_truoc_tru_goc,
    chenh_lech_truoc_tru_co_vat,
    is_result_incomplete,
    result_note: isUnallocatedGroup
      ? 'Nhóm chi phí gộp chưa phân bổ — chỉ kết luận ở cấp nhóm'
      : fuel.is_fuel_price_missing
      ? 'Chưa trừ lương • Chưa đủ tiền dầu (thiếu giá dầu ngày chạy)'
      : 'Chưa trừ lương',
  };
}

export const computeTripFinancials = calculateTripFinancials;

/**
 * Xác định tháng hạch toán chuẩn (YYYY-MM) của một chuyến xe.
 * Ưu tiên đọc từ tên sheet nguồn (T1-26, T7-2026 , T11-2026...) để bảo toàn đúng kỳ bảng kê
 * ngay cả khi ô ngày nguồn có lỗi đánh máy năm (2025 hoặc 2027).
 */
export function getTripAccountingMonth(trip) {
  const sheet = String(trip?.source_sheet || '').trim();
  const mMatch = sheet.match(/^T(\d{1,2})[-_]/i);
  if (mMatch) {
    return `2026-${String(parseInt(mMatch[1], 10)).padStart(2, '0')}`;
  }
  const d = String(trip?.trip_date || '').trim();
  if (/^2025-01/.test(d)) return '2026-01';
  if (/^\d{4}-\d{2}/.test(d)) {
    return d.slice(0, 7);
  }
  return '';
}

/**
 * Tính toán đầy đủ tất cả các thông số sản lượng, doanh thu, chi phí, chênh lệch, công nợ và tiền phơi
 * cho một tập hợp chuyến xe (theo từng tháng hoặc cả năm).
 */
export function computeAggregateMetrics(tripsList = []) {
  let totalCuocGoc = 0;
  let totalVat8 = 0;
  let totalCuocCoVat = 0;
  let totalKhoanTru17 = 0;
  let totalCuocSauTru17 = 0;
  let totalChiPhiCongTy = 0;
  let totalToll = 0;
  let totalCuocRa = 0;
  let totalPhatSinh = 0;
  let totalPhiNang = 0;
  let totalPhiHa = 0;
  let totalFuelLiters = 0;
  let totalTienDau = 0;
  let missingFuelPriceTrips = 0;
  let totalPhoiTraHo = 0;
  let totalPhoiDaHoan = 0;
  let totalPhoiConPhaiThu = 0;
  let totalDaThuKhach = 0;
  let totalDoiTruKhach = 0;
  let totalConPhaiThuKhach = 0;
  let houseTripsCount = 0;
  let subTripsCount = 0;

  const housePlatesSet = new Set();
  const subPartnersSet = new Set();
  const customersSet = new Set();

  tripsList.forEach((t) => {
    const f = calculateTripFinancials({
      base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
      lift_on_fee: t.phi_nang ?? t.lift_on_fee ?? 0,
      lift_off_fee: t.phi_ha ?? t.lift_off_fee ?? 0,
      port_fee: t.port_fee ?? 0,
      fuel_liters: t.dau_liters ?? t.dau_lit ?? t.fuel_liters ?? 0,
      fuel_unit_price: t.don_gia_dau ?? t.fuel_unit_price ?? null,
      fuel_cost: t.tien_dau ?? t.fuel_cost ?? null,
      toll_fee: t.tien_duong ?? t.toll_fee ?? 0,
      subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0,
      other_costs: t.phat_sinh ?? t.other_costs ?? 0,
      phoi_advance_amount: t.phoi_tra_ho ?? t.phoi_advance_amount ?? 0,
      phoi_refunded_amount: t.phoi_da_hoan ?? t.phoi_refunded_amount ?? 0,
    });

    if (t.is_subcontractor) {
      subTripsCount += 1;
      const pName = t.subcontractor_name || t.vehicle_plate;
      if (pName && pName !== 'ĐÃ TT' && pName !== 'MẸ ĐÃ TT') {
        subPartnersSet.add(pName);
      }
    } else {
      houseTripsCount += 1;
      const plate = t.vehicle_plate || t.so_xe;
      if (plate && plate !== 'Xe ngoài' && plate !== 'ĐÃ TT' && plate !== 'MẸ ĐÃ TT') {
        housePlatesSet.add(plate);
      }
    }

    if (t.customer_name) {
      customersSet.add(t.customer_name);
    }

    totalCuocGoc += f.cuoc_goc;
    totalVat8 += f.vat_amount;
    totalCuocCoVat += f.cuoc_co_vat;
    totalKhoanTru17 += f.khoan_tru_17;
    totalCuocSauTru17 += f.cuoc_sau_tru_17;
    totalChiPhiCongTy += f.chi_phi_cong_ty;
    totalToll += f.tien_duong;
    totalCuocRa += f.cuoc_ngoai;
    totalPhatSinh += f.chi_phi_khac;
    totalPhiNang += f.phi_nang;
    totalPhiHa += f.phi_ha;
    totalFuelLiters += f.fuel_liters;
    totalTienDau += f.fuel_cost;
    if (f.is_fuel_price_missing) missingFuelPriceTrips += 1;

    const phoiAdv = Number(t.phoi_total_advance ?? t.phoi_tra_ho ?? t.phoi_advance_amount ?? 0);
    const phoiDue = Number(t.phoi_balance_due ?? t.phoi_con_phai_thu ?? 0);
    const phoiRef = Number(t.phoi_total_refunded ?? t.phoi_da_hoan ?? Math.max(0, phoiAdv - phoiDue));

    totalPhoiTraHo += phoiAdv;
    totalPhoiConPhaiThu += phoiDue;
    totalPhoiDaHoan += phoiRef;

    totalDaThuKhach += Number(t.received_amount ?? 0);
    totalDoiTruKhach += Number(t.offset_amount ?? 0);
    totalConPhaiThuKhach += Number(t.fare_balance_base ?? 0);
  });

  const totalChenhLechSauTru17 = totalCuocSauTru17 - totalChiPhiCongTy;
  const totalChenhLechTruocTruCoVat = totalCuocCoVat - totalChiPhiCongTy;

  let journeyCount = tripsList.length;
  if (tripsList.length > 0) {
    const singleCount = tripsList.filter((t) => !t.is_grouped).length;
    const groupCount = new Set(tripsList.filter((t) => t.is_grouped).map((t) => t.group_id)).size;
    journeyCount = singleCount + groupCount;
  }

  return {
    completedCount: tripsList.length,
    journeyCount,
    houseTripsCount,
    subTripsCount,
    activeVehiclesCount: housePlatesSet.size,
    subPartnersCount: subPartnersSet.size,
    customersCount: customersSet.size,
    totalCuocGoc,
    totalVat8,
    totalCuocCoVat,
    totalKhoanTru17,
    totalCuocSauTru17,
    totalChiPhiCongTy,
    totalChenhLechSauTru17,
    totalChenhLechTruocTruCoVat,
    totalToll,
    totalCuocRa,
    totalPhatSinh,
    totalPhiNang,
    totalPhiHa,
    totalNangHaPhatSinh: totalPhiNang + totalPhiHa + totalPhatSinh,
    totalFuelLiters,
    totalTienDau,
    missingFuelPriceTrips,
    totalPhoiTraHo,
    totalPhoiDaHoan,
    totalPhoiConPhaiThu,
    totalDaThuKhach,
    totalDoiTruKhach,
    totalConPhaiThuKhach,
  };
}


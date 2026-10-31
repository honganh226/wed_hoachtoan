/**
 * Shared business calculation and normalization rules (Codex Standardization Plan 2026-10-28)
 *
 * Rules:
 * 1. Base fare (`cuoc_goc` / `base_revenue`) is PRE-VAT.
 * 2. VAT 8% (`vat_amount`) = Math.round(cuoc_goc * 0.08).
 * 3. Total fare with VAT (`cuoc_co_vat` / `total_revenue`) = cuoc_goc + vat_amount (cuoc_goc * 1.08).
 * 4. Internal 17% deduction (`khoan_tru_17` / `deduction_amount`) = Math.round(cuoc_co_vat * 0.17).
 * 5. Fare after 17% deduction (`cuoc_sau_tru_17` / `revenue_after_deduction`) = cuoc_co_vat - khoan_tru_17 (cuoc_co_vat * 0.83).
 * 6. Tiền phơi trả hộ (`eir_advances`) is NOT included in revenue and NOT subtracted in company trip cost/margin.
 * 7. Lift-on (`lift_on_fee`) and Lift-off (`lift_off_fee`) are company costs, each counted once.
 * 8. Fuel cost (`fuel_cost`) = Math.round(fuel_liters * fuel_unit_price) based on trip run date (`trip_date`).
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

/**
 * Calculates the 5 core fare indicators from pre-VAT base fare.
 * Rounds each step to integer VND so period totals summed from rows match detail tables.
 */
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

/**
 * Parses and normalizes container size & type without corrupting 40FR -> 40RF
 * or forcing unknown source text (like '15H00267') into cont 40.
 */
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

  // Exact standard types
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

  // Other custom or unknown values (e.g. '15H00267' in G71:G72 of tháng 1.xlsx)
  // Do NOT turn into 40 or 20 automatically!
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

/**
 * Calculates fuel cost for a single trip from fuel_liters and the daily unit price on trip_date.
 */
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

/**
 * Calculates all 7 required trip financial indicators:
 * 1. Cước vào chưa VAT (`cuoc_goc`)
 * 2. VAT 8% (`vat_amount`)
 * 3. Cước vào có VAT (`cuoc_co_vat`)
 * 4. Khoản trừ 17% trên cước có VAT (`khoan_tru_17`)
 * 5. Cước sau khoản trừ 17% (`cuoc_sau_tru_17`)
 * 6. Chi phí công ty đã ghi nhận (`chi_phi_cong_ty`)
 * 7. Chênh lệch tạm tính sau khoản trừ và chi phí (`chenh_lech_sau_tru_17`)
 *
 * Also preserves `chenh_lech_truoc_tru_17` (against cuoc_goc and cuoc_co_vat) for historical comparison.
 * NEVER subtracts `tien_phoi_tra_ho` (customer EIR advance).
 */
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
  // Prevent double counting: if lift_on_fee or lift_off_fee is already split/entered, do not add legacyPortFee
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

  // Chênh lệch tạm tính sau khoản trừ 17% và chi phí (Indicator #7)
  const chenh_lech_sau_tru_17 = isUnallocatedGroup
    ? null
    : fare.cuoc_sau_tru_17 - effective_company_cost;

  // Chênh lệch trước khoản trừ (đối chiếu lịch sử trên cước gốc chưa VAT và trên cước có VAT)
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

/**
 * Computes current date string YYYY-MM-DD in Asia/Ho_Chi_Minh timezone.
 */
export function getVietnamTodayIso(referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(referenceDate);
}

/**
 * Evaluates EIR advance refund status & reminder state.
 */
export function evaluateEirAdvanceState(advance, todayVnIso = getVietnamTodayIso()) {
  const advanceAmount = Math.max(0, toIntVnd(advance?.advance_amount));
  const refundedAmount = Math.max(0, toIntVnd(advance?.refunded_amount));
  const isNonFinancial = Boolean(advance?.is_non_financial_note);
  const rawSource = String(advance?.raw_source_value || '').trim();

  if (isNonFinancial || (advanceAmount === 0 && rawSource)) {
    return {
      advance_amount: 0,
      refunded_amount: 0,
      balance_due: 0,
      refund_status: 'GHI_CHU_NGUON',
      refund_status_label: rawSource || 'Ghi chú nguồn (không phát sinh nợ)',
      reminder_status: 'NONE',
      reminder_label: 'Không phải khoản nợ',
      is_completed: false,
    };
  }

  const balanceDue = Math.max(0, advanceAmount - refundedAmount);
  let refundStatus = 'CHUA_HOAN';
  let refundStatusLabel = 'Chưa hoàn';

  if (advanceAmount > 0 && balanceDue === 0) {
    refundStatus = 'DA_HOAN';
    refundStatusLabel = advance?.payment_term_type === 'TUOI' ? 'Đã hoàn (TƯƠI)' : 'Đã hoàn đủ';
  } else if (refundedAmount > 0 && balanceDue > 0) {
    refundStatus = 'HOAN_MOT_PHAN';
    refundStatusLabel = 'Hoàn một phần';
  }

  const dueDate = String(advance?.due_date || '').trim() || null;
  let reminderStatus = 'NONE';
  let reminderLabel = '';

  if (balanceDue > 0) {
    if (!dueDate) {
      reminderStatus = 'NO_DUE_DATE';
      reminderLabel =
        advance?.payment_term_type === 'CN_30_NGAY'
          ? 'CN 30 NGÀY (Chưa đặt ngày nhắc cụ thể)'
          : 'Chưa đặt ngày nhắc';
    } else if (dueDate < todayVnIso) {
      reminderStatus = 'OVERDUE';
      reminderLabel = `Quá hạn hoàn phơi (hẹn ${dueDate})`;
    } else if (dueDate === todayVnIso) {
      reminderStatus = 'DUE_TODAY';
      reminderLabel = `Đến hạn hoàn phơi hôm nay (${dueDate})`;
    } else {
      reminderStatus = 'UPCOMING';
      reminderLabel = `Hẹn hoàn ngày ${dueDate}`;
    }
  } else if (advanceAmount > 0 && balanceDue === 0) {
    reminderStatus = 'COMPLETED';
    reminderLabel = 'Đã tất toán tiền phơi';
  }

  return {
    advance_amount: advanceAmount,
    refunded_amount: refundedAmount,
    balance_due: balanceDue,
    remaining_amount: balanceDue,
    refund_status: refundStatus,
    refund_status_label: refundStatusLabel,
    due_date: dueDate,
    reminder_status: reminderStatus,
    reminder_label: reminderLabel,
    is_completed: advanceAmount > 0 && balanceDue === 0,
    unscheduled: reminderStatus === 'NO_DUE_DATE',
  };
}

export function isValidCalendarDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const computeTripFinancials = calculateTripFinancials;

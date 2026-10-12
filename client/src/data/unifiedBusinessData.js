/**
 * ============================================================
 * UNIFIED BUSINESS DATA HELPERS & TYPES - WED_HOACHTOAN
 * ============================================================
 * LƯU Ý BẢO MẬT BẢN ONLINE:
 * Toàn bộ dữ liệu doanh nghiệp thật (77 cuốc, cước vào, cước ra, công nợ)
 * được nạp ĐỘNG từ máy chủ Backend API có xác thực JWT (/api/v1/business/*).
 * Tuyệt đối không đóng gói dữ liệu doanh nghiệp thô vào bundle JavaScript công khai.
 * ============================================================
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

/**
 * Hàm tính phân bổ chi phí cho một nhóm cuốc xe
 * @param {object} group - Nhóm chi phí chung
 * @param {string} mode - 'PROPORTIONAL' | 'MANUAL' | 'UNALLOCATED'
 * @param {object} manualMap - Bản đồ phân bổ thủ công tripId -> số tiền
 * @param {Array} allTrips - Danh sách các cuốc xe thuộc nhóm
 */
export function calculateGroupAllocation(group, mode, manualMap = {}, allTrips = []) {
  if (!group) return [];
  const trips = (allTrips || []).filter(t => group.trips && group.trips.includes(t.id));
  const totalShared = group.total_shared_money || 0;

  if (mode === 'PROPORTIONAL') {
    let acc = 0;
    return trips.map((t, idx) => {
      const isLast = idx === trips.length - 1;
      const ratio = group.total_revenue > 0 ? t.cuoc_vao / group.total_revenue : 1 / (trips.length || 1);
      const allocated = isLast ? totalShared - acc : Math.round(totalShared * ratio);
      acc += allocated;
      return {
        trip_id: t.id,
        cuoc_vao: t.cuoc_vao,
        allocated_shared_cost: allocated,
        profit: t.cuoc_vao - (allocated + (t.phat_sinh || 0))
      };
    });
  }

  if (mode === 'MANUAL') {
    return trips.map(t => {
      const allocated = manualMap[t.id] || 0;
      return {
        trip_id: t.id,
        cuoc_vao: t.cuoc_vao,
        allocated_shared_cost: allocated,
        profit: t.cuoc_vao - (allocated + (t.phat_sinh || 0))
      };
    });
  }

  return trips.map(t => ({
    trip_id: t.id,
    cuoc_vao: t.cuoc_vao,
    allocated_shared_cost: null,
    profit: null
  }));
}

// Cấu trúc mặc định rỗng an toàn (Dữ liệu thực tế bảo vệ qua API có xác thực)
export const UNIFIED_THANG1_TRIPS = [];
export const UNIFIED_THANG1_GROUPS = [];
export const UNIFIED_THANG1_STATS = {
  total_trips: 0,
  count_journeys: 0,
  total_revenue_vat_inc: 0,
  total_known_direct_cost: 0,
  profit_before_salary_and_fuel: 0,
  total_fuel_liters: 0
};
export const UNIFIED_DEBTS_DATA = {
  receivables: { total_receivable: 0, total_paid: 0, total_offset: 0, total_remaining: 0, customers: [] },
  payables: { total_payable: 0, total_paid: 0, total_remaining: 0, subcontractors: [] }
};
export const UNIFIED_THANG1_DATA = {
  rows: [],
  groups: [],
  stats: UNIFIED_THANG1_STATS
};

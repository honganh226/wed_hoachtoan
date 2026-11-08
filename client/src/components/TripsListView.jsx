import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Truck,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { fetchBusinessTripsApi, fetchBusinessGroupsApi } from '../services/api.js';
import { calculateTripFinancials, toIntVnd, getTripAccountingMonth } from '../utils/tripFinancials.js';
import { formatVnd } from '../data/unifiedBusinessData';
import TripDetailDrawer from './TripDetailDrawer.jsx';

// Helper bỏ dấu tiếng Việt để tìm kiếm thông minh
export function removeVietnameseTones(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Hàm ánh xạ dữ liệu chuẩn dùng chung cho lọc, hiển thị, tính tiền và sắp xếp.
 * Tuân thủ nghiêm ngặt hợp đồng dữ liệu từ /api/v1/business/trips và /api/v1/business/groups.
 */
export function mapTripData(raw = {}, groupsMap = new Map()) {
  const isSubcontractor = Boolean(raw.is_subcontractor);
  const isInternal = !isSubcontractor;
  const vehiclePlate = String(raw.vehicle_plate || raw.bks_raw || '').trim();
  const subcontractorName = String(raw.subcontractor_name || '').trim();

  // Dầu cấp theo lít và đơn giá theo ngày chạy
  const fuelLiters = Math.max(0, Number(raw.dau_liters ?? raw.fuel_liters ?? 0));
  const fuelUnitPrice = raw.fuel_unit_price !== undefined && raw.fuel_unit_price !== null && raw.fuel_unit_price !== ''
    ? Number(raw.fuel_unit_price)
    : null;
  const fuelCost = raw.tien_dau ?? raw.fuel_cost ?? (fuelUnitPrice ? Math.round(fuelLiters * fuelUnitPrice) : 0);
  const isFuelPriceMissing = Boolean(fuelLiters > 0 && !fuelUnitPrice && (raw.is_fuel_price_missing ?? true));

  // Nhóm ô gộp chi phí dùng chung
  const isGrouped = Boolean(raw.is_grouped || raw.group_id);
  const groupId = raw.group_id || raw.group_key || null;
  const group = groupId ? groupsMap.get(groupId) : null;
  const allocationStatus = raw.allocation_status || (group ? group.allocation_mode : (isGrouped ? 'UNALLOCATED' : 'SINGLE'));
  const isUnallocatedGroup = isGrouped && (allocationStatus === 'UNALLOCATED');

  // Chi phí phát sinh / chi phí khác
  const otherCosts = toIntVnd(raw.other_costs || raw.phat_sinh || 0);

  // Trạng thái thanh toán chuẩn từ các cờ API
  const isOffset = Boolean(
    raw.is_offset ||
    raw.customer_payment_status === 'DOI_TRU' ||
    String(raw.payment_status_p || '').toUpperCase().includes('ĐỐI TRỪ')
  );
  const isTuoi = Boolean(
    raw.is_tuoi ||
    raw.customer_payment_status === 'TUOI' ||
    String(raw.payment_timing_q || '').trim() === 'TƯƠI'
  );
  const isPaid = Boolean(
    raw.is_customer_paid ||
    isTuoi ||
    ['DA_TT', 'TUOI', 'X'].includes(raw.customer_payment_status) ||
    String(raw.payment_status_p || '').toUpperCase().includes('ĐÃ THANH TOÁN') ||
    String(raw.payment_status_p || '').toUpperCase().includes('ĐÃ TT')
  );

  // Tính toán tài chính chuẩn xác 7 chỉ số
  const fin = calculateTripFinancials({
    baseFare: raw.cuoc_goc ?? raw.cuoc_vao ?? raw.base_revenue ?? 0,
    subcontractorCost: raw.cuoc_ra ?? raw.subcontractor_cost ?? 0,
    tollFee: raw.tien_duong ?? raw.toll_fee ?? 0,
    liftOnFee: raw.lift_on_fee ?? raw.phi_nang ?? 0,
    liftOffFee: raw.lift_off_fee ?? raw.phi_ha ?? 0,
    legacyPortFee: raw.port_fee ?? 0,
    fuelLiters: fuelLiters,
    fuelUnitPrice: fuelUnitPrice,
    parkingFee: raw.parking_fee ?? 0,
    handlingFee: raw.handling_fee ?? 0,
    mealAllowance: raw.meal_allowance ?? 0,
    otherCosts: otherCosts,
    allocatedGroupCost: isGrouped ? (raw.allocated_shared_cost ?? null) : null,
    isUnallocatedGroup: isUnallocatedGroup,
    is_grouped: isGrouped,
    group_id: groupId,
  });

  return {
    ...raw,
    is_subcontractor: isSubcontractor,
    is_internal_vehicle: isInternal,
    vehicle_plate: vehiclePlate,
    subcontractor_name: subcontractorName,
    dau_liters: fuelLiters,
    fuel_liters: fuelLiters,
    fuel_unit_price: fuelUnitPrice,
    fuel_cost: fuelCost,
    is_fuel_price_missing: isFuelPriceMissing,
    is_grouped: isGrouped,
    group_id: groupId,
    group: group,
    allocation_status: allocationStatus,
    is_unallocated_group: isUnallocatedGroup,
    other_costs: otherCosts,
    phat_sinh: otherCosts,
    is_customer_paid: isPaid,
    is_offset: isOffset,
    is_tuoi: isTuoi,
    financials: fin,
  };
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function TripsListView({
  assistantFocus,
  onAssistantFocusConsumed,
  onAssistantContext,
  onOpenExpenseModal,
  onOpenEirModal,
  onOpenExcelImport
}) {
  // 1. Dữ liệu nguồn
  const [tripsData, setTripsData] = useState([]);
  const [groupsData, setGroupsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 2. Bộ lọc
  const [dateFilter, setDateFilter] = useState('all'); // 'month' | 'month_01'..'month_12' | 'single_day' | 'range' | 'all'
  const [exactDate, setExactDate] = useState('2026-01-09');
  const [rangeStart, setRangeStart] = useState('2026-01-01');
  const [rangeEnd, setRangeEnd] = useState('2026-11-30');
  const [vehicleFilter, setVehicleFilter] = useState('ALL'); // 'ALL' | 'INTERNAL_ALL' | 'SUBCONTRACTOR_ALL' | plate | subName
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PAID' | 'TUOI' | 'UNPAID' | 'OFFSET'
  const [warningFilter, setWarningFilter] = useState('ALL'); // 'ALL' | 'MISSING_FUEL' | 'GROUP'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('stt_asc'); // 'stt_asc' | 'stt_desc' | 'date_desc' | 'date_asc' | 'revenue_desc' | 'cost_desc' | 'profit_desc'

  // 3. Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // 4. Drawer chi tiết chuyến xe
  const [selectedTrip, setSelectedTrip] = useState(null);
  const requestSeqRef = useRef(0);

  // Tải dữ liệu chuyến xe và nhóm ô gộp song song từ API chuẩn
  const loadTrips = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    try {
      setLoading(true);
      setError(null);
      const [tripsRes, groupsRes] = await Promise.all([
        fetchBusinessTripsApi().catch((err) => ({ success: false, error: err.message })),
        fetchBusinessGroupsApi().catch(() => ({ success: false, data: [] }))
      ]);

      if (seq !== requestSeqRef.current) return;

      if (tripsRes && tripsRes.success && tripsRes.data) {
        setTripsData(tripsRes.data.trips || []);
        setGroupsData(groupsRes?.data || []);
      } else {
        setError(tripsRes?.error || 'Không thể tải danh sách chuyến xe từ máy chủ backend.');
      }
    } catch (e) {
      if (seq === requestSeqRef.current) {
        setError('Lỗi kết nối khi tải danh sách chuyến xe. Vui lòng thử lại.');
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  // Lắng nghe sự kiện dữ liệu nghiệp vụ thay đổi
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadTrips();
    };
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [loadTrips]);

  // Bảng tra cứu nhóm
  const groupsMap = useMemo(() => {
    const map = new Map();
    (groupsData || []).forEach((g) => {
      if (g.group_key) map.set(g.group_key, g);
    });
    return map;
  }, [groupsData]);

  // Danh sách chuyến xe đã được ánh xạ chuẩn hóa
  const mappedTrips = useMemo(() => {
    return (tripsData || []).map((raw) => mapTripData(raw, groupsMap));
  }, [tripsData, groupsMap]);

  // Đồng bộ selectedTrip khi dữ liệu chuyến được tải lại ngầm
  useEffect(() => {
    if (!selectedTrip || !mappedTrips.length) return;
    const fresh = mappedTrips.find((t) => String(t.id) === String(selectedTrip.id));
    if (fresh && fresh !== selectedTrip) {
      setSelectedTrip(fresh);
    }
  }, [mappedTrips, selectedTrip]);

  // Trích xuất danh mục xe và nhà xe động từ dữ liệu thực tế (không cố định)
  const vehicleOptions = useMemo(() => {
    const internalSet = new Set();
    const subcontractorSet = new Set();

    mappedTrips.forEach((t) => {
      if (t.is_subcontractor) {
        const sub = t.subcontractor_name || t.vehicle_plate || 'Xe ngoài';
        if (sub) subcontractorSet.add(sub);
      } else {
        const plate = t.vehicle_plate;
        if (plate) internalSet.add(plate);
      }
    });

    return {
      internalPlates: Array.from(internalSet).sort(),
      subcontractors: Array.from(subcontractorSet).sort(),
    };
  }, [mappedTrips]);

  // Phản hồi điều hướng từ Trợ lý Giám đốc (assistantFocus)
  useEffect(() => {
    if (!assistantFocus) return;

    // Nếu trợ lý yêu cầu mở một chuyến cụ thể theo ID hoặc STT:
    if (assistantFocus.id) {
      if (!mappedTrips.length) {
        if (loading) return; // Đang tải thì không tiêu thụ vội, chờ dữ liệu về
        onAssistantFocusConsumed?.();
        return;
      }
      // Ưu tiên tìm chính xác theo ID chuyến thật trước, sau đó mới fallback theo STT nguồn
      const targetIdStr = String(assistantFocus.id).trim();
      const match =
        mappedTrips.find((t) => String(t.id).trim() === targetIdStr) ||
        mappedTrips.find((t) => String(t.stt) === targetIdStr);

      if (match) {
        if (assistantFocus.period?.all) {
          setDateFilter('all');
        } else if (assistantFocus.period?.startDate) {
          setRangeStart(assistantFocus.period.startDate);
          setRangeEnd(assistantFocus.period.endDate || assistantFocus.period.startDate);
          setDateFilter('range');
        }
        setSelectedTrip(match);
      }
      onAssistantFocusConsumed?.();
      return;
    }

    if (assistantFocus.query) {
      setSearchTerm(assistantFocus.query);
    }

    if (assistantFocus.period) {
      if (assistantFocus.period.all) {
        setDateFilter('all');
      } else if (assistantFocus.period.startDate && assistantFocus.period.endDate) {
        if (assistantFocus.period.startDate === '2026-01-08' && assistantFocus.period.endDate === '2026-01-08') {
          setDateFilter('day_08');
        } else if (assistantFocus.period.startDate === '2026-01-09' && assistantFocus.period.endDate === '2026-01-09') {
          setDateFilter('day_09');
        } else {
          setDateFilter('range');
          setRangeStart(assistantFocus.period.startDate);
          setRangeEnd(assistantFocus.period.endDate);
        }
      }
    }
    onAssistantFocusConsumed?.();
  }, [assistantFocus, mappedTrips, loading, onAssistantFocusConsumed]);

  // Cập nhật ngữ cảnh cho Trợ lý Giám đốc (đúng cấu trúc chuẩn startDate/endDate/all)
  useEffect(() => {
    const periods = {
      month: { startDate: '2026-01-01', endDate: '2026-01-31', kind: 'month', label: 'Tháng 01/2026' },
      day_09: { startDate: '2026-01-09', endDate: '2026-01-09', kind: 'day_09', label: 'Ngày 09/01' },
      day_08: { startDate: '2026-01-08', endDate: '2026-01-08', kind: 'day_08', label: 'Ngày 08/01' },
      range: { startDate: rangeStart, endDate: rangeEnd, kind: 'range', label: `${rangeStart} → ${rangeEnd}` },
      all: { startDate: null, endDate: null, all: true, kind: 'all', label: 'Toàn bộ' }
    };
    const period = periods[dateFilter] || periods.month;

    onAssistantContext?.({
      module: 'trips',
      period,
      totalTrips: mappedTrips.length
    });
  }, [dateFilter, rangeStart, rangeEnd, mappedTrips.length, onAssistantContext]);

  // 1. Lọc theo kỳ ngày chạy (ưu tiên tháng hạch toán theo sheet chuẩn)
  const scopedTrips = useMemo(() => {
    return mappedTrips.filter((trip) => {
      const date = trip.trip_date || '';
      if (dateFilter === 'all') return true;
      if (dateFilter.startsWith('month_')) {
        const m = dateFilter.slice(6);
        return getTripAccountingMonth(trip) === `2026-${m}`;
      }
      if (dateFilter === 'month') return getTripAccountingMonth(trip) === '2026-01';
      if (dateFilter === 'single_day') return date === exactDate;
      if (dateFilter === 'day_09') return date === '2026-01-09';
      if (dateFilter === 'day_08') return date === '2026-01-08';
      if (dateFilter === 'range') return date >= rangeStart && date <= rangeEnd;
      return true; // 'all'
    });
  }, [mappedTrips, dateFilter, exactDate, rangeStart, rangeEnd]);

  // Các nhãn số lượng động cho bộ lọc kỳ và bộ lọc trạng thái (không viết cứng số lượng)
  const filterCounts = useMemo(() => {
    const monthCount = mappedTrips.filter((t) => getTripAccountingMonth(t) === '2026-01').length;
    const day09Count = mappedTrips.filter((t) => t.trip_date === '2026-01-09').length;
    const day08Count = mappedTrips.filter((t) => t.trip_date === '2026-01-08').length;
    const allCount = mappedTrips.length;
    const byMonth = {};
    for (let i = 1; i <= 12; i += 1) {
      const mKey = String(i).padStart(2, '0');
      byMonth[mKey] = 0;
    }
    mappedTrips.forEach((t) => {
      const ym = getTripAccountingMonth(t);
      if (ym && ym.startsWith('2026-')) {
        const mKey = ym.slice(5, 7);
        if (byMonth[mKey] !== undefined) byMonth[mKey] += 1;
      }
    });

    const paidCount = scopedTrips.filter((t) => t.is_customer_paid).length;
    const tuoiCount = scopedTrips.filter((t) => t.is_tuoi).length;
    const offsetCount = scopedTrips.filter((t) => t.is_offset).length;
    const unpaidCount = scopedTrips.filter((t) => !t.is_customer_paid && !t.is_offset).length;

    const missingFuelCount = scopedTrips.filter((t) => t.is_fuel_price_missing).length;
    const groupedCount = scopedTrips.filter((t) => t.is_grouped).length;

    return {
      monthCount,
      day09Count,
      day08Count,
      allCount,
      byMonth,
      paidCount,
      tuoiCount,
      offsetCount,
      unpaidCount,
      missingFuelCount,
      groupedCount,
    };
  }, [mappedTrips, scopedTrips]);

  // 2. Lọc theo xe, trạng thái thanh toán, cảnh báo và từ khóa
  const filteredTrips = useMemo(() => {
    const normSearch = removeVietnameseTones(searchTerm);

    let result = scopedTrips.filter((t) => {
      // A. Lọc phương tiện / xe ngoài
      if (vehicleFilter !== 'ALL') {
        if (vehicleFilter === 'INTERNAL_ALL') {
          if (t.is_subcontractor) return false;
        } else if (vehicleFilter === 'NGOAI' || vehicleFilter === 'SUBCONTRACTOR_ALL') {
          if (!t.is_subcontractor) return false;
        } else {
          // Lọc theo biển số hoặc nhà xe cụ thể (khử ký tự đặc biệt để '15H00266' khớp '15H-002.66')
          const cleanTarget = String(vehicleFilter).toUpperCase().replace(/[^A-Z0-9]/g, '');
          const cleanPlate = String(t.vehicle_plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const normSub = removeVietnameseTones(t.subcontractor_name || '');
          const normTarget = removeVietnameseTones(vehicleFilter);

          const plateMatch = cleanPlate.includes(cleanTarget);
          const subMatch = normSub.includes(normTarget);

          if (!plateMatch && !subMatch) return false;
        }
      }

      // B. Lọc trạng thái thanh toán (đọc từ cờ chuẩn)
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'OFFSET' && !t.is_offset) return false;
        if (statusFilter === 'TUOI' && !t.is_tuoi) return false;
        if (statusFilter === 'PAID' && !t.is_customer_paid) return false;
        if (statusFilter === 'UNPAID' && (t.is_customer_paid || t.is_offset)) return false;
      }

      // C. Lọc cảnh báo nghiệp vụ
      if (warningFilter !== 'ALL') {
        if (warningFilter === 'MISSING_FUEL' && !t.is_fuel_price_missing) return false;
        if (warningFilter === 'GROUP' && !t.is_grouped) return false;
      }

      // D. Tìm kiếm tiếng Việt thông minh (Luôn tìm trên ID thật từ API, tìm theo STT riêng)
      if (normSearch) {
        const normClean = normSearch.replace(/[^a-z0-9]/g, '');

        // 1. Luôn tìm trên ID/mã chuyến thực tế từ API (ví dụ 't1-2026-003', 't1-2026-064')
        const realId = String(t.id || '').toLowerCase();
        const realIdClean = realId.replace(/[^a-z0-9]/g, '');
        const idMatch =
          realId.includes(normSearch) ||
          (normClean.length >= 3 && realIdClean.includes(normClean));

        // 2. Tìm theo STT nguồn là khả năng bổ sung riêng, không tự dựng ID giả từ STT
        let sttMatch = false;
        if (t.stt !== undefined && t.stt !== null) {
          const sttStr = String(t.stt);
          sttMatch =
            normSearch === `stt ${sttStr}` ||
            normSearch === `stt:${sttStr}` ||
            normSearch === `#${sttStr}` ||
            normSearch === `cuoc ${sttStr}` ||
            normSearch === `chuyen ${sttStr}` ||
            (normSearch === sttStr && normSearch.length <= 2);
        }

        const custName = removeVietnameseTones(t.customer_name);
        const routeName = removeVietnameseTones(t.route_name);
        const vehPlate = removeVietnameseTones(t.vehicle_plate);
        const vehPlateClean = vehPlate.replace(/[^a-z0-9]/g, '');
        const subName = removeVietnameseTones(t.subcontractor_name);
        const contNum = removeVietnameseTones(t.container_number);
        const contNumClean = contNum.replace(/[^a-z0-9]/g, '');
        const contSize = removeVietnameseTones(t.container_size);
        const driverName = removeVietnameseTones(t.driver_name);

        const match =
          idMatch ||
          sttMatch ||
          custName.includes(normSearch) ||
          routeName.includes(normSearch) ||
          vehPlate.includes(normSearch) ||
          (normClean && vehPlateClean.includes(normClean)) ||
          subName.includes(normSearch) ||
          contNum.includes(normSearch) ||
          (normClean && contNumClean.includes(normClean)) ||
          contSize.includes(normSearch) ||
          driverName.includes(normSearch);

        if (!match) return false;
      }

      return true;
    });

    // Sắp xếp an toàn
    result.sort((a, b) => {
      if (sortKey === 'stt_asc') {
        return (Number(a.stt) || 9999) - (Number(b.stt) || 9999);
      }
      if (sortKey === 'stt_desc') {
        return (Number(b.stt) || 0) - (Number(a.stt) || 0);
      }
      if (sortKey === 'date_desc') {
        const cmp = String(b.trip_date || '').localeCompare(String(a.trip_date || ''));
        return cmp !== 0 ? cmp : (Number(b.stt) || 0) - (Number(a.stt) || 0);
      }
      if (sortKey === 'date_asc') {
        const cmp = String(a.trip_date || '').localeCompare(String(b.trip_date || ''));
        return cmp !== 0 ? cmp : (Number(a.stt) || 0) - (Number(b.stt) || 0);
      }
      if (sortKey === 'revenue_desc') {
        return (b.financials.cuoc_goc || 0) - (a.financials.cuoc_goc || 0);
      }
      if (sortKey === 'cost_desc') {
        return (b.financials.chi_phi_cong_ty || 0) - (a.financials.chi_phi_cong_ty || 0);
      }
      if (sortKey === 'profit_desc') {
        // Quy tắc Codex: Không xếp hạng lãi/lỗ cho chuyến thuộc nhóm chưa phân bổ (đẩy xuống cuối)
        const diffA = a.financials.chenh_lech_sau_tru_17;
        const diffB = b.financials.chenh_lech_sau_tru_17;
        if (diffA === null && diffB === null) return (a.stt || 0) - (b.stt || 0);
        if (diffA === null) return 1;
        if (diffB === null) return -1;
        return diffB - diffA;
      }
      return 0;
    });

    return result;
  }, [scopedTrips, vehicleFilter, statusFilter, warningFilter, searchTerm, sortKey]);

  // 3. Tính toán tổng của tập kết quả đang lọc (Total Filtered Aggregates)
  const filteredTotals = useMemo(() => {
    let sumGoc = 0;
    let sumVat = 0;
    let sumCoVat = 0;
    let sumSauTru17 = 0;
    let sumCost = 0;
    let groupTripCount = 0;
    let missingFuelCount = 0;

    // Phát hiện nhóm chỉ lọt một phần (partial group) trong bộ lọc
    const groupMemberCounts = new Map();
    filteredTrips.forEach((t) => {
      if (t.group_id) {
        groupMemberCounts.set(t.group_id, (groupMemberCounts.get(t.group_id) || 0) + 1);
      }
    });

    const partialGroupAlerts = [];
    let hasPartialUnallocatedGroup = false;
    let unallocatedSharedMoneyTotal = 0;

    groupMemberCounts.forEach((count, gid) => {
      const g = groupsMap.get(gid);
      const totalInGroup = g?.trips?.length || 2;
      const isUnallocated = !g?.allocation_mode || g.allocation_mode === 'UNALLOCATED';

      if (count > 0 && count < totalInGroup) {
        const sharedMoney = g?.total_shared_money || 0;
        partialGroupAlerts.push({
          group_id: gid,
          name: g?.name || gid,
          count,
          totalInGroup,
          sharedMoney,
          isUnallocated,
        });
        if (isUnallocated) {
          hasPartialUnallocatedGroup = true;
          unallocatedSharedMoneyTotal += sharedMoney;
        }
      }
    });

    filteredTrips.forEach((t) => {
      const f = t.financials;
      sumGoc += f.cuoc_goc || 0;
      sumVat += f.vat_amount || 0;
      sumCoVat += f.cuoc_co_vat || 0;
      sumSauTru17 += f.cuoc_sau_tru_17 || 0;
      sumCost += f.chi_phi_cong_ty || 0;
      if (t.is_grouped) groupTripCount += 1;
      if (t.is_fuel_price_missing) missingFuelCount += 1;
    });

    // Quy tắc Codex: Khi thiếu thành viên nhóm và chưa có phân bổ hợp lệ,
    // chỉ tiêu chênh lệch tổng phải ghi "Chưa đủ cơ sở — còn chi phí chung chưa phân bổ" (sumDiff = null)
    // Khi đủ thành viên nhóm hoặc đã có phân bổ hợp lệ, tính đúng bình thường!
    const sumDiff = hasPartialUnallocatedGroup ? null : (sumSauTru17 - sumCost);

    return {
      count: filteredTrips.length,
      sumGoc,
      sumVat,
      sumCoVat,
      sumSauTru17,
      sumCost,
      sumDiff,
      hasPartialUnallocatedGroup,
      unallocatedSharedMoneyTotal,
      groupTripCount,
      missingFuelCount,
      partialGroupAlerts
    };
  }, [filteredTrips, groupsMap]);

  // 4. Phân trang
  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTrips = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredTrips.slice(start, start + pageSize);
  }, [filteredTrips, validCurrentPage, pageSize]);

  // Tính tổng riêng của trang hiện tại (Current Page Aggregates)
  const pageTotals = useMemo(() => {
    let pGoc = 0;
    let pCost = 0;
    let pSauTru17 = 0;

    // Kiểm tra trang hiện tại có bị phân tách thành viên của nhóm chưa phân bổ không
    const pageGroupCounts = new Map();
    paginatedTrips.forEach((t) => {
      if (t.group_id) {
        pageGroupCounts.set(t.group_id, (pageGroupCounts.get(t.group_id) || 0) + 1);
      }
    });

    let hasPartialUnallocatedGroupOnPage = false;
    pageGroupCounts.forEach((count, gid) => {
      const g = groupsMap.get(gid);
      const totalInGroup = g?.trips?.length || 2;
      const isUnallocated = !g?.allocation_mode || g.allocation_mode === 'UNALLOCATED';
      if (count > 0 && count < totalInGroup && isUnallocated) {
        hasPartialUnallocatedGroupOnPage = true;
      }
    });

    paginatedTrips.forEach((t) => {
      const f = t.financials;
      pGoc += f.cuoc_goc || 0;
      pCost += f.chi_phi_cong_ty || 0;
      pSauTru17 += f.cuoc_sau_tru_17 || 0;
    });

    const pDiff = hasPartialUnallocatedGroupOnPage ? null : (pSauTru17 - pCost);

    return {
      pGoc,
      pCost,
      pSauTru17,
      pDiff,
      hasPartialUnallocatedGroupOnPage,
    };
  }, [paginatedTrips, groupsMap]);

  // Reset về trang 1 khi thay đổi bộ lọc
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, rangeStart, rangeEnd, vehicleFilter, statusFilter, warningFilter, searchTerm]);

  // Kiểm tra có điều kiện lọc nào đang hoạt động
  const isFilteringActive =
    dateFilter !== 'all' ||
    vehicleFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    warningFilter !== 'ALL' ||
    Boolean(searchTerm.trim());

  const handleResetFilters = () => {
    setDateFilter('all');
    setVehicleFilter('ALL');
    setStatusFilter('ALL');
    setWarningFilter('ALL');
    setSearchTerm('');
    setSortKey('stt_asc');
  };

  // Điều hướng xem chuyến trước / tiếp theo trong Drawer
  const selectedTripIndex = useMemo(() => {
    if (!selectedTrip) return -1;
    return filteredTrips.findIndex((t) => t.id === selectedTrip.id);
  }, [selectedTrip, filteredTrips]);

  const hasPrevTrip = selectedTripIndex > 0;
  const hasNextTrip = selectedTripIndex >= 0 && selectedTripIndex < filteredTrips.length - 1;

  const handlePrevTrip = () => {
    if (hasPrevTrip) setSelectedTrip(filteredTrips[selectedTripIndex - 1]);
  };

  const handleNextTrip = () => {
    if (hasNextTrip) setSelectedTrip(filteredTrips[selectedTripIndex + 1]);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* 1. THANH TIÊU ĐỀ & ĐIỀU HƯỚNG KỲ NGHIỆP VỤ */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Danh Mục Chuyến Xe</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {scopedTrips.length} cuốc trong kỳ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Bảng dữ liệu đối soát cước, chi phí trực tiếp và chênh lệch tạm tính từng chuyến. Chuẩn hóa VAT 8% và khoản trừ 17% nội bộ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenExpenseModal && (
              <button
                type="button"
                onClick={() => onOpenExpenseModal()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all active:scale-95"
              >
                <span>Nhập chi phí</span>
              </button>
            )}
            {onOpenEirModal && (
              <button
                type="button"
                onClick={() => onOpenEirModal()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all active:scale-95"
              >
                <span>Ảnh EIR</span>
              </button>
            )}
            {onOpenExcelImport && (
              <button
                type="button"
                onClick={() => onOpenExcelImport()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all active:scale-95"
              >
                <span>Xem trước Excel</span>
              </button>
            )}
            <button
              onClick={loadTrips}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all active:scale-95 disabled:opacity-50"
              title="Tải lại dữ liệu chuyến xe"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
          </div>
        </div>

        {/* BỘ LỌC KỲ NGÀY CHẠY */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 flex items-center space-x-1 mr-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Kỳ chạy:</span>
          </span>

          <button
            onClick={() => setDateFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              dateFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Toàn bộ ({filterCounts.allCount} cuốc)
          </button>

          {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((mKey) => {
            const count = filterCounts.byMonth?.[mKey] ?? 0;
            const filterVal = mKey === '01' && dateFilter === 'month' ? 'month' : `month_${mKey}`;
            const isSelected = dateFilter === `month_${mKey}` || (mKey === '01' && dateFilter === 'month');
            return (
              <button
                key={mKey}
                onClick={() => setDateFilter(`month_${mKey}`)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : count > 0
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                T{parseInt(mKey, 10)} ({count})
              </button>
            );
          })}

          <div className="flex flex-wrap items-center gap-2 ml-auto pt-1 sm:pt-0">
            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setDateFilter('single_day')}
                className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                  dateFilter === 'single_day'
                    ? 'bg-indigo-700 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Theo ngày:
              </button>
              <input
                type="date"
                value={exactDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setExactDate(e.target.value);
                    setDateFilter('single_day');
                  }
                }}
                className="border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white font-mono"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setDateFilter('range')}
                className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                  dateFilter === 'range'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Khoảng ngày:
              </button>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => {
                  if (e.target.value) {
                    setRangeStart(e.target.value);
                    setDateFilter('range');
                  }
                }}
                className="border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white font-mono"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => {
                  if (e.target.value) {
                    setRangeEnd(e.target.value);
                    setDateFilter('range');
                  }
                }}
                className="border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. THANH CÔNG CỤ TÌM KIẾM, BỘ LỌC ĐA CHIỀU & SẮP XẾP */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          {/* Ô tìm kiếm thông minh */}
          <div className="md:col-span-4 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mã cuốc, khách hàng, số cont, biển số, tuyến..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Lọc Phương tiện / Xe ngoài động từ dữ liệu */}
          <div className="md:col-span-3">
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="w-full py-2 px-2.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ALL">Tất cả xe & nhà xe ({scopedTrips.length})</option>
              <optgroup label="Xe nhà công ty">
                <option value="INTERNAL_ALL">Tất cả xe nhà</option>
                {vehicleOptions.internalPlates.map((plate) => (
                  <option key={plate} value={plate}>
                    Xe nhà {plate}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Xe thuê ngoài">
                <option value="NGOAI">Tất cả xe ngoài</option>
                {vehicleOptions.subcontractors.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Lọc Trạng thái thanh toán */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-2.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ALL">Tất cả thanh toán ({scopedTrips.length})</option>
              <option value="PAID">Đã thanh toán ({filterCounts.paidCount})</option>
              <option value="TUOI">Tươi (Hoàn ngay - {filterCounts.tuoiCount})</option>
              {filterCounts.offsetCount > 0 && (
                <option value="OFFSET">Đối trừ ({filterCounts.offsetCount})</option>
              )}
              <option value="UNPAID">Chưa thanh toán ({filterCounts.unpaidCount})</option>
            </select>
          </div>

          {/* Lọc Cảnh báo / Nhóm gộp */}
          <div className="md:col-span-3">
            <select
              value={warningFilter}
              onChange={(e) => setWarningFilter(e.target.value)}
              className="w-full py-2 px-2.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ALL">Tất cả cảnh báo nghiệp vụ</option>
              <option value="MISSING_FUEL">Chưa có đơn giá dầu ({filterCounts.missingFuelCount} cuốc)</option>
              <option value="GROUP">Thuộc nhóm chi phí ô gộp ({filterCounts.groupedCount} cuốc)</option>
            </select>
          </div>
        </div>

        {/* Dòng điều khiển phụ: Sắp xếp, Phân trang & Xóa lọc */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 flex items-center space-x-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Sắp xếp:</span>
            </span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="py-1 px-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700"
            >
              <option value="stt_asc">Mặc định: Theo STT bảng kê (1 - {scopedTrips.length})</option>
              <option value="stt_desc">STT bảng kê giảm dần</option>
              <option value="date_desc">Ngày chạy mới nhất</option>
              <option value="date_asc">Ngày chạy cũ nhất</option>
              <option value="revenue_desc">Cước gốc cao nhất</option>
              <option value="cost_desc">Chi phí cao nhất</option>
              <option value="profit_desc">Chênh lệch cao nhất (đủ cơ sở)</option>
            </select>
          </div>

          <div className="flex items-center space-x-3">
            {isFilteringActive && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center space-x-1 px-2 py-1 rounded text-red-600 hover:bg-red-50 font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Xóa bộ lọc ({filteredTrips.length} kết quả)</span>
              </button>
            )}

            <div className="flex items-center space-x-1.5 text-slate-500">
              <span>Hiển thị:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="py-0.5 px-1.5 text-xs border border-slate-200 rounded bg-white text-slate-700"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size} cuốc / trang
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* THÔNG BÁO LỖI HOẶC CẢNH BÁO NHÓM MỘT PHẦN */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3 text-red-800 text-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-red-900">Không thể nạp danh sách chuyến xe:</p>
            <p className="mt-0.5">{error}</p>
            <button
              onClick={loadTrips}
              className="mt-2 inline-flex items-center space-x-1 px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded font-semibold transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Thử lại</span>
            </button>
          </div>
        </div>
      )}

      {/* CẢNH BÁO BỘ LỌC CHỨA MỘT PHẦN NHÓM CHI PHÍ DÙNG CHUNG */}
      {filteredTotals.partialGroupAlerts.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center space-x-1.5 text-amber-800">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Giới hạn bộ lọc nhóm chi phí dùng chung:</span>
          </div>
          {filteredTotals.partialGroupAlerts.map((pa) => (
            <p key={pa.group_id} className="text-[11px] text-amber-800 pl-5.5">
              • Kết quả chỉ chứa <strong>{pa.count}/{pa.totalInGroup} chuyến</strong> của {pa.name}.
              {pa.isUnallocated ? (
                <span className="text-rose-700 font-semibold ml-1">
                  Nhóm có chi phí dùng chung {formatVnd(pa.sharedMoney)} chưa phân bổ.
                  Chỉ tiêu chênh lệch tổng ghi nhận "Chưa đủ cơ sở — còn chi phí chung chưa phân bổ", không kết luận lãi/lỗ cho đến khi có đủ thành viên hoặc có quyết định phân bổ hợp lệ.
                </span>
              ) : (
                <span className="text-slate-600 ml-1">
                  (Đã có phân bổ chi phí hợp lệ cho từng chuyến).
                </span>
              )}
            </p>
          ))}
        </div>
      )}

      {/* 3. BẢNG DỮ LIỆU CHUYẾN XE (DESKTOP VIEW) & DANH SÁCH THẺ (MOBILE VIEW) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {/* DESKTOP TABLE VIEW (HIỂN THỊ TỪ MD TRỞ LÊN) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold select-none">
                <th className="py-2.5 px-3 w-14 text-center">STT</th>
                <th className="py-2.5 px-3 w-24">Ngày</th>
                <th className="py-2.5 px-3 min-w-[140px]">Khách hàng</th>
                <th className="py-2.5 px-3 min-w-[160px]">Tuyến đường</th>
                <th className="py-2.5 px-3 min-w-[120px]">Xe / Đối tác</th>
                <th className="py-2.5 px-3 min-w-[120px]">Số Cont / Loại</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Cước gốc</th>
                <th className="py-2.5 px-3 text-right min-w-[100px]">Chi phí</th>
                <th className="py-2.5 px-3 text-right min-w-[110px]">Chênh lệch</th>
                <th className="py-2.5 px-3 text-center min-w-[90px]">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && tripsData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    <span>Đang nạp dữ liệu chuyến xe...</span>
                  </td>
                </tr>
              ) : paginatedTrips.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-semibold text-slate-600">Không tìm thấy chuyến xe nào phù hợp</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {isFilteringActive
                        ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc điều kiện lọc.'
                        : 'Kỳ này chưa có dữ liệu chuyến xe.'}
                    </p>
                    {isFilteringActive && (
                      <button
                        onClick={handleResetFilters}
                        className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Xóa tất cả bộ lọc
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedTrips.map((t, index) => {
                  const f = t.financials;
                  const isSelected = selectedTrip?.id === t.id;

                  return (
                    <tr
                      key={t.id || index}
                      data-testid={`trip-row-${t.id}`}
                      data-trip-customer={t.customer_name}
                      onClick={() => setSelectedTrip(t)}
                      className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${
                        isSelected ? 'bg-blue-50/80 font-medium' : index % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                      }`}
                    >
                      {/* 1. STT / Mã cuốc */}
                      <td className="py-2.5 px-3 text-center font-mono">
                        <div className="font-bold text-slate-800 text-xs">
                          #{t.stt ? String(t.stt).padStart(2, '0') : index + 1}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono select-all" title={`Mã chuyến API: ${t.id}`}>
                          {t.id}
                        </div>
                      </td>

                      {/* 2. Ngày chạy */}
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap font-mono">
                        {t.trip_date ? t.trip_date.split('-').reverse().slice(0, 2).join('/') : '--'}
                      </td>

                      {/* 3. Khách hàng */}
                      <td className="py-2.5 px-3 text-slate-900 font-medium">
                        <div className="truncate max-w-[160px]" title={t.customer_name}>
                          {t.customer_name || '--'}
                        </div>
                      </td>

                      {/* 4. Tuyến đường */}
                      <td className="py-2.5 px-3 text-slate-600">
                        <div className="truncate max-w-[180px]" title={t.route_name}>
                          {t.route_name || '--'}
                        </div>
                      </td>

                      {/* 5. Xe / Đối tác */}
                      <td className="py-2.5 px-3">
                        {t.is_internal_vehicle ? (
                          <span className="inline-flex items-center space-x-1 font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            <span>{t.vehicle_plate || 'Xe nhà'}</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center space-x-1 text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]"
                            title={t.subcontractor_name || t.vehicle_plate}
                          >
                            <span className="font-semibold truncate max-w-[110px]">
                              {t.subcontractor_name || t.vehicle_plate || 'Xe ngoài'}
                            </span>
                          </span>
                        )}
                      </td>

                      {/* 6. Số Cont / Loại */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-slate-700 truncate max-w-[90px]" title={t.container_number}>
                            {t.container_number || '--'}
                          </span>
                          {t.container_size && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded font-mono font-semibold">
                              {t.container_size}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 7. Cước gốc */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-900 font-semibold whitespace-nowrap">
                        {formatVnd(f.cuoc_goc)}
                      </td>

                      {/* 8. Chi phí ghi nhận */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                        {formatVnd(f.chi_phi_cong_ty)}
                      </td>

                      {/* 9. Chênh lệch tạm tính (Nếu thuộc nhóm chưa phân bổ thì hiển thị Chờ phân bổ / Chưa đủ cơ sở) */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {f.chenh_lech_sau_tru_17 != null ? (
                          <span
                            className={`font-mono font-bold ${
                              f.chenh_lech_sau_tru_17 >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {f.chenh_lech_sau_tru_17 >= 0 ? '+' : ''}
                            {formatVnd(f.chenh_lech_sau_tru_17)}
                          </span>
                        ) : (
                          <span
                            className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            title={f.result_note || 'Chưa đủ cơ sở — thuộc nhóm chi phí ô gộp chưa phân bổ'}
                          >
                            Chưa đủ cơ sở
                          </span>
                        )}
                      </td>

                      {/* 10. Trạng thái */}
                      <td className="py-2.5 px-3 text-center">
                        {t.is_offset ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Đối trừ
                          </span>
                        ) : t.is_tuoi ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Tươi
                          </span>
                        ) : t.is_customer_paid ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                            Đã TT
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            Chưa TT
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW (HIỂN THỊ TRÊN MÀN HÌNH NHỎ DƯỚI MD - TEST 390px CHUẨN KHÔNG TRÀN) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {loading && tripsData.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500 mb-2" />
              <span>Đang nạp danh sách cuốc xe...</span>
            </div>
          ) : paginatedTrips.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p className="text-sm font-semibold text-slate-600">Không tìm thấy chuyến xe nào</p>
              {isFilteringActive && (
                <button
                  onClick={handleResetFilters}
                  className="mt-3 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            paginatedTrips.map((t, idx) => {
              const f = t.financials;

              return (
                <div
                  key={t.id || idx}
                  onClick={() => setSelectedTrip(t)}
                  className="p-3.5 space-y-2 hover:bg-blue-50/40 transition-colors active:bg-blue-50 cursor-pointer"
                >
                  {/* Hàng 1: Mã cuốc, Ngày, Badge xe & Trạng thái thanh toán */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{t.stt ? String(t.stt).padStart(2, '0') : idx + 1}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 bg-slate-50 border border-slate-200 px-1 py-0.5 rounded">
                        {t.id}
                      </span>
                      <span className="font-mono text-slate-500 text-[11px]">
                        {t.trip_date ? t.trip_date.split('-').reverse().join('/') : '--'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {t.is_offset ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          Đối trừ
                        </span>
                      ) : t.is_tuoi ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Tươi
                        </span>
                      ) : t.is_customer_paid ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                          Đã TT
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                          Chưa TT
                        </span>
                      )}

                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          t.is_internal_vehicle ? 'bg-slate-100 text-slate-800' : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {t.is_internal_vehicle ? t.vehicle_plate || 'Xe nhà' : t.subcontractor_name || 'Xe ngoài'}
                      </span>
                    </div>
                  </div>

                  {/* Hàng 2: Khách hàng & Tuyến đường */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      {t.customer_name || 'Khách hàng chưa rõ'}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{t.route_name || '--'}</p>
                  </div>

                  {/* Hàng 3: Container & Chi phí tài chính */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <div className="flex items-center space-x-1 font-mono text-[11px] text-slate-600">
                      <span>{t.container_number || 'Chưa cont'}</span>
                      {t.container_size && (
                        <span className="bg-slate-100 text-slate-700 px-1 rounded text-[10px] font-semibold">
                          {t.container_size}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 mr-1.5">Gốc: {formatVnd(f.cuoc_goc)}</span>
                      {f.chenh_lech_sau_tru_17 != null ? (
                        <span
                          className={`font-mono font-bold ${
                            f.chenh_lech_sau_tru_17 >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {f.chenh_lech_sau_tru_17 >= 0 ? '+' : ''}
                          {formatVnd(f.chenh_lech_sau_tru_17)}
                        </span>
                      ) : (
                        <span className="text-amber-700 bg-amber-50 px-1 rounded text-[10px] font-medium">
                          Chưa đủ cơ sở
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 4. CHÂN BẢNG TỔNG HỢP (PHÂN TÁCH RÕ TỔNG KẾT QUẢ ĐANG LỌC VÀ TỔNG TRANG HIỆN TẠI) */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:px-4 text-xs space-y-2">
          {/* Hàng 1: Tổng kết quả đang lọc toàn kỳ */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="font-bold text-slate-800">
              Tổng kết quả đang lọc: <span className="text-blue-700">{filteredTotals.count} cuốc</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700 font-mono">
              <span>
                Cước gốc: <strong>{formatVnd(filteredTotals.sumGoc)}</strong>
              </span>
              <span>
                VAT 8%: <strong>{formatVnd(filteredTotals.sumVat)}</strong>
              </span>
              <span>
                Có VAT: <strong>{formatVnd(filteredTotals.sumCoVat)}</strong>
              </span>
              <span>
                Sau trừ 17%: <strong className="text-blue-700">{formatVnd(filteredTotals.sumSauTru17)}</strong>
              </span>
              <span>
                Chi phí:{' '}
                <strong>{formatVnd(filteredTotals.sumCost)}</strong>
                {filteredTotals.hasPartialUnallocatedGroup && (
                  <span className="text-[11px] text-amber-800 italic ml-1">
                    (chưa gồm chi phí nhóm chưa phân bổ)
                  </span>
                )}
              </span>
              <span>
                Chênh lệch:{' '}
                {filteredTotals.sumDiff !== null ? (
                  <strong className={filteredTotals.sumDiff >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                    {filteredTotals.sumDiff >= 0 ? '+' : ''}
                    {formatVnd(filteredTotals.sumDiff)}
                  </strong>
                ) : (
                  <strong className="text-amber-800 italic bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    Chưa đủ cơ sở — còn chi phí chung chưa phân bổ
                  </strong>
                )}
              </span>
            </div>
          </div>

          {/* Hàng 2: Tóm tắt trang hiện tại & Điều khiển phân trang */}
          <div className="pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-500">
            <div>
              Trang hiện tại ({paginatedTrips.length} cuốc): Cước gốc{' '}
              <strong className="text-slate-800 font-mono">{formatVnd(pageTotals.pGoc)}</strong> • Chi phí{' '}
              <strong className="text-slate-800 font-mono">{formatVnd(pageTotals.pCost)}</strong>
              {pageTotals.hasPartialUnallocatedGroupOnPage && (
                <span className="text-[11px] text-amber-800 italic ml-1">
                  (chưa gồm chi phí nhóm chưa phân bổ)
                </span>
              )}{' '}
              • Chênh lệch{' '}
              {pageTotals.pDiff !== null ? (
                <strong
                  className={`font-mono ${pageTotals.pDiff >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}`}
                >
                  {pageTotals.pDiff >= 0 ? '+' : ''}
                  {formatVnd(pageTotals.pDiff)}
                </strong>
              ) : (
                <strong className="text-amber-800 italic bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  Chưa đủ cơ sở — còn chi phí chung chưa phân bổ
                </strong>
              )}
            </div>

            {/* Điều hướng trang */}
            {totalPages > 1 && (
              <div className="flex items-center space-x-1.5 self-end sm:self-auto">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage <= 1}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  title="Trang trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-xs text-slate-700">
                  {validCurrentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage >= totalPages}
                  className="p-1 rounded border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  title="Trang sau"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Cảnh báo nếu có nhóm chi phí ô gộp chưa phân bổ */}
          {filteredTotals.groupTripCount > 0 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Trong kết quả có <strong>{filteredTotals.groupTripCount} cuốc</strong> thuộc nhóm chi phí ô gộp chưa phân bổ xuống từng chuyến. Số chênh lệch tạm tính của từng cuốc chỉ kết luận sau khi có phương án phân bổ.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 5. DRAWER CHI TIẾT CHUYẾN XE (TRIP DETAIL DRAWER ĐÃ NGHIỆM THU ĐỢT 1) */}
      {selectedTrip && (
        <TripDetailDrawer
          selectedTrip={selectedTrip}
          onClose={() => setSelectedTrip(null)}
          onPrev={hasPrevTrip ? handlePrevTrip : null}
          onNext={hasNextTrip ? handleNextTrip : null}
          hasPrev={hasPrevTrip}
          hasNext={hasNextTrip}
          onTripUpdated={loadTrips}
        />
      )}
    </div>
  );
}

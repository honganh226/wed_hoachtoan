import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  AlertCircle,
  Layers,
  CheckCircle2,
  SlidersHorizontal,
  Info,
  X,
  Loader2,
  RefreshCw,
  Fuel,
  Clock,
  Coins,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowUpRight,
  Truck,
  Building2,
  Calendar,
  Eye,
  Check
} from 'lucide-react';
import {
  formatVnd,
  formatTrieuDong
} from '../data/unifiedBusinessData';
import {
  fetchBusinessOverviewApi,
  fetchBusinessTripsApi,
  fetchBusinessGroupsApi,
  fetchEirRemindersApi,
  fetchBusinessDebtsApi,
  saveBusinessGroupAllocationApi
} from '../services/api.js';
import { computeTripFinancials } from '../utils/tripFinancials.js';
import TripDetailDrawer from './TripDetailDrawer.jsx';
import FuelPriceManagementModal from './FuelPriceManagementModal.jsx';
import PhoiRefundModal from './PhoiRefundModal.jsx';

export default function BusinessOverviewView({
  onNavigateTab,
  onAssistantContext,
  assistantFocus,
  onAssistantFocusConsumed,
  onOpenTripCreate
}) {
  const [tripsData, setTripsData] = useState([]);
  const [groupsData, setGroupsData] = useState([]);
  const [overviewData, setOverviewData] = useState(null);
  const [debtsData, setDebtsData] = useState(null);
  const [debtsLoading, setDebtsLoading] = useState(false);
  const [debtsError, setDebtsError] = useState(null);
  const [eirReminders, setEirReminders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // 1. BỘ LỌC TOÀN TRANG: THỜI GIAN & PHẠM VI (SCOPE)
  const [dateFilter, setDateFilter] = useState('month'); // 'month' | 'day_09' | 'day_08' | 'all' | 'range'
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [scopeFilter, setScopeFilter] = useState('ALL'); // 'ALL' | 'XE_NHA' | 'THUE_NGOAI'

  // 2. KHUNG CHI TIẾT TẠI CHỖ (DRAWER NỘI BỘ VÀ CHUYẾN XE)
  const [activeDrawer, setActiveDrawer] = useState(null); // { type, title, subtitle, data }
  const [drawerSearch, setDrawerSearch] = useState('');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const previousFocusRef = useRef(null);
  const drawerDialogRef = useRef(null);

  // 3. COLLAPSIBLE LƯU Ý NGHIỆP VỤ & RỦI RO
  const [notesCollapsibleOpen, setNotesCollapsibleOpen] = useState(true);

  // 4. MODALS (GIÁ DẦU & TIỀN PHƠI)
  const [fuelModalOpen, setFuelModalOpen] = useState(false);
  const [phoiModalTarget, setPhoiModalTarget] = useState(null);
  const isFirstMountDebts = useRef(true);

  // Khóa định danh kỳ hiện tại để tránh race-condition và không bao giờ hiển thị công nợ kỳ cũ
  const currentPeriodKey = useMemo(() => {
    if (dateFilter === 'range') return `range:${rangeStart}_${rangeEnd}`;
    return dateFilter;
  }, [dateFilter, rangeStart, rangeEnd]);

  // Chuyển đổi bộ lọc thời gian thành khoảng ngày hợp lệ cho API
  const getPeriodRange = useCallback((filterKey, start, end) => {
    if (filterKey === 'month') return { start_date: '2026-01-01', end_date: '2026-01-31' };
    if (filterKey === 'day_09') return { start_date: '2026-01-09', end_date: '2026-01-09' };
    if (filterKey === 'day_08') return { start_date: '2026-01-08', end_date: '2026-01-08' };
    if (filterKey === 'range') {
      if (start && end) return { start_date: start, end_date: end };
      return {};
    }
    if (filterKey === 'all') return {};
    return { start_date: '2026-01-01', end_date: '2026-01-31' };
  }, []);

  // Tải dữ liệu công nợ theo đúng kỳ đang chọn
  const fetchDebtsForPeriod = useCallback(async (filterKey, start, end) => {
    const targetPeriodKey = filterKey === 'range' ? `range:${start}_${end}` : filterKey;
    try {
      setDebtsLoading(true);
      setDebtsError(null);
      const range = getPeriodRange(filterKey, start, end);
      const debtsRes = await fetchBusinessDebtsApi(range);
      if (debtsRes && debtsRes.success) {
        setDebtsData({ ...debtsRes.data, _periodKey: targetPeriodKey });
        setDebtsError(null);
      } else {
        setDebtsData(null);
        setDebtsError(debtsRes?.error || 'Chưa tải được công nợ');
      }
    } catch (e) {
      setDebtsData(null);
      setDebtsError(e.message || 'Không thể kết nối máy chủ để tải công nợ');
    } finally {
      setDebtsLoading(false);
    }
  }, [getPeriodRange]);

  // Thử lại tải công nợ theo kỳ hiện tại
  const reloadDebts = useCallback(() => {
    return fetchDebtsForPeriod(dateFilter, rangeStart, rangeEnd);
  }, [fetchDebtsForPeriod, dateFilter, rangeStart, rangeEnd]);

  // Tải dữ liệu từ API thực tế
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const targetPeriodKey = dateFilter === 'range' ? `range:${rangeStart}_${rangeEnd}` : dateFilter;
      const range = getPeriodRange(dateFilter, rangeStart, rangeEnd);
      setDebtsLoading(true);
      setDebtsError(null);
      const [ovRes, trRes, grRes, remRes, debtsRes] = await Promise.all([
        fetchBusinessOverviewApi({ period: 'month' }),
        fetchBusinessTripsApi(),
        fetchBusinessGroupsApi(),
        fetchEirRemindersApi().catch(() => ({ success: false })),
        fetchBusinessDebtsApi(range).catch((err) => ({ success: false, error: err.message || 'Lỗi mạng khi tải công nợ' }))
      ]);

      if (ovRes.success && trRes.success && grRes.success) {
        setOverviewData(ovRes.data);
        setTripsData(trRes.data.trips || []);
        setGroupsData(grRes.data || []);
        if (remRes.success) setEirReminders(remRes.data);
        if (debtsRes && debtsRes.success) {
          setDebtsData({ ...debtsRes.data, _periodKey: targetPeriodKey });
          setDebtsError(null);
        } else {
          setDebtsData(null);
          setDebtsError(debtsRes?.error || 'Chưa tải được công nợ');
        }
      } else {
        const err = ovRes.error || trRes.error || grRes.error || 'Lỗi lấy dữ liệu kinh doanh.';
        setLoadError(err);
      }
    } catch (e) {
      setLoadError('Không thể kết nối máy chủ backend. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setLoading(false);
      setDebtsLoading(false);
    }
  }, [dateFilter, rangeStart, rangeEnd, getPeriodRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Đồng bộ tải lại công nợ khi người dùng chuyển đổi kỳ lọc thời gian
  useEffect(() => {
    if (isFirstMountDebts.current) {
      isFirstMountDebts.current = false;
      return;
    }
    if (dateFilter === 'range' && (!rangeStart || !rangeEnd)) return;
    fetchDebtsForPeriod(dateFilter, rangeStart, rangeEnd);
  }, [dateFilter, rangeStart, rangeEnd, fetchDebtsForPeriod]);

  // Kiểm tra dữ liệu công nợ có thuộc đúng kỳ đang xem hay không
  const isDebtsCurrent = useMemo(() => {
    return Boolean(
      debtsData &&
      debtsData._periodKey === currentPeriodKey &&
      !debtsLoading &&
      !debtsError
    );
  }, [debtsData, currentPeriodKey, debtsLoading, debtsError]);

  const effectiveDebts = isDebtsCurrent ? debtsData : null;

  // Lắng nghe thay đổi dữ liệu từ các cửa sổ khác
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    window.addEventListener('business-data-changed', refresh);
    const timer = setInterval(refresh, 45000);
    return () => {
      window.removeEventListener('business-data-changed', refresh);
      clearInterval(timer);
    };
  }, [loadData]);

  // Tích hợp trợ lý AI Focus
  useEffect(() => {
    if (!assistantFocus || !tripsData.length) return;
    const trip = tripsData.find((r) => r.id === assistantFocus.id);
    if (trip) {
      const p = assistantFocus.period;
      if (p?.all) setDateFilter('all');
      else if (p?.startDate) {
        setRangeStart(p.startDate);
        setRangeEnd(p.endDate);
        setDateFilter('range');
      }
      setSelectedTrip(trip);
      onAssistantFocusConsumed?.();
    }
  }, [assistantFocus?.nonce, tripsData, onAssistantFocusConsumed]);

  // Cập nhật ngữ cảnh cho Trợ lý AI
  useEffect(() => {
    const periods = {
      month: { startDate: '2026-01-01', endDate: '2026-01-31', kind: 'month', label: 'Tháng 01/2026' },
      day_09: { startDate: '2026-01-09', endDate: '2026-01-09', kind: 'day' },
      day_08: { startDate: '2026-01-08', endDate: '2026-01-08', kind: 'day' },
      all: { all: true }
    };
    const period =
      dateFilter === 'range' && rangeStart && rangeEnd
        ? { startDate: rangeStart, endDate: rangeEnd, kind: 'range' }
        : periods[dateFilter];
    const entity = selectedTrip
      ? { kind: 'trip', value: selectedTrip.id }
      : null;
    onAssistantContext?.({ period, scope: scopeFilter, entity });
  }, [dateFilter, rangeStart, rangeEnd, scopeFilter, selectedTrip, onAssistantContext]);

  // Bàn phím & Focus Accessibility cho Drawer nội bộ
  useEffect(() => {
    if (!activeDrawer) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Nếu drawer chi tiết chuyến đang mở đè lên trên, chỉ để drawer chi tiết chuyến xử lý Escape
        if (selectedTrip) return;
        e.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDrawer, selectedTrip]);

  const openDrawer = (drawerConfig, triggerEl = null) => {
    previousFocusRef.current = triggerEl || document.activeElement;
    setDrawerSearch('');
    setActiveDrawer(drawerConfig);
  };

  const closeDrawer = () => {
    setActiveDrawer(null);
    setDrawerSearch('');
    if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      setTimeout(() => {
        try {
          previousFocusRef.current.focus();
        } catch (_) {}
      }, 50);
    }
  };

  // 1. Tập cuốc theo bộ lọc ngày
  const scopedTrips = useMemo(() => {
    return tripsData.filter((trip) => {
      if (
        dateFilter === 'range' &&
        ((rangeStart && trip.trip_date < rangeStart) || (rangeEnd && trip.trip_date > rangeEnd))
      )
        return false;
      if (dateFilter === 'all') return true;
      if (dateFilter === 'month' && !trip.trip_date?.startsWith('2026-01')) return false;
      if (dateFilter === 'day_09' && trip.trip_date !== '2026-01-09') return false;
      if (dateFilter === 'day_08' && trip.trip_date !== '2026-01-08') return false;
      return true;
    });
  }, [tripsData, dateFilter, rangeStart, rangeEnd]);

  // 2. Tập cuốc theo Scope (Toàn công ty / Xe nhà / Xe thuê ngoài)
  const effectiveTrips = useMemo(() => {
    return scopedTrips.filter((t) => {
      if (scopeFilter === 'XE_NHA') return !t.is_subcontractor;
      if (scopeFilter === 'THUE_NGOAI') return t.is_subcontractor;
      return true;
    });
  }, [scopedTrips, scopeFilter]);

  // 3. Tính toán 7 chỉ tiêu tài chính chuẩn hóa cho effectiveTrips
  const metrics = useMemo(() => {
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
    let totalPhoiConPhaiThu = 0;

    effectiveTrips.forEach((t) => {
      const f = computeTripFinancials({
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
        phoi_refunded_amount: t.phoi_da_hoan ?? t.phoi_refunded_amount ?? 0
      });

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
      totalPhoiTraHo += Number(t.phoi_total_advance ?? t.phoi_tra_ho ?? t.phoi_advance_amount ?? 0);
      totalPhoiConPhaiThu += Number(t.phoi_balance_due ?? t.phoi_con_phai_thu ?? 0);
    });

    const totalChenhLechSauTru17 = totalCuocSauTru17 - totalChiPhiCongTy;

    // Số hành trình
    let journeyCount = effectiveTrips.length;
    if (effectiveTrips.length > 0) {
      const singleCount = effectiveTrips.filter((t) => !t.is_grouped).length;
      const groupCount = new Set(effectiveTrips.filter((t) => t.is_grouped).map((t) => t.group_id)).size;
      journeyCount = singleCount + groupCount;
    }

    return {
      completedCount: effectiveTrips.length,
      journeyCount,
      totalCuocGoc,
      totalVat8,
      totalCuocCoVat,
      totalKhoanTru17,
      totalCuocSauTru17,
      totalChiPhiCongTy,
      totalChenhLechSauTru17,
      totalToll,
      totalCuocRa,
      totalPhatSinh,
      totalPhiNang,
      totalPhiHa,
      totalFuelLiters,
      totalTienDau,
      missingFuelPriceTrips,
      totalPhoiTraHo,
      totalPhoiConPhaiThu
    };
  }, [effectiveTrips]);

  // 4. Hiệu quả Đội xe nhà (Danh mục thực tế từ tập cuốc đang xem - Dynamic Fleet)
  const houseTrucks = useMemo(() => {
    const platesSet = new Set();
    scopedTrips
      .filter((t) => !t.is_subcontractor)
      .forEach((t) => {
        const p = t.vehicle_plate || t.so_xe;
        if (p && p !== 'Xe ngoài' && p !== 'ĐÃ TT' && p !== 'MẸ ĐÃ TT') {
          platesSet.add(p);
        }
      });
    const housePlates = Array.from(platesSet).sort();

    return housePlates.map((plate) => {
      const trips = scopedTrips.filter(
        (t) => !t.is_subcontractor && (t.vehicle_plate === plate || t.so_xe === plate)
      );
      let cuocGoc = 0;
      let cuocSauTru = 0;
      let toll = 0;
      let phatSinh = 0;
      let phiNang = 0;
      let phiHa = 0;
      let fuelLiters = 0;
      let fuelCost = 0;
      let totalCost = 0;

      trips.forEach((t) => {
        const f = computeTripFinancials({
          base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
          lift_on_fee: t.phi_nang ?? t.lift_on_fee ?? 0,
          lift_off_fee: t.phi_ha ?? t.lift_off_fee ?? 0,
          port_fee: t.port_fee ?? 0,
          fuel_liters: t.dau_liters ?? t.dau_lit ?? t.fuel_liters ?? 0,
          fuel_unit_price: t.don_gia_dau ?? t.fuel_unit_price ?? null,
          fuel_cost: t.tien_dau ?? t.fuel_cost ?? null,
          toll_fee: t.tien_duong ?? t.toll_fee ?? 0,
          subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0,
          other_costs: t.phat_sinh ?? t.other_costs ?? 0
        });
        cuocGoc += f.cuoc_goc;
        cuocSauTru += f.cuoc_sau_tru_17;
        toll += f.tien_duong;
        phatSinh += f.chi_phi_khac;
        phiNang += f.phi_nang;
        phiHa += f.phi_ha;
        fuelLiters += f.fuel_liters;
        fuelCost += f.fuel_cost;
        totalCost += f.chi_phi_cong_ty;
      });

      const diff = cuocSauTru - totalCost;

      return {
        plate,
        trip_count: trips.length,
        cuoc_goc: cuocGoc,
        cuoc_sau_tru_17: cuocSauTru,
        toll,
        phat_sinh: phatSinh,
        phi_nang: phiNang,
        phi_ha: phiHa,
        fuel_liters: fuelLiters,
        fuel_cost: fuelCost,
        total_cost: totalCost,
        diff,
        trips
      };
    });
  }, [scopedTrips]);

  const houseTrucksTotal = useMemo(() => {
    return houseTrucks.reduce(
      (acc, cur) => {
        acc.trip_count += cur.trip_count;
        acc.cuoc_goc += cur.cuoc_goc;
        acc.cuoc_sau_tru_17 += cur.cuoc_sau_tru_17;
        acc.toll += cur.toll;
        acc.phat_sinh += cur.phat_sinh;
        acc.phi_nang += cur.phi_nang;
        acc.phi_ha += cur.phi_ha;
        acc.fuel_liters += cur.fuel_liters;
        acc.fuel_cost += cur.fuel_cost;
        acc.total_cost += cur.total_cost;
        acc.diff += cur.diff;
        return acc;
      },
      {
        trip_count: 0,
        cuoc_goc: 0,
        cuoc_sau_tru_17: 0,
        toll: 0,
        phat_sinh: 0,
        phi_nang: 0,
        phi_ha: 0,
        fuel_liters: 0,
        fuel_cost: 0,
        total_cost: 0,
        diff: 0
      }
    );
  }, [houseTrucks]);

  // 5. Danh sách các nhà xe đối tác thuê ngoài (Đọc từ API công nợ theo kỳ, không tự suy từ cờ cuốc xe)
  const subcontractorPartners = useMemo(() => {
    const map = new Map();
    const payableMap = new Map();
    const hasPayablesData = Boolean(effectiveDebts?.payables);

    if (hasPayablesData && effectiveDebts.payables.subcontractors) {
      effectiveDebts.payables.subcontractors.forEach((s) => {
        payableMap.set(s.subcontractor_name, s);
      });
    }

    scopedTrips
      .filter((t) => t.is_subcontractor)
      .forEach((t) => {
        let name = t.subcontractor_name || t.vehicle_plate || 'Xe ngoài';
        if (name === 'ĐÃ TT' || name === 'MẸ ĐÃ TT') {
          name = t.vehicle_plate || 'Xe ngoài';
        }
        if (!map.has(name)) {
          const apiSub = payableMap.get(name);
          map.set(name, {
            name,
            trip_count: 0,
            cuoc_goc: 0,
            cuoc_sau_tru_17: 0,
            total_payable: 0,
            total_paid: hasPayablesData ? (apiSub ? Number(apiSub.total_paid || 0) : 0) : null,
            balance_due: hasPayablesData
              ? (apiSub ? Number(apiSub.balance_due || 0) : 0)
              : null,
            has_api_debt: Boolean(apiSub),
            trips: []
          });
        }
        const item = map.get(name);
        item.trip_count += 1;
        const f = computeTripFinancials({
          base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
          subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0
        });
        item.cuoc_goc += f.cuoc_goc;
        item.cuoc_sau_tru_17 += f.cuoc_sau_tru_17;
        item.total_payable += f.cuoc_ngoai;
        item.trips.push(t);
      });

    return Array.from(map.values())
      .map((item) => {
        if (!hasPayablesData) {
          return {
            ...item,
            status: 'UNKNOWN',
            statusLabel: 'Chưa xác định — chưa tải được công nợ'
          };
        }

        let status = 'CHUA_TRA';
        let statusLabel = 'Chưa trả';
        if (item.total_payable > 0) {
          if (item.balance_due === 0 && item.total_paid > 0) {
            status = 'DA_TAT_TOAN';
            statusLabel = 'Đã tất toán';
          } else if (item.total_paid > 0 && item.balance_due > 0) {
            status = 'TRA_MOT_PHAN';
            statusLabel = 'Trả một phần';
          } else {
            status = 'CHUA_TRA';
            statusLabel = 'Chưa trả';
          }
        } else {
          status = 'KHONG_PHAT_SINH';
          statusLabel = 'Không phát sinh';
        }
        return {
          ...item,
          status,
          statusLabel
        };
      })
      .sort((a, b) => (b.balance_due ?? 0) - (a.balance_due ?? 0) || b.total_payable - a.total_payable);
  }, [scopedTrips, effectiveDebts]);

  // 6. Tổng hợp Xe thuê ngoài
  const subcontractorTotals = useMemo(() => {
    const subTrips = scopedTrips.filter((t) => t.is_subcontractor);
    let cuoc_goc = 0;
    let cuoc_sau_tru_17 = 0;
    let cuoc_ra = 0;

    subTrips.forEach((t) => {
      const f = computeTripFinancials({
        base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
        subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0
      });
      cuoc_goc += f.cuoc_goc;
      cuoc_sau_tru_17 += f.cuoc_sau_tru_17;
      cuoc_ra += f.cuoc_ngoai;
    });

    const isDebtAvailable = Boolean(effectiveDebts?.payables);
    const totalPaid = isDebtAvailable ? Number(effectiveDebts.payables.total_paid ?? 0) : null;
    const totalDue = isDebtAvailable ? Number(effectiveDebts.payables.total_due ?? 0) : null;

    return {
      trip_count: subTrips.length,
      partners_count: subcontractorPartners.length,
      cuoc_goc,
      cuoc_sau_tru_17,
      cuoc_ra,
      paid: totalPaid,
      due: totalDue,
      isDebtAvailable,
      diff: cuoc_sau_tru_17 - cuoc_ra
    };
  }, [scopedTrips, subcontractorPartners, effectiveDebts]);

  // 7. Nhóm ô gộp 63–64 (HÀ PHƯƠNG) - Tính toán hoàn toàn động
  const group63_64 = useMemo(() => {
    return groupsData.find((g) => g.group_key === 'GROUP-63-64') || null;
  }, [groupsData]);

  const group63_64Trips = useMemo(() => {
    return scopedTrips.filter((t) => t.group_id === 'GROUP-63-64');
  }, [scopedTrips]);

  const group63_64Financials = useMemo(() => {
    if (group63_64Trips.length === 0) return null;
    let goc = 0;
    let vat = 0;
    let coVat = 0;
    let sauTru = 0;
    group63_64Trips.forEach((t) => {
      const f = computeTripFinancials({
        base_revenue: t.cuoc_goc ?? t.cuoc_vao ?? 0
      });
      goc += f.cuoc_goc;
      vat += f.vat_amount;
      coVat += f.cuoc_co_vat;
      sauTru += f.cuoc_sau_tru_17;
    });

    const sharedCost =
      group63_64?.total_shared_money ??
      group63_64Trips.reduce((s, t) => s + (t.cuoc_ra || 0), 0);
    const margin = sauTru - sharedCost;

    return {
      tripsCount: group63_64Trips.length,
      goc,
      vat,
      coVat,
      sauTru,
      sharedCost,
      margin
    };
  }, [group63_64Trips, group63_64]);

  // 8. Danh sách cuốc cấp dầu trong kỳ
  const fuelTripsList = useMemo(() => {
    return scopedTrips
      .filter((t) => (t.dau_liters || t.dau_lit || t.fuel_liters || 0) > 0)
      .sort((a, b) => (b.dau_liters || 0) - (a.dau_liters || 0));
  }, [scopedTrips]);

  // 9. Lọc danh sách trong Drawer hiện tại
  const filteredDrawerTrips = useMemo(() => {
    if (!activeDrawer?.trips) return [];
    if (!drawerSearch.trim()) return activeDrawer.trips;
    const q = drawerSearch.toLowerCase();
    return activeDrawer.trips.filter(
      (t) =>
        (t.id && String(t.id).toLowerCase().includes(q)) ||
        (t.trip_code && String(t.trip_code).toLowerCase().includes(q)) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q)) ||
        (t.vehicle_plate && t.vehicle_plate.toLowerCase().includes(q)) ||
        (t.subcontractor_name && t.subcontractor_name.toLowerCase().includes(q)) ||
        (t.container_number && t.container_number.toLowerCase().includes(q)) ||
        (t.route_name && t.route_name.toLowerCase().includes(q))
    );
  }, [activeDrawer, drawerSearch]);

  const filteredDrawerPartners = useMemo(() => {
    if (!activeDrawer?.partners) return [];
    if (!drawerSearch.trim()) return activeDrawer.partners;
    const q = drawerSearch.toLowerCase();
    return activeDrawer.partners.filter((p) => p.name.toLowerCase().includes(q));
  }, [activeDrawer, drawerSearch]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 flex flex-col items-center justify-center space-y-4 text-center">
        <Loader2 className="w-9 h-9 text-slate-800 animate-spin" />
        <div className="text-sm font-semibold text-slate-800">
          Đang tải dữ liệu kinh doanh và báo cáo điều hành...
        </div>
        <div className="text-xs text-slate-500">
          Chuẩn hóa cước gốc chưa VAT • VAT 8% • Khoản trừ nội bộ 17% • Tách nâng/hạ • Tiền dầu theo ngày
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 bg-white border border-rose-200 rounded-2xl shadow-xs text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Không thể tải dữ liệu kinh doanh</h3>
        <p className="text-xs text-slate-600">{loadError}</p>
        <button
          onClick={loadData}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Thử lại</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* PHẦN ĐẦU: TIÊU ĐỀ & BỘ LỌC PHẠM VI (SCOPE SELECTOR) */}
      {/* ============================================================ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Tổng quan kinh doanh {dateFilter === 'month' ? 'Tháng 01/2026' : ''}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              Chuẩn điều hành
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Sản lượng, doanh thu cước, chi phí trực tiếp, hiệu quả đội xe nhà và công nợ trọng điểm
          </p>
        </div>

        {/* Nút hành động đầu trang */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setFuelModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Fuel size={14} className="text-slate-600" />
            <span>Giá dầu theo ngày</span>
          </button>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center justify-center p-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 rounded-lg text-xs shadow-2xs transition-colors cursor-pointer"
            title="Làm mới dữ liệu từ máy chủ"
            aria-label="Làm mới dữ liệu"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* THANH BỘ LỌC: KỲ VÀ SCOPE RÕ RÀNG */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
        {/* Bộ lọc kỳ */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Kỳ báo cáo:</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium focus:outline-hidden focus:ring-1 focus:ring-slate-400"
          >
            <option value="month">Tháng 01/2026 (Toàn bộ bảng kê)</option>
            <option value="day_09">Ngày 09/01/2026</option>
            <option value="day_08">Ngày 08/01/2026</option>
            <option value="range">Khoảng ngày tùy chọn</option>
            <option value="all">Tất cả thời gian</option>
          </select>

          {dateFilter === 'range' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-800"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-800"
              />
            </div>
          )}
        </div>

        {/* 3 Nút Scope Selector */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium self-start lg:self-auto w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setScopeFilter('ALL')}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition-all ${
              scopeFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Toàn công ty ({scopedTrips.length} cuốc)
          </button>
          <button
            type="button"
            onClick={() => setScopeFilter('XE_NHA')}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition-all ${
              scopeFilter === 'XE_NHA'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Đội xe nhà ({scopedTrips.filter((t) => !t.is_subcontractor).length} cuốc)
          </button>
          <button
            type="button"
            onClick={() => setScopeFilter('THUE_NGOAI')}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition-all ${
              scopeFilter === 'THUE_NGOAI'
                ? 'bg-white text-slate-900 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Xe thuê ngoài ({scopedTrips.filter((t) => t.is_subcontractor).length} cuốc)
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4 THẺ KPI CHÍNH (KẾT NỐI THEO ĐÚNG SCOPE & CLICK MỞ DRILLDOWN) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Sản lượng */}
        <div
          onClick={(e) =>
            openDrawer(
              {
                type: 'TRIPS',
                title: `Danh sách cuốc xe: ${
                  scopeFilter === 'ALL'
                    ? 'Toàn công ty'
                    : scopeFilter === 'XE_NHA'
                    ? 'Đội xe nhà'
                    : 'Xe thuê ngoài'
                }`,
                subtitle: `Phạm vi: ${metrics.completedCount} cuốc hoàn tất`,
                trips: effectiveTrips
              },
              e.currentTarget
            )
          }
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-400 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
          title="Bấm để xem danh sách cuốc xe theo phạm vi"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
              <span>Sản lượng vận tải</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-600 border border-slate-200">
                {scopeFilter === 'ALL' ? 'Toàn bộ' : scopeFilter === 'XE_NHA' ? 'Xe nhà' : 'Xe ngoài'}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {metrics.completedCount} <span className="text-xs font-normal text-slate-500">cuốc</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {metrics.journeyCount} hành trình vận tải hoàn tất
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 mt-3 pt-2 border-t border-slate-100">
            <span>Xem danh sách theo phạm vi</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* KPI 2: Tổng cước sau trừ 17% */}
        <div
          onClick={(e) =>
            openDrawer(
              {
                type: 'REVENUE_BREAKDOWN',
                title: `Đối chiếu cước vận tải: ${
                  scopeFilter === 'ALL'
                    ? 'Toàn công ty'
                    : scopeFilter === 'XE_NHA'
                    ? 'Đội xe nhà'
                    : 'Xe thuê ngoài'
                }`,
                subtitle: `Tổng cước sau trừ 17%: ${formatVnd(metrics.totalCuocSauTru17)}`,
                trips: effectiveTrips,
                metrics
              },
              e.currentTarget
            )
          }
          className="bg-white border border-blue-200 rounded-xl p-4 shadow-2xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
          title="Bấm để xem đối chiếu cước theo phạm vi"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-blue-700 font-semibold uppercase tracking-wider mb-2">
              <span>Tổng cước sau trừ 17%</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Chính thức
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-blue-900 tabular-nums">
              {formatVnd(metrics.totalCuocSauTru17)}
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">
              Gốc: {formatTrieuDong(metrics.totalCuocGoc)}M • VAT: {formatTrieuDong(metrics.totalVat8)}M • Có VAT: {formatTrieuDong(metrics.totalCuocCoVat)}M
            </div>
          </div>
          <div className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 mt-3 pt-2 border-t border-blue-50">
            <span>Đối chiếu cước theo phạm vi</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* KPI 3: Chi phí công ty ghi nhận */}
        <div
          onClick={(e) =>
            openDrawer(
              {
                type: 'COST_BREAKDOWN',
                title: `Phân rã chi phí: ${
                  scopeFilter === 'ALL'
                    ? 'Toàn công ty (77 cuốc)'
                    : scopeFilter === 'XE_NHA'
                    ? 'Đội xe nhà (57 cuốc)'
                    : 'Xe thuê ngoài (20 cuốc)'
                }`,
                subtitle: `Tổng chi phí ghi nhận: ${formatVnd(metrics.totalChiPhiCongTy)}`,
                scope: scopeFilter,
                metrics
              },
              e.currentTarget
            )
          }
          className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
          title="Bấm để xem phân rã chi phí theo phạm vi"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-amber-800 font-semibold uppercase tracking-wider mb-2">
              <span>Chi phí ghi nhận</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Chưa tính dầu
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-950 tabular-nums">
              {formatVnd(metrics.totalChiPhiCongTy)}
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">
              {scopeFilter === 'XE_NHA'
                ? `BOT: ${formatTrieuDong(metrics.totalToll)}M • Phát sinh: ${formatVnd(metrics.totalPhatSinh)}`
                : scopeFilter === 'THUE_NGOAI'
                ? `Thuê ngoài: ${formatTrieuDong(metrics.totalCuocRa)}M (20 cuốc)`
                : `BOT: ${formatTrieuDong(metrics.totalToll)}M • Thuê ngoài: ${formatTrieuDong(metrics.totalCuocRa)}M`}
            </div>
          </div>
          <div className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1 mt-3 pt-2 border-t border-amber-50">
            <span>Phân rã chi phí theo phạm vi</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* KPI 4: Chênh lệch tạm tính */}
        <div
          onClick={(e) =>
            openDrawer(
              {
                type: 'PROFIT_EXPLAINER',
                title: `Giải trình chênh lệch: ${
                  scopeFilter === 'ALL'
                    ? 'Toàn công ty'
                    : scopeFilter === 'XE_NHA'
                    ? 'Đội xe nhà'
                    : 'Xe thuê ngoài'
                }`,
                subtitle: `Chênh lệch tạm tính: ${
                  metrics.totalChenhLechSauTru17 >= 0 ? '+' : ''
                }${formatVnd(metrics.totalChenhLechSauTru17)}`,
                scope: scopeFilter,
                metrics
              },
              e.currentTarget
            )
          }
          className="bg-white border border-emerald-200 rounded-xl p-4 shadow-2xs hover:border-emerald-400 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
          title="Bấm để xem công thức & ghi chú theo phạm vi"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-emerald-800 font-semibold uppercase tracking-wider mb-2">
              <span>Chênh lệch tạm tính</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Tạm tính
              </span>
            </div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums ${
                metrics.totalChenhLechSauTru17 >= 0 ? 'text-emerald-800' : 'text-rose-700'
              }`}
            >
              {metrics.totalChenhLechSauTru17 >= 0 ? '+' : ''}
              {formatVnd(metrics.totalChenhLechSauTru17)}
            </div>
            <div className="text-xs text-slate-500 mt-1 line-clamp-1">
              Chưa trừ lương • <em>Chưa tính tiền dầu do thiếu đơn giá ngày chạy</em>
            </div>
          </div>
          <div className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 mt-3 pt-2 border-t border-emerald-50">
            <span>Công thức & ghi chú giải trình</span>
            <ArrowUpRight size={13} />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* KHỐI 1: HIỆU QUẢ VẬN HÀNH ĐỘI XE NHÀ (ƯU TIÊN HÀNG ĐẦU CỦA GIÁM ĐỐC) */}
      {/* ============================================================ */}
      <section
        aria-label="Hiệu quả Đội xe nhà"
        className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Truck size={17} className="text-slate-700" />
              <span>Hiệu quả vận hành Đội xe nhà ({houseTrucks.length} phương tiện)</span>
            </h2>
            <div className="text-xs text-slate-500 mt-0.5">
              Chiếm {houseTrucksTotal.trip_count}/{scopedTrips.length} cuốc ({Math.round(
                (houseTrucksTotal.trip_count / (scopedTrips.length || 1)) * 100
              )}% sản lượng) • Đóng góp +{formatVnd(houseTrucksTotal.diff)} chênh lệch trước lương & dầu
            </div>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200 self-start sm:self-auto">
            {houseTrucksTotal.trip_count} cuốc xe nhà
          </span>
        </div>

        {/* Bảng máy tính để bàn (Desktop View) */}
        <div className="hidden md:block ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Biển số xe nhà</th>
                <th className="py-2.5 px-3 text-center">Số cuốc</th>
                <th className="py-2.5 px-3 text-right">Cước gốc (Chưa VAT)</th>
                <th className="py-2.5 px-3 text-right">Sau trừ 17% (×0,83)</th>
                <th className="py-2.5 px-3 text-right">Vé cầu đường BOT</th>
                <th className="py-2.5 px-3 text-right">Phát sinh</th>
                <th className="py-2.5 px-3 text-center">Dầu cấp</th>
                <th className="py-2.5 px-3 text-right">Chênh lệch tạm tính</th>
                <th className="py-2.5 px-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {houseTrucks.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-6 text-center text-slate-500">
                    Không có cuốc xe nhà trong kỳ được chọn
                  </td>
                </tr>
              ) : (
                houseTrucks.map((truck) => (
                  <tr key={truck.plate} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{truck.plate}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {truck.trip_count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {formatVnd(truck.cuoc_goc)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700">
                      {formatVnd(truck.cuoc_sau_tru_17)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {truck.toll > 0 ? formatVnd(truck.toll) : '0 đ'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {truck.phat_sinh > 0 ? formatVnd(truck.phat_sinh) : '0 đ'}
                    </td>
                    <td
                      className="py-2.5 px-3 text-center font-mono text-slate-600"
                      title={truck.fuel_liters > 0 ? 'Chưa tính tiền dầu do thiếu đơn giá ngày chạy' : ''}
                    >
                      {truck.fuel_liters > 0 ? `${truck.fuel_liters.toLocaleString('vi-VN')} L` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                      +{formatVnd(truck.diff)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) =>
                          openDrawer(
                            {
                              type: 'VEHICLE_TRIPS',
                              title: `Cuốc xe của phương tiện: ${truck.plate}`,
                              subtitle: `Tổng cộng ${truck.trip_count} cuốc trong kỳ`,
                              trips: truck.trips
                            },
                            e.currentTarget
                          )
                        }
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Xem {truck.trip_count} cuốc
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                <td className="py-2.5 px-3 uppercase">Tổng đội xe nhà</td>
                <td className="py-2.5 px-3 text-center font-mono">{houseTrucksTotal.trip_count}</td>
                <td className="py-2.5 px-3 text-right font-mono">{formatVnd(houseTrucksTotal.cuoc_goc)}</td>
                <td className="py-2.5 px-3 text-right font-mono text-blue-700">
                  {formatVnd(houseTrucksTotal.cuoc_sau_tru_17)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono">{formatVnd(houseTrucksTotal.toll)}</td>
                <td className="py-2.5 px-3 text-right font-mono">{formatVnd(houseTrucksTotal.phat_sinh)}</td>
                <td className="py-2.5 px-3 text-center font-mono">
                  {houseTrucksTotal.fuel_liters.toLocaleString('vi-VN')} L
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                  +{formatVnd(houseTrucksTotal.diff)}
                </td>
                <td className="py-2.5 px-3 text-center">-</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Khung thẻ di động (Mobile Cards) */}
        <div className="block md:hidden space-y-3 pt-1">
          {houseTrucks.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs bg-slate-50 border border-slate-200 rounded-xl">
              Không có cuốc xe nhà trong kỳ được chọn
            </div>
          ) : (
            houseTrucks.map((truck) => (
              <div
                key={truck.plate}
                className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="font-bold text-slate-900 text-sm">{truck.plate}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px]">
                    {truck.trip_count} cuốc
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Sau trừ 17%</span>
                    <span className="font-semibold text-blue-700">{formatVnd(truck.cuoc_sau_tru_17)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">BOT & Phí</span>
                    <span className="text-slate-800">{formatVnd(truck.toll + truck.phat_sinh)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Dầu cấp</span>
                    <span className="text-slate-700">
                      {truck.fuel_liters > 0 ? `${truck.fuel_liters}L (chưa giá)` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Chênh lệch</span>
                    <span className="font-bold text-emerald-700">+{formatVnd(truck.diff)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) =>
                    openDrawer(
                      {
                        type: 'VEHICLE_TRIPS',
                        title: `Cuốc xe của phương tiện: ${truck.plate}`,
                        subtitle: `Tổng cộng ${truck.trip_count} cuốc trong kỳ`,
                        trips: truck.trips
                      },
                      e.currentTarget
                    )
                  }
                  className="w-full mt-2 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  Xem {truck.trip_count} cuốc xe {truck.plate}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* KHỐI 2: TÓM TẮT 3 PHÂN HỆ CÔNG NỢ (RESPONSIVE CHUẨN 1 CỘT MOBILE) */}
      {/* ============================================================ */}
      <section aria-label="Tóm tắt công nợ 3 phân hệ">
        <div id="overview-debts-grid" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Phải thu khách hàng */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-sm text-slate-900">1. Phải thu khách hàng</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {debtsLoading || (!isDebtsCurrent && !debtsError)
                    ? '...'
                    : effectiveDebts?.receivables?.customers
                    ? `${effectiveDebts.receivables.customers.length} khách`
                    : 'Chưa có'}
                </span>
              </div>

              {debtsLoading || (!isDebtsCurrent && !debtsError) ? (
                <div className="py-6 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-500" />
                  <div className="text-xs">Đang tải dữ liệu công nợ...</div>
                </div>
              ) : (debtsError || (!isDebtsCurrent && debtsError)) && !effectiveDebts ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-2 text-rose-800">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-rose-600 shrink-0" />
                    <span>Chưa tải được công nợ</span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-tight">{debtsError}</p>
                  <button
                    type="button"
                    onClick={reloadDebts}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <RefreshCw size={12} />
                    <span>Thử lại</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Cước gốc phát sinh:</span>
                    <strong className="font-mono text-slate-900">
                      {formatVnd(effectiveDebts?.receivables?.total_receivable ?? 0)}
                    </strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Thực thu qua tài khoản/quỹ:</span>
                    <strong className="font-mono text-emerald-700">
                      {formatVnd(effectiveDebts?.receivables?.total_paid ?? 0)}
                    </strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Khoản đối trừ:</span>
                    <strong className="font-mono text-amber-700">
                      {formatVnd(effectiveDebts?.receivables?.total_offset ?? 0)}
                    </strong>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-dashed border-slate-200 font-semibold text-slate-800">
                    <span>Dư nợ cước gốc:</span>
                    <strong
                      className={`font-mono ${
                        (effectiveDebts?.receivables?.total_due ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {formatVnd(effectiveDebts?.receivables?.total_due ?? 0)}
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Chênh lệch VAT lịch sử:{' '}
                    {formatVnd(effectiveDebts?.receivables?.total_vat_reconciliation_diff ?? 0)}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('debts')}
              className="w-full mt-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Chi tiết công nợ khách hàng</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Card 2: Tiền phơi trả hộ */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-sm text-slate-900">2. Tiền phơi trả hộ</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  Theo dõi riêng
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Tổng tiền phơi tạm ứng:</span>
                  <strong className="font-mono text-slate-900">
                    {formatVnd(metrics.totalPhoiTraHo)}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Chủ hàng đã hoàn lại:</span>
                  <strong className="font-mono text-emerald-700">
                    {formatVnd(metrics.totalPhoiTraHo - metrics.totalPhoiConPhaiThu)}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Còn phải thu hồi:</span>
                  <strong className="font-mono text-slate-900">
                    {formatVnd(metrics.totalPhoiConPhaiThu)}
                  </strong>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-dashed border-slate-200 font-semibold text-slate-800">
                  <span>Đến hạn / Quá hạn:</span>
                  <strong className="font-mono text-slate-900">
                    {(eirReminders?.summary?.overdue_count || 0) +
                      (eirReminders?.summary?.due_today_count || 0)}{' '}
                    khoản
                  </strong>
                </div>
                <div className="text-[11px] text-slate-400">
                  Tách riêng cước vận tải • Không làm giảm lãi chuyến
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('debts')}
              className="w-full mt-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Theo dõi thu hồi phơi</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Card 3: Xe thuê ngoài */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-sm text-slate-900">
                  3. Xe thuê ngoài ({subcontractorTotals.trip_count} cuốc)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {subcontractorTotals.partners_count} đối tác
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Cước sau trừ 17%:</span>
                  <strong className="font-mono text-blue-700">
                    {formatVnd(subcontractorTotals.cuoc_sau_tru_17)}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cước ra phải trả:</span>
                  <strong className="font-mono text-rose-700">
                    {formatVnd(subcontractorTotals.cuoc_ra)}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Đã thanh toán:</span>
                  {debtsLoading || (!isDebtsCurrent && !debtsError) ? (
                    <span className="text-[11px] text-slate-400 italic">Đang tải...</span>
                  ) : isDebtsCurrent && subcontractorTotals.isDebtAvailable ? (
                    <strong className="font-mono text-emerald-700">
                      {formatVnd(subcontractorTotals.paid)}
                    </strong>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">
                      Chưa xác định — chưa tải được công nợ
                    </span>
                  )}
                </div>
                <div className="flex justify-between pt-1.5 border-t border-dashed border-slate-200 font-semibold text-slate-800">
                  <span>Chênh lệch tạm tính:</span>
                  <strong className="font-mono text-emerald-700">
                    +{formatVnd(subcontractorTotals.diff)}
                  </strong>
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  {debtsLoading || (!isDebtsCurrent && !debtsError) ? (
                    <span className="text-slate-400 italic">Đang kiểm tra dư nợ...</span>
                  ) : isDebtsCurrent && subcontractorTotals.isDebtAvailable ? (
                    subcontractorTotals.due === 0 && (subcontractorTotals.paid ?? 0) > 0 ? (
                      <span className="text-emerald-700">Dư nợ nhà xe: 0 đ (Đã tất toán toàn bộ)</span>
                    ) : (subcontractorTotals.due ?? 0) > 0 ? (
                      <span className="text-rose-700">
                        Dư nợ nhà xe: <strong>{formatVnd(subcontractorTotals.due)}</strong> (Còn phải trả)
                      </span>
                    ) : (
                      <span>Dư nợ nhà xe: 0 đ</span>
                    )
                  ) : (
                    <span className="text-rose-600 font-medium italic">
                      Dư nợ: Chưa xác định — chưa tải được công nợ
                    </span>
                  )}
                </div>

                {/* Khung cảnh báo khi API công nợ bị lỗi kèm nút Thử lại */}
                {(debtsError || (!isDebtsCurrent && debtsError)) && !effectiveDebts && (
                  <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs flex items-center justify-between text-rose-800">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <AlertCircle size={13} className="text-rose-600 shrink-0" />
                      <span>Chưa tải được công nợ nhà xe</span>
                    </span>
                    <button
                      type="button"
                      onClick={reloadDebts}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <RefreshCw size={11} />
                      <span>Thử lại</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) =>
                openDrawer(
                  {
                    type: 'SUBCONTRACTORS_LIST',
                    title: `Danh sách ${subcontractorTotals.partners_count} nhà xe thuê ngoài`,
                    subtitle: `Tổng cộng ${subcontractorTotals.trip_count} cuốc • Cước ra: ${formatVnd(
                      subcontractorTotals.cuoc_ra
                    )}${subcontractorTotals.isDebtAvailable ? '' : ' (Chưa tải công nợ thanh toán)'}`,
                    partners: subcontractorPartners
                  },
                  e.currentTarget
                )
              }
              className="w-full mt-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Xem danh sách {subcontractorTotals.partners_count} nhà xe</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* KHỐI 3: LƯU Ý NGHIỆP VỤ & GIÁM SÁT RỦI RO (COLLAPSIBLE Ở CUỐI) */}
      {/* ============================================================ */}
      <section
        aria-label="Lưu ý nghiệp vụ và giám sát rủi ro"
        className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setNotesCollapsibleOpen(!notesCollapsibleOpen)}
          className="w-full px-4 py-3 bg-slate-50/70 hover:bg-slate-100/80 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-600" />
            <span>Lưu ý nghiệp vụ & Giám sát rủi ro trong kỳ</span>
            <span className="text-[11px] font-normal text-slate-500">(Bấm để xem / thu gọn)</span>
          </div>
          {notesCollapsibleOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {notesCollapsibleOpen && (
          <div className="p-4 space-y-3 border-t border-slate-100 text-xs">
            {/* Mục 1: Nhóm 63–64 (Chỉ hiển thị khi có cuốc trong kỳ đang chọn) */}
            {group63_64Financials ? (
              <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900">
                    1. Chia lãi nhóm cuốc kết hợp GROUP-63-64 ({group63_64?.vehicle_or_partner || 'HÀ PHƯƠNG'})
                  </div>
                  <div className="text-slate-600 text-[11px] leading-relaxed">
                    Cước gốc {formatVnd(group63_64Financials.goc)}, Cước sau trừ 17%: {formatVnd(group63_64Financials.sauTru)}. Cước ra thuê ngoài {formatVnd(group63_64Financials.sharedCost)} dùng chung cho {group63_64Financials.tripsCount} cuốc.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) =>
                    openDrawer(
                      {
                        type: 'GROUP_DETAIL',
                        title: `Phân tích nhóm ô gộp: GROUP-63-64 (${group63_64?.vehicle_or_partner || 'HÀ PHƯƠNG'})`,
                        subtitle: `Bao gồm ${group63_64Financials.tripsCount} cuốc kẹp dùng chung chi phí thuê ngoài ${formatVnd(group63_64Financials.sharedCost)}`,
                        group: group63_64,
                        trips: group63_64Trips,
                        financials: group63_64Financials
                      },
                      e.currentTarget
                    )
                  }
                  className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 rounded-lg font-semibold shrink-0 transition-colors cursor-pointer"
                >
                  Mở chia lãi nhóm (Lãi: +{formatVnd(group63_64Financials.margin)})
                </button>
              </div>
            ) : null}

            {/* Mục 2: Khoản đối trừ (Chỉ hiển thị nếu có đối trừ trong kỳ) */}
            {(debtsData?.receivables?.total_offset ?? 0) > 0 ? (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900">
                    2. Khoản đối trừ cước ({formatVnd(debtsData?.receivables?.total_offset ?? 0)})
                  </div>
                  <div className="text-slate-600 text-[11px] leading-relaxed">
                    Đã hạch toán giảm trừ công nợ cho khách hàng, nhưng không làm phát sinh dòng tiền thanh toán vào tài khoản/quỹ.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab && onNavigateTab('debts')}
                  className="px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-semibold shrink-0 transition-colors cursor-pointer"
                >
                  Xem Công nợ đối trừ
                </button>
              </div>
            ) : null}

            {/* Mục 3: Lượng dầu cấp theo kỳ */}
            {fuelTripsList.length > 0 ? (
              <div className="p-3 bg-sky-50/60 border border-sky-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900">
                    3. Lượng dầu cấp trong kỳ ({metrics.totalFuelLiters.toLocaleString('vi-VN')} Lít / {fuelTripsList.length} cuốc)
                  </div>
                  <div className="text-slate-600 text-[11px] leading-relaxed">
                    {metrics.missingFuelPriceTrips > 0 ? (
                      <em>Có {metrics.missingFuelPriceTrips} cuốc chưa tính tiền dầu do thiếu đơn giá ngày chạy. Tạm thời chưa trừ chi phí dầu vào chênh lệch.</em>
                    ) : (
                      <span>Đã cập nhật đầy đủ đơn giá dầu cho các cuốc trong kỳ.</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) =>
                    openDrawer(
                      {
                        type: 'FUEL_TRIPS',
                        title: `Danh sách ${fuelTripsList.length} cuốc có cấp dầu (${metrics.totalFuelLiters.toLocaleString('vi-VN')} Lít)`,
                        subtitle: 'Chưa trừ chi phí dầu vào chênh lệch tạm tính',
                        trips: fuelTripsList
                      },
                      e.currentTarget
                    )
                  }
                  className="px-3 py-1.5 bg-white hover:bg-sky-50 text-sky-800 border border-sky-300 rounded-lg font-semibold shrink-0 transition-colors cursor-pointer"
                >
                  Xem {fuelTripsList.length} cuốc cấp dầu
                </button>
              </div>
            ) : null}

            {/* Trạng thái nếu kỳ này không có lưu ý rủi ro nào */}
            {!group63_64Financials &&
              (debtsData?.receivables?.total_offset ?? 0) === 0 &&
              fuelTripsList.length === 0 && (
                <div className="p-4 text-center text-slate-500 text-xs">
                  Không có lưu ý nghiệp vụ đặc thù hoặc rủi ro phát sinh trong kỳ được chọn.
                </div>
              )}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* DRAWER NỘI BỘ MỞ CHI TIẾT TẠI CHỖ (HỖ TRỢ ESCAPE VÀ HOÀN FOCUS) */}
      {/* ============================================================ */}
      {activeDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
          onClick={closeDrawer}
        >
          <div
            ref={drawerDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={activeDrawer.title}
            className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-drawer-slide"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {activeDrawer.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{activeDrawer.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="p-1.5 text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                aria-label="Đóng ngăn kéo"
              >
                <X size={18} />
              </button>
            </div>

            {/* Thanh tìm kiếm nhanh bên trong drawer nếu có danh sách */}
            {(activeDrawer.trips || activeDrawer.partners) && (
              <div className="p-3 bg-white border-b border-slate-100 shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={drawerSearch}
                    onChange={(e) => setDrawerSearch(e.target.value)}
                    placeholder="Tìm theo mã cuốc, đối tác, xe, cont, tuyến..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>
            )}

            {/* Body Drawer */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* LOẠI 1: DANH SÁCH CUỐC XE (TRIPS / VEHICLE_TRIPS / FUEL_TRIPS) */}
              {(activeDrawer.type === 'TRIPS' ||
                activeDrawer.type === 'VEHICLE_TRIPS' ||
                activeDrawer.type === 'FUEL_TRIPS' ||
                activeDrawer.type === 'PARTNER_TRIPS') && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500">
                    Đang hiển thị <strong>{filteredDrawerTrips.length}</strong> cuốc. Bấm vào cuốc để xem đối chiếu tài chính:
                  </div>
                  <p className="mb-1 text-xs text-slate-500 md:hidden">Vuốt ngang bảng để xem các cột bên phải.</p>
                  <div className="border border-slate-200 rounded-xl ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                          <th className="py-2.5 px-3">Mã cuốc</th>
                          <th className="py-2.5 px-3">Ngày</th>
                          <th className="py-2.5 px-3">Khách hàng</th>
                          <th className="py-2.5 px-3 text-right">Cước gốc</th>
                          <th className="py-2.5 px-3 text-right">Sau trừ 17%</th>
                          {activeDrawer.type === 'FUEL_TRIPS' && (
                            <th className="py-2.5 px-3 text-center">Dầu (Lít)</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDrawerTrips.map((t) => {
                          const f = computeTripFinancials({
                            base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
                            toll_fee: t.tien_duong ?? t.toll_fee ?? 0,
                            subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0,
                            other_costs: t.phat_sinh ?? t.other_costs ?? 0,
                            fuel_liters: t.dau_liters ?? t.dau_lit ?? t.fuel_liters ?? 0
                          });

                          return (
                            <tr
                              key={t.id}
                              onClick={() => setSelectedTrip(t)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                              title="Bấm để mở chi tiết cuốc xe"
                            >
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                {t.id}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-500">
                                {t.trip_date || t.raw_date}
                              </td>
                              <td className="py-2 px-3 text-slate-800 font-medium truncate max-w-[150px]">
                                {t.customer_name}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700">
                                {formatVnd(f.cuoc_goc)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700">
                                {formatVnd(f.cuoc_sau_tru_17)}
                              </td>
                              {activeDrawer.type === 'FUEL_TRIPS' && (
                                <td className="py-2 px-3 text-center font-mono font-bold text-sky-700">
                                  {f.fuel_liters} L
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* LOẠI 2: ĐỐI CHIẾU CƯỚC VẬN TẢI (REVENUE_BREAKDOWN) */}
              {activeDrawer.type === 'REVENUE_BREAKDOWN' && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 text-xs">
                    <div className="font-bold text-blue-900 text-sm">
                      Tổng cước sau trừ 17%: {formatVnd(activeDrawer.metrics.totalCuocSauTru17)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                      <div>1. Cước vào gốc chưa VAT: <b>{formatVnd(activeDrawer.metrics.totalCuocGoc)}</b></div>
                      <div>2. VAT 8% tính thêm: <b>+{formatVnd(activeDrawer.metrics.totalVat8)}</b></div>
                      <div>3. Cước có VAT (×1,08): <b>{formatVnd(activeDrawer.metrics.totalCuocCoVat)}</b></div>
                      <div>4. Khoản trừ 17%: <b className="text-rose-700">−{formatVnd(activeDrawer.metrics.totalKhoanTru17)}</b></div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">Danh sách cuốc cấu thành:</div>
                  <p className="mb-1 text-xs text-slate-500 md:hidden">Vuốt ngang bảng để xem các cột bên phải.</p>
                  <div className="border border-slate-200 rounded-xl ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                          <th className="py-2.5 px-3">Mã cuốc</th>
                          <th className="py-2.5 px-3">Khách hàng</th>
                          <th className="py-2.5 px-3 text-right">Cước gốc</th>
                          <th className="py-2.5 px-3 text-right">VAT 8%</th>
                          <th className="py-2.5 px-3 text-right">Sau trừ 17%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDrawerTrips.map((t) => {
                          const f = computeTripFinancials({
                            base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0
                          });

                          return (
                            <tr
                              key={t.id}
                              onClick={() => setSelectedTrip(t)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{t.id}</td>
                              <td className="py-2 px-3 text-slate-800 truncate max-w-[140px]">{t.customer_name}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-700">{formatVnd(f.cuoc_goc)}</td>
                              <td className="py-2 px-3 text-right font-mono text-slate-500">+{formatVnd(f.vat_amount)}</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700">{formatVnd(f.cuoc_sau_tru_17)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* LOẠI 3: PHÂN RÃ CHI PHÍ THEO PHẠM VI (COST_BREAKDOWN) */}
              {activeDrawer.type === 'COST_BREAKDOWN' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="font-bold text-slate-900 text-sm">
                      Cơ cấu chi phí: {formatVnd(activeDrawer.metrics.totalChiPhiCongTy)}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span>1. Vé cầu đường BOT:</span>
                        <strong className="font-mono text-rose-700">{formatVnd(activeDrawer.metrics.totalToll)}</strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span>2. Cước thuê xe ngoài:</span>
                        <strong className="font-mono text-rose-700">{formatVnd(activeDrawer.metrics.totalCuocRa)}</strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span>3. Chi phí phát sinh khác:</span>
                        <strong className="font-mono text-rose-700">{formatVnd(activeDrawer.metrics.totalPhatSinh)}</strong>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60 text-slate-500">
                        <span>4. Phí nâng / Phí hạ cảng:</span>
                        <span className="font-mono">{formatVnd(activeDrawer.metrics.totalPhiNang + activeDrawer.metrics.totalPhiHa)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-slate-500">
                        <span>5. Tiền dầu cấp ({activeDrawer.metrics.totalFuelLiters.toLocaleString('vi-VN')} Lít):</span>
                        <span className="font-mono">
                          {activeDrawer.metrics.totalTienDau > 0
                            ? formatVnd(activeDrawer.metrics.totalTienDau)
                            : 'Chưa tính tiền dầu do thiếu đơn giá ngày chạy'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900 leading-relaxed text-[11px]">
                    <strong>Lưu ý:</strong> Đội xe nhà chưa tính chi phí lương lái xe. Lượng dầu cấp ({activeDrawer.metrics.totalFuelLiters.toLocaleString('vi-VN')} lít) trong kỳ tạm thời chưa quy đổi ra tiền do chưa có đơn giá theo ngày chạy.
                  </div>
                </div>
              )}

              {/* LOẠI 4: GIẢI TRÌNH CHÊNH LỆCH & KHOẢN TRỪ 17% (PROFIT_EXPLAINER) */}
              {activeDrawer.type === 'PROFIT_EXPLAINER' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                    <div className="font-bold text-emerald-950 text-sm">
                      Chênh lệch tạm tính: +{formatVnd(activeDrawer.metrics.totalChenhLechSauTru17)}
                    </div>
                    <div className="text-emerald-800 leading-relaxed font-mono text-[11px]">
                      = Cước sau trừ 17% ({formatVnd(activeDrawer.metrics.totalCuocSauTru17)}) − Chi phí ghi nhận ({formatVnd(activeDrawer.metrics.totalChiPhiCongTy)})
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    <div className="font-bold text-slate-900">
                      Nguyên tắc tính cước đã thống nhất ngày 28/10/2026:
                    </div>
                    <ol className="list-decimal pl-4 space-y-1.5 text-slate-700 text-[11px] leading-relaxed">
                      <li><strong>Cước vào gốc chưa VAT:</strong> Cước gốc thỏa thuận trong bảng kê.</li>
                      <li><strong>VAT 8%:</strong> = Math.round(cước_gốc × 0,08).</li>
                      <li><strong>Tổng cước có VAT:</strong> = cước_gốc + VAT_8% (nhân 1,08).</li>
                      <li><strong>Khoản trừ 17% nội bộ:</strong> = Math.round(cước_có_VAT × 0,17).</li>
                      <li><strong>Tổng cước sau trừ 17%:</strong> = cước_có_VAT − khoản_trừ_17% (nhân 0,83).</li>
                    </ol>
                  </div>

                  <div className="text-[11px] text-slate-500 leading-relaxed">
                    * Khoản trừ 17% là quy tắc quản trị nội bộ theo yêu cầu của giám đốc, không diễn giải thành thuế suất pháp lý hay lãi ròng chính thức.<br />
                    * <em>Chưa tính tiền dầu do thiếu đơn giá ngày chạy.</em>
                  </div>
                </div>
              )}

              {/* LOẠI 5: DANH SÁCH NHÀ XE THUÊ NGOÀI (SUBCONTRACTORS_LIST) */}
              {activeDrawer.type === 'SUBCONTRACTORS_LIST' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500">
                    Danh sách <strong>{filteredDrawerPartners.length}</strong> đối tác vận tải thuê ngoài trong kỳ:
                  </div>
                  <p className="mb-1 text-xs text-slate-500 md:hidden">Vuốt ngang bảng để xem các cột bên phải.</p>
                  <div className="border border-slate-200 rounded-xl ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                          <th className="py-2.5 px-3">Tên đối tác xe ngoài</th>
                          <th className="py-2.5 px-3 text-center">Số cuốc</th>
                          <th className="py-2.5 px-3 text-right">Cước thuê</th>
                          <th className="py-2.5 px-3 text-right">Đã thanh toán</th>
                          <th className="py-2.5 px-3 text-right">Còn nợ</th>
                          <th className="py-2.5 px-3 text-center">Trạng thái</th>
                          <th className="py-2.5 px-3 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDrawerPartners.map((p) => (
                          <tr key={p.name} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{p.name}</td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                              {p.trip_count}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-700">
                              {formatVnd(p.total_payable)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                              {p.total_paid !== null ? (
                                formatVnd(p.total_paid)
                              ) : (
                                <span className="text-slate-400 font-normal italic">--</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                              {p.balance_due !== null ? (
                                formatVnd(p.balance_due)
                              ) : (
                                <span className="text-slate-400 font-normal italic">--</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {p.status === 'UNKNOWN' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  Chưa tải công nợ
                                </span>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    p.status === 'DA_TAT_TOAN'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : p.status === 'TRA_MOT_PHAN'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {p.statusLabel}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  openDrawer({
                                    type: 'PARTNER_TRIPS',
                                    title: `Cuốc xe của đối tác: ${p.name}`,
                                    subtitle: `Tổng cộng ${p.trip_count} cuốc trong kỳ • Cước ra: ${formatVnd(
                                      p.total_payable
                                    )}`,
                                    trips: p.trips
                                  })
                                }
                                className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                Xem cuốc
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* LOẠI 6: CHI TIẾT NHÓM Ô GỘP (GROUP_DETAIL - TÍNH TOÁN ĐỘNG) */}
              {activeDrawer.type === 'GROUP_DETAIL' && (() => {
                const fin = activeDrawer.financials || (() => {
                  let goc = 0, vat = 0, coVat = 0, sauTru = 0;
                  (activeDrawer.trips || []).forEach((t) => {
                    const f = computeTripFinancials({ base_revenue: t.cuoc_goc ?? t.cuoc_vao ?? 0 });
                    goc += f.cuoc_goc;
                    vat += f.vat_amount;
                    coVat += f.cuoc_co_vat;
                    sauTru += f.cuoc_sau_tru_17;
                  });
                  const shared =
                    activeDrawer.group?.total_shared_money ??
                    (activeDrawer.trips || []).reduce((s, t) => s + (t.cuoc_ra || 0), 0);
                  return { goc, vat, coVat, sauTru, sharedCost: shared, margin: sauTru - shared };
                })();

                return (
                  <div className="space-y-4 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div>Mã nhóm: <strong>{activeDrawer.group?.group_key || 'GROUP-63-64'}</strong></div>
                      <div>Đối tác: <strong>{activeDrawer.group?.vehicle_or_partner || 'HÀ PHƯƠNG'}</strong></div>
                      <div>Dòng nguồn: <strong>{activeDrawer.trips?.map((t) => `#${t.id}`).join(' & ')}</strong></div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2 font-bold text-slate-800 border-b border-slate-200">
                        Danh sách {activeDrawer.trips?.length || 0} cuốc cấu thành nhóm
                      </div>
                      <div className="ha-table-scroll" tabIndex={0} role="region" aria-label="Danh sách cuốc, có thể cuộn ngang">
                        <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                            <th className="py-2 px-3">Mã cuốc</th>
                            <th className="py-2 px-3">Khách hàng</th>
                            <th className="py-2 px-3 text-right">Cước gốc</th>
                            <th className="py-2 px-3 text-right">Sau trừ 17%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(activeDrawer.trips || []).map((t) => {
                            const f = computeTripFinancials({
                              base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0
                            });

                            return (
                              <tr
                                key={t.id}
                                onClick={() => setSelectedTrip(t)}
                                className="hover:bg-slate-50 cursor-pointer"
                                title="Bấm để xem chi tiết cuốc này"
                              >
                                <td className="py-2 px-3 font-mono font-bold text-slate-900">{t.id}</td>
                                <td className="py-2 px-3 text-slate-800">{t.customer_name}</td>
                                <td className="py-2 px-3 text-right font-mono text-slate-700">{formatVnd(f.cuoc_goc)}</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-blue-700">{formatVnd(f.cuoc_sau_tru_17)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                      <div className="font-bold text-emerald-950 text-sm">
                        Tổng hợp tài chính cấp nhóm (Tính động từ cuốc thực tế):
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between">
                          <span>Tổng cước gốc nhóm:</span>
                          <strong>{formatVnd(fin.goc)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Tổng cước có VAT:</span>
                          <strong>{formatVnd(fin.coVat)}</strong>
                        </div>
                        <div className="flex justify-between text-blue-700">
                          <span>Tổng cước sau trừ 17%:</span>
                          <strong>{formatVnd(fin.sauTru)}</strong>
                        </div>
                        <div className="flex justify-between text-rose-700">
                          <span>Chi phí thuê ngoài dùng chung:</span>
                          <strong>{formatVnd(fin.sharedCost)}</strong>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-emerald-200 text-sm font-bold text-emerald-800">
                          <span>Chênh lệch tạm tính nhóm:</span>
                          <span>+{formatVnd(fin.margin)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 leading-relaxed">
                      * <em>Quy tắc chuẩn hóa 28/10/2026:</em> Không tự ý chia đôi hay phân bổ chi phí gộp cho từng cuốc khi chưa có tỷ lệ thỏa thuận. Chênh lệch cấp nhóm (+{formatVnd(fin.margin)}) được bảo toàn chính xác trong tổng chênh lệch toàn công ty (+{formatVnd(metrics.totalChenhLechSauTru17)}).
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DRAWER CHI TIẾT CUỐC XE (TRIP DETAIL DRAWER) */}
      {/* ============================================================ */}
      <TripDetailDrawer
        selectedTrip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        onTripUpdated={loadData}
      />

      {/* ============================================================ */}
      {/* MODAL BẢNG GIÁ DẦU THEO NGÀY */}
      {/* ============================================================ */}
      <FuelPriceManagementModal
        isOpen={fuelModalOpen}
        onClose={() => setFuelModalOpen(false)}
        onSaved={loadData}
      />

      {/* ============================================================ */}
      {/* MODAL XÁC NHẬN HOÀN TIỀN PHƠI / ĐẶT NGÀY HẸN HOÀN */}
      {/* ============================================================ */}
      <PhoiRefundModal
        isOpen={Boolean(phoiModalTarget)}
        onClose={() => setPhoiModalTarget(null)}
        trip={phoiModalTarget?.trip || null}
        advance={phoiModalTarget?.advance || null}
        initialMode={phoiModalTarget?.mode || 'REFUND'}
        onSuccess={loadData}
      />
    </div>
  );
}

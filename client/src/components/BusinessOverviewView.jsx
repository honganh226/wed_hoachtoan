import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  Coins
} from 'lucide-react';
import {
  formatVnd,
  formatTrieuDong,
  calculateGroupAllocation
} from '../data/unifiedBusinessData';
import {
  fetchBusinessOverviewApi,
  fetchBusinessTripsApi,
  fetchBusinessGroupsApi,
  fetchEirRemindersApi,
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
  onAssistantFocusConsumed
}) {
  const [tripsData, setTripsData] = useState([]);
  const [groupsData, setGroupsData] = useState([]);
  const [overviewData, setOverviewData] = useState(null);
  const [eirReminders, setEirReminders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // 1. BỘ LỌC TOÀN TRANG: THỜI GIAN & KHU VỰC
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [dateFilter, setDateFilter] = useState('month'); // 'month' | 'day_09' | 'day_08' | 'all' | 'range'
  const [selectedArea, setSelectedArea] = useState('ALL');

  // 2. PHÂN HỆ HIỆU QUẢ HOẠT ĐỘNG
  const [breakdownView, setBreakdownView] = useState('VEHICLE'); // 'DRIVER' | 'VEHICLE' | 'GROUPS'
  const [breakdownSort, setBreakdownSort] = useState('PROFIT_DESC'); // 'PROFIT_DESC' | 'TRIPS_ASC'

  // 3. DRILL-DOWN DANH SÁCH CHUYẾN LIÊN QUAN
  const [activeDrilldown, setActiveDrilldown] = useState(null);
  const [drilldownSearch, setDrilldownSearch] = useState('');

  // 4. KHUNG CHI TIẾT CHUYẾN XE BÊN PHẢI (DRAWER)
  const [selectedTrip, setSelectedTrip] = useState(null);

  // 5. MODAL GIÁ DẦU THEO NGÀY & MODAL XÁC NHẬN HOÀN TIỀN PHƠI
  const [fuelModalOpen, setFuelModalOpen] = useState(false);
  const [phoiModalTarget, setPhoiModalTarget] = useState(null); // { trip, advance, mode }

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
      : activeDrilldown?.type === 'ENTITY'
      ? { kind: activeDrilldown.entityType === 'VEHICLE' ? 'vehicle' : 'driver', value: activeDrilldown.name }
      : null;
    onAssistantContext?.({ period, area: selectedArea, entity });
  }, [dateFilter, rangeStart, rangeEnd, selectedArea, selectedTrip, activeDrilldown, onAssistantContext]);

  const [selectedGroupForAllocation, setSelectedGroupForAllocation] = useState(null);
  const [allocationMode, setAllocationMode] = useState('PROPORTIONAL');
  const [manualInputs, setManualInputs] = useState({});
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [ovRes, trRes, grRes, remRes] = await Promise.all([
        fetchBusinessOverviewApi({ period: 'month' }),
        fetchBusinessTripsApi(),
        fetchBusinessGroupsApi(),
        fetchEirRemindersApi().catch(() => ({ success: false }))
      ]);
      if (ovRes.success && trRes.success && grRes.success) {
        setOverviewData(ovRes.data);
        setTripsData(trRes.data.trips || []);
        setGroupsData(grRes.data || []);
        if (remRes.success) setEirReminders(remRes.data);
      } else {
        const err = ovRes.error || trRes.error || grRes.error || 'Lỗi lấy dữ liệu kinh doanh.';
        setLoadError(err);
      }
    } catch (e) {
      setLoadError('Không thể kết nối máy chủ backend. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    window.addEventListener('business-data-changed', refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('business-data-changed', refresh);
      clearInterval(timer);
    };
  }, [loadData]);

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
  }, [assistantFocus?.nonce, tripsData]);

  const handleSaveAllocation = async () => {
    if (!selectedGroupForAllocation) return;
    const groupKey = selectedGroupForAllocation.group_key;

    if (allocationMode === 'MANUAL') {
      const target = selectedGroupForAllocation.total_shared_money;
      const totalManual = Object.values(manualInputs).reduce((s, v) => s + (Number(v) || 0), 0);
      if (totalManual !== target) {
        alert(`Tổng tiền phân bổ thủ công (${formatVnd(totalManual)}) chưa khớp với mục tiêu (${formatVnd(target)})!`);
        return;
      }
    }

    setIsSavingAllocation(true);
    try {
      const resp = await saveBusinessGroupAllocationApi(
        groupKey,
        allocationMode,
        allocationMode === 'MANUAL' ? manualInputs : {}
      );
      if (!resp.success) {
        alert(`Lỗi lưu phân bổ từ máy chủ: ${resp.error || resp.message || 'Không thành công'}`);
        return;
      }
      await loadData();
      setSelectedGroupForAllocation(null);
    } catch (e) {
      alert('Lỗi kết nối mạng: Không thể lưu phân bổ lên máy chủ.');
    } finally {
      setIsSavingAllocation(false);
    }
  };

  // Các chuyến xe trong phạm vi lọc
  const scopedTrips = useMemo(() => {
    return tripsData.filter((trip) => {
      if (
        dateFilter === 'range' &&
        ((rangeStart && trip.trip_date < rangeStart) || (rangeEnd && trip.trip_date > rangeEnd))
      )
        return false;
      if (dateFilter === 'all') return true;
      if (dateFilter === 'month' && !trip.trip_date.startsWith('2026-01')) return false;
      if (dateFilter === 'day_09' && trip.trip_date !== '2026-01-09') return false;
      if (dateFilter === 'day_08' && trip.trip_date !== '2026-01-08') return false;
      if (selectedArea !== 'ALL' && trip.area_id !== selectedArea) return false;
      return true;
    });
  }, [tripsData, dateFilter, selectedArea, rangeStart, rangeEnd]);

  const scopeLabel = useMemo(() => {
    let d =
      dateFilter === 'all'
        ? `Toàn bộ thời gian (${scopedTrips.length} cuốc)`
        : dateFilter === 'month'
        ? 'Tháng 01/2026 (77 cuốc bảng kê Excel)'
        : dateFilter === 'day_09'
        ? 'Ngày 09/01/2026'
        : dateFilter === 'range'
        ? `Từ ${rangeStart || 'đầu kỳ'} đến ${rangeEnd || 'hiện tại'}`
        : 'Ngày 08/01/2026';
    let a = selectedArea === 'ALL' ? 'Toàn công ty' : selectedArea === 'TUAN' ? 'Khu vực Tuân' : 'Khu vực ngoài';
    return `${d} • ${a}`;
  }, [dateFilter, selectedArea, scopedTrips.length, rangeStart, rangeEnd]);

  // Tính toán 7 chỉ tiêu tài chính chuẩn hóa từ từng dòng trong phạm vi lọc (cộng từ kết quả làm tròn từng dòng)
  const metrics = useMemo(() => {
    let totalCuocGoc = 0;
    let totalVat8 = 0;
    let totalCuocCoVat = 0;
    let totalKhoanTru17 = 0;
    let totalCuocSauTru17 = 0;
    let totalChiPhiCongTy = 0;
    let totalChenhLechSauTru17 = 0;
    let totalChenhLechTruocTru = 0;
    let totalFuelLiters = 0;
    let totalTienDau = 0;
    let missingFuelPriceTrips = 0;
    let totalPhiNang = 0;
    let totalPhiHa = 0;
    let totalPhoiTraHo = 0;
    let totalPhoiConPhaiThu = 0;

    scopedTrips.forEach((t) => {
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
      totalChenhLechSauTru17 += f.chenh_lech_sau_tru_17;
      totalChenhLechTruocTru += f.chenh_lech_truoc_tru_goc;
      totalFuelLiters += f.fuel_liters;
      totalTienDau += f.fuel_cost;
      if (f.is_fuel_price_missing) missingFuelPriceTrips += 1;
      totalPhiNang += f.phi_nang;
      totalPhiHa += f.phi_ha;
      totalPhoiTraHo += Number(t.phoi_total_advance ?? t.phoi_tra_ho ?? t.phoi_advance_amount ?? 0);
      totalPhoiConPhaiThu += Number(t.phoi_balance_due ?? t.phoi_con_phai_thu ?? 0);
    });

    let journeys = 0;
    if (scopedTrips.length > 0) {
      if (dateFilter === 'month' && selectedArea === 'ALL') {
        journeys = overviewData?.kpis?.journeys_count || 70;
      } else {
        const singleCount = scopedTrips.filter((t) => !t.is_grouped).length;
        const groupCount = new Set(scopedTrips.filter((t) => t.is_grouped).map((t) => t.group_id)).size;
        journeys = singleCount + groupCount;
      }
    }

    return {
      completedCount: scopedTrips.length,
      journeyCount: journeys,
      totalCuocGoc,
      totalVat8,
      totalCuocCoVat,
      totalKhoanTru17,
      totalCuocSauTru17,
      totalChiPhiCongTy,
      totalChenhLechSauTru17,
      totalChenhLechTruocTru,
      totalFuelLiters,
      totalTienDau,
      missingFuelPriceTrips,
      totalPhiNang,
      totalPhiHa,
      totalPhoiTraHo,
      totalPhoiConPhaiThu,
      groupsCount: groupsData.length
    };
  }, [scopedTrips, dateFilter, selectedArea, overviewData, groupsData]);

  // Dữ liệu hiệu quả theo tài xế / xe
  const driverPerformance = useMemo(() => {
    const map = new Map();

    scopedTrips.forEach((t) => {
      const key = t.is_subcontractor
        ? `Xe ngoài ${t.subcontractor_name || t.vehicle_plate || ''}`.trim()
        : `Xe ${t.vehicle_plate} (Tài xế: Chưa xác định)`;
      if (!map.has(key)) {
        map.set(key, {
          driver_name: key,
          vehicle_plate: t.vehicle_plate || t.so_xe || '-',
          is_subcontractor: t.is_subcontractor,
          completed_trips: 0,
          total_cuoc_goc: 0,
          total_cuoc_co_vat: 0,
          total_cuoc_sau_tru_17: 0,
          total_cost: 0,
          total_profit_after_17: 0,
          total_profit_pre_deduction: 0,
          fuel_liters: 0,
          fuel_cost: 0
        });
      }
      const f = computeTripFinancials({
        base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
        lift_on_fee: t.phi_nang ?? t.lift_on_fee ?? 0,
        lift_off_fee: t.phi_ha ?? t.lift_off_fee ?? 0,
        fuel_liters: t.dau_liters ?? t.dau_lit ?? t.fuel_liters ?? 0,
        fuel_unit_price: t.don_gia_dau ?? t.fuel_unit_price ?? null,
        fuel_cost: t.tien_dau ?? t.fuel_cost ?? null,
        toll_fee: t.tien_duong ?? t.toll_fee ?? 0,
        subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0,
        other_costs: t.phat_sinh ?? t.other_costs ?? 0
      });
      const item = map.get(key);
      item.completed_trips += 1;
      item.total_cuoc_goc += f.cuoc_goc;
      item.total_cuoc_co_vat += f.cuoc_co_vat;
      item.total_cuoc_sau_tru_17 += f.cuoc_sau_tru_17;
      item.total_cost += f.chi_phi_cong_ty;
      item.total_profit_after_17 += f.chenh_lech_sau_tru_17;
      item.total_profit_pre_deduction += f.chenh_lech_truoc_tru_goc;
      item.fuel_liters += f.fuel_liters;
      item.fuel_cost += f.fuel_cost;
    });

    const list = Array.from(map.values()).map((item) => {
      const avg = item.completed_trips > 0 ? Math.round(item.total_profit_after_17 / item.completed_trips) : 0;
      return { ...item, avg_profit_per_trip: avg };
    });

    if (breakdownSort === 'TRIPS_ASC') {
      return list.sort((a, b) => a.completed_trips - b.completed_trips);
    }
    return list.sort((a, b) => b.total_profit_after_17 - a.total_profit_after_17);
  }, [scopedTrips, breakdownSort]);

  // Dữ liệu hiệu quả theo đầu xe
  const vehiclePerformance = useMemo(() => {
    const map = new Map();

    scopedTrips.forEach((t) => {
      const key =
        t.vehicle_plate || t.so_xe || (t.is_subcontractor ? t.subcontractor_name || 'Xe ngoài' : 'Xe công ty');
      if (!map.has(key)) {
        map.set(key, {
          vehicle_plate: key,
          driver_name: t.is_subcontractor ? t.subcontractor_name || 'Thuê ngoài' : 'Chưa xác định',
          is_subcontractor: t.is_subcontractor,
          completed_trips: 0,
          total_cuoc_goc: 0,
          total_cuoc_co_vat: 0,
          total_cuoc_sau_tru_17: 0,
          total_cost: 0,
          total_profit_after_17: 0,
          total_profit_pre_deduction: 0,
          fuel_liters: 0,
          fuel_cost: 0
        });
      }
      const f = computeTripFinancials({
        base_revenue: t.cuoc_goc ?? t.base_revenue ?? t.cuoc_vao ?? 0,
        lift_on_fee: t.phi_nang ?? t.lift_on_fee ?? 0,
        lift_off_fee: t.phi_ha ?? t.lift_off_fee ?? 0,
        fuel_liters: t.dau_liters ?? t.dau_lit ?? t.fuel_liters ?? 0,
        fuel_unit_price: t.don_gia_dau ?? t.fuel_unit_price ?? null,
        fuel_cost: t.tien_dau ?? t.fuel_cost ?? null,
        toll_fee: t.tien_duong ?? t.toll_fee ?? 0,
        subcontractor_cost: t.cuoc_ra ?? t.subcontractor_cost ?? 0,
        other_costs: t.phat_sinh ?? t.other_costs ?? 0
      });
      const item = map.get(key);
      item.completed_trips += 1;
      item.total_cuoc_goc += f.cuoc_goc;
      item.total_cuoc_co_vat += f.cuoc_co_vat;
      item.total_cuoc_sau_tru_17 += f.cuoc_sau_tru_17;
      item.total_cost += f.chi_phi_cong_ty;
      item.total_profit_after_17 += f.chenh_lech_sau_tru_17;
      item.total_profit_pre_deduction += f.chenh_lech_truoc_tru_goc;
      item.fuel_liters += f.fuel_liters;
      item.fuel_cost += f.fuel_cost;
    });

    const list = Array.from(map.values()).map((item) => {
      const avg = item.completed_trips > 0 ? Math.round(item.total_profit_after_17 / item.completed_trips) : 0;
      return { ...item, avg_profit_per_trip: avg };
    });

    if (breakdownSort === 'TRIPS_ASC') {
      return list.sort((a, b) => a.completed_trips - b.completed_trips);
    }
    return list.sort((a, b) => b.total_profit_after_17 - a.total_profit_after_17);
  }, [scopedTrips, breakdownSort]);

  // Danh sách các vấn đề thực tế (Phần B)
  const attentionItems = useMemo(() => {
    return [
      {
        id: 'GROUP_63_64',
        title: 'Chi phí chung cần đối chiếu — Hà Phương',
        desc: 'Cước gốc 5.6M (2.2M + 3.4M), Cước ra gộp chung 4.8M → Chênh lệch gốc cấp nhóm 800.000 đ (Chưa khẳng định lãi từng cuốc)',
        impact: 'Chênh lệch nhóm 800.000 đ',
        severity: 'high',
        btnText: 'Xem nhóm ô gộp',
        onAction: () => {
          setBreakdownView('GROUPS');
          const el = document.getElementById('performance-section');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      },
      {
        id: 'OFFSET_P22',
        title: 'Đối trừ công nợ — Vạn Đạt Thái Bình',
        desc: 'Cuốc hàng 22 ghi chú ĐỐI TRỪ XONG: 3.600.000 đ giảm nợ khách nhưng không tăng tiền mặt thực thu',
        impact: 'Đối trừ 3.600.000 đ',
        severity: 'medium',
        btnText: 'Xem công nợ',
        onAction: () => {
          if (onNavigateTab) onNavigateTab('debts');
        }
      },
      {
        id: 'FUEL_LITERS',
        title:
          metrics.missingFuelPriceTrips > 0
            ? `Còn ${metrics.missingFuelPriceTrips} cuốc cấp dầu chưa nhập đơn giá ngày chạy`
            : 'Đã quy đổi đầy đủ tiền dầu theo đơn giá ngày chạy',
        desc: `Tổng cộng ${metrics.totalFuelLiters} lít dầu cấp trong kỳ • Tiền dầu đã quy đổi: ${formatVnd(metrics.totalTienDau)}`,
        impact: `${metrics.totalFuelLiters} Lít • ${formatVnd(metrics.totalTienDau)}`,
        severity: metrics.missingFuelPriceTrips > 0 ? 'high' : 'medium',
        btnText: 'Xem giá dầu',
        onAction: () => {
          setFuelModalOpen(true);
        }
      }
    ];
  }, [metrics, onNavigateTab]);

  const handleDrilldownFromMetric = (metricKey) => {
    let label = `Toàn bộ cuốc xe hoàn thành trong kỳ (${scopedTrips.length} cuốc)`;
    if (metricKey === 'REVENUE') label = 'Danh sách cuốc xe (Sắp xếp cước vào cao nhất)';
    if (metricKey === 'DIRECT_COST') label = 'Danh sách cuốc có chi phí công ty (Nâng/hạ, dầu, đường, thuê ngoài)';
    if (metricKey === 'PROFIT') label = 'Danh sách cuốc xe (Sắp xếp chênh lệch sau trừ 17% cao nhất)';
    if (metricKey === 'FUEL') label = 'Danh sách các cuốc xe có cấp dầu';

    setActiveDrilldown({
      type: 'METRIC',
      key: metricKey,
      label
    });

    const el = document.getElementById('drilldown-trips-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectRow = (type, name) => {
    setActiveDrilldown({
      type: 'ENTITY',
      entityType: type,
      name,
      label: `Danh sách các cuốc của ${type === 'DRIVER' ? 'tài xế' : 'xe'}: ${name}`
    });

    const el = document.getElementById('drilldown-trips-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const drilldownTrips = useMemo(() => {
    if (!activeDrilldown) return [];

    let list = [...scopedTrips];

    if (activeDrilldown.type === 'METRIC') {
      if (activeDrilldown.key === 'REVENUE') list.sort((a, b) => (b.cuoc_vao || 0) - (a.cuoc_vao || 0));
      if (activeDrilldown.key === 'DIRECT_COST')
        list.sort((a, b) => (b.chi_phi_cong_ty || 0) - (a.chi_phi_cong_ty || 0));
      if (activeDrilldown.key === 'PROFIT')
        list.sort((a, b) => (b.chenh_lech_sau_tru_17 || 0) - (a.chenh_lech_sau_tru_17 || 0));
      if (activeDrilldown.key === 'FUEL')
        list = list.filter((t) => (t.dau_lit || 0) > 0).sort((a, b) => (b.dau_lit || 0) - (a.dau_lit || 0));
    } else if (activeDrilldown.type === 'ENTITY') {
      if (activeDrilldown.entityType === 'DRIVER') {
        list = list.filter((t) => t.lai_xe === activeDrilldown.name);
      } else if (activeDrilldown.entityType === 'VEHICLE') {
        list = list.filter((t) => t.so_xe === activeDrilldown.name);
      }
    }

    if (drilldownSearch.trim()) {
      const q = drilldownSearch.toLowerCase();
      list = list.filter(
        (t) =>
          (t.trip_code && t.trip_code.toLowerCase().includes(q)) ||
          (t.so_xe && t.so_xe.toLowerCase().includes(q)) ||
          (t.lai_xe && t.lai_xe.toLowerCase().includes(q)) ||
          (t.ten_khach && t.ten_khach.toLowerCase().includes(q)) ||
          (t.tuyen_duong && t.tuyen_duong.toLowerCase().includes(q)) ||
          (t.so_cont && t.so_cont.toLowerCase().includes(q))
      );
    }

    return list;
  }, [scopedTrips, activeDrilldown, drilldownSearch]);

  const currentTripIndex = useMemo(() => {
    if (!selectedTrip || drilldownTrips.length === 0) return -1;
    return drilldownTrips.findIndex((t) => t.trip_code === selectedTrip.trip_code);
  }, [selectedTrip, drilldownTrips]);

  const handlePrevTrip = () => {
    if (currentTripIndex > 0) {
      setSelectedTrip(drilldownTrips[currentTripIndex - 1]);
    }
  };

  const handleNextTrip = () => {
    if (currentTripIndex >= 0 && currentTripIndex < drilldownTrips.length - 1) {
      setSelectedTrip(drilldownTrips[currentTripIndex + 1]);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center space-y-4 text-center">
        <Loader2 className="w-8 h-8 text-slate-800 animate-spin" />
        <div className="text-sm font-semibold text-slate-700">
          Đang tải dữ liệu kinh doanh từ máy chủ bảo mật...
        </div>
        <div className="text-xs text-slate-400">
          Chuẩn hóa Cước gốc chưa VAT • VAT 8% • Trừ 17% • Nâng/Hạ • Dầu • Phơi trả hộ
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 bg-white border border-rose-200 rounded-2xl shadow-sm text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Không thể tải dữ liệu kinh doanh</h3>
        <p className="text-xs text-slate-600">{loadError}</p>
        <button
          onClick={loadData}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Thử lại</span>
        </button>
      </div>
    );
  }

  const reminderItems = [
    ...(eirReminders?.overdue || []).map((it) => ({ ...it, badge: 'Quá hạn', badgeColor: 'bg-rose-100 text-rose-800 border-rose-300' })),
    ...(eirReminders?.due_today || []).map((it) => ({ ...it, badge: 'Đến hạn hôm nay', badgeColor: 'bg-amber-100 text-amber-800 border-amber-300' })),
    ...(eirReminders?.unscheduled || []).map((it) => ({ ...it, badge: 'Chưa đặt ngày nhắc', badgeColor: 'bg-purple-100 text-purple-800 border-purple-300' }))
  ];

  return (
    <div className="ha-overview space-y-5">
      {/* ============================================================ */}
      {/* PHẦN A — 7 CHỈ TIÊU KẾT QUẢ KINH DOANH CHUẨN MỚI */}
      {/* ============================================================ */}
      <section aria-label="Kết quả kinh doanh" className="ha-overview-summary">
        <div className="ha-page-heading">
          <div>
            <p className="ha-eyebrow">Báo cáo điều hành</p>
            <h1>Tổng quan kinh doanh</h1>
            <p className="ha-page-description">Kết quả vận hành, tài chính và những việc cần theo dõi.</p>
          </div>
          <div className="ha-page-actions">
            <button type="button" onClick={() => setFuelModalOpen(true)} className="ha-button">
              <Fuel size={15} /><span>Giá dầu theo ngày</span>
            </button>
            <button type="button" onClick={loadData} className="ha-icon-button" aria-label="Làm mới dữ liệu" title="Làm mới dữ liệu">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="ha-report-toolbar">
          <label className="ha-filter-field">
            <span>Kỳ báo cáo</span>
            <select aria-label="Kỳ báo cáo" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="month">Tháng 01/2026</option>
              <option value="all">Tất cả dữ liệu</option>
              <option value="day_09">Ngày 09/01/2026</option>
              <option value="day_08">Ngày 08/01/2026</option>
              <option value="range">Khoảng ngày tùy chọn</option>
            </select>
          </label>
          {dateFilter === 'range' && <div className="ha-date-range">
            <label className="ha-filter-field"><span>Từ ngày</span><input aria-label="Từ ngày báo cáo" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} /></label>
            <label className="ha-filter-field"><span>Đến ngày</span><input aria-label="Đến ngày báo cáo" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} /></label>
          </div>}
          <label className="ha-filter-field">
            <span>Phạm vi</span>
            <select aria-label="Phạm vi báo cáo" value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
              <option value="ALL">Toàn công ty</option>
              <option value="TUAN">Khu vực Tuân (Xe nhà)</option>
            </select>
          </label>
          <span className="ha-scope-caption">{scopeLabel}</span>
        </div>

        <div className="ha-kpi-grid">
          <button type="button" id="kpi-card-completed_trips" onClick={() => handleDrilldownFromMetric('ALL')} className="ha-kpi">
            <span className="ha-kpi-label">Cuốc đã ghi nhận</span>
            <span className="ha-kpi-value">{metrics.completedCount}<small>cuốc</small></span>
            <span className="ha-kpi-foot">Xem danh sách chuyến <span aria-hidden="true">↗</span></span>
          </button>
          <button type="button" id="kpi-card-revenue" onClick={() => handleDrilldownFromMetric('REVENUE')} className="ha-kpi">
            <span className="ha-kpi-label">Tổng cước có VAT</span>
            <span className="ha-kpi-value">{formatVnd(metrics.totalCuocCoVat)}</span>
            <span className="ha-kpi-foot">Đã bao gồm VAT 8% <span aria-hidden="true">↗</span></span>
          </button>
          <button type="button" id="kpi-card-direct_cost" onClick={() => handleDrilldownFromMetric('DIRECT_COST')} className="ha-kpi">
            <span className="ha-kpi-label">Chi phí đã ghi nhận</span>
            <span className="ha-kpi-value">{formatVnd(metrics.totalChiPhiCongTy)}</span>
            <span className="ha-kpi-foot">Các khoản công ty chịu <span aria-hidden="true">↗</span></span>
          </button>
          <button type="button" id="kpi-card-profit" onClick={() => handleDrilldownFromMetric('PROFIT')} className="ha-kpi ha-kpi-result">
            <span className="ha-kpi-label">Chênh lệch tạm tính</span>
            <span className="ha-kpi-value">{formatVnd(metrics.totalChenhLechSauTru17)}</span>
            <span className="ha-kpi-foot">Sau khoản trừ 17% và chi phí <span aria-hidden="true">↗</span></span>
          </button>
        </div>

        <p className="ha-calculation-note"><Info size={14} /><span>Chênh lệch chưa trừ lương{metrics.missingFuelPriceTrips > 0 ? `; còn ${metrics.missingFuelPriceTrips} cuốc chưa có giá dầu ngày chạy` : ''}. Tiền phơi trả hộ được theo dõi riêng.</span></p>

        <details className="ha-finance-disclosure">
          <summary><span>Đối chiếu tiền cước và chi phí</span><span className="ha-disclosure-caption">VAT 8% · Khoản trừ nội bộ 17%</span><span className="ha-disclosure-arrow" aria-hidden="true">⌄</span></summary>
          <div className="ha-finance-content">
            <dl className="ha-ledger">
              <div><dt>Cước gốc chưa VAT</dt><dd>{formatVnd(metrics.totalCuocGoc)}</dd></div>
              <div><dt>VAT 8%</dt><dd>{formatVnd(metrics.totalVat8)}</dd></div>
              <div className="ha-ledger-total"><dt>Cước có VAT</dt><dd>{formatVnd(metrics.totalCuocCoVat)}</dd></div>
              <div><dt>Khoản trừ nội bộ 17%</dt><dd>−{formatVnd(metrics.totalKhoanTru17)}</dd></div>
              <div className="ha-ledger-total"><dt>Cước sau khoản trừ</dt><dd>{formatVnd(metrics.totalCuocSauTru17)}</dd></div>
              <div><dt>Chi phí công ty chịu</dt><dd>−{formatVnd(metrics.totalChiPhiCongTy)}</dd></div>
              <div className="ha-ledger-result"><dt>Chênh lệch tạm tính</dt><dd>{formatVnd(metrics.totalChenhLechSauTru17)}</dd></div>
            </dl>
            <div className="ha-finance-aside">
              <h3>Chi tiết trong kỳ</h3>
              <dl className="ha-ledger">
                <div><dt>Phí nâng và hạ</dt><dd>{formatVnd(metrics.totalPhiNang + metrics.totalPhiHa)}</dd></div>
                <div><dt>Dầu đã cấp</dt><dd>{metrics.totalFuelLiters.toLocaleString('vi-VN')} lít</dd></div>
                <div><dt>Tiền dầu đã xác định</dt><dd>{formatVnd(metrics.totalTienDau)}</dd></div>
                <div><dt>Phơi đã trả hộ</dt><dd>{formatVnd(metrics.totalPhoiTraHo)}</dd></div>
                <div><dt>Phơi còn phải thu</dt><dd>{formatVnd(metrics.totalPhoiConPhaiThu)}</dd></div>
                <div><dt>Chênh lệch trước khoản trừ</dt><dd>{formatVnd(metrics.totalChenhLechTruocTru)}</dd></div>
              </dl>
              <p>Khoản trừ 17% là quy tắc nội bộ. Kết quả hiện tại chưa phải lợi nhuận ròng; chi phí chung chưa phân bổ được xem ở cấp nhóm.</p>
            </div>
          </div>
        </details>
      </section>


      {/* ============================================================ */}
      {/* MỤC NHẮC ĐÒI TIỀN PHƠI ĐẾN HẠN / QUÁ HẠN / CHƯA ĐẶT NGÀY NHẮC (Mục 8 & 9) */}
      {/* ============================================================ */}
      {reminderItems.length > 0 && (
        <section
          aria-label="Nhắc hoàn tiền phơi trả hộ"
          className="bg-purple-50/80 rounded-xl border border-purple-200 p-4 space-y-3 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/80 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-purple-950 flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-purple-600" />
              <span>
                Nhắc Đòi Tiền Phơi Trả Hộ Chủ Hàng ({reminderItems.length} khoản chưa tất toán • Tổng còn phải thu:{' '}
                {formatVnd(eirReminders?.summary?.total_outstanding_amount || 0)})
              </span>
            </h2>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                Quá hạn: {eirReminders?.summary?.overdue_count || 0}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                Đến hạn hôm nay: {eirReminders?.summary?.due_today_count || 0}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
                Chưa đặt ngày nhắc: {eirReminders?.summary?.unscheduled_count || 0}
              </span>
            </div>
          </div>

          <div className="divide-y divide-purple-200/60">
            {reminderItems.map((item) => (
              <div
                key={item.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                    <span className="font-bold text-slate-900">{item.customer_name}</span>
                    <span className="font-mono text-slate-600">• Chuyến: {item.trip_id}</span>
                    {item.container_number && (
                      <span className="font-mono text-indigo-700 font-bold">• Cont: {item.container_number}</span>
                    )}
                  </div>
                  <div className="text-slate-600 text-[11px]">
                    Ngày trả hộ: <b>{item.advance_date}</b> • Ngày hẹn hoàn:{' '}
                    <b>{item.due_date || 'Chưa đặt ngày nhắc'}</b> • Đã trả hộ:{' '}
                    <b>{formatVnd(item.advance_amount)}</b> (Đã hoàn: {formatVnd(item.refunded_amount)})
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="font-mono font-extrabold text-rose-700 bg-white px-2.5 py-1 rounded border border-rose-200">
                    Còn thu: {formatVnd(item.remaining_amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPhoiModalTarget({
                        advance: item,
                        trip: { id: item.trip_id, customer_name: item.customer_name },
                        mode: 'REFUND'
                      })
                    }
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs cursor-pointer"
                  >
                    Ghi nhận hoàn tiền
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPhoiModalTarget({
                        advance: item,
                        trip: { id: item.trip_id, customer_name: item.customer_name },
                        mode: 'SCHEDULE'
                      })
                    }
                    className="px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-lg font-semibold text-xs cursor-pointer"
                  >
                    Đổi ngày hẹn
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* PHẦN B — CẦN CHÚ Ý */}
      {/* ============================================================ */}
      <section aria-label="Cần chú ý" className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Cần theo dõi</span>
          </h2>
          <span className="text-[11px] text-slate-400">Thông tin cần kiểm tra trong kỳ</span>
        </div>

        <div className="divide-y divide-slate-100">
          {attentionItems.map((item, idx) => (
            <div key={idx} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start space-x-2.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    item.severity === 'high' ? 'bg-indigo-600' : 'bg-amber-500'
                  }`}
                />
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{item.title}</div>
                  <div className="text-slate-600 mt-0.5">{item.desc}</div>
                </div>
              </div>

              <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center">
                <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded">
                  {item.impact}
                </span>
                <button
                  type="button"
                  onClick={item.onAction}
                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer border border-indigo-200"
                >
                  {item.btnText}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* PHẦN C — HIỆU QUẢ HOẠT ĐỘNG & 7 NHÓM Ô GỘP */}
      {/* ============================================================ */}
      <section
        id="performance-section"
        aria-label="Hiệu quả hoạt động"
        className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Hiệu quả hoạt động</h2>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setBreakdownView('DRIVER')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  breakdownView === 'DRIVER'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo tài xế
              </button>
              <button
                type="button"
                onClick={() => setBreakdownView('VEHICLE')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  breakdownView === 'VEHICLE'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo xe
              </button>
              <button
                type="button"
                onClick={() => setBreakdownView('GROUPS')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  breakdownView === 'GROUPS'
                    ? 'bg-indigo-50 text-indigo-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Nhóm chi phí chung
              </button>
            </div>
          </div>

          {breakdownView !== 'GROUPS' && (
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-500">Sắp xếp:</span>
              <select
                value={breakdownSort}
                onChange={(e) => setBreakdownSort(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium"
              >
                <option value="PROFIT_DESC">Chênh lệch cao nhất</option>
                <option value="TRIPS_ASC">Ít cuốc nhất</option>
              </select>
            </div>
          )}
        </div>

        {breakdownView !== 'GROUPS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                  <th className="py-2.5 px-3 text-left">
                    {breakdownView === 'DRIVER' ? 'Tài xế' : 'Biển số xe'}
                  </th>
                  <th className="py-2.5 px-3 text-center">Số cuốc</th>
                  <th className="py-2.5 px-3 text-right">Cước gốc (Chưa VAT)</th>
                  <th className="py-2.5 px-3 text-right">Cước có VAT (×1,08)</th>
                  <th className="py-2.5 px-3 text-right">Sau trừ 17% (×0,83)</th>
                  <th className="py-2.5 px-3 text-right">Chi phí Cty</th>
                  <th className="py-2.5 px-3 text-right">Dầu cấp (Lít)</th>
                  <th className="py-2.5 px-3 text-right">Chênh lệch sau trừ 17%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(breakdownView === 'DRIVER' ? driverPerformance : vehiclePerformance).map((item, idx) => {
                  const name = breakdownView === 'DRIVER' ? item.driver_name : item.vehicle_plate;

                  return (
                    <tr
                      key={idx}
                      onClick={() => handleSelectRow(breakdownView, name)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                      title={`Bấm để mở các cuốc của ${name}`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900">{name}</span>
                          {item.is_subcontractor && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              Xe ngoài
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                        {item.completed_trips}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatVnd(item.total_cuoc_goc)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                        {formatVnd(item.total_cuoc_co_vat)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700">
                        {formatVnd(item.total_cuoc_sau_tru_17)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatVnd(item.total_cost)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-sky-700">
                        {item.fuel_liters > 0 ? `${item.fuel_liters} L` : '-'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800">
                        {formatVnd(item.total_profit_after_17)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {breakdownView === 'GROUPS' && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <Layers className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <b>Chi phí dùng chung:</b> Trong Excel tháng 1, có các nhóm cuốc có ô chi phí gộp chung. Hệ thống giữ nguyên chênh lệch ở cấp nhóm (UNALLOCATED), không tự chia hoặc gán hết vào một cuốc.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2.5 px-3">Mã Nhóm</th>
                    <th className="py-2.5 px-3">Dòng Excel</th>
                    <th className="py-2.5 px-3">Xe / Đối Tác</th>
                    <th className="py-2.5 px-3">Số Cuốc Kẹp</th>
                    <th className="py-2.5 px-3 text-right">Tổng Cước Gốc</th>
                    <th className="py-2.5 px-3 text-right">Chi Phí Ô Gộp</th>
                    <th className="py-2.5 px-3 text-right">Chênh Lệch Nhóm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupsData.map((group) => {
                    const diff = group.total_revenue - group.total_shared_money;
                    const is63_64 = group.group_key === 'GROUP-63-64';

                    return (
                      <tr
                        key={group.group_key}
                        className={`hover:bg-slate-50 transition-colors ${is63_64 ? 'bg-amber-50/30' : ''}`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {group.group_key}
                          {is63_64 && (
                            <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                              Trọng tâm kiểm tra
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">Hàng {group.row_indices.join(' & ')}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{group.vehicle_or_partner}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                          {group.trips.length}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                          {formatVnd(group.total_revenue)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700">
                          {formatVnd(group.total_shared_money)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          {formatVnd(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* KHUNG DANH SÁCH CHUYẾN LIÊN QUAN KÈM CỘT CUỐI HOÀN TIỀN PHƠI */}
      {/* ============================================================ */}
      {activeDrilldown && (
        <section
          id="drilldown-trips-section"
          aria-label="Danh sách chuyến liên quan"
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <h3 className="text-xs font-bold text-slate-900">{activeDrilldown.label}</h3>
              <span className="text-[11px] text-slate-500 font-mono">({drilldownTrips.length} cuốc)</span>
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  placeholder="Lọc nhanh chuyến, xe, khách, cont..."
                  className="pl-8 pr-3 py-1 border border-slate-200 rounded-lg text-xs w-52 text-slate-800 placeholder-slate-400"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveDrilldown(null);
                  setDrilldownSearch('');
                }}
                className="px-2.5 py-1 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2 px-2.5">Mã Cuốc</th>
                  <th className="py-2 px-2.5">Ngày</th>
                  <th className="py-2 px-2.5">Xe / Lái Xe</th>
                  <th className="py-2 px-2.5">Khách Hàng / Tuyến</th>
                  <th className="py-2 px-2.5">Cont / Loại</th>
                  <th className="py-2 px-2.5 text-right">Cước Gốc (Chưa VAT)</th>
                  <th className="py-2 px-2.5 text-right">Có VAT (×1,08)</th>
                  <th className="py-2 px-2.5 text-right">Sau Trừ 17%</th>
                  <th className="py-2 px-2.5 text-right">Chi Phí Cty</th>
                  <th className="py-2 px-2.5 text-right">Chênh Lệch Sau Trừ</th>
                  <th className="py-2 px-2.5 text-center">Cột Cuối: Hoàn Tiền Phơi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drilldownTrips.map((trip) => {
                  const f = computeTripFinancials({
                    base_revenue: trip.cuoc_goc ?? trip.base_revenue ?? trip.cuoc_vao ?? 0,
                    lift_on_fee: trip.phi_nang ?? trip.lift_on_fee ?? 0,
                    lift_off_fee: trip.phi_ha ?? trip.lift_off_fee ?? 0,
                    port_fee: trip.port_fee ?? 0,
                    fuel_liters: trip.dau_liters ?? trip.dau_lit ?? trip.fuel_liters ?? 0,
                    fuel_unit_price: trip.don_gia_dau ?? trip.fuel_unit_price ?? null,
                    fuel_cost: trip.tien_dau ?? trip.fuel_cost ?? null,
                    toll_fee: trip.tien_duong ?? trip.toll_fee ?? 0,
                    subcontractor_cost: trip.cuoc_ra ?? trip.subcontractor_cost ?? 0,
                    other_costs: trip.phat_sinh ?? trip.other_costs ?? 0,
                    phoi_advance_amount: trip.phoi_tra_ho ?? trip.phoi_advance_amount ?? 0,
                    phoi_refunded_amount: trip.phoi_da_hoan ?? trip.phoi_refunded_amount ?? 0
                  });

                  const phoiAdv = Number(trip.phoi_total_advance ?? trip.phoi_tra_ho ?? trip.phoi_advance_amount ?? 0);
                  const phoiRem = Number(trip.phoi_balance_due ?? trip.phoi_con_phai_thu ?? 0);
                  const isPhoiDone = phoiAdv > 0 && phoiRem === 0;

                  return (
                    <tr
                      key={trip.id}
                      onClick={() => setSelectedTrip(trip)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      title="Bấm để xem chi tiết cuốc xe"
                    >
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-900">{trip.trip_code || trip.id}</td>
                      <td className="py-2 px-2.5 font-mono text-slate-500">{trip.trip_date}</td>
                      <td className="py-2 px-2.5 text-slate-800">
                        {trip.vehicle_plate || trip.so_xe || 'Chưa gán xe'} • {trip.driver_name || trip.lai_xe || 'Chưa xác nhận tài xế'}
                      </td>
                      <td className="py-2 px-2.5 text-slate-800">
                        <span className="font-semibold">{trip.customer_name || trip.ten_khach}</span> • {trip.route_name || trip.tuyen_duong}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-[11px]">
                        <span className="font-bold text-slate-800">{trip.container_number || trip.so_cont || '-'}</span>{' '}
                        {trip.loai_cont && (
                          <span className="px-1 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px]">
                            {trip.loai_cont}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900">
                        {formatVnd(f.cuoc_goc)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-emerald-700">
                        {formatVnd(f.cuoc_co_vat)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-blue-700">
                        {formatVnd(f.cuoc_sau_tru_17)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-slate-700">
                        {formatVnd(f.chi_phi_cong_ty)}
                      </td>
                      <td
                        className={`py-2 px-2.5 text-right font-mono font-bold ${
                          f.chenh_lech_sau_tru_17 < 0 ? 'text-rose-700' : 'text-amber-800'
                        }`}
                      >
                        {formatVnd(f.chenh_lech_sau_tru_17)}
                      </td>

                      {/* CỘT CUỐI: TRẠNG THÁI HOÀN TIỀN PHƠI & DẤU TÍCH XÁC NHẬN (Mục 8) */}
                      <td
                        className="py-2 px-2.5 text-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhoiModalTarget({
                            trip,
                            advance: trip.phoi_advances?.[0] || trip.eir_advances?.[0] || null,
                            mode: phoiAdv > 0 ? 'REFUND' : 'CREATE'
                          });
                        }}
                      >
                        {phoiAdv > 0 ? (
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                              isPhoiDone
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : f.phoi_da_hoan > 0
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100'
                            }`}
                            title="Bấm để mở xác nhận hoàn tiền phơi hoặc sửa ngày hẹn"
                          >
                            <input
                              type="checkbox"
                              checked={isPhoiDone}
                              readOnly
                              className="rounded text-emerald-600 pointer-events-none"
                            />
                            <span>
                              {isPhoiDone
                                ? `Đã hoàn ✓ (${formatVnd(phoiAdv)})`
                                : f.phoi_da_hoan > 0
                                ? `Còn ${formatVnd(phoiRem)}`
                                : `Chưa hoàn (${formatVnd(phoiRem)})`}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-[10px] text-slate-400 hover:text-purple-700 hover:underline font-medium"
                          >
                            + Nhập phơi
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* DRAWER CHI TIẾT CHUYẾN */}
      <TripDetailDrawer
        selectedTrip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        onPrev={handlePrevTrip}
        onNext={handleNextTrip}
        hasPrev={currentTripIndex > 0}
        hasNext={currentTripIndex >= 0 && currentTripIndex < drilldownTrips.length - 1}
        onTripUpdated={loadData}
      />

      {/* MODAL BẢNG GIÁ DẦU THEO NGÀY */}
      <FuelPriceManagementModal
        isOpen={fuelModalOpen}
        onClose={() => setFuelModalOpen(false)}
        onSaved={loadData}
      />

      {/* MODAL XÁC NHẬN HOÀN TIỀN PHƠI / ĐẶT NGÀY HẸN HOÀN */}
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

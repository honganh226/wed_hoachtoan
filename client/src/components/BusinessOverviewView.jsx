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
  const [breakdownView, setBreakdownView] = useState('DRIVER'); // 'DRIVER' | 'VEHICLE' | 'GROUPS'
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
      totalFuelLiters += f.dau_lit;
      totalTienDau += f.tien_dau;
      if (f.is_fuel_price_missing) missingFuelPriceTrips += 1;
      totalPhiNang += f.phi_nang;
      totalPhiHa += f.phi_ha;
      totalPhoiTraHo += f.phoi_tra_ho;
      totalPhoiConPhaiThu += f.phoi_con_phai_thu;
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
      item.fuel_liters += f.dau_lit;
      item.fuel_cost += f.tien_dau;
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
      item.fuel_liters += f.dau_lit;
      item.fuel_cost += f.tien_dau;
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
        title: 'Chênh lệch nhóm ô gộp kết hợp 63–64 (HÀ PHƯƠNG)',
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
        title: 'Khoản đối trừ P22 (VẠN ĐẠT THÁI BÌNH)',
        desc: 'Cuốc hàng 22 ghi chú ĐỐI TRỪ XONG: 3.600.000 đ giảm nợ khách nhưng không tăng tiền mặt thực thu',
        impact: 'Đối trừ 3.600.000 đ',
        severity: 'medium',
        btnText: 'Xem Công Nợ',
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
        btnText: 'Nhập Giá Dầu Theo Ngày',
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
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-6 bg-slate-50/60 min-h-screen text-slate-800">
      {/* ============================================================ */}
      {/* PHẦN A — 7 CHỈ TIÊU KẾT QUẢ KINH DOANH CHUẨN MỚI */}
      {/* ============================================================ */}
      <section aria-label="Kết quả kinh doanh" className="space-y-4">
        {/* Hàng tiêu đề và bộ lọc */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              <span>Tổng Quan Kinh Doanh</span>
              <span className="text-xs bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-semibold">
                Chuẩn Mới: Cước Gốc Chưa VAT • ×1,08 Có VAT • ×0,83 Sau Trừ 17%
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Phạm vi: <span className="font-medium text-slate-800">{scopeLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5 font-medium shadow-2xs">
              <button
                type="button"
                onClick={() => setDateFilter('month')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateFilter === 'month' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tháng 01/2026 ({tripsData.filter((t) => t.trip_date.startsWith('2026-01')).length} cuốc)
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateFilter === 'all' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({tripsData.length} cuốc)
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('day_09')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateFilter === 'day_09' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ngày 09/01
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('day_08')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateFilter === 'day_08' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ngày 08/01
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <label>
                Từ ngày{' '}
                <input
                  aria-label="Từ ngày báo cáo"
                  type="date"
                  className="border rounded p-1.5 max-w-full bg-white"
                  value={rangeStart}
                  onChange={(e) => {
                    setRangeStart(e.target.value);
                    setDateFilter('range');
                  }}
                />
              </label>
              <label>
                Đến ngày{' '}
                <input
                  aria-label="Đến ngày báo cáo"
                  type="date"
                  className="border rounded p-1.5 max-w-full bg-white"
                  value={rangeEnd}
                  onChange={(e) => {
                    setRangeEnd(e.target.value);
                    setDateFilter('range');
                  }}
                />
              </label>
            </div>

            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium text-slate-800 shadow-2xs"
            >
              <option value="ALL">Toàn công ty</option>
              <option value="TUAN">Khu vực Tuân (Xe nhà)</option>
            </select>

            <button
              type="button"
              onClick={() => setFuelModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Fuel className="w-3.5 h-3.5" />
              <span>Giá Dầu Theo Ngày</span>
            </button>

            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* 4 THẺ KPI CHÍNH + DẢI 7 CHỈ TIÊU CHUẨN HÓA */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* 1. Cuốc hoàn thành */}
          <button
            type="button"
            id="kpi-card-completed_trips"
            onClick={() => handleDrilldownFromMetric('ALL')}
            className="p-4 bg-white rounded-xl border border-slate-200 text-left hover:border-slate-300 hover:bg-slate-50/50 transition-all flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <span className="text-xs font-medium text-slate-500">Cuốc hoàn thành</span>
            <div className="my-1.5">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                {metrics.completedCount}
              </span>
              <span className="text-xs text-slate-500 font-normal ml-1">cuốc</span>
            </div>
            <span className="text-[11px] text-indigo-600 font-medium">
              {metrics.journeyCount} hành trình • {metrics.groupsCount} nhóm ô gộp
            </span>
          </button>

          {/* 2. Tổng cước vào gốc (Chưa VAT) & Có VAT */}
          <button
            type="button"
            id="kpi-card-revenue"
            onClick={() => handleDrilldownFromMetric('REVENUE')}
            className="p-4 bg-white rounded-xl border border-emerald-200 text-left hover:border-emerald-300 hover:bg-emerald-50/30 transition-all flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <span className="text-xs font-bold text-emerald-800">
              Tổng Cước Có VAT (×1,08)
            </span>
            <div className="my-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700 whitespace-nowrap">
                {formatVnd(metrics.totalCuocCoVat)}
              </span>
            </div>
            <span className="text-[11px] text-slate-600">
              Cước gốc chưa VAT: <b>{formatVnd(metrics.totalCuocGoc)}</b> (+VAT 8%: {formatVnd(metrics.totalVat8)})
            </span>
          </button>

          {/* 3. Cước sau khoản trừ 17% nội bộ */}
          <button
            type="button"
            id="kpi-card-direct_cost"
            onClick={() => handleDrilldownFromMetric('DIRECT_COST')}
            className="p-4 bg-white rounded-xl border border-blue-200 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-all flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <span className="text-xs font-bold text-blue-800">
              Cước Sau Khoản Trừ 17% (×0,83)
            </span>
            <div className="my-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-blue-700 whitespace-nowrap">
                {formatVnd(metrics.totalCuocSauTru17)}
              </span>
            </div>
            <span className="text-[11px] text-amber-700 font-semibold">
              Trừ 17% nội bộ: −{formatVnd(metrics.totalKhoanTru17)} • Chi phí Cty: {formatVnd(metrics.totalChiPhiCongTy)}
            </span>
          </button>

          {/* 4. Chênh lệch tạm tính sau khoản trừ 17% & chi phí */}
          <button
            type="button"
            id="kpi-card-profit"
            onClick={() => handleDrilldownFromMetric('PROFIT')}
            className="p-4 bg-white rounded-xl border border-amber-300 text-left hover:border-amber-400 hover:bg-amber-50/30 transition-all flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <span className="text-xs font-bold text-amber-900">
              Chênh Lệch Tạm Tính (Sau Trừ 17% & Chi Phí)
            </span>
            <div className="my-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-amber-700 whitespace-nowrap">
                {formatVnd(metrics.totalChenhLechSauTru17)}
              </span>
            </div>
            <span className="text-[11px] text-slate-600">
              Chưa trừ lương • Trước trừ 17%: <b>{formatVnd(metrics.totalChenhLechTruocTru)}</b>
            </span>
          </button>
        </div>

        {/* BẢNG CHI TIẾT 7 CHỈ TIÊU TÀI CHÍNH + DẦU + NÂNG HẠ + PHƠI TRẢ HỘ (Mục 3.A & 15) */}
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2 text-xs">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <Coins className="w-4 h-4" />
              <span>7 Chỉ Tiêu Tài Chính Chuẩn Hóa Toàn Kỳ & Công Nợ Phơi Trả Hộ</span>
            </div>
            <span className="text-[11px] text-slate-300">
              * Khoản trừ 17% là quy tắc tính nội bộ Giám đốc; tiền phơi trả hộ không tính vào doanh thu hay chi phí chuyến
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center text-xs">
            <div className="p-2.5 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-[10px] text-slate-400">1. Cước vào chưa VAT</div>
              <div className="font-mono font-bold text-white mt-0.5">{formatVnd(metrics.totalCuocGoc)}</div>
            </div>
            <div className="p-2.5 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-[10px] text-slate-400">2. VAT 8%</div>
              <div className="font-mono font-bold text-teal-300 mt-0.5">+{formatVnd(metrics.totalVat8)}</div>
            </div>
            <div className="p-2.5 bg-slate-800 rounded-lg border border-emerald-600/60">
              <div className="text-[10px] text-emerald-300 font-semibold">3. Cước vào có VAT</div>
              <div className="font-mono font-extrabold text-emerald-400 mt-0.5">{formatVnd(metrics.totalCuocCoVat)}</div>
            </div>
            <div className="p-2.5 bg-slate-800 rounded-lg border border-amber-600/60">
              <div className="text-[10px] text-amber-300">4. Khoản trừ 17%</div>
              <div className="font-mono font-bold text-amber-300 mt-0.5">−{formatVnd(metrics.totalKhoanTru17)}</div>
            </div>
            <div className="p-2.5 bg-slate-800 rounded-lg border border-blue-500/60">
              <div className="text-[10px] text-blue-300 font-semibold">5. Cước sau trừ 17%</div>
              <div className="font-mono font-extrabold text-blue-300 mt-0.5">{formatVnd(metrics.totalCuocSauTru17)}</div>
            </div>
            <div className="p-2.5 bg-slate-800 rounded-lg border border-rose-500/60">
              <div className="text-[10px] text-rose-300">6. Chi phí Cty chịu</div>
              <div className="font-mono font-bold text-rose-300 mt-0.5">{formatVnd(metrics.totalChiPhiCongTy)}</div>
            </div>
            <div className="p-2.5 bg-amber-500/20 rounded-lg border border-amber-400/70 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-amber-200 font-bold">7. Chênh lệch sau trừ</div>
              <div className="font-mono font-extrabold text-amber-300 mt-0.5">
                {formatVnd(metrics.totalChenhLechSauTru17)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-700/80 text-xs">
            <div className="flex items-center justify-between bg-slate-800/70 px-3 py-2 rounded-lg">
              <span className="text-slate-300">Phí nâng + Phí hạ (Công ty chịu):</span>
              <strong className="font-mono text-indigo-300">
                {formatVnd(metrics.totalPhiNang + metrics.totalPhiHa)}
              </strong>
            </div>
            <div className="flex items-center justify-between bg-slate-800/70 px-3 py-2 rounded-lg">
              <span className="text-slate-300">Dầu cấp ({metrics.totalFuelLiters} Lít) → Tiền dầu:</span>
              <strong className="font-mono text-sky-300">
                {formatVnd(metrics.totalTienDau)}{' '}
                {metrics.missingFuelPriceTrips > 0 && (
                  <span className="text-[10px] text-amber-300">({metrics.missingFuelPriceTrips} cuốc thiếu giá)</span>
                )}
              </strong>
            </div>
            <div className="flex items-center justify-between bg-slate-800/70 px-3 py-2 rounded-lg">
              <span className="text-slate-300">Tiền phơi trả hộ / Còn phải thu:</span>
              <strong className="font-mono text-purple-300">
                {formatVnd(metrics.totalPhoiTraHo)} / Nợ: {formatVnd(metrics.totalPhoiConPhaiThu)}
              </strong>
            </div>
          </div>
        </div>
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
                    ✓ Thu Hoàn Tiền
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
                    📅 Đổi Ngày Hẹn
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
            <span>Cần Chú Ý (Ưu tiên theo số liệu thực tế)</span>
          </h2>
          <span className="text-[11px] text-slate-400">3 vấn đề cốt lõi cần giám đốc xử lý</span>
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
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Hiệu Quả Hoạt Động</h2>

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
                7 Nhóm Ô Gộp (Chia lãi)
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
                <b>Nguyên tắc chia lãi nhóm theo quy định:</b> Trong Excel tháng 1, có 7 nhóm hành trình (như hàng 63-64, 65-66, 71-72, 74-75, 8-9, 36-37, 57-58) có ô chi phí gộp chung. Hệ thống giữ nguyên chênh lệch ở cấp nhóm (UNALLOCATED), không tự chia hoặc gán hết vào một cuốc.
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

                  const phoiAdv = f.phoi_tra_ho;
                  const phoiRem = f.phoi_con_phai_thu;
                  const isPhoiDone = phoiAdv > 0 && phoiRem === 0;

                  return (
                    <tr
                      key={trip.id}
                      onClick={() => setSelectedTrip(trip)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      title="Bấm để xem chi tiết cuốc xe"
                    >
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-900">{trip.trip_code}</td>
                      <td className="py-2 px-2.5 font-mono text-slate-500">{trip.trip_date}</td>
                      <td className="py-2 px-2.5 text-slate-800">
                        {trip.so_xe || '-'} • {trip.lai_xe || 'Xe ngoài'}
                      </td>
                      <td className="py-2 px-2.5 text-slate-800">
                        <span className="font-semibold">{trip.ten_khach}</span> • {trip.tuyen_duong}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-[11px]">
                        <span className="font-bold text-slate-800">{trip.so_cont || '-'}</span>{' '}
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

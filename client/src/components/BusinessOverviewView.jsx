import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  Search,
  AlertCircle,
  Truck,
  Layers,
  CheckCircle2,
  SlidersHorizontal,
  ChevronRight,
  Info,
  Calendar,
  X,
  Loader2,
  RefreshCw
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
  saveBusinessGroupAllocationApi
} from '../services/api.js';
import TripDetailDrawer from './TripDetailDrawer.jsx';

export default function BusinessOverviewView({ onNavigateTab, onAssistantContext, assistantFocus, onAssistantFocusConsumed }) {
  // DỮ LIỆU ĐỘNG TỪ BACKEND API CÓ XÁC THỰC
  const [tripsData, setTripsData] = useState([]);
  const [groupsData, setGroupsData] = useState([]);
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // 1. BỘ LỌC TOÀN TRANG: THỜI GIAN & KHU VỰC
  const [rangeStart,setRangeStart]=useState('');
  const [rangeEnd,setRangeEnd]=useState('');
  const [dateFilter, setDateFilter] = useState('month'); // 'month' | 'day_09' | 'day_08'
  const [selectedArea, setSelectedArea] = useState('ALL');



  // 2. PHÂN HỆ HIỆU QUẢ HOẠT ĐỘNG
  const [breakdownView, setBreakdownView] = useState('DRIVER'); // 'DRIVER' | 'VEHICLE' | 'GROUPS'
  const [breakdownSort, setBreakdownSort] = useState('PROFIT_DESC'); // 'PROFIT_DESC' | 'TRIPS_ASC'

  // 3. DRILL-DOWN DANH SÁCH CHUYẾN LIÊN QUAN
  const [activeDrilldown, setActiveDrilldown] = useState(null);
  const [drilldownSearch, setDrilldownSearch] = useState('');

  // 4. KHUNG CHI TIẾT CHUYẾN XE BÊN PHẢI (DRAWER)
  const [selectedTrip, setSelectedTrip] = useState(null);

  useEffect(() => {
    const periods={month:{startDate:'2026-01-01',endDate:'2026-01-31',kind:'month',label:'Tháng 01/2026'},day_09:{startDate:'2026-01-09',endDate:'2026-01-09',kind:'day'},day_08:{startDate:'2026-01-08',endDate:'2026-01-08',kind:'day'},all:{all:true}};
    const period=dateFilter==='range'&&rangeStart&&rangeEnd?{startDate:rangeStart,endDate:rangeEnd,kind:'range'}:periods[dateFilter];
    const entity=selectedTrip?{kind:'trip',value:selectedTrip.id}:activeDrilldown?.type==='ENTITY'?{kind:activeDrilldown.entityType==='VEHICLE'?'vehicle':'driver',value:activeDrilldown.name}:null;
    onAssistantContext?.({period,area:selectedArea,entity});
  },[dateFilter,rangeStart,rangeEnd,selectedArea,selectedTrip,activeDrilldown,onAssistantContext]);

  // 5. MODAL QUẢN LÝ PHÂN BỔ CHI PHÍ NHÓM Ô GỘP
  const [selectedGroupForAllocation, setSelectedGroupForAllocation] = useState(null);
  const [allocationMode, setAllocationMode] = useState('PROPORTIONAL'); // 'UNALLOCATED' | 'PROPORTIONAL' | 'MANUAL'
  const [manualInputs, setManualInputs] = useState({});
  const [allocationSavedMap, setAllocationSavedMap] = useState({}); // groupKey -> { mode, items }
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [ovRes, trRes, grRes] = await Promise.all([
        fetchBusinessOverviewApi({ period: 'month' }),
        fetchBusinessTripsApi(),
        fetchBusinessGroupsApi()
      ]);
      if (ovRes.success && trRes.success && grRes.success) {
        setOverviewData(ovRes.data);
        setTripsData(trRes.data.trips || []);
        setGroupsData(grRes.data || []);
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
    const refresh = () => { if (document.visibilityState === 'visible') loadData(); };
    window.addEventListener('business-data-changed', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { window.removeEventListener('business-data-changed', refresh); clearInterval(timer); };
  }, [loadData]);

  useEffect(() => {
    if(!assistantFocus||!tripsData.length)return;
    const trip=tripsData.find(r=>r.id===assistantFocus.id);
    if(trip){const p=assistantFocus.period;if(p?.all)setDateFilter('all');else if(p?.startDate){setRangeStart(p.startDate);setRangeEnd(p.endDate);setDateFilter('range');}setSelectedTrip(trip);onAssistantFocusConsumed?.();}
  },[assistantFocus?.nonce,tripsData]);

  const handleOpenAllocationModal = (group) => {
    setSelectedGroupForAllocation(group);
    setAllocationMode(group.allocation_mode === 'MANUAL' ? 'MANUAL' : 'UNALLOCATED');
    setManualInputs(group.manual_allocations || {});
  };

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
      for (const tripId of selectedGroupForAllocation.trips) {
        const val = manualInputs[tripId];
        if (val === undefined || val === null || val < 0) {
          alert(`Cuốc ${tripId} chưa có số tiền phân bổ hợp lệ (phải là số nguyên >= 0)!`);
          return;
        }
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
        // GIỮ NGUYÊN MODAL CHO NGƯỜI DÙNG THỬ LẠI
        return;
      }
      // Nạp lại dữ liệu tươi mới từ máy chủ sau khi lưu bền vững
      await loadData();
      setSelectedGroupForAllocation(null);
    } catch (e) {
      alert(`Lỗi kết nối mạng: Không thể lưu phân bổ lên máy chủ. Vui lòng thử lại.`);
      // GIỮ NGUYÊN MODAL
    } finally {
      setIsSavingAllocation(false);
    }
  };

  // Các chuyến xe trong phạm vi lọc
  const scopedTrips = useMemo(() => {
    return tripsData.filter((trip) => {
      if (dateFilter === 'range' && ((rangeStart && trip.trip_date < rangeStart) || (rangeEnd && trip.trip_date > rangeEnd))) return false;
      if (dateFilter === 'all') return true;
      if (dateFilter === 'month' && !trip.trip_date.startsWith('2026-01')) return false;
      if (dateFilter === 'day_09' && trip.trip_date !== '2026-01-09') return false;
      if (dateFilter === 'day_08' && trip.trip_date !== '2026-01-08') return false;
      if (selectedArea !== 'ALL' && trip.area_id !== selectedArea) return false;
      return true;
    });
  }, [tripsData, dateFilter, selectedArea, rangeStart, rangeEnd]);

  // Nhãn phạm vi hiển thị
  const scopeLabel = useMemo(() => {
    let d = dateFilter === 'all'
      ? `Toàn bộ thời gian (${scopedTrips.length} cuốc)`
      : dateFilter === 'month' 
      ? 'Tháng 01/2026 (77 cuốc bảng kê Excel)' 
      : dateFilter === 'day_09' 
      ? 'Ngày 09/01/2026' 
      : dateFilter === 'range' ? `Từ ${rangeStart || 'đầu kỳ'} đến ${rangeEnd || 'hiện tại'}` : 'Ngày 08/01/2026';
    let a = selectedArea === 'ALL' ? 'Toàn công ty' : selectedArea === 'TUAN' ? 'Khu vực Tuân' : 'Khu vực ngoài';
    return `${d} • ${a}`;
  }, [dateFilter, selectedArea, scopedTrips.length, rangeStart, rangeEnd]);

  // Các chỉ số tài chính cốt lõi (Phần A)
  const metrics = useMemo(() => {
    const totalRev = scopedTrips.reduce((s, t) => s + (t.cuoc_vao || 0), 0);
    const totalToll = scopedTrips.reduce((s, t) => s + (t.tien_duong || 0), 0);
    const totalCuocRa = scopedTrips.reduce((s, t) => s + (t.cuoc_ra || 0), 0);
    const totalPhatSinh = scopedTrips.reduce((s, t) => s + (t.phat_sinh || 0), 0);
    const totalCost = totalToll + totalCuocRa + totalPhatSinh;
    const totalProfit = totalRev - totalCost;
    const totalFuelLiters = scopedTrips.reduce((s, t) => s + (t.dau_liters || t.dau_lit || 0), 0);

    const marginPct = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : '0';

    // Scoped journey count
    let journeys = 0;
    if (scopedTrips.length > 0) {
      if (dateFilter === 'month' && selectedArea === 'ALL') {
        journeys = overviewData?.kpis?.journeys_count || 70;
      } else {
        const singleCount = scopedTrips.filter(t => !t.is_grouped).length;
        const groupCount = new Set(scopedTrips.filter(t => t.is_grouped).map(t => t.group_id)).size;
        journeys = singleCount + groupCount;
      }
    }

    return {
      completedCount: scopedTrips.length,
      journeyCount: journeys,
      totalRevenuePreTax: totalRev,
      totalDirectCost: totalCost,
      totalFuelLiters: totalFuelLiters,
      totalProfit: totalProfit,
      profitMarginPct: marginPct,
      groupsCount: groupsData.length
    };
  }, [scopedTrips, dateFilter, selectedArea, overviewData, groupsData]);

  // Dữ liệu hiệu quả theo tài xế / xe
  const driverPerformance = useMemo(() => {
    const map = new Map();

    scopedTrips.forEach(t => {
      const key = t.is_subcontractor
        ? `Xe ngoài ${t.subcontractor_name || t.vehicle_plate || ''}`.trim()
        : `Xe ${t.vehicle_plate} (Tài xế: Chưa xác định)`;
      if (!map.has(key)) {
        map.set(key, {
          driver_name: key,
          vehicle_plate: t.vehicle_plate || t.so_xe || '-',
          is_subcontractor: t.is_subcontractor,
          completed_trips: 0,
          total_revenue: 0,
          total_cost: 0,
          total_profit: 0,
          fuel_liters: 0
        });
      }
      const item = map.get(key);
      item.completed_trips += 1;
      item.total_revenue += (t.cuoc_vao || 0);
      const cost = (t.tien_duong || 0) + (t.cuoc_ra || 0) + (t.phat_sinh || 0);
      item.total_cost += cost;
      item.total_profit += ((t.cuoc_vao || 0) - cost);
      item.fuel_liters += (t.dau_liters || t.dau_lit || 0);
    });

    const list = Array.from(map.values()).map(item => {
      const avg = item.completed_trips > 0 ? Math.round(item.total_profit / item.completed_trips) : 0;
      return { ...item, avg_profit_per_trip: avg };
    });

    if (breakdownSort === 'TRIPS_ASC') {
      return list.sort((a, b) => a.completed_trips - b.completed_trips);
    }
    return list.sort((a, b) => b.total_profit - a.total_profit);
  }, [scopedTrips, breakdownSort]);

  // Dữ liệu hiệu quả theo đầu xe
  const vehiclePerformance = useMemo(() => {
    const map = new Map();

    scopedTrips.forEach(t => {
      const key = t.vehicle_plate || t.so_xe || (t.is_subcontractor ? (t.subcontractor_name || 'Xe ngoài') : 'Xe công ty');
      if (!map.has(key)) {
        map.set(key, {
          vehicle_plate: key,
          driver_name: t.is_subcontractor ? (t.subcontractor_name || 'Thuê ngoài') : 'Chưa xác định',
          is_subcontractor: t.is_subcontractor,
          completed_trips: 0,
          total_revenue: 0,
          total_cost: 0,
          total_profit: 0,
          fuel_liters: 0
        });
      }
      const item = map.get(key);
      item.completed_trips += 1;
      item.total_revenue += (t.cuoc_vao || 0);
      const cost = (t.tien_duong || 0) + (t.cuoc_ra || 0) + (t.phat_sinh || 0);
      item.total_cost += cost;
      item.total_profit += ((t.cuoc_vao || 0) - cost);
      item.fuel_liters += (t.dau_liters || t.dau_lit || 0);
    });

    const list = Array.from(map.values()).map(item => {
      const avg = item.completed_trips > 0 ? Math.round(item.total_profit / item.completed_trips) : 0;
      return { ...item, avg_profit_per_trip: avg };
    });

    if (breakdownSort === 'TRIPS_ASC') {
      return list.sort((a, b) => a.completed_trips - b.completed_trips);
    }
    return list.sort((a, b) => b.total_profit - a.total_profit);
  }, [scopedTrips, breakdownSort]);

  // Danh sách các vấn đề thực tế (Phần B: 3 mục chuẩn nghiệp vụ)
  const attentionItems = useMemo(() => {
    return [
      {
        id: 'GROUP_63_64',
        title: 'Chênh lệch nhóm ô gộp kết hợp 63–64 (HÀ PHƯƠNG)',
        desc: 'Cước vào 5.6M (2.2M + 3.4M), Cước ra gộp chung 4.8M → Chênh lệch cấp nhóm 800.000 đ (Chưa khẳng định lãi từng cuốc)',
        impact: 'Chênh lệch nhóm 800.000 đ',
        isLoss: false,
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
        isLoss: false,
        severity: 'medium',
        btnText: 'Xem Công Nợ',
        onAction: () => {
          if (onNavigateTab) onNavigateTab('debts');
        }
      },
      {
        id: 'FUEL_LITERS',
        title: 'Lượng cấp dầu ghi nhận theo Lít (Chưa có đơn giá)',
        desc: 'Tổng cộng 1.770 lít dầu được cấp trong bảng kê tháng 1; chưa quy đổi thành tiền do thiếu đơn giá',
        impact: '1.770 Lít dầu',
        isLoss: false,
        severity: 'medium',
        btnText: 'Xem chi tiết dầu',
        onAction: () => {
          setActiveDrilldown({
            type: 'METRIC',
            key: 'FUEL',
            label: 'Danh sách các cuốc xe có cấp dầu (Tổng 1.770 lít)'
          });
        }
      }
    ];
  }, [groupsData, onNavigateTab]);

  // Xử lý drill-down từ KPI
  const handleDrilldownFromMetric = (metricKey) => {
    let label = 'Toàn bộ cuốc xe hoàn thành trong kỳ (77 cuốc)';
    if (metricKey === 'REVENUE') label = 'Danh sách cuốc xe (Sắp xếp cước vào cao nhất)';
    if (metricKey === 'DIRECT_COST') label = 'Danh sách cuốc có chi phí trực tiếp (Cước ra & phát sinh)';
    if (metricKey === 'PROFIT') label = 'Danh sách cuốc xe (Sắp xếp lãi chuyến cao nhất)';
    if (metricKey === 'FUEL') label = 'Danh sách các cuốc xe có cấp dầu';

    setActiveDrilldown({
      type: 'METRIC',
      key: metricKey,
      label: label
    });

    const el = document.getElementById('drilldown-trips-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Xử lý chọn dòng tài xế / xe từ Bảng hiệu quả
  const handleSelectRow = (type, name) => {
    setActiveDrilldown({
      type: 'ENTITY',
      entityType: type,
      name: name,
      label: `Danh sách các cuốc của ${type === 'DRIVER' ? 'tài xế' : 'xe'}: ${name}`
    });

    const el = document.getElementById('drilldown-trips-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Danh sách các chuyến được lọc theo drill-down
  const drilldownTrips = useMemo(() => {
    if (!activeDrilldown) return [];

    let list = [...scopedTrips];

    if (activeDrilldown.type === 'METRIC') {
      if (activeDrilldown.key === 'REVENUE') list.sort((a, b) => b.cuoc_vao - a.cuoc_vao);
      if (activeDrilldown.key === 'DIRECT_COST') list.sort((a, b) => (b.cuoc_ra + b.phat_sinh) - (a.cuoc_ra + a.phat_sinh));
      if (activeDrilldown.key === 'PROFIT') list.sort((a, b) => (b.cuoc_vao - (b.cuoc_ra + b.phat_sinh)) - (a.cuoc_vao - (a.cuoc_ra + a.phat_sinh)));
      if (activeDrilldown.key === 'FUEL') list = list.filter(t => t.dau_lit > 0).sort((a, b) => b.dau_lit - a.dau_lit);
    } else if (activeDrilldown.type === 'ENTITY') {
      if (activeDrilldown.entityType === 'DRIVER') {
        list = list.filter(t => t.lai_xe === activeDrilldown.name);
      } else if (activeDrilldown.entityType === 'VEHICLE') {
        list = list.filter(t => t.so_xe === activeDrilldown.name);
      }
    }

    if (drilldownSearch.trim()) {
      const q = drilldownSearch.toLowerCase();
      list = list.filter(t =>
        t.trip_code.toLowerCase().includes(q) ||
        (t.so_xe && t.so_xe.toLowerCase().includes(q)) ||
        (t.lai_xe && t.lai_xe.toLowerCase().includes(q)) ||
        (t.ten_khach && t.ten_khach.toLowerCase().includes(q)) ||
        (t.tuyen_duong && t.tuyen_duong.toLowerCase().includes(q))
      );
    }

    return list;
  }, [scopedTrips, activeDrilldown, drilldownSearch]);

  // Điều hướng tuần tự trong Drawer
  const currentTripIndex = useMemo(() => {
    if (!selectedTrip || drilldownTrips.length === 0) return -1;
    return drilldownTrips.findIndex(t => t.trip_code === selectedTrip.trip_code);
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

  // Tính toán phân bổ cho nhóm đang mở modal
  const currentGroupAllocations = useMemo(() => {
    if (!selectedGroupForAllocation) return [];
    return calculateGroupAllocation(selectedGroupForAllocation, allocationMode, manualInputs, tripsData);
  }, [selectedGroupForAllocation, allocationMode, manualInputs, tripsData]);

  const currentGroupTrips = useMemo(() => {
    if (!selectedGroupForAllocation) return [];
    return tripsData.filter(t => selectedGroupForAllocation.trips && selectedGroupForAllocation.trips.includes(t.id));
  }, [selectedGroupForAllocation, tripsData]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center space-y-4 text-center">
        <Loader2 className="w-8 h-8 text-slate-800 animate-spin" />
        <div className="text-sm font-semibold text-slate-700">Đang tải dữ liệu kinh doanh từ máy chủ bảo mật...</div>
        <div className="text-xs text-slate-400">Xác thực Token JWT và nạp bảng kê tháng 1</div>
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 bg-slate-50/60 min-h-screen text-slate-800">
      {/* ============================================================ */}
      {/* PHẦN A — KẾT QUẢ KINH DOANH */}
      {/* ============================================================ */}
      <section aria-label="Kết quả kinh doanh" className="space-y-4">
        {/* Hàng tiêu đề và bộ lọc thời gian / khu vực */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Tổng Quan Kinh Doanh</span>
              <span className="text-xs bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-semibold">
                Chuẩn Excel Tháng 1
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Phạm vi: <span className="font-medium text-slate-800">{scopeLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Bộ chọn thời gian */}
            <div className="flex flex-wrap rounded-lg border border-slate-300 bg-white p-0.5 font-medium shadow-2xs">
              <button
                type="button"
                onClick={() => setDateFilter('month')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  dateFilter === 'month' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tháng 01/2026 ({tripsData.filter(t=>t.trip_date.startsWith('2026-01')).length} cuốc)
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

            <div className="flex flex-wrap gap-2 items-center"><label>Từ ngày <input aria-label="Từ ngày báo cáo" type="date" className="border rounded p-1.5 max-w-full" value={rangeStart} onChange={e=>{setRangeStart(e.target.value);setDateFilter('range');}}/></label><label>Đến ngày <input aria-label="Đến ngày báo cáo" type="date" className="border rounded p-1.5 max-w-full" value={rangeEnd} onChange={e=>{setRangeEnd(e.target.value);setDateFilter('range');}}/></label></div>
            {/* Dropdown khu vực */}
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-medium text-slate-800 shadow-2xs focus:outline-hidden"
            >
              <option value="ALL">Toàn công ty</option>
              <option value="TUAN">Khu vực Tuân (Xe nhà)</option>
            </select>

            {/* Nút Làm Mới thủ công tối ưu cho kết nối từ xa */}
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Tải lại số liệu mới nhất từ máy chủ"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Bốn chỉ số ngang hàng */}
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
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">{metrics.completedCount}</span>
              <span className="text-xs text-slate-500 font-normal ml-1">cuốc</span>
            </div>
            <span className="text-[11px] text-indigo-600 font-medium">
              {metrics.journeyCount} hành trình • {metrics.groupsCount} nhóm ô gộp
            </span>
          </button>

          {/* 2. Tổng cước vào (Có VAT) */}
          <button
            type="button"
            id="kpi-card-revenue"
            onClick={() => handleDrilldownFromMetric('REVENUE')}
            className="p-4 bg-white rounded-xl border border-slate-200 text-left hover:border-slate-300 hover:bg-slate-50/50 transition-all flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <span className="text-xs font-medium text-slate-500">Tổng Cước Vào (Có VAT)</span>
            <div className="my-1.5">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 whitespace-nowrap">{formatTrieuDong(metrics.totalRevenuePreTax)}</span>
            </div>
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              {formatVnd(metrics.totalRevenuePreTax)}
            </span>
          </button>

          {/* 3. Chi phí trực tiếp đã biết */}
          <button
            type="button"
            id="kpi-card-direct_cost"
            onClick={() => handleDrilldownFromMetric('DIRECT_COST')}
            className="p-4 bg-white rounded-xl border border-slate-200 text-left hover:border-slate-300 hover:bg-slate-50/50 transition-all flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <span className="text-xs font-medium text-slate-500">Chi Phí Trực Tiếp Đã Biết</span>
            <div className="my-1.5">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 whitespace-nowrap">{formatTrieuDong(metrics.totalDirectCost)}</span>
            </div>
            <span className="text-[11px] text-amber-700 font-semibold whitespace-nowrap">
              Đường BOT + Cước ra + Phát sinh
            </span>
          </button>

          {/* 4. Chênh lệch (Trước lương & dầu) */}
          <button
            type="button"
            id="kpi-card-profit"
            onClick={() => handleDrilldownFromMetric('PROFIT')}
            className="p-4 bg-white rounded-xl border border-slate-200 text-left hover:border-slate-300 hover:bg-slate-50/50 transition-all flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <span className="text-xs font-medium text-slate-500">Chênh Lệch (Trước Lương & Dầu)</span>
            <div className="my-1.5">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-emerald-700 whitespace-nowrap">
                {formatTrieuDong(metrics.totalProfit)}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              Chưa trừ lương và chưa quy đổi tiền dầu
            </span>
          </button>
        </div>

        {/* Một dòng chú thích chung theo chuẩn quy tắc xác nhận */}
        <div className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>
              <b>Quy tắc đã xác nhận:</b> Cước vào đã gồm VAT · Lãi chuyến chưa tính lương lái xe · Ô gộp cần phân bổ chi phí.
            </span>
          </div>
          <span className="text-slate-500">
            Dầu cấp: <b className="text-slate-900">{metrics.totalFuelLiters} Lít</b> (theo dõi riêng lượng cấp, chưa áp đơn giá).
          </span>
        </div>
      </section>

      {/* ============================================================ */}
      {/* PHẦN B — CẦN CHÚ Ý */}
      {/* ============================================================ */}
      <section aria-label="Cần chú ý" className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Cần Chú Ý (Ưu tiên theo số liệu thực tế Excel Tháng 1)</span>
          </h2>
          <span className="text-[11px] text-slate-400">
            3 vấn đề cốt lõi cần giám đốc xử lý
          </span>
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
      <section id="performance-section" aria-label="Hiệu quả hoạt động" className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Hiệu Quả Hoạt Động
            </h2>

            {/* Chuyển đổi Theo tài xế / Theo xe / 7 Nhóm ô gộp */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setBreakdownView('DRIVER')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  breakdownView === 'DRIVER' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo tài xế
              </button>
              <button
                type="button"
                onClick={() => setBreakdownView('VEHICLE')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  breakdownView === 'VEHICLE' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo xe
              </button>
              <button
                type="button"
                onClick={() => setBreakdownView('GROUPS')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  breakdownView === 'GROUPS' ? 'bg-indigo-50 text-indigo-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                7 Nhóm Ô Gộp (Chia lãi)
              </button>
            </div>
          </div>

          {/* Sắp xếp nhanh */}
          {breakdownView !== 'GROUPS' && (
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-500">Sắp xếp:</span>
              <select
                value={breakdownSort}
                onChange={(e) => setBreakdownSort(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium focus:outline-hidden"
              >
                <option value="PROFIT_DESC">Lãi cao nhất</option>
                <option value="TRIPS_ASC">Ít cuốc nhất</option>
              </select>
            </div>
          )}
        </div>

        {/* 1. BẢNG THEO TÀI XẾ HOẶC ĐẦU XE */}
        {breakdownView !== 'GROUPS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                  <th className="py-2.5 px-3 text-left">
                    {breakdownView === 'DRIVER' ? 'Tài xế' : 'Biển số xe'}
                  </th>
                  <th className="py-2.5 px-3 text-center">Số cuốc</th>
                  <th className="py-2.5 px-3 text-right">Cước vào (Có VAT)</th>
                  <th className="py-2.5 px-3 text-right">Chi phí cước ra</th>
                  <th className="py-2.5 px-3 text-right">Dầu cấp (Lít)</th>
                  <th className="py-2.5 px-3 text-right">Lãi từ cuốc</th>
                  <th className="py-2.5 px-3 text-right">Lãi / cuốc</th>
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
                        {formatVnd(item.total_revenue)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatVnd(item.total_cost)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-700">
                        {item.fuel_liters > 0 ? `${item.fuel_liters} L` : '-'}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="font-mono font-bold text-slate-900">
                          {formatVnd(item.total_profit)}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                        {formatVnd(item.avg_profit_per_trip)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. BẢNG 7 NHÓM HÀNH TRÌNH DÙNG CHUNG CHI PHÍ (Ô GỘP) */}
        {breakdownView === 'GROUPS' && (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <Layers className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <b>Nguyên tắc chia lãi nhóm theo quy định:</b> Trong Excel tháng 1, có 7 nhóm hành trình (như hàng 63-64, 65-66, 71-72, 74-75, 8-9, 36-37, 57-58) có ô cước ra gộp chung. 
                Hệ thống giữ nguyên chênh lệch ở cấp nhóm (UNALLOCATED) để đảm bảo toàn vẹn dữ liệu. <i>Thao tác phân bổ chi tiết đang tạm khóa ở bản online đầu tiên theo yêu cầu rà soát để đồng bộ với chi tiết cuốc xe.</i>
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
                    <th className="py-2.5 px-3 text-right">Tổng Cước Vào</th>
                    <th className="py-2.5 px-3 text-right">Cước Ra Ô Gộp</th>
                    <th className="py-2.5 px-3 text-right">Chênh Lệch Nhóm</th>
                    <th className="py-2.5 px-3 text-center">Thao Tác</th>
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
                        <td className="py-2.5 px-3 text-slate-600">
                          Hàng {group.row_indices.join(' & ')}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {group.vehicle_or_partner}
                        </td>
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
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            disabled
                            className="px-2.5 py-1 bg-slate-200 text-slate-500 rounded text-xs font-semibold cursor-not-allowed inline-flex items-center gap-1 opacity-75"
                            title="Chức năng chia lãi nhóm đang khóa ở bản online đầu tiên để đối soát đồng bộ với chi tiết chuyến"
                          >
                            <span>Tạm Khóa</span>
                          </button>
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
      {/* KHUNG DANH SÁCH CHUYẾN LIÊN QUAN (KHI BẤM CHỈ SỐ HOẶC BẢNG) */}
      {/* ============================================================ */}
      {activeDrilldown && (
        <section id="drilldown-trips-section" aria-label="Danh sách chuyến liên quan" className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <h3 className="text-xs font-bold text-slate-900">
                {activeDrilldown.label}
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                ({drilldownTrips.length} cuốc)
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  value={drilldownSearch}
                  onChange={(e) => setDrilldownSearch(e.target.value)}
                  placeholder="Lọc nhanh chuyến, xe, khách..."
                  className="pl-8 pr-3 py-1 border border-slate-200 rounded-lg text-xs w-52 text-slate-800 placeholder-slate-400 focus:outline-hidden"
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
                ✕ Đóng danh sách
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2 px-3">Mã Cuốc</th>
                  <th className="py-2 px-3">Ngày</th>
                  <th className="py-2 px-3">Xe / Lái Xe</th>
                  <th className="py-2 px-3">Khách Hàng / Tuyến</th>
                  <th className="py-2 px-3 text-right">Cước Vào (Có VAT)</th>
                  <th className="py-2 px-3 text-right">Cước Ra</th>
                  <th className="py-2 px-3 text-right">Dầu (Lít)</th>
                  <th className="py-2 px-3 text-right">Lãi Chuyến</th>
                  <th className="py-2 px-3 text-center">Ghi Chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drilldownTrips.map(trip => {
                  const cost = (trip.cuoc_ra || 0) + (trip.phat_sinh || 0);
                  const profit = (trip.cuoc_vao || 0) - cost;

                  return (
                    <tr
                      key={trip.id}
                      onClick={() => setSelectedTrip(trip)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                      title="Bấm để xem chi tiết cuốc xe"
                    >
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        {trip.trip_code}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-500">
                        {trip.trip_date}
                      </td>
                      <td className="py-2 px-3 text-slate-800">
                        {trip.so_xe || '-'} • {trip.lai_xe || 'Xe ngoài'}
                      </td>
                      <td className="py-2 px-3 text-slate-800">
                        <span className="font-semibold">{trip.ten_khach}</span> • {trip.tuyen_duong}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                        {formatVnd(trip.cuoc_vao)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {formatVnd(trip.cuoc_ra)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-amber-700">
                        {trip.dau_lit > 0 ? `${trip.dau_lit} L` : '-'}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-bold ${profit < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                        {formatVnd(profit)}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-500 text-[11px]">
                        {trip.is_merged_group ? (
                          <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                            Ô gộp {trip.group_id}
                          </span>
                        ) : trip.ghi_chu_khach ? (
                          <span className="italic">{trip.ghi_chu_khach}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
                {drilldownTrips.length === 0 && (
                  <tr>
                    <td colSpan="9" className="py-4 text-center text-slate-400 italic">
                      Không tìm thấy cuốc xe nào phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* MODAL PHÂN BỔ CHI PHÍ NHÓM Ô GỘP - TẠM KHÓA HOÀN TOÀN Ở BẢN ĐẦU TIÊN */}
      {/* ============================================================ */}
      {false && selectedGroupForAllocation && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-fade-in space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                  <span>Phân Bổ Chi Phí Chung - {selectedGroupForAllocation.group_key}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Xe/Đối tác: <b>{selectedGroupForAllocation.vehicle_or_partner}</b> • Dòng Excel: <b>Hàng {selectedGroupForAllocation.row_indices.join(' & ')}</b>
                </p>
              </div>
              <button
                onClick={() => setSelectedGroupForAllocation(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thông số cốt lõi của nhóm */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div>
                <span className="text-[11px] text-slate-500 block">Tổng Cước Vào (Có VAT)</span>
                <span className="text-base font-bold font-mono text-slate-900">
                  {formatVnd(selectedGroupForAllocation.total_revenue)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Cước Ra Ô Gộp</span>
                <span className="text-base font-bold font-mono text-slate-700">
                  {formatVnd(selectedGroupForAllocation.total_shared_money)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Chênh Lệch Nhóm</span>
                <span className="text-base font-bold font-mono text-emerald-700">
                  {formatVnd(selectedGroupForAllocation.total_revenue - selectedGroupForAllocation.total_shared_money)}
                </span>
              </div>
            </div>

            {/* Chọn chế độ phân bổ */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-2">
                Chọn phương án phân bổ chi phí:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAllocationMode('UNALLOCATED')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    allocationMode === 'UNALLOCATED'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  1. Chưa phân bổ
                  <span className="text-[10px] text-slate-500 block font-normal mt-0.5">Giữ nguyên cấp nhóm</span>
                </button>

                <button
                  type="button"
                  disabled title="Chưa xác nhận quy tắc phân bổ tự động"
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    allocationMode === 'PROPORTIONAL'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  2. Theo tỷ trọng cước
                  <span className="text-[10px] text-slate-500 block font-normal mt-0.5">Chưa xác nhận quy tắc</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAllocationMode('MANUAL')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    allocationMode === 'MANUAL'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  3. Phân bổ thủ công
                  <span className="text-[10px] text-slate-500 block font-normal mt-0.5">Kiểm tra tổng khớp 100%</span>
                </button>
              </div>
            </div>

            {/* Bảng phân bổ chi tiết cho từng cuốc trong nhóm */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Cuốc xe / Dòng</th>
                    <th className="py-2.5 px-3">Khách hàng & Tuyến</th>
                    <th className="py-2.5 px-3 text-right">Cước Vào</th>
                    <th className="py-2.5 px-3 text-right">Chi Phí Phân Bổ</th>
                    <th className="py-2.5 px-3 text-right">Lãi Sau Phân Bổ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentGroupTrips.map((t, idx) => {
                    const alloc = currentGroupAllocations.find(a => a.trip_id === t.id);
                    const allocatedCost = alloc?.allocated_shared_cost;
                    const profit = alloc?.profit;

                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-900">{t.trip_code}</span>
                          <span className="text-slate-400 block text-[10px]">Hàng #{t.row_index}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-800">{t.customer_name || t.ten_khach}</span>
                          <span className="text-slate-500 block text-[10px] truncate max-w-[200px]">{t.route_name || t.tuyen_duong}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                          {formatVnd(t.cuoc_vao)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {allocationMode === 'MANUAL' ? (
                            <input
                              type="number"
                              value={manualInputs[t.id] ?? ''}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setManualInputs(prev => ({ ...prev, [t.id]: val }));
                              }}
                              placeholder="0"
                              className="w-24 p-1 text-right border border-slate-300 rounded font-mono text-xs"
                            />
                          ) : allocatedCost !== null ? (
                            <span className="font-bold text-indigo-700">{formatVnd(allocatedCost)}</span>
                          ) : (
                            <span className="text-slate-400 italic">Chưa chia</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          {profit !== null ? (
                            <span className={profit < 0 ? 'text-rose-700' : 'text-emerald-700'}>
                              {formatVnd(profit)}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Theo nhóm</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Thông báo kiểm tra tổng nếu dùng thủ công */}
            {allocationMode === 'MANUAL' && (() => {
              const totalManual = Object.values(manualInputs).reduce((s, v) => s + (Number(v) || 0), 0);
              const target = selectedGroupForAllocation.total_shared_money;
              const isMatch = totalManual === target;

              return (
                <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
                  isMatch ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  <span>Tổng tiền đã nhập: {formatVnd(totalManual)} / Mục tiêu: {formatVnd(target)}</span>
                  <span>{isMatch ? '✓ Khớp 100%' : `Chênh lệch: ${formatVnd(target - totalManual)}`}</span>
                </div>
              );
            })()}

            {/* Nút thao tác */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedGroupForAllocation(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Đóng
              </button>
              {(() => {
                const totalManual = Object.values(manualInputs).reduce((s, v) => s + (Number(v) || 0), 0);
                const isMatch = totalManual === selectedGroupForAllocation.total_shared_money;
                const canSave = allocationMode !== 'MANUAL' || (isMatch && selectedGroupForAllocation.trips.every(tId => manualInputs[tId] !== undefined && Number(manualInputs[tId]) >= 0));

                return (
                  <button
                    type="button"
                    disabled={!canSave || isSavingAllocation}
                    onClick={handleSaveAllocation}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSavingAllocation ? 'Đang lưu...' : 'Lưu Phương Án Chia Lãi'}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* KHUNG CHI TIẾT CHUYẾN XE BÊN PHẢI (DRAWER) */}
      {/* ============================================================ */}
      <TripDetailDrawer
        selectedTrip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        onPrev={handlePrevTrip}
        onNext={handleNextTrip}
        hasPrev={currentTripIndex > 0}
        hasNext={currentTripIndex >= 0 && currentTripIndex < drilldownTrips.length - 1}
      />
    </div>
  );
}

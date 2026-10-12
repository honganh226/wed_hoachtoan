import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Edit3,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  RefreshCw,
  AlertTriangle,
  Users,
  Truck,
  DollarSign,
  FileText,
  BarChart3,
  Crown,
  Trophy,
  Award,
  Zap,
  Search,
  SlidersHorizontal,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Phone,
  MapPin,
  Clock
} from 'lucide-react';
import { 
  fetchKpiProgress, 
  fetchDriverKpiDrilldown, 
  updateDriverKpiApi,
  loginApi,
  setAuthToken,
  setStoredUser
} from '../services/api.js';

// ================================================================
// TIỆN ÍCH ĐỊNH DẠNG SỐ & TIỀN TỆ
// ================================================================
const formatVnd = (amount) => new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';

const formatVndShort = (amount) => {
  const n = Math.round(Number(amount || 0));
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  return new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
};

// Map màu theo trạng thái KPI (Chuẩn doanh nghiệp sạch sẽ)
const KPI_STATUS_COLORS = {
  BEHIND: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    bar: 'bg-rose-500',
    text: 'text-rose-700',
    icon: '🔴'
  },
  ON_TRACK: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    bar: 'bg-amber-500',
    text: 'text-amber-700',
    icon: '🟡'
  },
  EXCEEDED: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700',
    icon: '🟢'
  },
  NO_KPI: {
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    bar: 'bg-slate-300',
    text: 'text-slate-500',
    icon: '⚪'
  }
};

const KPI_PRESETS = [
  { label: '30 Tr', value: 30000000 },
  { label: '40 Tr', value: 40000000 },
  { label: '50 Tr', value: 50000000 },
  { label: '60 Tr', value: 60000000 },
  { label: '70 Tr', value: 70000000 },
  { label: '80 Tr', value: 80000000 },
  { label: '100 Tr', value: 100000000 },
  { label: 'Bỏ KPI (0đ)', value: 0 }
];

// ================================================================
// SUB-COMPONENT: MODAL / PANEL THIẾT LẬP KPI CHO TÀI XẾ
// ================================================================
function KpiTargetModal({ driver, isOpen, onClose, onSave, isDirector, onSwitchToDirector, loading }) {
  if (!isOpen || !driver) return null;

  const [kpiInput, setKpiInput] = useState(
    driver.kpi_target > 0 ? driver.kpi_target.toString() : ''
  );
  const [reason, setReason] = useState('Điều chỉnh chỉ tiêu doanh số theo kế hoạch tháng');
  const [displayValue, setDisplayValue] = useState(
    driver.kpi_target > 0 ? new Intl.NumberFormat('vi-VN').format(driver.kpi_target) : ''
  );

  const handleKpiChange = (numericStr) => {
    const cleaned = numericStr.replace(/[^0-9]/g, '');
    setKpiInput(cleaned);
    if (cleaned) {
      setDisplayValue(new Intl.NumberFormat('vi-VN').format(parseInt(cleaned, 10)));
    } else {
      setDisplayValue('');
    }
  };

  const handlePresetClick = (val) => {
    handleKpiChange(val.toString());
  };

  const currentNumeric = parseInt(kpiInput, 10) || 0;
  const simulatedPercent = currentNumeric > 0
    ? Math.round((driver.actual_revenue / currentNumeric) * 100)
    : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Vui lòng nhập lý do điều chỉnh chỉ tiêu KPI.');
      return;
    }
    onSave(driver.driver_id, currentNumeric, reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Đặt Chỉ Tiêu KPI Doanh Số</h3>
              <p className="text-[11px] text-slate-300">Tài xế: {driver.full_name} ({driver.default_vehicle_plate || 'Chưa gán xe'})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Thông tin hiện tại */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div>
              <span className="text-slate-500 block">Doanh thu hiện tại trong kỳ:</span>
              <strong className="font-mono text-slate-900 text-sm">{formatVnd(driver.actual_revenue)}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Chỉ tiêu KPI hiện tại:</span>
              <strong className="font-mono text-indigo-700 text-sm">
                {driver.kpi_target > 0 ? formatVnd(driver.kpi_target) : 'Chưa cài đặt'}
              </strong>
            </div>
          </div>

          {/* Cảnh báo quyền nếu không phải Giám Đốc */}
          {!isDirector && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start justify-between gap-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Thao tác sửa KPI quy định chỉ dành riêng cho <strong>Giám Đốc (DIRECTOR)</strong>.</span>
              </div>
              {onSwitchToDirector && (
                <button
                  type="button"
                  onClick={onSwitchToDirector}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 transition-all text-[11px]"
                >
                  👑 Đổi sang GĐ
                </button>
              )}
            </div>
          )}

          {/* Chọn nhanh Preset */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Gợi ý mức chỉ tiêu phổ biến (Bấm 1-chạm):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {KPI_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handlePresetClick(p.value)}
                  className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-all ${
                    currentNumeric === p.value
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ô nhập số tiền tùy chỉnh */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Chỉ tiêu KPI mới (VND):
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={displayValue}
                onChange={(e) => handleKpiChange(e.target.value)}
                placeholder="Ví dụ: 60.000.000"
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900"
                autoFocus
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-semibold text-slate-400">
                VND
              </span>
            </div>
            {currentNumeric > 0 ? (
              <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>Số tiền: {formatVnd(currentNumeric)}</span>
                <span className="font-semibold text-emerald-700">
                  Dự kiến đạt: {simulatedPercent}% tiến độ
                </span>
              </div>
            ) : (
              <span className="mt-1 text-[11px] text-slate-400 block italic">
                (Đặt 0 ₫ để gỡ bỏ chỉ tiêu KPI cho tài xế này)
              </span>
            )}
          </div>

          {/* Lý do điều chỉnh */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lý do điều chỉnh (Ghi nhận Audit Log): <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do giao hoặc đổi chỉ tiêu..."
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
              required
            />
          </div>

          {/* Nút hành động */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading || !isDirector}
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm active:scale-95 flex items-center space-x-1.5"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Lưu Chỉ Tiêu KPI</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================================================================
// SUB-COMPONENT: DRILLDOWN CUỐC XE TÀI XẾ
// ================================================================
function DriverTripsDrilldown({ driverId, dateFilter, onClose }) {
  const [drillData, setDrillData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetchDriverKpiDrilldown(driverId, dateFilter);
        if (res.success) setDrillData(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [driverId, dateFilter]);

  if (loading) {
    return (
      <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
        <RefreshCw className="w-4 h-4 animate-spin text-slate-600 mx-auto mb-1.5" />
        <span className="text-xs text-slate-500">Đang tải lịch sử cuốc xe...</span>
      </div>
    );
  }

  if (!drillData) return null;
  const { driver, summary, trips } = drillData;

  return (
    <div className="mt-3 border border-slate-200 bg-white rounded-xl overflow-hidden shadow-xs animate-fade-in">
      <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
          <Truck className="w-3.5 h-3.5 text-slate-600" />
          <span>Danh sách {trips.length} cuốc xe: {driver.full_name}</span>
          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
            {driver.default_vehicle_plate}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-slate-200 text-xs">
        <div>
          <span className="text-slate-400 text-[11px] block">Doanh thu kỳ:</span>
          <strong className="font-mono text-slate-900">{formatVnd(summary.total_revenue)}</strong>
        </div>
        <div>
          <span className="text-slate-400 text-[11px] block">Lương chuyến:</span>
          <strong className="font-mono text-emerald-700">{formatVnd(summary.total_salary)}</strong>
        </div>
        <div>
          <span className="text-slate-400 text-[11px] block">Chi phí liên quan:</span>
          <strong className="font-mono text-rose-700">{formatVnd(summary.total_expenses)}</strong>
        </div>
        <div>
          <span className="text-slate-400 text-[11px] block">Số cuốc xe:</span>
          <strong className="font-mono text-slate-900">{summary.trip_count} cuốc</strong>
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
        {trips.length === 0 ? (
          <p className="p-4 text-xs text-slate-400 text-center italic">Không có cuốc xe nào trong kỳ này.</p>
        ) : (
          trips.map((t) => (
            <div key={t.id} className="p-2.5 px-4 hover:bg-slate-50 flex items-center justify-between text-xs">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-blue-600">{t.trip_code}</span>
                  <span className="text-slate-400 text-[11px]">{t.trip_date}</span>
                  <span className="font-semibold text-slate-800">{t.customer_name}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Tuyến: {t.route_name} • Cont: <span className="font-mono">{t.container_number || 'N/A'}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-slate-900 block">{formatVnd(t.total_revenue)}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                  t.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {t.status === 'PAID' ? 'Đã thu tiền' : 'Chưa thu'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ================================================================
// COMPONENT CHÍNH: BÁO CÁO DOANH SỐ & KPI TÀI XẾ
// ================================================================
export default function KpiAdjustTable({ dateFilter = {}, currentUser }) {
  const [kpiData, setKpiData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Chế độ xem: 'visual' (Biểu đồ trực quan) | 'table' (Bảng số liệu chi tiết)
  const [viewMode, setViewMode] = useState('visual');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('revenue'); // 'revenue' | 'percent' | 'trips' | 'status'
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Quản lý Modal đặt KPI & Drill-down
  const [selectedDriverForKpi, setSelectedDriverForKpi] = useState(null);
  const [drilldownDriverId, setDrilldownDriverId] = useState(null);

  const isDirector = currentUser?.role === 'DIRECTOR';

  // Tải dữ liệu KPI
  const loadKpi = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetchKpiProgress(dateFilter);
      if (res.success) {
        setKpiData(res.data);
      } else {
        setErrorMsg(res.error || 'Không thể tải dữ liệu KPI');
      }
    } catch (e) {
      setErrorMsg(e.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(dateFilter)]);

  useEffect(() => {
    loadKpi();
  }, [loadKpi]);

  // Lưu chỉ tiêu KPI mới
  const handleSaveKpi = async (driverId, newTarget, reason) => {
    try {
      setEditLoading(true);
      const res = await updateDriverKpiApi(driverId, newTarget, reason);
      if (res.success) {
        setSuccessMsg(res.message || 'Đã cập nhật chỉ tiêu KPI thành công!');
        setSelectedDriverForKpi(null);
        await loadKpi();
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        alert(res.error || 'Cập nhật thất bại');
      }
    } catch (e) {
      alert(e.message || 'Lỗi kết nối máy chủ');
    } finally {
      setEditLoading(false);
    }
  };

  // Chuyển nhanh sang Giám Đốc để test đặt KPI
  const handleSwitchToDirector = async () => {
    try {
      const res = await loginApi('giamdoc', 'admin123');
      if (res.success) {
        setAuthToken(res.data.token);
        setStoredUser(res.data.user);
        window.location.reload();
      }
    } catch (e) {
      alert('Không thể chuyển đổi vai trò');
    }
  };

  // Tính toán danh sách tài xế đã lọc và sắp xếp
  const drivers = kpiData?.drivers || [];
  const team = kpiData?.team_summary || {};

  const filteredAndSortedDrivers = useMemo(() => {
    let list = [...drivers];

    // Lọc theo từ khóa tìm kiếm
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d => 
        d.full_name?.toLowerCase().includes(q) ||
        d.default_vehicle_plate?.toLowerCase().includes(q) ||
        d.phone?.includes(q) ||
        d.area_id?.toLowerCase().includes(q)
      );
    }

    // Lọc theo trạng thái
    if (filterStatus !== 'ALL') {
      list = list.filter(d => d.kpi_status === filterStatus);
    }

    // Sắp xếp
    if (sortBy === 'revenue') {
      list.sort((a, b) => b.actual_revenue - a.actual_revenue);
    } else if (sortBy === 'trips') {
      list.sort((a, b) => b.trip_count - a.trip_count);
    } else if (sortBy === 'percent') {
      list.sort((a, b) => {
        if (a.kpi_percent === null && b.kpi_percent === null) return 0;
        if (a.kpi_percent === null) return 1;
        if (b.kpi_percent === null) return -1;
        return b.kpi_percent - a.kpi_percent;
      });
    } else if (sortBy === 'status') {
      const order = { BEHIND: 0, NO_KPI: 1, ON_TRACK: 2, EXCEEDED: 3 };
      list.sort((a, b) => (order[a.kpi_status] ?? 99) - (order[b.kpi_status] ?? 99));
    }

    return list;
  }, [drivers, searchQuery, filterStatus, sortBy]);

  // Doanh thu lớn nhất trong đội để tính tỷ lệ biểu đồ ngang
  const maxRevenueInTeam = useMemo(() => {
    if (!drivers.length) return 1;
    return Math.max(...drivers.map(d => Math.max(d.actual_revenue || 0, d.kpi_target || 0)), 1);
  }, [drivers]);

  // Tài xế xuất sắc nhất & Cần hỗ trợ nhất
  const topRevenueDriver = useMemo(() => {
    if (!drivers.length) return null;
    return [...drivers].sort((a, b) => b.actual_revenue - a.actual_revenue)[0];
  }, [drivers]);

  const lowestRevenueDriver = useMemo(() => {
    if (!drivers.length) return null;
    return [...drivers].sort((a, b) => a.actual_revenue - b.actual_revenue)[0];
  }, [drivers]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <RefreshCw className="w-8 h-8 animate-spin text-slate-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-800">Đang khởi tạo báo cáo doanh số & KPI tài xế...</p>
        <p className="text-xs text-slate-400 mt-1">Đang tổng hợp dữ liệu doanh thu thực tế từ từng cuốc xe</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Thông báo */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={handleSwitchToDirector}
            className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800"
          >
            Đăng nhập Giám Đốc
          </button>
        </div>
      )}

      {/* 1. HEADER & THẺ TỔNG QUAN HIỆU SUẤT ĐỘI XE */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight uppercase">
                Báo Cáo Doanh Thu & Chỉ Tiêu KPI Từng Tài Xế
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                {drivers.length} Tài Xế
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Thống kê doanh thu thực tế, số chuyến hoàn thành, tiến độ KPI và phân bổ chỉ tiêu mục tiêu
              {dateFilter.label && (
                <span className="ml-2 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono">
                  📅 {dateFilter.label}
                </span>
              )}
            </p>
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
              <span>ℹ️</span>
              <span>Nguồn thử nghiệm: Bộ 33 chuyến theo dõi tài xế. Độc lập với 77 dòng Excel tháng 1.</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadKpi}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg border border-slate-200 transition-colors"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Thẻ chỉ số tổng hợp toàn đội */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-[11px] text-slate-500 font-medium block">Tổng Doanh Thu Toàn Đội</span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
              {formatVnd(team.total_actual_revenue)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{team.total_trip_count || 0} chuyến vận tải</span>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-[11px] text-slate-500 font-medium block">Tổng Chỉ Tiêu KPI Đặt Ra</span>
            <div className="text-lg font-bold font-mono text-indigo-700 mt-0.5">
              {formatVnd(team.total_kpi_target)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{team.drivers_with_kpi || 0} tài xế đã cài KPI</span>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-[11px] text-slate-500 font-medium block">Tiến Độ KPI Toàn Đội</span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5 flex items-center space-x-2">
              <span>{team.team_kpi_percent || 0}%</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                team.team_kpi_percent >= 100 ? 'bg-emerald-100 text-emerald-800' :
                team.team_kpi_percent >= 80 ? 'bg-amber-100 text-amber-800' :
                'bg-rose-100 text-rose-800'
              }`}>
                {team.team_kpi_percent >= 100 ? 'Vượt mốc' : team.team_kpi_percent >= 80 ? 'Đang đạt' : 'Cần đẩy mạnh'}
              </span>
            </div>
            {/* Progress bar toàn đội */}
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div 
                className="bg-slate-900 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(team.team_kpi_percent || 0, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-[11px] text-slate-500 font-medium block">Năng Suất Trung Bình / Cuốc</span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
              {formatVnd(team.total_trip_count ? Math.round(team.total_actual_revenue / team.total_trip_count) : 0)}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Cước bình quân mỗi chuyến</span>
          </div>
        </div>

        {/* Thẻ vinh danh Quán Quân Doanh Số & Hỗ Trợ Điều Vận */}
        {topRevenueDriver && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Quán quân */}
            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Trophy className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                    🥇 Dẫn Đầu Doanh Số Trong Kỳ
                  </span>
                  <span className="font-bold text-slate-900">{topRevenueDriver.full_name}</span>
                  <span className="text-slate-500 font-mono ml-1.5">({topRevenueDriver.default_vehicle_plate})</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-emerald-800 block">{formatVnd(topRevenueDriver.actual_revenue)}</span>
                <span className="text-[10px] text-emerald-600">{topRevenueDriver.trip_count} chuyến ({topRevenueDriver.kpi_percent || 0}% KPI)</span>
              </div>
            </div>

            {/* Cần hỗ trợ */}
            {lowestRevenueDriver && lowestRevenueDriver.driver_id !== topRevenueDriver.driver_id && (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <Zap className="w-4 h-4 text-amber-700" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                      ⚠️ Cần Điều Thêm Cuốc Vận Tải
                    </span>
                    <span className="font-bold text-slate-900">{lowestRevenueDriver.full_name}</span>
                    <span className="text-slate-500 font-mono ml-1.5">({lowestRevenueDriver.default_vehicle_plate})</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-amber-800 block">{formatVnd(lowestRevenueDriver.actual_revenue)}</span>
                  <span className="text-[10px] text-amber-600">{lowestRevenueDriver.trip_count} chuyến ({lowestRevenueDriver.kpi_percent || 0}% KPI)</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. THANH CÔNG CỤ TÌM KIẾM, LỌC & CHUYỂN ĐỔI CHẾ ĐỘ XEM */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        {/* Tìm kiếm & Trạng thái */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tài xế, biển số, SĐT..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700">✕</button>
            )}
          </div>

          {/* Lọc trạng thái KPI */}
          <div className="flex items-center space-x-1 overflow-x-auto text-xs">
            {[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'EXCEEDED', label: '🟢 Vượt' },
              { key: 'ON_TRACK', label: '🟡 Đạt' },
              { key: 'BEHIND', label: '🔴 Chậm' },
              { key: 'NO_KPI', label: '⚪ Chưa cài' }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterStatus === key
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sắp xếp & Chế độ xem */}
        <div className="flex items-center space-x-3 self-end md:self-auto">
          {/* Sắp xếp */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-500">
            <span>Sắp xếp:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="revenue">Doanh số cao nhất</option>
              <option value="percent">% KPI cao nhất</option>
              <option value="trips">Số chuyến nhiều nhất</option>
              <option value="status">Ưu tiên chậm tiến độ</option>
            </select>
          </div>

          {/* Chuyển chế độ: Biểu đồ trực quan vs Bảng chi tiết */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center space-x-1 ${
                viewMode === 'visual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Xem biểu đồ so sánh trực quan"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Biểu Đồ</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center space-x-1 ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Xem bảng số liệu chi tiết"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bảng Biểu</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. NỘI DUNG CHÍNH (BIỂU ĐỒ TRỰC QUAN HOẶC BẢNG BIỂU) */}
      {filteredAndSortedDrivers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
          <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">Không tìm thấy tài xế nào phù hợp với bộ lọc hiện tại.</p>
        </div>
      ) : viewMode === 'visual' ? (
        /* ============================================================
           CHẾ ĐỘ 1: BIỂU ĐỒ TRỰC QUAN SO SÁNH DOANH SỐ VS CHỈ TIÊU KPI
           ============================================================ */
        <div className="space-y-3">
          {filteredAndSortedDrivers.map((driver, idx) => {
            const statusConfig = KPI_STATUS_COLORS[driver.kpi_status] || KPI_STATUS_COLORS.NO_KPI;
            const actualPercentOfMax = (driver.actual_revenue / maxRevenueInTeam) * 100;
            const targetPercentOfMax = (driver.kpi_target / maxRevenueInTeam) * 100;
            const revenueShare = team.total_actual_revenue > 0
              ? Math.round((driver.actual_revenue / team.total_actual_revenue) * 100)
              : 0;
            const isDrilldown = drilldownDriverId === driver.driver_id;

            return (
              <div
                key={driver.driver_id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all"
              >
                {/* Dòng tiêu đề tài xế */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{driver.full_name}</span>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {driver.default_vehicle_plate || 'Chưa gắn xe'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusConfig.badge}`}>
                          {statusConfig.icon} {driver.kpi_status_label}
                        </span>
                        {driver.area_id && (
                          <span className="text-[10px] text-slate-500 font-medium">📍 Khu {driver.area_id}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-3">
                        <span>Đã chạy: <b className="text-slate-700">{driver.trip_count}</b> cuốc</span>
                        <span>Đã thu tiền: <b className="text-emerald-700">{formatVndShort(driver.collected_revenue)}</b></span>
                        <span>Đóng góp: <b className="text-slate-700">{revenueShare}%</b> toàn đội</span>
                      </div>
                    </div>
                  </div>

                  {/* Nút thao tác nhanh */}
                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                    <button
                      onClick={() => setSelectedDriverForKpi(driver)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-all active:scale-95"
                      title="Đặt hoặc chỉnh sửa chỉ tiêu KPI cho tài xế này"
                    >
                      <Target className="w-3.5 h-3.5 text-amber-400" />
                      <span>Đặt KPI</span>
                    </button>

                    <button
                      onClick={() => setDrilldownDriverId(isDrilldown ? null : driver.driver_id)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
                      title="Xem chi tiết các cuốc xe đã chạy"
                    >
                      <span>Cuốc xe</span>
                      {isDrilldown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* BIỂU ĐỒ THANH NGANG SO SÁNH DOANH SỐ VS CHỈ TIÊU KPI */}
                <div className="mt-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-700">Thực tế:</span>
                      <strong className="font-mono text-sm text-slate-900">{formatVnd(driver.actual_revenue)}</strong>
                    </div>

                    <div className="flex items-center space-x-3 text-right font-mono">
                      <div className="text-slate-500">
                        Chỉ tiêu: <strong className="text-slate-800">{driver.kpi_target > 0 ? formatVnd(driver.kpi_target) : 'Chưa đặt'}</strong>
                      </div>
                      <div>
                        {driver.kpi_percent !== null ? (
                          <span className={`font-bold text-sm ${statusConfig.text}`}>
                            {driver.kpi_percent}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Thanh biểu đồ kép (Doanh thu vs Chỉ tiêu) */}
                  <div className="relative w-full bg-slate-100 h-4 rounded-lg overflow-hidden">
                    {/* Vạch mốc chỉ tiêu KPI */}
                    {driver.kpi_target > 0 && (
                      <div
                        className="absolute top-0 bottom-0 border-r-2 border-slate-900 z-10"
                        style={{ left: `${Math.min(targetPercentOfMax, 100)}%` }}
                        title={`Mốc KPI: ${formatVnd(driver.kpi_target)}`}
                      ></div>
                    )}

                    {/* Thanh doanh thu thực tế */}
                    <div
                      className={`h-full rounded-lg transition-all duration-500 ${statusConfig.bar}`}
                      style={{ width: `${Math.min(actualPercentOfMax, 100)}%` }}
                      title={`Doanh thu: ${formatVnd(driver.actual_revenue)} (${driver.kpi_percent || 0}% KPI)`}
                    ></div>
                  </div>

                  {/* Ghi chú khoảng cách đến đích */}
                  {driver.kpi_target > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                      <span>
                        {driver.actual_revenue >= driver.kpi_target ? (
                          <span className="text-emerald-700 font-semibold">
                            ✓ Đã vượt chỉ tiêu {formatVnd(driver.actual_revenue - driver.kpi_target)}
                          </span>
                        ) : (
                          <span>
                            Còn thiếu <strong className="font-mono text-slate-600">{formatVnd(driver.revenue_gap)}</strong> để đạt 100% KPI
                          </span>
                        )}
                      </span>
                      {driver.last_trip_date && (
                        <span>Cuốc xe gần nhất: {driver.last_trip_date}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bảng con xem chi tiết cuốc xe nếu đang mở */}
                {isDrilldown && (
                  <DriverTripsDrilldown
                    driverId={driver.driver_id}
                    dateFilter={dateFilter}
                    onClose={() => setDrilldownDriverId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ============================================================
           CHẾ ĐỘ 2: BẢNG SỐ LIỆU CHI TIẾT ĐẦY ĐỦ CÁC CỘT (TABLE VIEW)
           ============================================================ */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 font-semibold">Tài Xế & Biển Số</th>
                  <th className="py-3 px-3 font-semibold text-center">Khu Vực</th>
                  <th className="py-3 px-3 font-semibold text-center">Số Cuốc</th>
                  <th className="py-3 px-3 font-semibold text-right">Doanh Thu Kỳ</th>
                  <th className="py-3 px-3 font-semibold text-right">Đã Thu Tiền</th>
                  <th className="py-3 px-3 font-semibold text-right">Chỉ Tiêu KPI</th>
                  <th className="py-3 px-3 font-semibold text-center">Tiến Độ (%)</th>
                  <th className="py-3 px-3 font-semibold text-center">Trạng Thái</th>
                  <th className="py-3 px-4 font-semibold text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedDrivers.map((driver) => {
                  const statusConfig = KPI_STATUS_COLORS[driver.kpi_status] || KPI_STATUS_COLORS.NO_KPI;
                  const isDrilldown = drilldownDriverId === driver.driver_id;

                  return (
                    <React.Fragment key={driver.driver_id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{driver.full_name}</div>
                          <div className="font-mono text-[11px] text-blue-600 font-semibold">{driver.default_vehicle_plate || '—'}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {driver.area_id || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-800">
                          {driver.trip_count}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {formatVnd(driver.actual_revenue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-700 font-semibold">
                          {formatVnd(driver.collected_revenue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-indigo-700">
                          {driver.kpi_target > 0 ? formatVnd(driver.kpi_target) : <span className="text-slate-400 italic">Chưa đặt</span>}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-sm">
                          {driver.kpi_percent !== null ? (
                            <span className={statusConfig.text}>{driver.kpi_percent}%</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusConfig.badge}`}>
                            {driver.kpi_status_label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center space-x-1">
                            <button
                              onClick={() => setSelectedDriverForKpi(driver)}
                              className="px-2 py-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md font-semibold text-[11px] border border-slate-200"
                              title="Đặt KPI"
                            >
                              Đặt KPI
                            </button>
                            <button
                              onClick={() => setDrilldownDriverId(isDrilldown ? null : driver.driver_id)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                              title="Xem cuốc xe"
                            >
                              {isDrilldown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Hàng mở rộng chi tiết cuốc xe */}
                      {isDrilldown && (
                        <tr>
                          <td colSpan={9} className="p-3 bg-slate-50">
                            <DriverTripsDrilldown
                              driverId={driver.driver_id}
                              dateFilter={dateFilter}
                              onClose={() => setDrilldownDriverId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL THIẾT LẬP KPI CHO TÀI XẾ */}
      <KpiTargetModal
        driver={selectedDriverForKpi}
        isOpen={Boolean(selectedDriverForKpi)}
        onClose={() => setSelectedDriverForKpi(null)}
        onSave={handleSaveKpi}
        isDirector={isDirector}
        onSwitchToDirector={handleSwitchToDirector}
        loading={editLoading}
      />
    </div>
  );
}

/**
 * ============================================================
 * DASHBOARD GIÁM ĐỐC: SONG SONG 2 DÒNG TIỀN & P&L (TASK 4.2)
 * ============================================================
 * Tính năng chính:
 * 1. Hiển thị song song 2 dòng tiền:
 *    - Dòng tiền Kỳ vọng (Expected Revenue)
 *    - Dòng tiền Thực thu (Actual Collected)
 *    - Công nợ khách hàng (Pending Receivables)
 * 2. Cơ cấu Chi phí Cố định (Fixed) vs Biến động (Variable) trực quan
 * 3. Tỷ suất Lợi nhuận gộp (Profit Margin %) & Lợi nhuận gộp (Gross Profit)
 * 4. Đồng bộ Real-time SSE tức thì khi có biến động từ bất kỳ đâu
 * 5. Nút 1-chạm Xác nhận thu tiền cuốc xe để kiểm chứng nhảy số tức thì
 * ============================================================
 */
import React, { useState } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Wallet, 
  Clock, 
  PieChart, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  RefreshCw, 
  Truck, 
  Users, 
  ArrowUpRight, 
  ArrowDownRight,
  Layers,
  Fuel,
  Receipt,
  FileCheck,
  Check,
  RotateCcw,
  CreditCard
} from 'lucide-react';
import { markTripPaidApi } from '../services/api.js';

export default function DirectorDashboard({ 
  plData, 
  loading, 
  isConnected, 
  lastEvent, 
  eventCount, 
  lastPulseTime,
  onRefresh, 
  onTriggerSSE, 
  currentUser,
  trips = [],
  dateFilter = {},
  onOpenBatchPayment,
  onNavigateToKpi
}) {
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [showAllDrivers, setShowAllDrivers] = useState(false);

  // Định dạng số nguyên VND
  const formatVnd = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';
  };

  // Thao tác 1-chạm đổi trạng thái thanh toán chuyến xe để xem SSE nhảy số tức thì
  const handleTogglePayment = async (tripId, willBePaid) => {
    try {
      setActionLoadingId(tripId);
      setActionMessage(null);
      const res = await markTripPaidApi(tripId, willBePaid);
      if (res.success) {
        setActionMessage(willBePaid ? 'Đã thu tiền chuyến xe. Tín hiệu SSE đã phát!' : 'Đã hủy thu tiền chuyến xe.');
        if (onRefresh) onRefresh();
      } else {
        alert(res.error || 'Thao tác thất bại');
      }
    } catch (e) {
      alert(e.message || 'Lỗi kết nối máy chủ');
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  if (!plData && loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-700">Đang khởi tạo Real-time P&L Engine...</p>
        <p className="text-xs text-slate-400 mt-1">Đang kết nối Server-Sent Events (SSE) để cập nhật số liệu trực tiếp.</p>
      </div>
    );
  }

  const cf = plData?.cash_flow || {};
  const pnl = plData?.profit_and_loss || {};
  const exp = plData?.expenses_breakdown || {};
  const expDetails = exp.details || {};
  const adv = plData?.advances_overview || {};
  const breakdowns = plData?.breakdowns || {};

  return (
    <div className="space-y-5">
      {/* 1. HEADER DASHBOARD GIÁM ĐỐC & LIVE SSE STATUS BAR */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Trung Tâm Hoạch Toán P&L & Dòng Tiền</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Real-time
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dòng tiền kế hoạch vs Thực thu vs Công nợ • Đồng bộ dữ liệu qua SSE
            {dateFilter.label && (
              <span className="ml-2 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono">
                📅 {dateFilter.label}
              </span>
            )}
            {plData?.filter_info?.description && plData.filter_info.type !== 'ALL' && (
              <span className="text-[11px] text-slate-400 font-mono ml-1">
                ({plData.filter_info.description})
              </span>
            )}
          </p>
        </div>

        {/* SSE Status & Quick Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 text-xs font-medium ${
            isConnected 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
            <span>{isConnected ? 'SSE Trực Tuyến' : 'Mất kết nối'}</span>
            <span className="text-[10px] font-mono text-slate-400">({eventCount})</span>
          </div>

          <button
            onClick={() => onTriggerSSE && onTriggerSSE('Cập nhật dữ liệu từ Dashboard')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-all flex items-center space-x-1"
            title="Gửi tín hiệu kiểm tra đồng bộ số liệu qua SSE"
          >
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="hidden sm:inline">Kiểm tra SSE</span>
          </button>

          <button
            onClick={onRefresh}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg border border-slate-200 transition-colors"
            title="Làm mới thủ công"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Thông báo thao tác nhanh */}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* 2. KHỐI SONG SONG 2 DÒNG TIỀN (CASH FLOW DUEL - CHUẨN DOANH NGHIỆP) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Thẻ 1: Doanh Thu Kế Hoạch */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Doanh Thu Kế Hoạch
              </span>
              <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono tracking-tight">
                {formatVnd(cf.expected_revenue)}
              </h3>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tổng chuyến vận tải:</span>
            <span className="font-semibold text-slate-800">{plData?.trips_overview?.total_trips || 0} cuốc xe</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Tổng doanh thu dự kiến theo các lệnh điều vận.
          </div>
        </div>

        {/* Thẻ 2: Thực Thu Đã Nhận */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Doanh Thu Thực Thu</span>
              </span>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1 font-mono tracking-tight">
                {formatVnd(cf.actual_revenue)}
              </h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Tỷ lệ đã thu hồi:</span>
            <span className="font-bold text-emerald-700 font-mono">
              {cf.collection_rate_percent || 0}%
            </span>
          </div>
          {/* Progress bar thu tiền */}
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(cf.collection_rate_percent || 0, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Thẻ 3: Công Nợ Còn Phải Thu */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Công Nợ Còn Phải Thu</span>
              </span>
              <h3 className="text-2xl font-bold text-amber-800 mt-1 font-mono tracking-tight">
                {formatVnd(cf.pending_receivables)}
              </h3>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Tỷ lệ công nợ còn lại:</span>
            <span className="font-bold text-amber-800 font-mono">
              {100 - (cf.collection_rate_percent || 0)}%
            </span>
          </div>
          {/* Progress bar công nợ */}
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100 - (cf.collection_rate_percent || 0), 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* 3. KHỐI LỢI NHUẬN GỘP & HIỆU SUẤT HOẠT ĐỘNG (P&L METRICS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Lợi nhuận gộp kỳ vọng */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
            <span>Lợi Nhuận Gộp (Kỳ vọng)</span>
          </div>
          <div className={`text-lg font-black font-mono mt-1 ${pnl.expected_gross_profit >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
            {formatVnd(pnl.expected_gross_profit)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Doanh thu kỳ vọng - Toàn bộ chi phí
          </div>
        </div>

        {/* Biên lợi nhuận % */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 flex items-center space-x-1">
            <PieChart className="w-3.5 h-3.5 text-blue-600" />
            <span>Biên Lợi Nhuận Gộp (%)</span>
          </div>
          <div className="text-lg font-black font-mono mt-1 text-blue-700 flex items-center space-x-1">
            <span>{pnl.profit_margin_percent || 0}%</span>
            {pnl.profit_margin_percent >= 30 ? (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                Đạt Chuẩn
              </span>
            ) : (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                Thấp
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Tỷ suất LN gộp / Doanh thu
          </div>
        </div>

        {/* Tổng chi phí vận hành */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 flex items-center space-x-1">
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
            <span>Tổng Chi Phí Hoạt Động</span>
          </div>
          <div className="text-lg font-black font-mono mt-1 text-rose-700">
            {formatVnd(pnl.total_operating_costs)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Biến động + Cố định + Lương lái xe
          </div>
        </div>

        {/* Tạm ứng lái xe còn giữ */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 flex items-center space-x-1">
            <Wallet className="w-3.5 h-3.5 text-amber-600" />
            <span>Dư Nợ Tạm Ứng Tài Xế</span>
          </div>
          <div className="text-lg font-black font-mono mt-1 text-amber-800">
            {formatVnd(adv.pending_balance)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {adv.pending_count || 0} cuốc chưa hoàn ứng
          </div>
        </div>
      </div>

      {/* 4. PHÂN BỔ CHI PHÍ CỐ ĐỊNH VS BIẾN ĐỘNG (TASK 4.2 BIỂU ĐỒ & BẢNG) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-indigo-600" />
              <span>Phân Bổ Chi Phí: Biến Động vs Cố Định</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cơ cấu chi phí trực tiếp trên chuyến xe so với chi phí phân bổ cố định của phương tiện.
            </p>
          </div>
          {exp.anomalies_count > 0 && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>{exp.anomalies_count} Khoản Bất Thường (&gt;25%)</span>
            </span>
          )}
        </div>

        {/* Thanh Tỷ Lệ Stacked Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-blue-600 flex items-center space-x-1">
              <span className="w-2.5 h-2.5 bg-blue-600 rounded-sm"></span>
              <span>Chi Phí Biến Động: {exp.variable_ratio_percent || 0}% ({formatVnd(exp.total_variable)})</span>
            </span>
            <span className="text-amber-600 flex items-center space-x-1">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm"></span>
              <span>Chi Phí Cố Định: {exp.fixed_ratio_percent || 0}% ({formatVnd(exp.total_fixed)})</span>
            </span>
          </div>
          <div className="w-full bg-slate-100 h-4 rounded-xl overflow-hidden flex shadow-inner">
            <div 
              className="bg-blue-600 h-full transition-all duration-500" 
              style={{ width: `${exp.variable_ratio_percent || 50}%` }}
              title={`Biến động: ${exp.variable_ratio_percent}%`}
            ></div>
            <div 
              className="bg-amber-500 h-full transition-all duration-500" 
              style={{ width: `${exp.fixed_ratio_percent || 50}%` }}
              title={`Cố định: ${exp.fixed_ratio_percent}%`}
            ></div>
          </div>
        </div>

        {/* Grid Chi Tiết Từng Loại Chi Phí */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] text-slate-500 block">Nâng Cont</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{formatVnd(expDetails.lift_on)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] text-slate-500 block">Hạ Cont</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{formatVnd(expDetails.lift_off)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] text-slate-500 block">Vé BOT Cầu Đường</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{formatVnd(expDetails.toll_bot)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] text-slate-500 block">Dầu Diesel</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{formatVnd(expDetails.fuel)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] text-slate-500 block">Cước Thuê Ngoài</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{formatVnd(expDetails.subcontractor)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[11px] text-slate-500 block">Lương Công Chuyến</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{formatVnd(expDetails.driver_salary)}</span>
          </div>
        </div>
      </div>

      {/* 5. PHÂN HỆ ĐỐI SOÁT & XÁC NHẬN THU CƯỚC */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
              <FileCheck className="w-4 h-4 text-slate-700" />
              <span>Đối Soát & Xác Nhận Thu Cước Chuyến Xe</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Xác nhận thu cước từng chuyến để cập nhật dòng tiền tức thì vào hệ thống P&L.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenBatchPayment && (
              <button
                onClick={() => onOpenBatchPayment()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all flex items-center space-x-1.5 active:scale-95"
                title="Thanh toán gộp cả lô nhiều chuyến theo bảng kê"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Thanh Toán Bảng Kê</span>
              </button>
            )}
            <span className="text-[11px] text-slate-400 hidden sm:inline font-mono">
              (8 chuyến gần nhất)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                <th className="pb-2.5 font-semibold">Mã Cuốc</th>
                <th className="pb-2.5 font-semibold">Ngày Chuyến</th>
                <th className="pb-2.5 font-semibold">Khách Hàng</th>
                <th className="pb-2.5 font-semibold">Tuyến Đường</th>
                <th className="pb-2.5 font-semibold text-right">Tổng Cước</th>
                <th className="pb-2.5 font-semibold text-center">Trạng Thái</th>
                <th className="pb-2.5 font-semibold text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.slice(0, 8).map((t) => {
                const isPaid = t.status === 'PAID' || t.eir_paid_status === 'DA_TT';
                const isProcessing = actionLoadingId === t.id;

                return (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 font-mono font-bold text-blue-600">
                      {t.trip_code}
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {t.trip_date}
                    </td>
                    <td className="py-2.5 font-medium text-slate-900">
                      {t.customer_name}
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {t.route_name}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                      {formatVnd(t.total_revenue)}
                    </td>
                    <td className="py-2.5 text-center">
                      {isPaid ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>ĐÃ THU</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>CHƯA THU (NỢ)</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {isPaid ? (
                        <button
                          onClick={() => handleTogglePayment(t.id, false)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 rounded-lg transition-all inline-flex items-center space-x-1"
                          title="Hủy đánh dấu thanh toán (chuyển về nợ)"
                        >
                          <RotateCcw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                          <span>Hủy thu</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTogglePayment(t.id, true)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-lg shadow-xs transition-all inline-flex items-center space-x-1"
                          title="Xác nhận thu tiền cước ngay lập tức"
                        >
                          <Check className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                          <span>✔ Thu Tiền</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. BA BẢNG CON: DOANH THU TÀI XẾ, TOP KHÁCH HÀNG & HIỆU SUẤT ĐẦU XE */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Khối 1: Doanh Thu Từng Tài Xế (Đầy đủ, trực quan & chi tiết) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Doanh Thu Từng Tài Xế</span>
              {(breakdowns.drivers || []).length > 0 && (
                <span className="text-[10px] font-normal font-mono bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                  {(breakdowns.drivers || []).length}
                </span>
              )}
            </h4>
            {onNavigateToKpi && (
              <button
                onClick={onNavigateToKpi}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center space-x-1"
                title="Mở bảng báo cáo chi tiết & đặt KPI cho từng tài xế"
              >
                <span>Xem KPI</span>
                <span>→</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            {(breakdowns.drivers || []).length === 0 ? (
              <p className="text-xs text-slate-400 italic py-3 text-center">Chưa có dữ liệu chuyến xe của tài xế.</p>
            ) : (
              (showAllDrivers ? (breakdowns.drivers || []) : (breakdowns.drivers || []).slice(0, 4)).map((d, idx) => {
                const isExternal = !d.driver_id;
                return (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 hover:bg-slate-100/70 transition-colors">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="font-bold text-slate-900 truncate">{d.driver_name}</span>
                        {d.vehicle_plate && (
                          <span className={`font-mono text-[10px] px-1 py-0.2 rounded border shrink-0 ${
                            isExternal ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-blue-700 bg-blue-50 border-blue-200'
                          }`}>
                            {d.vehicle_plate}
                          </span>
                        )}
                        {d.area_id && (
                          <span className="text-[9px] text-slate-400 font-mono hidden sm:inline">({d.area_id})</span>
                        )}
                      </div>
                      <div className="text-right shrink-0 font-mono font-bold text-slate-900">
                        {formatVnd(d.total_revenue)}
                      </div>
                    </div>

                    {/* Progress bar tỷ trọng doanh thu */}
                    <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isExternal ? 'bg-amber-500' : 'bg-emerald-600'}`}
                        style={{ width: `${Math.min(d.revenue_share_percent || 0, 100)}%` }}
                        title={`Tỷ trọng: ${d.revenue_share_percent || 0}%`}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {d.trip_count} cuốc • Thu: <b className="text-emerald-700 font-mono">{formatVnd(d.collected_revenue)}</b>
                        {d.receivable > 0 && (
                          <span className="text-amber-600 font-mono ml-1.5">(Nợ: {formatVnd(d.receivable)})</span>
                        )}
                      </span>
                      <span className="text-slate-400">
                        {isExternal ? `Cước ngoài: ${formatVnd(d.salary)}` : `Lương: ${formatVnd(d.salary)}`}
                        {d.revenue_share_percent > 0 && <b className="text-slate-700 ml-1">({d.revenue_share_percent}%)</b>}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Nút xem thêm / thu gọn & nút mở phân hệ KPI */}
          <div className="pt-1 flex items-center justify-between border-t border-slate-100 text-[11px]">
            {(breakdowns.drivers || []).length > 4 ? (
              <button
                onClick={() => setShowAllDrivers(!showAllDrivers)}
                className="font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {showAllDrivers ? '↑ Thu gọn' : `↓ Xem tất cả ${(breakdowns.drivers || []).length} tài xế`}
              </button>
            ) : <span />}

            {onNavigateToKpi && (
              <button
                onClick={onNavigateToKpi}
                className="font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center space-x-1"
              >
                <span>Báo Cáo Doanh Thu & KPI</span>
                <span>→</span>
              </button>
            )}
          </div>
        </div>

        {/* Khối 2: Top Khách Hàng (Doanh Thu & Công Nợ) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Receipt className="w-4 h-4 text-indigo-600" />
              <span>Top Khách Hàng (Cước & Nợ)</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">Top 5</span>
          </h4>
          <div className="space-y-2">
            {(breakdowns.customers || []).slice(0, 5).map((c, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{c.customer_name}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{c.trip_count} cuốc xe</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900 block">{formatVnd(c.total_revenue)}</span>
                  {c.receivable > 0 ? (
                    <div className="flex items-center justify-end space-x-1.5 mt-0.5">
                      <span className="text-[10px] font-semibold text-amber-600">Nợ: {formatVnd(c.receivable)}</span>
                      {onOpenBatchPayment && (
                        <button
                          onClick={() => onOpenBatchPayment(c.customer_name)}
                          className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded transition-colors active:scale-95"
                          title={`Thu gộp nợ cho khách ${c.customer_name}`}
                        >
                          Thu lô
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-600">Đã thu đủ 100%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Khối 3: Hiệu Suất Từng Đầu Xe */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>Hiệu Suất Từng Đầu Xe</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">Đội xe</span>
          </h4>
          <div className="space-y-2">
            {(breakdowns.vehicles || []).slice(0, 5).map((v, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-blue-700">{v.vehicle_plate}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{v.trip_count} cuốc đã chạy</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-emerald-700 block">{formatVnd(v.revenue)}</span>
                  <span className="text-[10px] text-slate-500">Lương lái: {formatVnd(v.salary)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

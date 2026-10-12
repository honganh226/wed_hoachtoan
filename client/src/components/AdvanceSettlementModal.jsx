import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  Coins, 
  PlusCircle, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Truck, 
  User, 
  Calendar, 
  FileText, 
  ArrowRightLeft, 
  Clock, 
  Check, 
  Filter,
  DollarSign,
  TrendingDown,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { 
  fetchAdvances, 
  fetchAdvanceSummary, 
  createAdvanceApi, 
  settleAdvanceApi, 
  fetchTrips 
} from '../services/api.js';

export default function AdvanceSettlementModal({ 
  isOpen, 
  onClose, 
  currentUser,
  targetTrip = null,
  onUpdated = null
}) {
  const [activeTab, setActiveTab] = useState(targetTrip ? 'CREATE' : 'LIST'); // 'LIST' | 'CREATE'
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'PENDING' | 'SETTLED'
  const [advances, setAdvances] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tripsList, setTripsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  // Form Xuất Ứng Mới
  const [selectedTripId, setSelectedTripId] = useState(targetTrip?.id || '');
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [advanceAmount, setAdvanceAmount] = useState(1500000); // 1.500.000 đ mặc định
  const [notes, setNotes] = useState('Tạm ứng dầu & vé cầu đường BOT');

  // Inline Settle State
  const [settlingId, setSettlingId] = useState(null);
  const [settledAmountInput, setSettledAmountInput] = useState('');
  const [settleNotes, setSettleNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErr(null);
      setMsg(null);
      setSettlingId(null);
      if (targetTrip) {
        setSelectedTripId(targetTrip.id);
        setActiveTab('CREATE');
      }
      loadData();
    }
  }, [isOpen, targetTrip, filterStatus]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus !== 'ALL') params.status = filterStatus;

      const [advRes, sumRes, tripsRes] = await Promise.all([
        fetchAdvances(params).catch(() => ({ success: false })),
        fetchAdvanceSummary().catch(() => ({ success: false })),
        fetchTrips(50).catch(() => ({ success: false }))
      ]);

      if (advRes.success) setAdvances(advRes.data?.items || []);
      if (sumRes.success) setSummary(sumRes.data);
      if (tripsRes.success) setTripsList(tripsRes.data || []);

      if (tripsRes.data?.length > 0 && !selectedTripId) {
        setSelectedTripId(tripsRes.data[0].id);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdvance = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErr(null);
      setMsg(null);

      const targetTripObj = tripsList.find(t => t.id === selectedTripId);

      const payload = {
        trip_id: selectedTripId,
        driver_id: targetTripObj?.driver_id || null,
        advance_date: advanceDate,
        advance_amount: Math.round(Number(advanceAmount) || 0),
        notes: notes
      };

      const res = await createAdvanceApi(payload);
      if (res.success) {
        setMsg(`Xuất tạm ứng thành công ${formatVnd(payload.advance_amount)} cho chuyến ${res.data.trip_code}!`);
        await loadData();
        setActiveTab('LIST');
        if (onUpdated) onUpdated();
      } else {
        setErr(res.error || 'Xuất tạm ứng thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartSettle = (item) => {
    setSettlingId(item.id);
    setSettledAmountInput(item.settled_amount > 0 ? item.settled_amount : item.advance_amount);
    setSettleNotes('');
  };

  const handleConfirmSettle = async (item) => {
    try {
      setSubmitting(true);
      setErr(null);
      setMsg(null);

      const settledVal = Math.round(Number(settledAmountInput) || 0);
      const res = await settleAdvanceApi(item.id, settledVal, settleNotes);

      if (res.success) {
        const bal = res.data.balance_amount;
        const balText = bal > 0 
          ? `Tài xế thừa ${formatVnd(bal)} nộp quỹ`
          : bal < 0 
          ? `Quỹ bù tài xế ${formatVnd(Math.abs(bal))}`
          : 'Khớp hoàn toàn';
        setMsg(`Quyết toán hoàn ứng thành công (${balText})!`);
        setSettlingId(null);
        await loadData();
        if (onUpdated) onUpdated();
      } else {
        setErr(res.error || 'Quyết toán thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatVnd = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';
  };

  if (!isOpen) return null;

  const canManage = currentUser?.role === 'DIRECTOR' || currentUser?.role === 'ACCOUNTANT' || currentUser?.role === 'AREA_MANAGER';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-600 rounded-xl">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-800 text-emerald-200">
                  Task 3.3
                </span>
                <h3 className="font-bold text-base">Phân Hệ Tạm Ứng Trước Chuyến & Quyết Toán Hoàn Ứng</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Xuất quỹ trước khi chạy xe, kiểm tra phơi/vé thực tế, tự tính tiền thừa nộp quỹ hoặc tiền công ty bù
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo lỗi / thành công */}
        {err && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{err}</span>
          </div>
        )}
        {msg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{msg}</span>
          </div>
        )}

        {/* Dashboard Thống Kê Mini */}
        <div className="px-6 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-500 font-medium flex items-center space-x-1">
              <Coins className="w-3.5 h-3.5 text-blue-600" />
              <span>Tổng Đã Xuất Ứng</span>
            </span>
            <p className="text-base font-bold text-slate-900 mt-1">
              {formatVnd(summary?.total_advance)}
            </p>
            <span className="text-[10px] text-slate-400">{summary?.total_count || 0} phiếu</span>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
            <span className="text-[11px] text-amber-800 font-medium flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Đang Chờ Hoàn Ứng</span>
            </span>
            <p className="text-base font-bold text-amber-900 mt-1">
              {formatVnd(summary?.pending_amount)}
            </p>
            <span className="text-[10px] text-amber-600 font-semibold">{summary?.pending_count || 0} phiếu chờ</span>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <span className="text-[11px] text-emerald-800 font-medium flex items-center space-x-1">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đã Quyết Toán Thực Chi</span>
            </span>
            <p className="text-base font-bold text-emerald-900 mt-1">
              {formatVnd(summary?.total_settled)}
            </p>
            <span className="text-[10px] text-emerald-600 font-semibold">{summary?.settled_count || 0} phiếu đã chốt</span>
          </div>

          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
            <span className="text-[11px] text-indigo-800 font-medium flex items-center space-x-1">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
              <span>Thừa Nộp Quỹ / Bù</span>
            </span>
            <p className="text-base font-bold text-indigo-900 mt-1">
              +{formatVnd(summary?.surplus_amount)}
            </p>
            <span className="text-[10px] text-slate-500">
              (Bù tài xế: {formatVnd(summary?.deficit_amount)})
            </span>
          </div>
        </div>

        {/* Thanh chuyển Tab */}
        <div className="px-6 pt-4 flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('LIST')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'LIST'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Danh Sách Phiếu & Quyết Toán ({advances.length})
            </button>
            {canManage && (
              <button
                onClick={() => setActiveTab('CREATE')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'CREATE'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Xuất Phiếu Tạm Ứng Mới</span>
              </button>
            )}
          </div>

          {activeTab === 'LIST' && (
            <div className="flex items-center space-x-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  filterStatus === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setFilterStatus('PENDING')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  filterStatus === 'PENDING' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                Chờ hoàn ứng
              </button>
              <button
                onClick={() => setFilterStatus('SETTLED')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  filterStatus === 'SETTLED' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Đã hoàn ứng
              </button>
            </div>
          )}
        </div>

        {/* Nội dung theo Tab */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {/* TAB 1: DANH SÁCH & QUYẾT TOÁN */}
          {activeTab === 'LIST' && (
            <div className="space-y-3">
              {advances.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Wallet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="font-medium text-sm">Chưa có phiếu tạm ứng nào</p>
                  <p className="text-xs text-slate-400 mt-1">Bấm "+ Xuất Phiếu Tạm Ứng Mới" để tạo phiếu đầu tiên.</p>
                </div>
              ) : (
                advances.map((item) => {
                  const isSettling = settlingId === item.id;
                  const currentBalance = item.advance_amount - (Math.round(Number(settledAmountInput) || 0));

                  return (
                    <div 
                      key={item.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        item.status === 'PENDING' 
                          ? 'bg-amber-50/30 border-amber-200' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-blue-600 text-xs">{item.trip_code}</span>
                          <span className="font-semibold text-slate-800">{item.vehicle_plate}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-medium">Tài xế: <b>{item.driver_name}</b></span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span>{item.advance_date}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'PENDING' 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {item.status === 'PENDING' ? '⏳ Chờ Hoàn Ứng' : '✓ Đã Quyết Toán'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Số tiền xuất ứng:</span>
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {formatVnd(item.advance_amount)}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block">Thực chi theo phơi:</span>
                          <span className="font-mono font-bold text-indigo-700 text-sm">
                            {item.status === 'SETTLED' ? formatVnd(item.settled_amount) : 'Chưa nhập'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block">Chênh lệch hoàn ứng:</span>
                          {item.status === 'SETTLED' ? (
                            <span className={`font-mono font-bold text-xs flex items-center space-x-0.5 ${
                              item.balance_amount > 0 
                                ? 'text-emerald-700' 
                                : item.balance_amount < 0 
                                ? 'text-rose-700' 
                                : 'text-slate-600'
                            }`}>
                              {item.balance_amount > 0 && <span>+ Thừa nộp quỹ: {formatVnd(item.balance_amount)}</span>}
                              {item.balance_amount < 0 && <span>- Bù tài xế: {formatVnd(Math.abs(item.balance_amount))}</span>}
                              {item.balance_amount === 0 && <span>Khớp 0 ₫</span>}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-italic text-xs">Đang chờ phơi</span>
                          )}
                        </div>

                        <div className="flex items-center justify-end">
                          {canManage && (
                            item.status === 'PENDING' ? (
                              <button
                                onClick={() => handleStartSettle(item)}
                                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs active:scale-95 transition-all flex items-center space-x-1"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Quyết Toán Ngay</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStartSettle(item)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition-all flex items-center space-x-1"
                              >
                                <RotateCcw className="w-3 h-3 text-slate-500" />
                                <span>Sửa Quyết Toán</span>
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {item.notes && (
                        <p className="mt-2 text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                          Ghi chú: {item.notes}
                        </p>
                      )}

                      {/* INLINE FORM QUYẾT TOÁN HOÀN ỨNG */}
                      {isSettling && (
                        <div className="mt-3 p-3 bg-amber-100/60 border border-amber-300 rounded-xl space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-900 text-xs flex items-center space-x-1">
                              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700" />
                              <span>Nhập Số Liệu Quyết Toán Hoàn Ứng Cho Chuyến {item.trip_code}</span>
                            </span>
                            <button 
                              onClick={() => setSettlingId(null)}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Số Tiền Thực Chi Theo Phơi / Vé (VND) <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                step="1000"
                                required
                                value={settledAmountInput}
                                onChange={(e) => setSettledAmountInput(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs font-mono font-bold text-slate-900 border border-amber-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Tự Động Tính Cân Đối Quỹ:
                              </label>
                              <div className={`p-2 rounded-xl text-xs font-bold border flex items-center justify-between ${
                                currentBalance > 0 
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                                  : currentBalance < 0 
                                  ? 'bg-rose-50 text-rose-800 border-rose-300' 
                                  : 'bg-slate-50 text-slate-700 border-slate-300'
                              }`}>
                                <span>{currentBalance > 0 ? '🟢 Thừa nộp lại quỹ:' : currentBalance < 0 ? '🔴 Quỹ bù tài xế:' : 'Khớp:'}</span>
                                <span className="font-mono text-sm">{formatVnd(Math.abs(currentBalance))}</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Ghi chú quyết toán (chi tiết hóa đơn dầu, vé cầu đường, nâng hạ...)
                            </label>
                            <input
                              type="text"
                              value={settleNotes}
                              onChange={(e) => setSettleNotes(e.target.value)}
                              placeholder="VD: Dầu 1.200k, Vé BOT 100k, Phí nâng 200k..."
                              className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-xl bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center justify-end space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setSettlingId(null)}
                              className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800"
                            >
                              Hủy Bỏ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmSettle(item)}
                              disabled={submitting}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs active:scale-95 transition-all flex items-center space-x-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{submitting ? 'Đang Lưu...' : 'Xác Nhận Quyết Toán'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: XUẤT PHIẾU TẠM ỨNG MỚI */}
          {activeTab === 'CREATE' && (
            <form onSubmit={handleCreateAdvance} className="space-y-4 max-w-xl mx-auto py-2">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs flex items-center space-x-2">
                <Coins className="w-4 h-4 shrink-0 text-blue-600" />
                <span>Xuất quỹ tiền mặt / chuyển khoản cho tài xế trước khi khởi hành. Số tiền này sẽ được đối trừ khi tài xế nộp phơi chuyến.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chọn Chuyến Xe Vận Chuyển <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                >
                  <option value="">-- Chọn chuyến xe --</option>
                  {tripsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.trip_code} • Xe: {t.vehicle_plate} • Lái: {t.driver_name} • Tuyến: {t.route_name} ({t.trip_date})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ngày Xuất Quỹ Tạm Ứng <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={advanceDate}
                    onChange={(e) => setAdvanceDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số Tiền Tạm Ứng (VND) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="10000"
                    required
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">{formatVnd(advanceAmount)}</span>
                </div>
              </div>

              {/* Nút chọn nhanh số tiền */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                  Chọn nhanh định mức ứng:
                </label>
                <div className="flex flex-wrap gap-2">
                  {[500000, 1000000, 1500000, 2000000, 3000000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAdvanceAmount(amt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                        Number(advanceAmount) === amt
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {formatVnd(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mục Đích / Ghi Chú Tạm Ứng
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="VD: Ứng tiền dầu Hải Phòng - Lào Cai, vé BOT..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('LIST')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center space-x-2"
                >
                  <Coins className="w-4 h-4" />
                  <span>{submitting ? 'Đang Xuất Quỹ...' : 'Xác Nhận Xuất Tạm Ứng'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Quy chuẩn: Tiền tệ số nguyên VND • Ghi vết kiểm toán Audit Log tự động</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

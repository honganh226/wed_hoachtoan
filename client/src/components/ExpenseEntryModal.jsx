import React, { useState, useEffect } from 'react';
import { 
  X, 
  Receipt, 
  AlertTriangle, 
  CheckCircle2, 
  PlusCircle, 
  Trash2, 
  Edit3, 
  TrendingUp, 
  Coins, 
  DollarSign, 
  Flame, 
  ShieldAlert, 
  Layers, 
  Calendar, 
  Truck, 
  Tag, 
  RefreshCw,
  Info
} from 'lucide-react';
import { 
  fetchTripExpenses, 
  fetchExpenseTypes, 
  createExpenseApi, 
  updateExpenseApi, 
  deleteExpenseApi, 
  evaluateExpenseAnomalyApi,
  fetchExpenses
} from '../services/api.js';

export default function ExpenseEntryModal({
  isOpen,
  onClose,
  targetTrip = null,
  allTrips = [],
  currentUser = null,
  onUpdated = () => {}
}) {
  const [selectedTripId, setSelectedTripId] = useState(targetTrip?.id || (allTrips[0]?.id || ''));
  const [tripData, setTripData] = useState(null);
  const [expenseList, setExpenseList] = useState([]);
  const [warnings, setWarnings] = useState({ redFlags: [], yellowFlags: [], summary: {} });
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  // Chế độ xem: 'TRIP_EXPENSES' hoặc 'ANOMALY_MONITOR' (Giám sát toàn bộ cảnh báo chi phí)
  const [viewTab, setViewTab] = useState('TRIP_EXPENSES');
  const [allAnomalies, setAllAnomalies] = useState([]);

  // Form State thêm/sửa chi phí
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    expense_type: 'TOLL_BOT',
    category: 'VARIABLE',
    amount: '',
    note: '',
    expense_date: ''
  });

  // Real-time Anomaly preview khi người dùng đang nhập form
  const [liveAnomaly, setLiveAnomaly] = useState(null);

  // Load danh mục loại chi phí
  useEffect(() => {
    if (isOpen) {
      fetchExpenseTypes().then(res => {
        if (res.success) setExpenseTypes(res.data);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Cập nhật selectedTripId khi targetTrip thay đổi
  useEffect(() => {
    if (targetTrip?.id) {
      setSelectedTripId(targetTrip.id);
    } else if (allTrips.length > 0 && !selectedTripId) {
      setSelectedTripId(allTrips[0].id);
    }
  }, [targetTrip, allTrips]);

  // Load dữ liệu chi phí của chuyến đang chọn
  const loadTripExpenses = async (tripId) => {
    if (!tripId) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetchTripExpenses(tripId);
      if (res.success) {
        setTripData(res.data.trip);
        setExpenseList(res.data.expenses || []);
        setWarnings(res.data.warnings || { redFlags: [], yellowFlags: [], summary: {} });
        setFormData(prev => ({
          ...prev,
          expense_date: res.data.trip.trip_date || ''
        }));
      } else {
        setErr(res.error || 'Không tải được chi phí chuyến xe');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Load danh sách toàn bộ cảnh báo bất thường (>25%) trên hệ thống
  const loadAllAnomalies = async () => {
    try {
      const res = await fetchExpenses({ is_anomaly: true, limit: 100 });
      if (res.success) {
        setAllAnomalies(res.data.items || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen && selectedTripId && viewTab === 'TRIP_EXPENSES') {
      loadTripExpenses(selectedTripId);
    } else if (isOpen && viewTab === 'ANOMALY_MONITOR') {
      loadAllAnomalies();
    }
  }, [isOpen, selectedTripId, viewTab]);

  // Real-time đánh giá bất thường khi nhập Amount hoặc đổi Type
  useEffect(() => {
    const rawAmt = parseInt(formData.amount || 0, 10);
    if (!rawAmt || !selectedTripId) {
      setLiveAnomaly(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await evaluateExpenseAnomalyApi({
          expenseType: formData.expense_type,
          amount: rawAmt,
          tripId: selectedTripId
        });
        if (res.success) {
          setLiveAnomaly(res.data);
        }
      } catch (e) {}
    }, 250);

    return () => clearTimeout(timer);
  }, [formData.amount, formData.expense_type, selectedTripId]);

  if (!isOpen) return null;

  const formatVnd = (num) => {
    return new Intl.NumberFormat('vi-VN').format(num || 0) + ' ₫';
  };

  const handleTripChange = (e) => {
    setSelectedTripId(e.target.value);
    setEditingId(null);
    setMsg(null);
    setErr(null);
  };

  const handleEditClick = (exp) => {
    setEditingId(exp.id);
    setFormData({
      expense_type: exp.expense_type,
      category: exp.category,
      amount: exp.amount,
      note: exp.note || '',
      expense_date: exp.expense_date || (tripData?.trip_date || '')
    });
    setMsg(null);
    setErr(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      expense_type: 'TOLL_BOT',
      category: 'VARIABLE',
      amount: '',
      note: '',
      expense_date: tripData?.trip_date || ''
    });
    setLiveAnomaly(null);
  };

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    const rawAmt = parseInt(formData.amount || 0, 10);
    if (isNaN(rawAmt) || rawAmt <= 0) {
      setErr('Vui lòng nhập số tiền chi phí lớn hơn 0.');
      return;
    }

    try {
      setSaving(true);
      setErr(null);
      setMsg(null);

      if (editingId) {
        // Cập nhật
        const res = await updateExpenseApi(editingId, {
          expense_type: formData.expense_type,
          category: formData.category,
          amount: rawAmt,
          note: formData.note,
          expense_date: formData.expense_date
        });
        if (res.success) {
          setMsg(`Cập nhật chi phí thành công! ${res.data.anomalyInfo?.isAnomaly ? '🔴 (Đã ghi nhận cảnh báo bất thường)' : ''}`);
          handleCancelEdit();
          await loadTripExpenses(selectedTripId);
          onUpdated();
        } else {
          setErr(res.error || 'Cập nhật thất bại');
        }
      } else {
        // Thêm mới
        const res = await createExpenseApi({
          trip_id: selectedTripId,
          vehicle_id: tripData?.vehicle_id,
          expense_type: formData.expense_type,
          category: formData.category,
          amount: rawAmt,
          note: formData.note,
          expense_date: formData.expense_date || tripData?.trip_date
        });
        if (res.success) {
          setMsg(`Thêm chi phí thành công! ${res.data.anomalyInfo?.isAnomaly ? '🔴 (Phát hiện chênh lệch > 25% so với tuyến chuẩn)' : ''}`);
          handleCancelEdit();
          await loadTripExpenses(selectedTripId);
          onUpdated();
        } else {
          setErr(res.error || 'Thêm chi phí thất bại');
        }
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expId, label) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa khoản chi phí [${label}] này?`)) return;

    try {
      setSaving(true);
      setErr(null);
      const res = await deleteExpenseApi(expId);
      if (res.success) {
        setMsg('Đã xóa khoản chi phí thành công.');
        await loadTripExpenses(selectedTripId);
        onUpdated();
      } else {
        setErr(res.error || 'Xóa chi phí thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh]">
        {/* Header Modal */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center space-x-2">
                <span>Nhập Chi Phí Thực Tế & Cảnh Báo Bất Thường</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-blue-600 text-white rounded-md uppercase">
                  Task 3.4
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Phân loại Cố định vs Biến động • Cờ đỏ 🔴 chênh lệch &gt; 25% • Cờ vàng 🟡 nghi quên nhập
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation & Selector */}
        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewTab('TRIP_EXPENSES')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                viewTab === 'TRIP_EXPENSES'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Chi Phí Theo Cuốc Xe</span>
            </button>
            <button
              onClick={() => setViewTab('ANOMALY_MONITOR')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                viewTab === 'ANOMALY_MONITOR'
                  ? 'bg-rose-50 text-rose-700 shadow-xs border border-rose-200'
                  : 'text-slate-600 hover:text-rose-600'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>Giám Sát Cảnh Báo 🔴 (&gt;25%)</span>
            </button>
          </div>

          {viewTab === 'TRIP_EXPENSES' && (
            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Chọn cuốc xe:</label>
              <select
                value={selectedTripId}
                onChange={handleTripChange}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-semibold text-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 max-w-[240px]"
              >
                {allTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.trip_code} - {t.vehicle_plate} ({t.route_name})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Thông báo Alert */}
          {msg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{msg}</span>
            </div>
          )}
          {err && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          {viewTab === 'ANOMALY_MONITOR' ? (
            /* TAB 2: GIÁM SÁT TOÀN BỘ CẢNH BÁO BẤT THƯỜNG TRÊN TOÀN BỘ HỆ THỐNG */
            <div className="space-y-4">
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start space-x-3">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-900">
                  <div className="font-bold text-sm">Trung Tâm Giám Sát Chi Phí Bất Thường (Anomaly Center)</div>
                  <p className="mt-0.5 text-rose-700">
                    Thuật toán tự động gắn cờ 🔴 Đỏ cho bất kỳ khoản vé BOT, tiền dầu hay chi phí nào chênh lệch vượt 25% định mức chuẩn của tuyến đường, hỗ trợ Giám Đốc và Kế Toán phát hiện gian lận hoặc sai sót nhập liệu ngay tức thì.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="p-3">Mã Cuốc & Ngày</th>
                      <th className="p-3">Xe / Lái xe</th>
                      <th className="p-3">Tuyến Đường</th>
                      <th className="p-3">Khoản Chi Phí</th>
                      <th className="p-3 text-right">Số Tiền Thực Tế</th>
                      <th className="p-3">Chi Tiết Cảnh Báo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allAnomalies.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          Chưa có khoản chi phí nào bị gắn cờ bất thường (&gt;25%).
                        </td>
                      </tr>
                    ) : (
                      allAnomalies.map((ano) => (
                        <tr key={ano.id} className="hover:bg-rose-50/40">
                          <td className="p-3">
                            <span className="font-mono font-bold text-blue-600">{ano.trip_code || 'Chi phí xe'}</span>
                            <div className="text-[10px] text-slate-400">{ano.expense_date}</div>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-slate-800">{ano.vehicle_plate || 'N/A'}</span>
                            <div className="text-[10px] text-slate-500">{ano.driver_name}</div>
                          </td>
                          <td className="p-3 text-slate-700 font-medium">
                            {ano.route_name || 'N/A'}
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {ano.expense_type}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-rose-600">
                            {formatVnd(ano.amount)}
                          </td>
                          <td className="p-3 text-slate-600 text-[11px]">
                            <span className="inline-flex items-center space-x-1 text-rose-700 font-medium">
                              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                              <span>{ano.note || 'Lệch > 25% định mức tuyến'}</span>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* TAB 1: CHI PHÍ THEO CUỐC XE HIỆN TẠI */
            <div className="space-y-5">
              {/* Box 1: Thông tin tuyến và Định mức chuẩn */}
              {tripData && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                      <Truck className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-900">
                        {tripData.trip_code} • {tripData.customer_name} • Xe: <span className="text-blue-700">{tripData.vehicle_plate}</span>
                      </span>
                      <span className="text-slate-400">({tripData.trip_date})</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Tuyến: <span className="font-bold text-slate-800">{tripData.route_name}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Doanh Thu Cuốc</span>
                      <span className="text-xs font-bold font-mono text-emerald-600">
                        {formatVnd(tripData.total_revenue)}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Tổng Chi Phí Thực Tế</span>
                      <span className="text-xs font-bold font-mono text-rose-600">
                        {formatVnd(warnings.summary?.totalTripExpense)}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">BOT Định Mức Tuyến</span>
                      <span className="text-xs font-bold font-mono text-slate-700">
                        {formatVnd(tripData.default_toll || 200000)}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Định Mức Dầu Diesel</span>
                      <span className="text-xs font-bold text-slate-700">
                        {tripData.default_fuel_liters ? `${tripData.default_fuel_liters} Lít` : '65 Lít (~1.3M)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Box 2: Cảnh báo Cờ Đỏ & Cờ Vàng */}
              {(warnings.redFlags.length > 0 || warnings.yellowFlags.length > 0) && (
                <div className="space-y-2">
                  {/* Cờ Đỏ 🔴 */}
                  {warnings.redFlags.map((rf, idx) => (
                    <div key={`rf-${idx}`} className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-start space-x-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Cảnh báo bất thường ({rf.label}): </span>
                        <span>Số tiền {formatVnd(rf.amount)} chênh lệch &gt; 25% so với định mức tuyến. ({rf.note})</span>
                      </div>
                    </div>
                  ))}

                  {/* Cờ Vàng 🟡 */}
                  {warnings.yellowFlags.map((yf, idx) => (
                    <div key={`yf-${idx}`} className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Nghi vấn thiếu sót: </span>
                        <span>{yf.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Box 3: Form Thêm / Chỉnh Sửa Chi Phí Nhanh */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                    {editingId ? <Edit3 className="w-3.5 h-3.5 text-blue-600" /> : <PlusCircle className="w-3.5 h-3.5 text-blue-600" />}
                    <span>{editingId ? 'Chỉnh Sửa Khoản Chi Phí' : 'Thêm Khoản Chi Phí Thực Tế Mới'}</span>
                  </h3>
                  {editingId && (
                    <button
                      onClick={handleCancelEdit}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Hủy sửa / Thêm mới
                    </button>
                  )}
                </div>

                <form onSubmit={handleSubmitExpense} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {/* Loại chi phí */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Loại Chi Phí *</label>
                      <select
                        value={formData.expense_type}
                        onChange={(e) => setFormData({ ...formData, expense_type: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500"
                      >
                        {expenseTypes.map((t) => (
                          <option key={t.key} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Phân loại Cố định / Biến động */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Phân Loại *</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="VARIABLE">Biến động (Theo chuyến)</option>
                        <option value="FIXED">Cố định (Theo xe/tháng)</option>
                      </select>
                    </div>

                    {/* Số tiền (1 ô nhập chuẩn VND Integer) */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Số Tiền (VND nguyên) *
                      </label>
                      <input
                        type="number"
                        step="1000"
                        min="0"
                        placeholder="VD: 300000"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Ngày chi phí */}
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">Ngày Phát Sinh</label>
                      <input
                        type="date"
                        value={formData.expense_date}
                        onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Diễn giải chi tiết */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">Ghi Chú / Diễn Giải Chứng Từ</label>
                    <input
                      type="text"
                      placeholder="VD: Vé BOT cao tốc Nội Bài - Lào Cai, Tiền nâng cảng Tân Vũ, Sửa vỏ cont rách bạt..."
                      value={formData.note}
                      onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 text-slate-800"
                    />
                  </div>

                  {/* Real-time Live Anomaly Badge khi gõ phím */}
                  {liveAnomaly && liveAnomaly.isAnomaly === 1 && (
                    <div className="p-2.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center space-x-2 animate-pulse">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{liveAnomaly.reason}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{editingId ? 'Lưu Thay Đổi' : 'Thêm Khoản Chi Phí'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Box 4: Danh Sách Chi Phí Đã Nhập Của Chuyến */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase">
                    Danh Sách Chi Phí Của Cuốc Xe ({expenseList.length} khoản)
                  </span>
                  <span className="text-xs font-bold font-mono text-slate-900">
                    Tổng: {formatVnd(warnings.summary?.totalTripExpense)}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {expenseList.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Chưa có khoản chi phí nào cho cuốc xe này. Dùng form phía trên để thêm chi phí thực tế.
                    </div>
                  ) : (
                    expenseList.map((exp) => (
                      <div key={exp.id} className="p-3.5 hover:bg-slate-50 flex items-center justify-between text-xs">
                        <div className="flex items-start space-x-3">
                          <div className={`p-2 rounded-lg ${exp.is_anomaly ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                            {exp.is_anomaly ? <AlertTriangle className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-800">
                                {exp.expense_type}
                              </span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                                exp.category === 'FIXED' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {exp.category === 'FIXED' ? 'Cố định' : 'Biến động'}
                              </span>
                              {exp.is_anomaly === 1 && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-700 border border-rose-300 flex items-center space-x-0.5">
                                  <span>🔴 Lệch &gt; 25%</span>
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              {exp.note || 'Không có ghi chú'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <span className={`font-mono font-bold text-sm ${exp.is_anomaly ? 'text-rose-600' : 'text-slate-900'}`}>
                            {formatVnd(exp.amount)}
                          </span>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleEditClick(exp)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Chỉnh sửa"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(exp.id, exp.expense_type)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Hệ thống tự động lưu chuẩn VND Integer & ghi vết Audit Log</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

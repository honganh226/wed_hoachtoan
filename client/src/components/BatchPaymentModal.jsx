/**
 * ============================================================
 * MODAL THANH TOÁN GỘP THEO BẢNG KÊ (TASK 4.5: BATCH PAYMENT)
 * ============================================================
 * Cho phép Giám Đốc và Kế Toán:
 * 1. Chọn khách hàng có công nợ tồn đọng.
 * 2. Xem toàn bộ các chuyến xe chưa thanh toán của khách hàng đó.
 * 3. Tích chọn hàng loạt (Select All) hoặc từng chuyến lẻ.
 * 4. Tự động tính toán tổng tiền cước cần thanh toán (Integer VND).
 * 5. Nhập số UNC / Bảng kê / Ngày chuyển khoản.
 * 6. Xác nhận thanh toán lô -> API cập nhật trạng thái PAID & DA_TT,
 *    đồng thời kích hoạt SSE để Dashboard P&L nhảy số tức thì!
 * ============================================================
 */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  CheckSquare, 
  Square, 
  CreditCard, 
  Building2, 
  FileText, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  ArrowRight,
  ShieldCheck,
  Receipt,
  FileCheck2,
  DollarSign
} from 'lucide-react';
import { fetchUnpaidTripsByCustomerApi, batchPayTripsApi } from '../services/api.js';

export default function BatchPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  defaultCustomerName = '',
  currentUser
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [customerData, setCustomerData] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(defaultCustomerName || '');
  const [selectedTripIds, setSelectedTripIds] = useState(new Set());

  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');

  // Format VND Integer
  const formatVnd = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';
  };

  // Tải danh sách công nợ theo khách hàng khi mở modal
  const loadReceivables = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchUnpaidTripsByCustomerApi();
      if (res.success && res.data) {
        setCustomerData(res.data.customers || []);
        // Nếu chưa chọn khách hàng hoặc khách hàng cũ không còn nợ, tự chọn khách hàng có nợ lớn nhất
        if (!selectedCustomer && res.data.customers?.length > 0) {
          const firstCustomer = defaultCustomerName && res.data.customers.some(c => c.customer_name === defaultCustomerName)
            ? defaultCustomerName
            : res.data.customers[0].customer_name;
          setSelectedCustomer(firstCustomer);
        }
      } else {
        setError(res.error || 'Không thể tải danh sách công nợ khách hàng');
      }
    } catch (e) {
      setError(e.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedTripIds(new Set());
      setSuccessMsg(null);
      setError(null);
      setPaymentNote('');
      if (defaultCustomerName) {
        setSelectedCustomer(defaultCustomerName);
      }
      loadReceivables();
    }
  }, [isOpen, defaultCustomerName]);

  // Khách hàng hiện đang được chọn
  const currentCustomerObj = useMemo(() => {
    if (!selectedCustomer) return null;
    return customerData.find(c => c.customer_name === selectedCustomer) || null;
  }, [customerData, selectedCustomer]);

  // Danh sách các chuyến thuộc khách hàng hiện tại
  const tripsOfCustomer = useMemo(() => {
    return currentCustomerObj ? currentCustomerObj.trips : [];
  }, [currentCustomerObj]);

  // Khi đổi khách hàng, tự động chọn tất cả chuyến của khách hàng đó làm mặc định
  useEffect(() => {
    if (tripsOfCustomer && tripsOfCustomer.length > 0) {
      const allIds = new Set(tripsOfCustomer.map(t => t.id));
      setSelectedTripIds(allIds);
      // Tự gợi ý ghi chú bảng kê
      const todayStr = new Date().toLocaleDateString('vi-VN');
      setPaymentNote(`Bảng kê thanh toán đợt ${todayStr} - ${selectedCustomer}`);
    } else {
      setSelectedTripIds(new Set());
    }
  }, [selectedCustomer, tripsOfCustomer]);

  // Toggle chọn 1 chuyến
  const handleToggleTrip = (tripId) => {
    const updated = new Set(selectedTripIds);
    if (updated.has(tripId)) {
      updated.delete(tripId);
    } else {
      updated.add(tripId);
    }
    setSelectedTripIds(updated);
  };

  // Toggle Chọn tất cả / Bỏ chọn tất cả
  const handleToggleSelectAll = () => {
    if (selectedTripIds.size === tripsOfCustomer.length) {
      setSelectedTripIds(new Set());
    } else {
      const allIds = new Set(tripsOfCustomer.map(t => t.id));
      setSelectedTripIds(allIds);
    }
  };

  // Tính toán tổng tiền của các chuyến đang được tích chọn
  const totalSelectedAmount = useMemo(() => {
    if (!tripsOfCustomer) return 0;
    return tripsOfCustomer
      .filter(t => selectedTripIds.has(t.id))
      .reduce((sum, t) => sum + (t.total_revenue || 0), 0);
  }, [tripsOfCustomer, selectedTripIds]);

  // Gửi yêu cầu thanh toán gộp
  const handleSubmitBatchPayment = async (e) => {
    e.preventDefault();
    if (selectedTripIds.size === 0) {
      alert('Vui lòng tích chọn ít nhất 1 chuyến xe để thanh toán!');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      const payload = {
        tripIds: Array.from(selectedTripIds),
        customerName: selectedCustomer,
        paymentDate,
        paymentNote: paymentNote.trim(),
        paymentMethod
      };

      const res = await batchPayTripsApi(payload);

      if (res.success) {
        setSuccessMsg(res.message || `Đã thanh toán gộp thành công ${res.data?.count || selectedTripIds.size} chuyến!`);
        if (onSuccess) {
          onSuccess(res.data);
        }
        // Đóng sau 1.5 giây để người dùng nhìn thấy thông báo thành công
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setError(res.error || 'Thanh toán gộp thất bại');
      }
    } catch (err) {
      setError(err.message || 'Lỗi kết nối khi thanh toán gộp');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isAllSelected = tripsOfCustomer.length > 0 && selectedTripIds.size === tripsOfCustomer.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-400/20">
              <CreditCard className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Thanh Toán Gộp Bảng Kê (Batch Payment)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Task 4.5
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Quyết toán cả lô cuốc xe cho khách hàng • Tự động đẩy tín hiệu SSE Real-time cập nhật P&L
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center space-x-2.5 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center space-x-2.5 text-xs font-bold animate-pulse">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Nội dung chính cuộn dọc */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Hàng chọn Khách hàng & Thống kê nhanh */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            {/* Bộ chọn Khách hàng */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>Chọn Khách Hàng Cần Thanh Toán:</span>
              </label>
              <div className="relative">
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  disabled={loading || submitting}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
                >
                  {customerData.length === 0 && (
                    <option value="">Không có khách hàng nào đang nợ cước</option>
                  )}
                  {customerData.map((c) => (
                    <option key={c.customer_name} value={c.customer_name}>
                      🏢 {c.customer_name} — ({c.total_trips} cuốc nợ • {formatVnd(c.total_receivable)})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500">
                Có tổng cộng <span className="font-bold text-slate-700">{customerData.length}</span> đối tác đang phát sinh công nợ cước chưa thu.
              </p>
            </div>

            {/* Thẻ tóm tắt tiền cước */}
            <div className="bg-indigo-600 text-white p-3.5 rounded-xl shadow-xs flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-indigo-200 uppercase tracking-wider">
                Tổng Tiền Đang Chọn Thu
              </span>
              <div className="my-1">
                <div className="text-xl font-extrabold font-mono text-amber-300">
                  {formatVnd(totalSelectedAmount)}
                </div>
                <div className="text-[11px] text-indigo-100 flex items-center space-x-1 mt-0.5">
                  <CheckSquare className="w-3 h-3 text-emerald-400" />
                  <span>
                    Đã tích chọn <b>{selectedTripIds.size}</b> / {tripsOfCustomer.length} chuyến
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bảng danh sách chuyến xe chưa thu của khách hàng */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-slate-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Danh Sách Cuốc Xe Chờ Quyết Toán ({tripsOfCustomer.length})
                </h4>
              </div>
              {tripsOfCustomer.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  {isAllSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Bỏ chọn tất cả</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Chọn tất cả ({tripsOfCustomer.length} chuyến)</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">Đang tải danh sách cuốc xe chưa thanh toán...</p>
              </div>
            ) : tripsOfCustomer.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50 rounded-xl border border-emerald-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-emerald-900">
                  Tuyệt vời! Khách hàng này không còn cuốc xe nào nợ tiền.
                </p>
                <p className="text-xs text-emerald-700 mt-1">
                  Mọi cuốc xe của {selectedCustomer || 'khách hàng'} đều đã hoàn tất thanh toán 100%.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-[260px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200 z-10">
                    <tr>
                      <th className="p-2.5 text-center w-10">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={handleToggleSelectAll}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-2.5">Mã Cuốc</th>
                      <th className="p-2.5">Ngày</th>
                      <th className="p-2.5">Tuyến Đường</th>
                      <th className="p-2.5">Số Container</th>
                      <th className="p-2.5">Xe / Lái</th>
                      <th className="p-2.5 text-center">Phơi</th>
                      <th className="p-2.5 text-right">Tổng Cước</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {tripsOfCustomer.map((t) => {
                      const isSelected = selectedTripIds.has(t.id);
                      return (
                        <tr
                          key={t.id}
                          onClick={() => handleToggleTrip(t.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50/70 hover:bg-indigo-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleTrip(t.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-2.5 font-mono font-bold text-blue-700">
                            {t.trip_code}
                          </td>
                          <td className="p-2.5 text-slate-500">
                            {t.trip_date}
                          </td>
                          <td className="p-2.5 font-medium text-slate-900">
                            {t.route_name}
                          </td>
                          <td className="p-2.5 font-mono text-slate-600">
                            {t.container_number || 'N/A'}
                          </td>
                          <td className="p-2.5 text-slate-600">
                            <span className="font-semibold text-slate-800">{t.vehicle_plate}</span>
                            {t.driver_name && <span className="block text-[10px] text-slate-400">{t.driver_name}</span>}
                          </td>
                          <td className="p-2.5 text-center">
                            {t.eir_status === 'DA_TRA' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Đã trả phơi
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                                Chưa trả
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                            {formatVnd(t.total_revenue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Biểu mẫu ghi nhận Chứng từ thanh toán */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
              <FileCheck2 className="w-4 h-4 text-indigo-600" />
              <span>Chứng Từ &amp; Thông Tin Bảng Kê Thanh Toán</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Ngày thanh toán */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ngày Thanh Toán / Chuyển Khoản:</span>
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Phương thức thanh toán */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 flex items-center space-x-1">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hình Thức Quyết Toán:</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="BANK_TRANSFER">Chuyển Khoản / Ủy Nhiệm Chi (UNC)</option>
                  <option value="CASH">Tiền Mặt Tại Quỹ</option>
                  <option value="OFFSET">Cấn Trừ Công Nợ Khác</option>
                </select>
              </div>

              {/* Ghi chú / Số chứng từ */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 flex items-center space-x-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Số UNC / Mã Bảng Kê Đối Soát:</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: UNC-VCB-00812 hoặc BK-10-2026"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Người duyệt: <b>{currentUser?.full_name || currentUser?.username}</b> ({currentUser?.role})
            </span>
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
            >
              Hủy Bỏ
            </button>

            <button
              type="button"
              onClick={handleSubmitBatchPayment}
              disabled={submitting || selectedTripIds.size === 0 || tripsOfCustomer.length === 0}
              className="px-5 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md shadow-indigo-600/30 transition-all flex items-center space-x-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang Quyết Toán Lô...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>
                    Xác Nhận Thu Cả Lô ({selectedTripIds.size} Chuyến • {formatVnd(totalSelectedAmount)})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

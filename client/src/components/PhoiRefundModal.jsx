import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Coins,
  RotateCcw,
  PlusCircle
} from 'lucide-react';
import {
  fetchEirAdvanceDetailApi,
  createEirAdvanceApi,
  updateEirAdvanceApi,
  recordEirRefundApi,
  cancelEirRefundApi
} from '../services/api.js';
import { todayInVietnam } from '../utils/businessDate.js';
import { formatVnd } from '../data/unifiedBusinessData.js';

function makeRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function PhoiRefundModal({
  isOpen,
  onClose,
  trip = null,
  advance = null,
  initialMode = 'REFUND', // 'REFUND' | 'SCHEDULE' | 'CREATE'
  onSuccess
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('REFUND'); // 'REFUND' | 'EDIT' | 'CREATE'
  const opKeyRef = useRef({ sig: null, key: null });

  const getOrCreateOpKey = (opName, payloadObj) => {
    const sig = `${opName}:${JSON.stringify(payloadObj)}`;
    if (opKeyRef.current.sig !== sig || !opKeyRef.current.key) {
      opKeyRef.current = { sig, key: makeRequestId() };
    }
    return opKeyRef.current.key;
  };

  const clearOpKey = () => {
    opKeyRef.current = { sig: null, key: null };
  };

  // Form Hoàn tiền
  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState(() => todayInVietnam());
  const [refundNote, setRefundNote] = useState('');

  // Form Sửa ngày hẹn / số tiền phơi
  const [editAdvanceAmount, setEditAdvanceAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNote, setEditNote] = useState('');

  // Form Tạo mới khoản phơi trả hộ cho chuyến chưa có phơi
  const [newAdvanceAmount, setNewAdvanceAmount] = useState('');
  const [newRefundMode, setNewRefundMode] = useState('HEN_NGAY'); // 'HEN_NGAY' | 'TUOI'
  const [newDueDate, setNewDueDate] = useState('');
  const [newNote, setNewNote] = useState('');

  const advancesList =
    (Array.isArray(trip?.phoi_advances) && trip.phoi_advances.length > 0 && trip.phoi_advances) ||
    (Array.isArray(trip?.eir_advances) && trip.eir_advances.length > 0 && trip.eir_advances) ||
    [];

  const initialAdvId =
    advance?.id ||
    trip?.eir_advance_id ||
    advancesList.find((a) => (Number(a.balance_due ?? a.remaining_amount) || 0) > 0)?.id ||
    advancesList[0]?.id ||
    null;

  const [selectedAdvanceId, setSelectedAdvanceId] = useState(initialAdvId);

  useEffect(() => {
    setSelectedAdvanceId(initialAdvId);
  }, [initialAdvId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setErr(null);
    setMsg(null);
    setRefundDate(todayInVietnam());
    setRefundNote('');

    if (selectedAdvanceId) {
      loadAdvanceDetail(selectedAdvanceId);
      setActiveTab(initialMode === 'SCHEDULE' ? 'EDIT' : 'REFUND');
    } else {
      setDetail(null);
      setActiveTab('CREATE');
      setNewAdvanceAmount('');
      setNewRefundMode('HEN_NGAY');
      setNewDueDate('');
      setNewNote('');
    }
  }, [isOpen, selectedAdvanceId, initialMode]);

  const loadAdvanceDetail = async (id) => {
    try {
      setLoading(true);
      const res = await fetchEirAdvanceDetailApi(id);
      if (res.success && res.data) {
        setDetail(res.data);
        const remaining = Math.max(0, (res.data.advance_amount || 0) - (res.data.refunded_amount || 0));
        setRefundAmount(remaining > 0 ? String(remaining) : '');
        setEditAdvanceAmount(String(res.data.advance_amount || 0));
        setEditDueDate(res.data.due_date || '');
        setEditNote(res.data.reference_note || '');
        if (remaining === 0 && initialMode !== 'SCHEDULE') {
          setActiveTab('EDIT');
        }
      } else {
        setErr(res.error || 'Không tải được chi tiết khoản tiền phơi.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRefund = async (e) => {
    e.preventDefault();
    if (!detail) return;
    const amt = Math.round(Number(refundAmount) || 0);
    const remaining = Math.max(0, (detail.advance_amount || 0) - (detail.refunded_amount || 0));

    if (amt <= 0) {
      setErr('Số tiền hoàn phải lớn hơn 0.');
      return;
    }
    if (amt > remaining) {
      setErr(`Số tiền hoàn (${formatVnd(amt)}) không được vượt quá số dư còn phải thu (${formatVnd(remaining)}).`);
      return;
    }

    try {
      setSubmitting(true);
      setErr(null);
      const payload = {
        refund_amount: amt,
        refund_date: refundDate || todayInVietnam(),
        note: refundNote.trim() || (amt === remaining ? 'Hoàn đủ tiền phơi' : 'Hoàn một phần tiền phơi')
      };
      const reqId = getOrCreateOpKey(`refund:${detail.id}`, payload);
      const res = await recordEirRefundApi(detail.id, payload, reqId);
      if (res.success) {
        clearOpKey();
        setMsg(`Đã ghi nhận hoàn ${formatVnd(amt)} thành công!`);
        await loadAdvanceDetail(detail.id);
        if (onSuccess) onSuccess(res.data);
        setTimeout(() => {
          onClose();
        }, 700);
      } else {
        setErr(res.error || res.message || 'Ghi nhận hoàn tiền thất bại.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveScheduleOrEdit = async (e) => {
    e.preventDefault();
    if (!detail) return;
    try {
      setSubmitting(true);
      setErr(null);
      const payload = {
        advance_amount: Math.round(Number(editAdvanceAmount) || 0),
        due_date: editDueDate || null,
        reference_note: editNote.trim() || null
      };
      const reqId = getOrCreateOpKey(`edit:${detail.id}`, payload);
      const res = await updateEirAdvanceApi(detail.id, payload, reqId);
      if (res.success) {
        clearOpKey();
        setMsg('Đã cập nhật thông tin & lịch hẹn hoàn tiền phơi!');
        await loadAdvanceDetail(detail.id);
        if (onSuccess) onSuccess(res.data);
        setTimeout(() => {
          onClose();
        }, 700);
      } else {
        setErr(res.error || res.message || 'Cập nhật thất bại.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAdvance = async (e) => {
    e.preventDefault();
    const amt = Math.round(Number(newAdvanceAmount) || 0);
    if (amt <= 0) {
      setErr('Vui lòng nhập số tiền phơi trả hộ lớn hơn 0.');
      return;
    }
    try {
      setSubmitting(true);
      setErr(null);
      const payload = {
        trip_id: trip?.id || trip?.trip_code,
        customer_name: trip?.customer_name || trip?.ten_khach || advance?.customer_name || 'KHÁCH HÀNG',
        container_number: trip?.container_number || trip?.so_cont || null,
        advance_amount: amt,
        advance_date: trip?.trip_date || todayInVietnam(),
        due_date: newRefundMode === 'HEN_NGAY' && newDueDate ? newDueDate : null,
        is_tuoi: newRefundMode === 'TUOI',
        reference_note: newNote.trim() || null
      };
      const reqId = getOrCreateOpKey(`create:${payload.trip_id}`, payload);
      const res = await createEirAdvanceApi(payload, reqId);
      if (res.success) {
        clearOpKey();
        setMsg('Đã tạo khoản tiền phơi trả hộ thành công!');
        if (onSuccess) onSuccess(res.data);
        setTimeout(() => {
          onClose();
        }, 700);
      } else {
        setErr(res.error || res.message || 'Tạo khoản phơi thất bại.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRefund = async (refundId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy giao dịch hoàn tiền này? Số dư nợ phơi sẽ được khôi phục.')) {
      return;
    }
    try {
      setSubmitting(true);
      setErr(null);
      const payload = { reason: 'Hủy giao dịch hoàn tiền từ giao diện' };
      const reqId = getOrCreateOpKey(`cancel:${refundId}`, payload);
      const res = await cancelEirRefundApi(refundId, payload, reqId);
      if (res.success) {
        clearOpKey();
        setMsg('Đã hủy giao dịch hoàn tiền và khôi phục số dư!');
        if (detail?.id) await loadAdvanceDetail(detail.id);
        if (onSuccess) onSuccess(res.data);
      } else {
        setErr(res.error || res.message || 'Không thể hủy giao dịch hoàn tiền.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const remainingBalance = detail
    ? Math.max(0, (detail.advance_amount || 0) - (detail.refunded_amount || 0))
    : 0;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-600 rounded-xl text-white">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {detail ? 'Xác Nhận Hoàn Tiền Phơi & Lịch Hẹn Đòi' : 'Ghi Nhận Tiền Phơi Trả Hộ Chủ Hàng'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Chuyến: {detail?.trip_id || trip?.trip_code || trip?.id || '-'} • Chủ hàng: {detail?.customer_name || trip?.ten_khach || trip?.customer_name || '-'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {err && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{err}</span>
          </div>
        )}
        {msg && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{msg}</span>
          </div>
        )}

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {loading ? (
            <div className="py-8 text-center text-slate-500">Đang tải thông tin tiền phơi...</div>
          ) : detail ? (
            <>
              {advancesList.length > 1 && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 text-xs">Chuyến có {advancesList.length} khoản phơi:</span>
                  <select
                    value={selectedAdvanceId || ''}
                    onChange={(e) => setSelectedAdvanceId(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-500"
                  >
                    {advancesList.map((a, idx) => (
                      <option key={a.id || idx} value={a.id}>
                        Khoản #{idx + 1}: {formatVnd(a.advance_amount)} (Còn {formatVnd(a.balance_due ?? a.remaining_amount ?? 0)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Tóm tắt số dư khoản phơi */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl text-center">
                <div>
                  <span className="text-[10px] text-purple-700 block">Tiền Phơi Trả Hộ</span>
                  <span className="text-xs sm:text-sm font-extrabold text-purple-950 font-mono">
                    {formatVnd(detail.advance_amount)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-700 block">Đã Hoàn</span>
                  <span className="text-xs sm:text-sm font-extrabold text-emerald-700 font-mono">
                    {formatVnd(detail.refunded_amount)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-700 font-bold block">Còn Phải Thu</span>
                  <span className="text-xs sm:text-sm font-extrabold text-rose-700 font-mono">
                    {formatVnd(remainingBalance)}
                  </span>
                </div>
              </div>

              {/* Tabs chuyển đổi Hoàn tiền vs Đổi ngày hẹn */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('REFUND')}
                  className={`py-1.5 px-3 rounded-lg font-bold text-xs transition-all ${
                    activeTab === 'REFUND' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  ✓ Xác Nhận Thu Hoàn Tiền
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('EDIT')}
                  className={`py-1.5 px-3 rounded-lg font-bold text-xs transition-all ${
                    activeTab === 'EDIT' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  📅 Ngày Hẹn Hoàn & Lịch Sử
                </button>
              </div>

              {activeTab === 'REFUND' ? (
                remainingBalance > 0 ? (
                  <form onSubmit={handleConfirmRefund} className="space-y-3">
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                          Số Tiền Chủ Hàng Hoàn Trả Lần Này (VND) *
                        </label>
                        <input
                          type="number"
                          required
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          placeholder="Nhập số tiền hoàn..."
                          className="w-full px-3 py-2 text-sm font-extrabold text-emerald-900 border-2 border-emerald-400 rounded-lg bg-white"
                        />
                        <div className="flex items-center justify-between text-[10px] text-emerald-800 mt-1">
                          <span>
                            Sau lần thu này còn lại:{' '}
                            <strong>{formatVnd(Math.max(0, remainingBalance - (Number(refundAmount) || 0)))}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRefundAmount(String(remainingBalance))}
                            className="underline font-bold"
                          >
                            Điền thu đủ ({formatVnd(remainingBalance)})
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Ngày Thực Nhận Hoàn Tiền *
                          </label>
                          <input
                            type="date"
                            required
                            value={refundDate}
                            onChange={(e) => setRefundDate(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Ghi chú hoàn tiền
                          </label>
                          <input
                            type="text"
                            value={refundNote}
                            onChange={(e) => setRefundNote(e.target.value)}
                            placeholder="VD: CK Vietcombank..."
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm flex items-center space-x-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {submitting
                            ? 'Đang lưu...'
                            : Number(refundAmount) === remainingBalance
                            ? `Xác Nhận Đã Hoàn Đủ (${formatVnd(refundAmount)})`
                            : `Ghi Nhận Hoàn Một Phần (${formatVnd(refundAmount)})`}
                        </span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <div className="font-bold text-emerald-900">Khoản tiền phơi này đã được hoàn đủ 100%!</div>
                    <p className="text-[11px] text-emerald-700">
                      Nếu cần hủy giao dịch hoàn nhầm để khôi phục số dư, chuyển sang tab &quot;Ngày Hẹn Hoàn &amp; Lịch Sử&quot;.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <form onSubmit={handleSaveScheduleOrEdit} className="space-y-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Cập Nhật Ngày Chủ Hàng Hẹn Hoàn Tiền</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                          Ngày chủ hàng hẹn hoàn
                        </label>
                        <input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                        />
                        <span className="text-[10px] text-slate-500">
                          Đổi ngày hẹn thì lịch nhắc tự đổi theo
                        </span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                          Số tiền phơi trả hộ (VND)
                        </label>
                        <input
                          type="number"
                          value={editAdvanceAmount}
                          onChange={(e) => setEditAdvanceAmount(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-bold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                        Nội dung / Chứng từ tham chiếu
                      </label>
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold"
                      >
                        {submitting ? 'Đang lưu...' : 'Lưu Ngày Hẹn & Thông Tin'}
                      </button>
                    </div>
                  </form>

                  {/* Lịch sử các lần hoàn tiền */}
                  <div className="space-y-2">
                    <div className="font-bold text-slate-800">Lịch Sử Giao Dịch Hoàn Tiền</div>
                    {Array.isArray(detail.refunds) && detail.refunds.length > 0 ? (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {detail.refunds.map((rf) => (
                          <div key={rf.id} className="p-2.5 bg-white flex items-center justify-between">
                            <div>
                              <div className="font-bold text-slate-800">
                                {formatVnd(rf.refund_amount)}{' '}
                                <span className="text-[10px] font-normal text-slate-500">• Ngày {rf.refund_date}</span>
                              </div>
                              <div className="text-[10px] text-slate-500">{rf.note || rf.refund_method}</div>
                            </div>
                            {rf.is_cancelled ? (
                              <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                                Đã hủy
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCancelRefund(rf.id)}
                                className="px-2 py-1 text-[10px] text-rose-600 hover:bg-rose-50 border border-rose-200 rounded font-semibold flex items-center space-x-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Hủy thu</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-lg text-slate-400 text-center">
                        Chưa có giao dịch hoàn tiền nào.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* TẠO MỚI KHOẢN TIỀN PHƠI CHO CHUYẾN CHƯA CÓ PHƠI */
            <form onSubmit={handleCreateAdvance} className="space-y-3">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2.5">
                <div className="text-[11px] text-purple-900 font-semibold">
                  Tạo khoản tiền phơi trả hộ chủ hàng (Không tính vào doanh thu hay chi phí làm giảm lãi chuyến)
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-purple-950 mb-1">
                    Số Tiền Phơi Trả Hộ (VND) *
                  </label>
                  <input
                    type="number"
                    required
                    value={newAdvanceAmount}
                    onChange={(e) => setNewAdvanceAmount(e.target.value)}
                    placeholder="VD: 850000"
                    className="w-full px-3 py-2 text-sm font-bold border border-purple-300 rounded-lg bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-purple-950 mb-1">
                      Hình thức hoàn tiền
                    </label>
                    <select
                      value={newRefundMode}
                      onChange={(e) => setNewRefundMode(e.target.value)}
                      className="w-full px-2.5 py-2 border border-purple-300 rounded-lg bg-white font-semibold"
                    >
                      <option value="HEN_NGAY">Chưa hoàn — Hẹn ngày đòi</option>
                      <option value="TUOI">TƯƠI — Hoàn đủ ngay</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-purple-950 mb-1">
                      Ngày chủ hàng hẹn hoàn
                    </label>
                    <input
                      type="date"
                      disabled={newRefundMode === 'TUOI'}
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-purple-300 rounded-lg bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-purple-950 mb-1">
                    Nội dung / Chứng từ tham chiếu
                  </label>
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="VD: Phơi nâng hạ VIP GREEN..."
                    className="w-full px-2.5 py-1.5 border border-purple-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-sm flex items-center space-x-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{submitting ? 'Đang lưu...' : 'Lưu Khoản Tiền Phơi'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

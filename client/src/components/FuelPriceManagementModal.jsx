import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Fuel,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  Calendar,
  History
} from 'lucide-react';
import {
  fetchFuelPricesApi,
  saveFuelPriceApi,
  deleteFuelPriceApi
} from '../services/api.js';
import { todayInVietnam } from '../utils/businessDate.js';
import { formatVnd } from '../data/unifiedBusinessData.js';

export default function FuelPriceManagementModal({ isOpen, onClose, onSaved }) {
  const [prices, setPrices] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const [applyDate, setApplyDate] = useState(() => todayInVietnam());
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const opKeyRef = useRef({ signature: null, key: null });
  const getOrCreateOpKey = (opName, payload) => {
    const sig = `${opName}:${JSON.stringify(payload)}`;
    if (opKeyRef.current.signature !== sig || !opKeyRef.current.key) {
      opKeyRef.current = {
        signature: sig,
        key: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${opName}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      };
    }
    return opKeyRef.current.key;
  };
  const clearOpKey = () => {
    opKeyRef.current = { signature: null, key: null };
  };

  useEffect(() => {
    if (isOpen) {
      setErr(null);
      setMsg(null);
      loadPrices();
    }
  }, [isOpen]);

  const loadPrices = async () => {
    try {
      setLoading(true);
      const res = await fetchFuelPricesApi();
      if (res && res.success !== false) {
        const rawData = res.data;
        const priceList = Array.isArray(rawData?.prices)
          ? rawData.prices
          : Array.isArray(rawData)
          ? rawData
          : Array.isArray(res.prices)
          ? res.prices
          : [];
        const histList = Array.isArray(rawData?.history)
          ? rawData.history
          : Array.isArray(res.history)
          ? res.history
          : [];
        setPrices(priceList);
        setHistory(histList);
      } else {
        setErr(res?.error || 'Không tải được bảng giá dầu theo ngày.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const priceInt = Math.round(Number(pricePerLiter) || 0);
    if (!applyDate) {
      setErr('Vui lòng chọn ngày áp dụng.');
      return;
    }
    if (priceInt <= 0) {
      setErr('Đơn giá dầu (đồng/lít) phải lớn hơn 0.');
      return;
    }

    try {
      setSubmitting(true);
      setErr(null);
      const savePayload = {
        apply_date: applyDate,
        price_per_liter: priceInt,
        note: note.trim() || null
      };
      const requestId = getOrCreateOpKey('saveFuelPrice', savePayload);
      const res = await saveFuelPriceApi(savePayload, requestId);
      if (res.success) {
        clearOpKey();
        setMsg(
          `Đã lưu giá dầu ngày ${applyDate}: ${formatVnd(priceInt)}/lít! Đã tự động cập nhật tiền dầu cho các cuốc chạy ngày ${applyDate}.`
        );
        setPricePerLiter('');
        setNote('');
        await loadPrices();
        if (onSaved) onSaved(res.data);
      } else {
        setErr(res.error || 'Lưu giá dầu thất bại.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (dateStr) => {
    if (!window.confirm(`Xóa đơn giá dầu ngày ${dateStr}? Các cuốc ngày ${dateStr} sẽ trở về trạng thái "Chưa nhập giá dầu".`)) {
      return;
    }
    try {
      setSubmitting(true);
      const requestId = getOrCreateOpKey('deleteFuelPrice', { dateStr });
      const res = await deleteFuelPriceApi(dateStr, 'Xóa đơn giá dầu từ bảng quản lý', requestId);
      if (res.success) {
        clearOpKey();
        setMsg(`Đã xóa đơn giá dầu ngày ${dateStr}.`);
        await loadPrices();
        if (onSaved) onSaved();
      } else {
        setErr(res.error || 'Xóa thất bại.');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-sky-600 rounded-xl text-white">
              <Fuel className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                Bảng Giá Dầu Theo Ngày Chạy (Đồng / Lít)
              </h3>
              <p className="text-[11px] text-slate-400">
                Nhập giá một lần cho ngày chạy — Mọi cuốc xe đúng ngày chạy tự động tính Tiền dầu = Lít × Đơn giá
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

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Form nhập / cập nhật giá dầu theo ngày */}
          <form onSubmit={handleSave} className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-xl space-y-3">
            <div className="font-bold text-sky-950 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <span>Nhập / Cập Nhật Giá Bán Dầu Theo Ngày Chạy</span>
              </span>
              <span className="text-[10px] text-sky-700">1 ngày dùng 1 đơn giá chung</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-sky-950 mb-1">
                  Ngày áp dụng (Ngày chạy) *
                </label>
                <input
                  type="date"
                  required
                  value={applyDate}
                  onChange={(e) => setApplyDate(e.target.value)}
                  className="w-full px-2.5 py-2 border border-sky-300 rounded-lg bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-sky-950 mb-1">
                  Đơn giá (Đồng / Lít) *
                </label>
                <input
                  type="number"
                  required
                  value={pricePerLiter}
                  onChange={(e) => setPricePerLiter(e.target.value)}
                  placeholder="VD: 20500"
                  className="w-full px-2.5 py-2 border border-sky-300 rounded-lg bg-white font-extrabold text-sky-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-sky-950 mb-1">
                  Ghi chú nguồn giá
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Giá Petrolimex vùng 1..."
                  className="w-full px-2.5 py-2 border border-sky-300 rounded-lg bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setApplyDate('2026-01-08')}
                  className="px-2 py-1 bg-white border border-sky-200 rounded text-[10px] font-semibold text-sky-800 hover:bg-sky-100"
                >
                  Chọn nhanh 08/01/2026
                </button>
                <button
                  type="button"
                  onClick={() => setApplyDate('2026-01-09')}
                  className="px-2 py-1 bg-white border border-sky-200 rounded text-[10px] font-semibold text-sky-800 hover:bg-sky-100"
                >
                  Chọn nhanh 09/01/2026
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-xs flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{submitting ? 'Đang lưu...' : 'Lưu Đơn Giá Ngày Này'}</span>
              </button>
            </div>
          </form>

          {/* Danh sách giá dầu đã nhập */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800">Danh Sách Đơn Giá Dầu Đã Nhập ({prices.length} ngày)</h4>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-[11px] text-indigo-600 hover:underline font-semibold flex items-center space-x-1"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>{showHistory ? 'Ẩn lịch sử sửa' : `Lịch sử sửa (${history.length})`}</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-6 text-center text-slate-400">Đang tải bảng giá dầu...</div>
            ) : prices.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500">
                Chưa có đơn giá dầu nào được nhập. Các cuốc có cấp dầu đang hiển thị trạng thái &quot;Chưa nhập giá dầu&quot;.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl ha-table-scroll" tabIndex={0} role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Ngày Áp Dụng</th>
                      <th className="py-2 px-3 text-right">Đơn Giá (Đồng/Lít)</th>
                      <th className="py-2 px-3">Ghi Chú</th>
                      <th className="py-2 px-3">Người Cập Nhật</th>
                      <th className="py-2 px-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prices.map((p) => (
                      <tr key={p.apply_date} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{p.apply_date}</td>
                        <td className="py-2 px-3 text-right font-mono font-extrabold text-sky-700">
                          {formatVnd(p.price_per_liter)} / L
                        </td>
                        <td className="py-2 px-3 text-slate-600">{p.note || '-'}</td>
                        <td className="py-2 px-3 text-slate-500">{p.updated_by || 'DIRECTOR'}</td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setApplyDate(p.apply_date);
                                setPricePerLiter(String(p.price_per_liter));
                                setNote(p.note || '');
                              }}
                              className="text-blue-600 hover:underline font-bold text-[11px]"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(p.apply_date)}
                              className="text-rose-500 hover:text-rose-700 p-1"
                              title="Xóa giá ngày này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {showHistory && history.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="font-bold text-slate-700 text-[11px]">Lịch Sử Thay Đổi Đơn Giá Dầu</div>
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-200/70 text-[11px]">
                {history.map((h) => (
                  <div key={h.id} className="py-1.5 flex items-center justify-between text-slate-600">
                    <span>
                      Ngày <strong>{h.apply_date}</strong>: {h.old_price ? formatVnd(h.old_price) : 'Chưa có'} →{' '}
                      <strong>{h.new_price ? formatVnd(h.new_price) : 'Đã xóa'}</strong>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {h.changed_by} • {h.changed_at}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

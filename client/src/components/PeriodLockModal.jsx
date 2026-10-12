import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Unlock, 
  History, 
  Calendar, 
  AlertCircle, 
  ShieldCheck, 
  X, 
  Clock, 
  User, 
  FileText 
} from 'lucide-react';
import { 
  fetchPeriodLockStatus, 
  lockPeriodApi, 
  unlockPeriodApi, 
  fetchAuditLogs 
} from '../services/api.js';

export default function PeriodLockModal({ isOpen, onClose, currentUser, onActionSuccess }) {
  const [periodStatus, setPeriodStatus] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('periods'); // 'periods' | 'audit'
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const isDirector = currentUser?.role === 'DIRECTOR';
  const isAccountant = currentUser?.role === 'ACCOUNTANT';
  const canLock = isDirector || isAccountant;
  const canUnlock = isDirector;

  const loadData = async () => {
    try {
      setLoading(true);
      const [pRes, aRes] = await Promise.all([
        fetchPeriodLockStatus().catch(() => ({ success: false })),
        fetchAuditLogs(30).catch(() => ({ success: false }))
      ]);
      if (pRes.success) setPeriodStatus(pRes.data || []);
      if (aRes.success) setAuditLogs(aRes.data || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setMsg(null);
      setErr(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLock = async (month) => {
    if (!canLock) {
      setErr('Chỉ Giám Đốc hoặc Kế Toán mới có quyền Khóa sổ kỳ.');
      return;
    }
    const reason = window.prompt(`Xác nhận KHÓA SỔ kỳ tháng [${month}]?\nNhập ghi chú hoặc lý do:`, 'Chốt số liệu kế toán');
    if (reason === null) return;

    try {
      setLoading(true);
      setErr(null);
      const res = await lockPeriodApi(month, reason);
      if (res.success) {
        setMsg(`Đã khóa sổ kỳ tháng ${month} thành công.`);
        await loadData();
        if (onActionSuccess) onActionSuccess();
      } else {
        setErr(res.error || 'Khóa sổ thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (month) => {
    if (!canUnlock) {
      setErr('⛔ Chỉ GIÁM ĐỐC (DIRECTOR) mới có quyền mở khóa sổ kỳ kế toán!');
      return;
    }
    const reason = window.prompt(`⚠️ CẢNH BÁO: MỞ KHÓA SỔ kỳ tháng [${month}]?\nNhập lý do mở khóa (để lưu Audit Log):`, 'Mở khóa điều chỉnh chứng từ');
    if (reason === null) return;

    try {
      setLoading(true);
      setErr(null);
      const res = await unlockPeriodApi(month, reason);
      if (res.success) {
        setMsg(`Đã mở khóa sổ kỳ tháng ${month} thành công.`);
        await loadData();
        if (onActionSuccess) onActionSuccess();
      } else {
        setErr(res.error || 'Mở khóa thất bại');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const formatVnd = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600 rounded-xl">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Khóa Sổ Kỳ & Nhật Ký Kiểm Toán (Task 2.3)</h3>
              <p className="text-xs text-slate-400">Bảo vệ số liệu quá khứ, chống sửa cước/tiền tùy tiện & ghi vết Audit Log</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 space-x-4">
          <button
            onClick={() => setActiveTab('periods')}
            className={`pb-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-all ${
              activeTab === 'periods'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Trạng Thái Khóa Sổ Theo Tháng</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-all ${
              activeTab === 'audit'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Nhật Ký Audit Log ({auditLogs.length})</span>
          </button>
        </div>

        {/* Alert Notifications */}
        {msg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{msg}</span>
          </div>
        )}
        {err && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'periods' ? (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Quy tắc nghiệp vụ:</span> Khi một tháng bị KHÓA SỔ, toàn bộ chứng từ, cước xe, chi phí, tạm ứng trong tháng đó sẽ bị vô hiệu hóa quyền sửa/xóa. Chỉ Giám Đốc mới có quyền Mở khóa sổ.
                </div>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {periodStatus.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">Chưa có dữ liệu kỳ kế toán nào.</div>
                ) : (
                  periodStatus.map((p) => (
                    <div key={p.period_month} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm font-bold text-slate-900">Tháng {p.period_month}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center space-x-1 ${
                            p.is_locked 
                              ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {p.is_locked ? <Lock className="w-3 h-3 mr-0.5" /> : <Unlock className="w-3 h-3 mr-0.5" />}
                            <span>{p.is_locked ? 'ĐÃ KHÓA SỔ' : 'ĐANG MỞ'}</span>
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center space-x-3">
                          <span>{p.trip_count} cuốc xe</span>
                          <span>•</span>
                          <span>Doanh thu: <b className="text-slate-700">{formatVnd(p.total_revenue)}</b></span>
                        </div>
                        {p.is_locked && (
                          <div className="text-[11px] text-slate-400">
                            Khóa bởi: <span className="font-semibold text-slate-600">{p.locked_by || 'Kế toán'}</span> ({p.locked_at ? new Date(p.locked_at).toLocaleString('vi-VN') : 'N/A'})
                            {p.notes && <span className="italic"> — "{p.notes}"</span>}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {p.is_locked ? (
                          <button
                            onClick={() => handleUnlock(p.period_month)}
                            disabled={loading || !canUnlock}
                            title={!canUnlock ? 'Chỉ Giám Đốc mới có quyền Mở khóa sổ' : ''}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                              canUnlock
                                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Mở Khóa Sổ</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleLock(p.period_month)}
                            disabled={loading || !canLock}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs flex items-center space-x-1.5 transition-all"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Khóa Sổ Tháng Này</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {auditLogs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">Chưa có bản ghi nhật ký kiểm toán nào.</div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[450px] overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="p-3.5 text-xs hover:bg-slate-50 transition-colors space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' :
                              log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                              log.action === 'PERIOD_LOCK' ? 'bg-rose-100 text-rose-800' :
                              log.action === 'PERIOD_UNLOCK' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {log.action}
                            </span>
                            <span className="font-mono font-semibold text-slate-700">[{log.table_name}] #{log.record_id?.slice(0, 8)}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 text-slate-600">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Người thực hiện: <b className="text-slate-800">{log.username || 'SYSTEM'}</b></span>
                          {log.ip_address && <span className="text-[10px] text-slate-400 font-mono">({log.ip_address})</span>}
                        </div>

                        {log.reason && (
                          <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                            <b>Lý do:</b> {log.reason}
                          </div>
                        )}

                        {/* JSON Details */}
                        {(log.old_values || log.new_values) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono bg-slate-900 text-slate-200 p-2 rounded-lg overflow-x-auto">
                            <div>
                              <div className="text-slate-400 font-bold mb-0.5">Giá trị cũ:</div>
                              <pre>{log.old_values ? JSON.stringify(log.old_values, null, 2) : '(Trống)'}</pre>
                            </div>
                            <div>
                              <div className="text-emerald-400 font-bold mb-0.5">Giá trị mới:</div>
                              <pre>{log.new_values ? JSON.stringify(log.new_values, null, 2) : '(Trống)'}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Đóng Cửa Sổ
          </button>
        </div>
      </div>
    </div>
  );
}

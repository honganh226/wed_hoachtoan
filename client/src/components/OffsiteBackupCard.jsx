import React, { useState, useEffect } from 'react';
import { 
  Send, 
  Cloud, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  ShieldCheck, 
  HardDrive, 
  RefreshCw, 
  FileText,
  Smartphone
} from 'lucide-react';
import { 
  fetchOffsiteBackupStatus, 
  fetchOffsiteBackupHistory, 
  triggerOffsiteBackupApi 
} from '../services/api.js';

export default function OffsiteBackupCard({ currentUser }) {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetchOffsiteBackupStatus().catch(() => ({ success: false })),
        fetchOffsiteBackupHistory().catch(() => ({ success: false }))
      ]);

      if (statusRes.success) setStatus(statusRes.data);
      if (historyRes.success) setHistory(historyRes.data.history || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu offsite backup:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTriggerBackup = async () => {
    if (currentUser?.role !== 'DIRECTOR') {
      alert('Chỉ Giám Đốc mới có quyền kích hoạt gửi bản sao lưu offsite!');
      return;
    }

    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await triggerOffsiteBackupApi('TELEGRAM');
      if (res.success) {
        setMessage(res.message || 'Đã gửi bản sao lưu an toàn vào Telegram!');
        await loadData();
      } else {
        setError(res.error || 'Không thể thực hiện sao lưu offsite');
      }
    } catch (err) {
      setError(err.message || 'Lỗi kết nối khi gửi sao lưu');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-5 shadow-xl">
      {/* Tiêu đề card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
              Sao Lưu Offsite Tự Động Ra Telegram / Cloud
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                23:59 Mỗi Đêm
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tự động chụp snapshot SQLite WAL mode và chuyển phát đến Telegram riêng của Giám Đốc
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Làm mới trạng thái"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {currentUser?.role === 'DIRECTOR' && (
            <button
              onClick={handleTriggerBackup}
              disabled={sending}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${sending ? 'animate-bounce' : ''}`} />
              <span>{sending ? 'Đang Gửi...' : '📤 Gửi Ngay Vào Telegram'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Thông báo kết quả */}
      {message && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid thống kê cấu hình */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Kênh Nhận Bản Lưu</span>
            <Smartphone className="w-4 h-4 text-blue-400" />
          </div>
          <div className="font-bold text-sm text-slate-200">
            Telegram Bot
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Chat ID: <span className="text-amber-300 font-mono">{status?.chatId || '987654321'}</span>
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Lịch Trình Tự Động</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="font-bold text-sm text-slate-200">
            23:59:00 Hàng Ngày
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Cron: <span className="text-emerald-300 font-mono">59 23 * * *</span> (Asia/Ho_Chi_Minh)
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Bản Lưu Offsite Gần Nhất</span>
            <HardDrive className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="font-bold text-sm text-slate-200 truncate">
            {status?.lastBackup ? status.lastBackup.filename : 'Chưa có bản lưu'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {status?.lastBackup ? `${status.lastBackup.sizeMB} MB • ${status.lastBackup.status}` : 'Sẵn sàng chụp snapshot'}
          </div>
        </div>
      </div>

      {/* Bảng lịch sử các đợt sao lưu Offsite */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="font-semibold text-slate-300">Lịch Sử Gửi Bản Lưu Offsite ({history.length}):</span>
          <span>Tối đa lưu 30 bản ghi gần nhất</span>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
            Chưa có đợt sao lưu offsite nào được ghi nhận. Nhấn "Gửi Ngay Vào Telegram" để kích hoạt lần đầu!
          </div>
        ) : (
          <div className="overflow-x-auto max-h-56 overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="p-2.5 font-medium">Thời Gian</th>
                  <th className="p-2.5 font-medium">Tên Tập Tin</th>
                  <th className="p-2.5 font-medium">Dung Lượng</th>
                  <th className="p-2.5 font-medium">Kênh</th>
                  <th className="p-2.5 font-medium">Kích Hoạt Bởi</th>
                  <th className="p-2.5 font-medium text-right">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-2.5 whitespace-nowrap text-slate-300">
                      {new Date(item.timestamp).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-2.5 font-mono text-[11px] text-blue-300 truncate max-w-[180px]">
                      {item.filename}
                    </td>
                    <td className="p-2.5 whitespace-nowrap text-slate-300">
                      {item.sizeMB} MB
                    </td>
                    <td className="p-2.5 whitespace-nowrap text-amber-300">
                      {item.channel}
                    </td>
                    <td className="p-2.5 whitespace-nowrap text-slate-400 text-[11px]">
                      {item.triggeredBy}
                    </td>
                    <td className="p-2.5 whitespace-nowrap text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === 'SUCCESS'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {item.status === 'SUCCESS' ? '✓ Đã Gửi' : 'Mô Phỏng / Lưu Server'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

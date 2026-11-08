import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  User, 
  ShieldCheck, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  X, 
  Crown, 
  Calculator, 
  MapPin, 
  Truck 
} from 'lucide-react';
import { loginApi, setAuthToken, setStoredUser } from '../services/api.js';

export default function LoginModal({ isOpen, onClose, onLoginSuccess, currentUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const requestRef = useRef(null);
  useEffect(() => {
    setError(null);setSuccessMsg(null);setConnectionStatus(null);setLoading(false);
    return () => requestRef.current?.abort();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e, customUser = null, customPass = null) => {
    if (e) e.preventDefault();
    const u = customUser || username;
    const p = customPass || password;

    if (!u || !p) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }

    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);

      const res = await loginApi(u, p, {signal:request.signal,onStatus:setConnectionStatus});
      if (request.signal.aborted) return;
      if (res.success) {
        setAuthToken(res.data.token);
        setStoredUser(res.data.user);
        setSuccessMsg(`Đăng nhập thành công với vai trò: ${res.data.user.role}`);
        setTimeout(() => {
          if (request.signal.aborted) return;
          onLoginSuccess(res.data.user);
          onClose();
        }, 600);
      } else {
        setError(res.error || 'Đăng nhập không thành công.');
      }
    } catch (err) {
      setError(err.message || 'Lỗi kết nối máy chủ.');
    } finally {
      if (requestRef.current === request && !request.signal.aborted) { setLoading(false);setConnectionStatus(null); }
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg my-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)]">
        {/* Header modal */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 bg-slate-800/80 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Đăng nhập Quản lý vận tải
              </h2>
              <p className="text-xs text-slate-400">
                Dành cho nhân sự công ty
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung form */}
        <div className="p-5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="flex items-center gap-2.5 p-3 text-sm text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {connectionStatus && <div role="status" className="text-xs text-sky-200">{connectionStatus}</div>}
          {successMsg && (
            <div className="flex items-center gap-2.5 p-3 text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded-xl">
              <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Tên đăng nhập
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tài khoản được công ty cấp"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Đang xác thực bảo mật...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>Đăng Nhập Ngay</span>
                </>
              )}
            </button>
          </form>

          {/* Ghi chú an toàn thông tin & bảo mật phân quyền */}
          <div className="pt-4 border-t border-slate-800 text-center space-y-1">
            <p className="text-xs text-slate-400">
              Hệ thống bảo vệ phân quyền RBAC và mã hóa Token JWT an toàn.
            </p>
            <p className="text-[11px] text-slate-500">
              Vui lòng sử dụng tên đăng nhập và mật khẩu được cấp phát bởi quản trị viên.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

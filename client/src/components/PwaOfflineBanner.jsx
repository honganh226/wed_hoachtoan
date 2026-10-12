import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Database,
  Smartphone
} from 'lucide-react';
import { getOfflineQueueStats, syncOfflineQueue, saveOfflineTrip } from '../utils/offlineDb.js';

export default function PwaOfflineBanner({ onDataSynced }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [queueStats, setQueueStats] = useState({ tripsCount: 0, eirsCount: 0, totalPending: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);

  // 1. Kiểm tra trạng thái cài đặt & sự kiện beforeinstallprompt
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 2. Lắng nghe trạng thái mạng online / offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshStats();
      triggerAutoSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshStats();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshStats = async () => {
    const stats = await getOfflineQueueStats();
    setQueueStats(stats);
  };

  const triggerAutoSync = async () => {
    const stats = await getOfflineQueueStats();
    if (stats.totalPending > 0) {
      handleManualSync();
    }
  };

  const handleManualSync = async () => {
    if (!isOnline) {
      alert('Thiết bị đang mất mạng. Vui lòng kết nối 4G/Wifi trước khi đồng bộ!');
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const result = await syncOfflineQueue();
      await refreshStats();
      setSyncFeedback({
        success: result.success,
        message: result.message
      });
      if (onDataSynced) onDataSynced();
      setTimeout(() => setSyncFeedback(null), 5000);
    } catch (err) {
      setSyncFeedback({
        success: false,
        message: 'Lỗi đồng bộ: ' + err.message
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Nút test cuốc offline cho nhà phát triển
  const handleTestCreateOffline = async () => {
    const mockTrip = {
      trip_code: `OFFLINE-TEST-${Date.now().toString().slice(-4)}`,
      trip_date: new Date().toISOString().split('T')[0],
      vehicle_id: 'veh_01',
      driver_id: 'drv_01',
      customer_id: 'cus_01',
      route_name: 'Đình Vũ -> Hải Dương (Offline Cont)',
      freight_rate: 2200000,
      driver_wage: 350000,
      has_vat: 1,
      status: 'NEW',
      notes: 'Tạo ngoại tuyến khi mất sóng 4G tại bãi cảng Tân Vũ'
    };
    await saveOfflineTrip(mockTrip);
    await refreshStats();
    alert('Đã lưu cuốc xe vào hàng đợi IndexedDB ngoại tuyến thành công!');
  };

  // NẾU MẠNG BÌNH THƯỜNG VÀ KHÔNG CÓ HÀNG ĐỢI CHỜ: Ẩn hoàn toàn để giao diện tối giản tối đa
  if (isOnline && queueStats.totalPending === 0 && !syncFeedback) {
    return null;
  }

  return (
    <div className="space-y-2 mb-4 animate-fade-in">
      {/* Chỉ hiện khi MẤT MẠNG hoặc CÓ HÀNG ĐỢI CHỜ ĐỒNG BỘ */}
      {(!isOnline || queueStats.totalPending > 0) && (
        <div className={`px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
          !isOnline 
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-center space-x-2">
            {!isOnline ? (
              <>
                <WifiOff className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium">
                  <strong>Ngoại tuyến:</strong> Mất kết nối mạng tại bãi cảng. Hệ thống đã kích hoạt IndexedDB tự lưu cuốc xe & ảnh phơi.
                </span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-medium">
                  Có <strong>{queueStats.totalPending}</strong> mục ngoại tuyến ({queueStats.tripsCount} cuốc, {queueStats.eirsCount} phơi) đang chờ đồng bộ lên máy chủ.
                </span>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {queueStats.totalPending > 0 && isOnline && (
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm transition-all text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}</span>
              </button>
            )}

            <button
              onClick={handleTestCreateOffline}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline"
            >
              + Tạo mẫu cuốc offline
            </button>
          </div>
        </div>
      )}

      {/* Thông báo kết quả đồng bộ */}
      {syncFeedback && (
        <div className={`p-3 rounded-xl border flex items-center space-x-2 text-xs font-medium ${
          syncFeedback.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {syncFeedback.success ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
          <span>{syncFeedback.message}</span>
        </div>
      )}
    </div>
  );
}

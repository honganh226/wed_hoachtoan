/**
 * ============================================================
 * HOOK LẮNG NGHE REAL-TIME P&L QUA SSE (TASK 4.1 & TASK 4.3)
 * ============================================================
 * Tự động đồng bộ số liệu Doanh thu & Lợi nhuận tức thì.
 *
 * Cải tiến Session & Race-condition (Phản hồi Codex):
 * - Theo dõi phiên và token người dùng trực tiếp (`sessionKey`).
 * - Đóng kết nối SSE cũ và mở kết nối mới khi đổi tài khoản (kể cả DIRECTOR -> ACCOUNTANT).
 * - Bỏ qua phản hồi REST cũ nếu phiên đổi, bộ lọc đổi hoặc đăng xuất trong lúc request đang bay.
 * - Dọn dẹp triệt để dữ liệu và thông tin sự kiện của phiên trước.
 * ============================================================
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPLSummary, createPLEventSource, triggerPLBroadcastApi, getAuthToken } from '../services/api.js';

/**
 * @param {object} dateFilter - Bộ lọc thời gian { startDate, endDate, month, year }
 * @param {object|null} currentUser - Thông tin tài khoản người dùng hiện tại
 */
export function useRealtimePL(dateFilter = {}, currentUser = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [eventCount, setEventCount] = useState(0);
  const [lastPulseTime, setLastPulseTime] = useState(null);

  // Nhận diện phiên và kiểm tra quyền xem P&L
  const token = getAuthToken();
  const role = currentUser?.role;
  const username = currentUser?.username;
  const isAuthorized = Boolean(token && (role === 'DIRECTOR' || role === 'ACCOUNTANT'));
  const sessionKey = isAuthorized ? `${username}:${role}:${token}` : null;

  // Ref theo dõi filter và session để chống race condition
  const dateFilterRef = useRef(dateFilter);
  dateFilterRef.current = dateFilter;

  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;

  // Bộ đếm request hủy/bỏ qua kết quả REST fetch cũ
  const activeRequestIdRef = useRef(0);
  const eventSourceRef = useRef(null);
  // Cờ đánh dấu phiên P&L đã bị máy chủ báo hết hạn (AUTH_EXPIRED)
  const isExpiredRef = useRef(false);

  // Hàm dọn dẹp sạch sẽ dữ liệu của phiên trước
  const cleanupSessionData = useCallback(() => {
    setData(null);
    setError(null);
    setIsConnected(false);
    setLastEvent(null);
    setEventCount(0);
    setLastPulseTime(null);
    setLoading(false);
  }, []);

  // Tải dữ liệu qua REST API với bộ lọc hiện tại, chống race condition
  const refresh = useCallback(async (overrideFilter = null) => {
    // Không tải dữ liệu nếu chưa có phiên hoặc phiên đã bị đánh dấu hết hạn
    if (!sessionKeyRef.current || isExpiredRef.current) {
      cleanupSessionData();
      return;
    }

    const thisRequestId = ++activeRequestIdRef.current;
    const currentSession = sessionKeyRef.current;
    const filter = overrideFilter || dateFilterRef.current;

    try {
      setLoading(true);
      setError(null);
      const res = await fetchPLSummary(filter);

      // Nếu request id không khớp (đã có request mới hơn), session đã đổi hoặc phiên đã hết hạn -> bỏ qua hoàn toàn phản hồi
      if (thisRequestId !== activeRequestIdRef.current || currentSession !== sessionKeyRef.current || isExpiredRef.current) {
        return;
      }

      if (res.success) {
        setData(res.data);
      } else {
        if (res.error && (res.error.includes('hết hạn') || res.error.includes('Token'))) {
          isExpiredRef.current = true;
          cleanupSessionData();
        }
        setError(res.error || 'Lỗi khi tải số liệu P&L');
      }
    } catch (err) {
      if (thisRequestId !== activeRequestIdRef.current || currentSession !== sessionKeyRef.current || isExpiredRef.current) {
        return;
      }
      setError(err.message || 'Không thể kết nối đến máy chủ');
    } finally {
      if (thisRequestId === activeRequestIdRef.current && currentSession === sessionKeyRef.current && !isExpiredRef.current) {
        setLoading(false);
      }
    }
  }, [cleanupSessionData]);

  // Kích hoạt phát tín hiệu SSE kiểm thử
  const triggerBroadcast = useCallback(async (reason = 'Kiểm thử SSE thủ công') => {
    if (!sessionKeyRef.current) return;
    try {
      await triggerPLBroadcastApi('MANUAL_TEST_TRIGGER', reason);
    } catch (e) {
      console.warn('Lỗi trigger SSE:', e);
    }
  }, []);

  // Effect 1: Vòng đời phiên & SSE connection
  useEffect(() => {
    // 1. Đóng EventSource cũ nếu đang mở
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }

    // 2. Vô hiệu hóa mọi request REST đang bay của phiên cũ & đặt lại cờ hết hạn
    activeRequestIdRef.current++;
    isExpiredRef.current = false;

    // 3. Nếu phiên mới không có quyền hoặc đã đăng xuất: dọn sạch dữ liệu và dừng lại
    if (!sessionKey) {
      cleanupSessionData();
      return;
    }

    // 4. Nếu phiên mới hợp lệ: xóa dữ liệu cũ, tải REST ngay lập tức
    cleanupSessionData();
    refresh(dateFilterRef.current);

    // 5. Quản lý kết nối thời gian thực:
    // Trên Cloudflare Quick Tunnel (hoặc môi trường không hỗ trợ SSE), EventSource sẽ bắn lỗi liên tục.
    // Tự động đóng EventSource sau 2 lần lỗi và chuyển sang Polling định kỳ 60s khi trang đang mở; dừng khi đăng xuất.
    let es = null;
    let sseErrorCount = 0;
    let pollInterval = null;

    const startPollingFallback = () => {
      if (pollInterval) return;
      console.log('[Realtime] Chuyển sang chế độ cập nhật định kỳ (Polling 60s) để tối ưu đường truyền từ xa.');
      pollInterval = setInterval(() => {
        if (sessionKeyRef.current && !isExpiredRef.current && typeof document !== 'undefined' && !document.hidden) {
          refresh(dateFilterRef.current);
        }
      }, 60000);
    };

    // Tự động nhận diện nếu đang chạy qua trycloudflare.com thì dùng ngay polling, không mở SSE
    const isCloudflareTunnel = typeof window !== 'undefined' && window.location.hostname.includes('trycloudflare.com');

    if (isCloudflareTunnel) {
      startPollingFallback();
    } else {
      try {
        es = createPLEventSource(
          // onMessage
          (payload) => {
            if (sessionKey !== sessionKeyRef.current || isExpiredRef.current) return;

            setIsConnected(true);
            setLastPulseTime(new Date());
            setEventCount((prev) => prev + 1);

            if (payload.data) {
              const currentFilter = dateFilterRef.current;
              const hasFilter = Object.values(currentFilter).some(v => v);

              if (hasFilter) {
                refresh(currentFilter);
              } else {
                setData(payload.data);
              }

              setLastEvent({
                event: payload.event,
                timestamp: payload.timestamp,
                trigger: payload.trigger,
                reason: payload.reason
              });
            }
          },
          // onError
          (err) => {
            if (sessionKey !== sessionKeyRef.current || isExpiredRef.current) return;
            setIsConnected(false);
            sseErrorCount++;
            if (sseErrorCount >= 2) {
              console.warn('[SSE] Mạng từ xa không hỗ trợ luồng SSE liên tục. Đóng kết nối và dùng chế độ Polling an toàn.');
              if (es) {
                es.close();
                es = null;
                eventSourceRef.current = null;
              }
              startPollingFallback();
            }
          },
          // onAuthExpired: Khi máy chủ phát hiện token hết hạn
          (errData) => {
            if (sessionKey !== sessionKeyRef.current) return;
            console.warn('[useRealtimePL] Máy chủ báo hết hạn phiên (AUTH_EXPIRED). Đóng kết nối và dọn dẹp dữ liệu.');
            isExpiredRef.current = true;
            activeRequestIdRef.current++;
            cleanupSessionData();
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            setIsConnected(false);
            if (pollInterval) clearInterval(pollInterval);
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
          }
        );

        if (es) {
          es.onopen = () => {
            if (sessionKey === sessionKeyRef.current && !isExpiredRef.current) {
              setIsConnected(true);
            }
          };
          eventSourceRef.current = es;
        }
      } catch (e) {
        setIsConnected(false);
        startPollingFallback();
      }
    }

    return () => {
      if (es) {
        es.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
      }
    };
  }, [sessionKey, cleanupSessionData, refresh]);

  // Effect 2: Tải lại dữ liệu khi dateFilter thay đổi (trong cùng 1 phiên hợp lệ và chưa hết hạn)
  const filterKey = JSON.stringify(dateFilter);
  useEffect(() => {
    if (sessionKey && !isExpiredRef.current) {
      refresh(dateFilter);
    }
  }, [filterKey, sessionKey, refresh]);

  return {
    data,
    loading,
    error,
    isConnected,
    lastEvent,
    eventCount,
    lastPulseTime,
    refresh,
    triggerBroadcast
  };
}

export default useRealtimePL;

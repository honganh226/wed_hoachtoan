import { initializeDurableState, durabilityStatus } from './durableState.service.js';

// Cold starts must never authenticate against temporary bootstrap accounts.
export function durableReadiness(req, res, next) {
  const status = durabilityStatus();
  if (!status.configured || status.ready || /^\/health(?:\/live)?\/?$/.test(req.path) || req.path === '/auth/logout' || req.method === 'OPTIONS') return next();
  res.setHeader('Retry-After', '5');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({success:false,code:'SERVICE_STARTING',retryable:true,error:'Máy chủ đang khôi phục dữ liệu. Vui lòng chờ, hệ thống sẽ tự kết nối lại.'});
}

export function startDurableRecovery({ initialize=initializeDurableState, getStatus=durabilityStatus, onReady=()=>{}, retryMs=10000, schedule=setTimeout } = {}) {
  let stopped = false, timer = null;
  const attempt = async () => {
    let success = false;
    try { success = await initialize(); } catch (error) { console.error('[STARTUP] Khôi phục chưa hoàn tất; sẽ thử lại.'); }
    if (stopped) return false;
    onReady(success);
    if (!success && getStatus().configured) {
      timer = schedule(() => { void attempt(); }, retryMs);
      timer?.unref?.();
    }
    return success;
  };
  const first = attempt();
  return { first, stop() { stopped=true; if (timer) clearTimeout(timer); } };
}

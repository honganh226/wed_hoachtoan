/**
 * API Service Client
 * Hợp đồng kỹ thuật:
 * - Base URL proxy qua /api/v1/
 * - Tiền tệ số nguyên VND Integer
 * - Trả về format { success, data, message, error }
 */

const API_BASE = '/api/v1';

export function getAuthToken() {
  return typeof localStorage !== 'undefined' ? localStorage.getItem('hoachtoan_auth_token') : null;
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('hoachtoan_auth_token', token);
  } else {
    localStorage.removeItem('hoachtoan_auth_token');
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('hoachtoan_auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) {
    localStorage.setItem('hoachtoan_auth_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('hoachtoan_auth_user');
  }
}

export function authHeaders() {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ================= AUTH APIS =================
// A temporary deployment/HTML gateway response is not a wrong password.
async function authRequest(path, options = {}, {signal, timeoutMs=20000} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) return {success:false,code:'REQUEST_CANCELLED'};
  signal?.addEventListener('abort', abort, {once:true});
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {...options, signal:controller.signal});
    const payload = await response.json().catch(() => null);
    const temporary = [502,503,504].includes(response.status);
    if (!payload || typeof payload.success !== 'boolean') {
      return {success:false,httpStatus:response.status,code:'SERVER_UNAVAILABLE',retryable:temporary,error:'Máy chủ đang khởi động hoặc tạm gián đoạn. Vui lòng thử lại sau ít phút.'};
    }
    return {...payload,httpStatus:response.status,retryable:temporary || payload.retryable === true,retryAfterMs:Math.min(5000,Math.max(500,(Number(response.headers.get('Retry-After')) || 2)*1000))};
  } catch (_) {
    return {success:false,code:signal?.aborted?'REQUEST_CANCELLED':'SERVER_UNAVAILABLE',retryable:!signal?.aborted,error:'Chưa kết nối được máy chủ. Dữ liệu đăng nhập chưa được kiểm tra; vui lòng thử lại.'};
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort',abort);
  }
}

function waitForLoginRetry(ms, signal) {
  return new Promise(resolve => {
    const finish = () => {clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
    const timer = setTimeout(finish,ms);
    if (signal?.aborted) finish(); else signal?.addEventListener('abort',finish,{once:true});
  });
}

export async function loginApi(username, password, {signal,onStatus} = {}) {
  const deadline=Date.now()+90000;
  let result;
  for (let attempt=0; attempt<18 && Date.now()<deadline; attempt++) {
    result = await authRequest('/auth/login', {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})
    }, {signal,timeoutMs:Math.min(20000,Math.max(1,deadline-Date.now()))});
    if (result.success || !result.retryable || signal?.aborted) return result;
    onStatus?.('Máy chủ đang khởi động hoặc khôi phục dữ liệu. Đang tự kết nối lại…');
    await waitForLoginRetry(Math.min(result.retryAfterMs || 2000,Math.max(0,deadline-Date.now())),signal);
  }
  return {...result,success:false,error:'Máy chủ chưa sẵn sàng. Vui lòng thử lại sau ít phút; đây không phải kết luận sai mật khẩu.'};
}

// Only expire the exact session that produced the rejected request.
export function expireAuthSession(requestToken) {
  if (!requestToken || getAuthToken() !== requestToken) return false;
  setAuthToken(null);setStoredUser(null);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth-session-expired'));
  return true;
}

export async function logoutApi() {
  try {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: authHeaders()
    });
    return res.json();
  } catch (e) {
    return { success: true };
  }
}

export async function fetchMeApi() {
  const requestToken=getAuthToken();
  if (!requestToken) return {success:false,httpStatus:401,error:'Vui lòng đăng nhập.'};
  const response=await authRequest('/auth/me',{headers:authHeaders()});
  if ([401,403,404].includes(response.httpStatus)) expireAuthSession(requestToken);
  return response;
}

export async function fetchDemoAccounts() {
  const res = await fetch(`${API_BASE}/auth/demo-accounts`);
  return res.json();
}

// ================= SYSTEM & DATA APIS =================
export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchBackupStats() {
  const res = await fetch(`${API_BASE}/backup/stats`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchBackupList() {
  const res = await fetch(`${API_BASE}/backup/list`, {
    headers: authHeaders()
  });
  return res.json();
}

export function getBackupDownloadUrl(filename) {
  const token = getAuthToken();
  return `${API_BASE}/backup/download/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export async function triggerBackup() {
  const res = await fetch(`${API_BASE}/backup/create`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json();
}

export async function resetDatabase(confirmPhrase) {
  const res = await fetch(`${API_BASE}/backup/reset`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ confirmPhrase }),
  });
  return res.json();
}

export async function fetchDataSummary() {
  const res = await fetch(`${API_BASE}/data/summary`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function triggerSeed() {
  const res = await fetch(`${API_BASE}/data/seed`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json();
}

export async function fetchVehicles() {
  const res = await fetch(`${API_BASE}/data/vehicles`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchDrivers() {
  const res = await fetch(`${API_BASE}/data/drivers`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchTrips(limit = 10) {
  const res = await fetch(`${API_BASE}/data/trips?limit=${limit}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchEport() {
  const res = await fetch(`${API_BASE}/data/eport`, {
    headers: authHeaders()
  });
  return res.json();
}

// ================= PERIOD LOCK APIS (TASK 2.3) =================
export async function fetchPeriodLockStatus() {
  const res = await fetch(`${API_BASE}/period-lock/status`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function lockPeriodApi(periodMonth, notes = '') {
  const res = await fetch(`${API_BASE}/period-lock/lock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ period_month: periodMonth, notes })
  });
  return res.json();
}

export async function unlockPeriodApi(periodMonth, notes = '') {
  const res = await fetch(`${API_BASE}/period-lock/unlock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ period_month: periodMonth, notes })
  });
  return res.json();
}

// ================= AUDIT LOG APIS (TASK 2.3) =================
export async function fetchAuditLogs(limit = 50, tableName = null) {
  let url = `${API_BASE}/audit-logs?limit=${limit}`;
  if (tableName) url += `&tableName=${encodeURIComponent(tableName)}`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  return res.json();
}

// ================= TRIP MANAGEMENT APIS (TASK 3.1) =================
export async function fetchRoutes() {
  const res = await fetch(`${API_BASE}/trips/routes`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchRouteDefaultPrice(routeId) {
  const res = await fetch(`${API_BASE}/trips/default-price?routeId=${encodeURIComponent(routeId)}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function createTripApi(tripData, requestId) {
  const res = await fetch(`${API_BASE}/trips`, {
    method: 'POST',
    headers: {...authHeaders(), ...(requestId ? {'Idempotency-Key':requestId} : {})},
    body: JSON.stringify(tripData)
  });
  const result=await safeJson(res);
  if(result.success&&!result.data?.failed)window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

export async function createBatchTripsApi(trips, requestId) {
  const res = await fetch(`${API_BASE}/trips/batch`, {
    method: 'POST',
    headers: {...authHeaders(), ...(requestId ? {'Idempotency-Key':requestId} : {})},
    body: JSON.stringify({ trips })
  });
  const result=await safeJson(res);
  if(result.success&&!result.data?.failed)window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

export async function fetchCustomersApi() {
  const res = await fetch(`${API_BASE}/data/customers`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function createCustomerApi(data) {
  const res = await fetch(`${API_BASE}/data/customers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchSubcontractorsApi() {
  const res = await fetch(`${API_BASE}/data/subcontractors`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function createSubcontractorApi(data) {
  const res = await fetch(`${API_BASE}/data/subcontractors`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function createVehicleApi(data) {
  const res = await fetch(`${API_BASE}/data/vehicles`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function createDriverApi(data) {
  const res = await fetch(`${API_BASE}/data/drivers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function createRouteApi(data) {
  const res = await fetch(`${API_BASE}/data/routes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchPortsApi() {
  const res = await fetch(`${API_BASE}/data/ports`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function createPortApi(data) {
  const res = await fetch(`${API_BASE}/data/ports`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function duplicateTripApi(tripId, targetDate) {
  const res = await fetch(`${API_BASE}/trips/${tripId}/duplicate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ target_date: targetDate })
  });
  const result = await res.json();
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

export async function updateTripApi(tripId, updateData, reason = '', requestId = null) {
  const res = await fetch(`${API_BASE}/trips/${tripId}`, {
    method: 'PUT',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify({ ...updateData, reason })
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

// ================= CONTAINER & ISO 6346 APIS (TASK 3.2) =================
export async function validateIso6346Api(containerNumber) {
  const res = await fetch(`${API_BASE}/trips/validate-container?containerNumber=${encodeURIComponent(containerNumber)}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchTripContainersApi(tripId) {
  const res = await fetch(`${API_BASE}/trips/${tripId}/containers`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function addTripContainerApi(tripId, containerData) {
  const res = await fetch(`${API_BASE}/trips/${tripId}/containers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(containerData)
  });
  return res.json();
}

export async function removeTripContainerApi(tripId, containerId) {
  const res = await fetch(`${API_BASE}/trips/${tripId}/containers/${containerId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return res.json();
}

// ================= ADVANCE & SETTLEMENT APIS (TASK 3.3) =================
export async function fetchAdvances(params = {}) {
  const query = new URLSearchParams();
  if (params.trip_id) query.append('trip_id', params.trip_id);
  if (params.driver_id) query.append('driver_id', params.driver_id);
  if (params.status) query.append('status', params.status);
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);

  const res = await fetch(`${API_BASE}/advances?${query.toString()}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchAdvanceSummary() {
  const res = await fetch(`${API_BASE}/advances/summary`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchTripAdvances(tripId) {
  const res = await fetch(`${API_BASE}/advances/trip/${tripId}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function createAdvanceApi(advanceData) {
  const res = await fetch(`${API_BASE}/advances`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(advanceData)
  });
  return res.json();
}

export async function settleAdvanceApi(advanceId, settledAmount, notes = '') {
  const res = await fetch(`${API_BASE}/advances/${advanceId}/settle`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ settled_amount: settledAmount, notes })
  });
  return res.json();
}

export async function updateAdvanceApi(advanceId, updateData) {
  const res = await fetch(`${API_BASE}/advances/${advanceId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(updateData)
  });
  return res.json();
}

export async function deleteAdvanceApi(advanceId) {
  const res = await fetch(`${API_BASE}/advances/${advanceId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return res.json();
}

// ================= EXPENSE APIS (TASK 3.4) =================
export async function fetchExpenseTypes() {
  const res = await fetch(`${API_BASE}/expenses/types`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchExpenses(params = {}) {
  const query = new URLSearchParams();
  if (params.trip_id) query.append('tripId', params.trip_id);
  if (params.vehicle_id) query.append('vehicleId', params.vehicle_id);
  if (params.category) query.append('category', params.category);
  if (params.expense_type) query.append('expenseType', params.expense_type);
  if (params.is_anomaly !== undefined) query.append('isAnomaly', params.is_anomaly);
  if (params.limit) query.append('limit', params.limit);
  if (params.offset) query.append('offset', params.offset);

  const res = await fetch(`${API_BASE}/expenses?${query.toString()}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function fetchTripExpenses(tripId) {
  const res = await fetch(`${API_BASE}/expenses/trip/${tripId}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function evaluateExpenseAnomalyApi({ expenseType, amount, tripId, routeId }) {
  const res = await fetch(`${API_BASE}/expenses/evaluate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ expenseType, amount, tripId, routeId })
  });
  return res.json();
}

export async function createExpenseApi(expenseData) {
  const res = await fetch(`${API_BASE}/expenses`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(expenseData)
  });
  return res.json();
}

export async function updateExpenseApi(expenseId, updateData) {
  const res = await fetch(`${API_BASE}/expenses/${expenseId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(updateData)
  });
  return res.json();
}

export async function deleteExpenseApi(expenseId) {
  const res = await fetch(`${API_BASE}/expenses/${expenseId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return res.json();
}

export async function batchSaveTripExpensesApi(tripId, expenses) {
  const res = await fetch(`${API_BASE}/expenses/trip/${tripId}/batch`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ expenses })
  });
  return res.json();
}

export async function fetchExpenseAnalytics(params = {}) {
  const query = new URLSearchParams();
  if (params.month) query.append('month', params.month);
  if (params.year) query.append('year', params.year);

  const res = await fetch(`${API_BASE}/expenses/analytics?${query.toString()}`, {
    headers: authHeaders()
  });
  return res.json();
}

// ================= EIR PHOTO & CONTAINER EIR APIS (TASK 3.5) =================
export async function fetchPendingEirTrips(minDays = 3) {
  const res = await fetch(`${API_BASE}/trips/pending-eir?minDays=${minDays}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function uploadEirPhotoApi(tripId, { photoFile = null, photoBase64 = null }) {
  const token = getAuthToken();
  if (photoFile) {
    const formData = new FormData();
    formData.append('photo', photoFile);

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/trips/${tripId}/eir-photo`, {
      method: 'POST',
      headers,
      body: formData
    });
    return res.json();
  } else if (photoBase64) {
    const res = await fetch(`${API_BASE}/trips/${tripId}/eir-photo`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ photo_base64: photoBase64 })
    });
    return res.json();
  } else {
    throw new Error('Vui lòng chọn ảnh phơi hoặc chụp ảnh.');
  }
}

export async function updateEirStatusApi(tripId, { eir_status, eir_paid_status, notes }) {
  const res = await fetch(`${API_BASE}/trips/${tripId}/eir-status`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ eir_status, eir_paid_status, notes })
  });
  return res.json();
}

export async function deleteEirPhotoApi(tripId) {
  const res = await fetch(`${API_BASE}/trips/${tripId}/eir-photo`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return res.json();
}

// ================= REAL-TIME P&L APIS (TASK 4.1, TASK 4.2 & TASK 4.3) =================
export async function fetchPLSummary(params = {}) {
  const query = new URLSearchParams();
  if (params.month) query.append('month', params.month);
  if (params.year) query.append('year', params.year);
  if (params.areaId) query.append('areaId', params.areaId);
  // Task 4.3: hỗ trợ lọc theo khoảng ngày tùy chọn
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);

  const res = await fetch(`${API_BASE}/pl/summary?${query.toString()}`, {
    headers: authHeaders()
  });
  return res.json();
}

export async function triggerPLBroadcastApi(event = 'MANUAL_REFRESH', reason = 'Người dùng làm mới') {
  const res = await fetch(`${API_BASE}/pl/trigger`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ event, reason })
  });
  return res.json();
}

export async function markTripPaidApi(tripId, isPaid = true) {
  const res = await fetch(`${API_BASE}/pl/mark-paid`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ tripId, isPaid })
  });
  return res.json();
}

export function createPLEventSource(onMessage, onError, onAuthExpired) {
  const token = getAuthToken();
  if (!token) {
    console.warn('[SSE] Không tìm thấy Token xác thực, bỏ qua kết nối SSE P&L');
    return null;
  }
  const url = `${API_BASE}/pl/events?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onMessage) onMessage(data);
    } catch (e) {
      console.error('[SSE Parse Error]', e);
    }
  };

  // Lắng nghe sự kiện hết hạn token từ máy chủ (Task P&L Auth)
  es.addEventListener('AUTH_EXPIRED', (event) => {
    console.warn('[SSE] Nhận thông báo AUTH_EXPIRED từ server.');
    try {
      const errData = JSON.parse(event.data);
      if (onAuthExpired) onAuthExpired(errData);
    } catch (e) {
      if (onAuthExpired) onAuthExpired({ error: 'Token expired' });
    }
  });

  es.onerror = (err) => {
    if (onError) onError(err);
  };

  return es;
}


// ================= KPI APIS (TASK 4.4) =================

/**
 * Lấy tiến độ KPI tất cả tài xế
 * @param {object} params - { startDate, endDate, month, year }
 */
export async function fetchKpiProgress(params = {}) {
  const query = new URLSearchParams();
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  if (params.month) query.append('month', params.month);
  if (params.year) query.append('year', params.year);

  const res = await fetch(`${API_BASE}/kpi/progress?${query.toString()}`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy chi tiết drill-down cuốc xe và chi phí của 1 tài xế
 * @param {string} driverId
 * @param {object} params - { startDate, endDate, month, year }
 */
export async function fetchDriverKpiDrilldown(driverId, params = {}) {
  const query = new URLSearchParams();
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  if (params.month) query.append('month', params.month);
  if (params.year) query.append('year', params.year);

  const res = await fetch(`${API_BASE}/kpi/driver/${driverId}?${query.toString()}`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Cập nhật chỉ tiêu KPI của tài xế (chỉ DIRECTOR)
 * @param {string} driverId
 * @param {number} newKpiTarget - Chỉ tiêu mới (VND số nguyên)
 * @param {string} reason - Lý do điều chỉnh
 */
export async function updateDriverKpiApi(driverId, newKpiTarget, reason = '') {
  const res = await fetch(`${API_BASE}/kpi/driver/${driverId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      new_kpi_target: Math.round(Number(newKpiTarget)),
      reason
    })
  });
  return res.json();
}

// ================= BATCH PAYMENT APIS (TASK 4.5) =================

/**
 * Lấy danh sách công nợ & các chuyến chưa thanh toán gom theo khách hàng
 * @param {string} [customerName]
 */
export async function fetchUnpaidTripsByCustomerApi(customerName = '') {
  const query = customerName ? `?customerName=${encodeURIComponent(customerName)}` : '';
  const res = await fetch(`${API_BASE}/trips/unpaid-summary${query}`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Xác nhận thanh toán gộp cả lô nhiều chuyến theo bảng kê
 * @param {object} payload - { tripIds, customerName, paymentDate, paymentNote, paymentMethod }
 */
export async function batchPayTripsApi({
  tripIds = [],
  customerName = '',
  paymentDate = '',
  paymentNote = '',
  paymentMethod = 'BANK_TRANSFER'
}) {
  const res = await fetch(`${API_BASE}/trips/batch-pay`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      tripIds,
      customerName,
      paymentDate,
      paymentNote,
      paymentMethod
    })
  });
  return res.json();
}

// ================= PAYROLL & DRIVER APP APIS (TASK 6.1) =================

/**
 * Lấy bảng lương tổng hợp 3 thành phần theo tháng
 * @param {string} [month] - YYYY-MM
 */
export async function fetchPayrollSummaryApi(month = '') {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const res = await fetch(`${API_BASE}/payroll/summary${query}`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Cập nhật khoản động viên của Giám đốc (DIRECTOR only)
 * @param {object} payload - { driver_id, period_month, incentive_amount, incentive_note, base_salary_override }
 */
export async function updateDriverIncentiveApi(payload) {
  const res = await fetch(`${API_BASE}/payroll/incentive`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  return res.json();
}

// ================= FLEET VEHICLES APIS =================

/**
 * Lấy danh sách đội xe, tài xế phụ trách và hạn đăng kiểm/bảo hiểm (Chỉ đọc)
 */
export async function fetchFleetVehiclesApi() {
  const res = await fetch(`${API_BASE}/data/fleet-vehicles`, {
    headers: authHeaders()
  });
  return safeJson(res);
}

// ================= AI ASSISTANT & GUARDRAILS APIS (TASK 6.3) =================

/**
 * Gửi tin nhắn tới Trợ lý ảo AI nội bộ
 * @param {string} message - Nội dung câu hỏi
 * @param {Array} [conversationHistory]
 */
export async function askAiChatApi(message, conversationHistory = [], options = {}) {
  const {signal,...context}=options;
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: authHeaders(),
    signal,
    body: JSON.stringify({ message, conversationHistory,...context })
  });
  return res.json();
}

/**
 * Lấy danh sách câu hỏi gợi ý nhanh theo vai trò
 */
export async function fetchAiSuggestionsApi() {
  const res = await fetch(`${API_BASE}/ai/suggestions`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * AI Gợi ý phân bổ nhanh xe & tài xế chạy chuyến (Task 6.4)
 * Quét 4 tiêu chí vàng: KPI chậm, Sức khỏe/Đảo cuốc, Kỹ thuật xe rảnh, Tuyến quen
 * @param {object} params - { routeId, customerName, tripDate, pickupLocation, dropoffLocation, isMultiContainer }
 */
export async function fetchAiDispatchSuggestionsApi(params = {}) {
  const res = await fetch(`${API_BASE}/ai/dispatch-suggestion`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params)
  });
  return res.json();
}

// ================= HELP CENTER & GLOSSARY APIS (TASK 7.1) =================

/**
 * Lấy toàn bộ cẩm nang hướng dẫn sử dụng và từ điển ký hiệu
 */
export async function fetchHandbookApi() {
  const res = await fetch(`${API_BASE}/help/handbook`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy danh sách từ điển thuật ngữ logistics & ký hiệu nội bộ
 */
export async function fetchGlossaryApi(category = '') {
  const url = category ? `${API_BASE}/help/glossary?category=${encodeURIComponent(category)}` : `${API_BASE}/help/glossary`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy quy trình tác nghiệp chuẩn 7 bước (SOP)
 */
export async function fetchSopStepsApi() {
  const res = await fetch(`${API_BASE}/help/sop`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy ma trận phân quyền 4 vai trò (RBAC Matrix)
 */
export async function fetchRbacMatrixApi() {
  const res = await fetch(`${API_BASE}/help/rbac`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy danh sách câu hỏi thường gặp (FAQ)
 */
export async function fetchFaqApi() {
  const res = await fetch(`${API_BASE}/help/faq`, {
    headers: authHeaders()
  });
  return res.json();
}

// ================= OFFSITE BACKUP APIS (TASK 7.4) =================

/**
 * Lấy trạng thái và cấu hình sao lưu offsite hàng đêm (Telegram / Cloud)
 */
export async function fetchOffsiteBackupStatus() {
  const res = await fetch(`${API_BASE}/backup/offsite/status`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy lịch sử các lần sao lưu offsite gần nhất
 */
export async function fetchOffsiteBackupHistory() {
  const res = await fetch(`${API_BASE}/backup/offsite/history`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Kích hoạt gửi ngay bản sao lưu sang Telegram của Giám Đốc (Chỉ DIRECTOR)
 */
export async function triggerOffsiteBackupApi(channel = 'TELEGRAM') {
  const res = await fetch(`${API_BASE}/backup/offsite/trigger`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ channel })
  });
  return res.json();
}

// ================= BUSINESS APIS (EXCEL THÁNG 1 - CÓ XÁC THỰC JWT) =================

/**
 * Lấy Báo cáo Tổng quan Giám Đốc (Doanh thu, Chi phí đã biết, Chênh lệch, Dầu, Vấn đề chú ý)
 */
export async function fetchBusinessOverviewApi(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/business/overview?${query}` : `${API_BASE}/business/overview`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy Danh sách Toàn bộ Cuốc xe từ Excel tháng 1
 */
export async function fetchBusinessTripsApi(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/business/trips?${query}` : `${API_BASE}/business/trips`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy Chi tiết một cuốc xe kèm nhóm dùng chung
 */
export async function fetchBusinessTripDetailApi(tripId) {
  const res = await fetch(`${API_BASE}/business/trip/${encodeURIComponent(tripId)}`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lấy Danh sách nhóm chi phí dùng chung / nhóm ô gộp
 */
export async function fetchBusinessGroupsApi() {
  const res = await fetch(`${API_BASE}/business/groups`, {
    headers: authHeaders()
  });
  return res.json();
}

/**
 * Lưu cấu hình phân bổ chi phí cho một nhóm cuốc
 */
export async function saveBusinessGroupAllocationApi(groupKey, mode, allocations = {}) {
  const res = await fetch(`${API_BASE}/business/group/${encodeURIComponent(groupKey)}/allocate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ mode, allocations })
  });
  return res.json();
}

/**
 * Lấy Dữ liệu Công nợ Phải thu khách hàng và Phải trả nhà xe
 */
export async function fetchBusinessDebtsApi(params = {}) {
  const query=new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/business/debts${query ? '?'+query : ''}`, {
    headers: authHeaders()
  });
  return res.json();
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return {
      success: false,
      status: res.status,
      error: `Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status}).`,
      message: `Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status}).`
    };
  }
}

/**
 * Lấy danh sách bảng giá dầu theo ngày
 */
export async function fetchFuelPricesApi(month = '') {
  const url = month
    ? `${API_BASE}/business/fuel-prices?month=${encodeURIComponent(month)}`
    : `${API_BASE}/business/fuel-prices`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  return safeJson(res);
}

/**
 * Lưu / cập nhật giá dầu theo ngày
 */
export async function saveFuelPriceApi(payload, requestId = null) {
  const res = await fetch(`${API_BASE}/business/fuel-prices`, {
    method: 'POST',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify(payload)
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

/**
 * Xóa giá dầu theo ngày
 */
export async function deleteFuelPriceApi(applyDate, reason = '', requestId = null) {
  const res = await fetch(`${API_BASE}/business/fuel-prices/${encodeURIComponent(applyDate)}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify({ reason })
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

/**
 * Lấy danh sách nhắc đòi tiền phơi đến hạn / quá hạn / chưa đặt ngày nhắc
 */
export async function fetchEirRemindersApi(date = '') {
  const url = date
    ? `${API_BASE}/business/eir-reminders?date=${encodeURIComponent(date)}`
    : `${API_BASE}/business/eir-reminders`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  return safeJson(res);
}

/**
 * Lấy danh sách tiền phơi trả hộ
 */
export async function fetchEirAdvancesApi(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/business/eir-advances?${query}` : `${API_BASE}/business/eir-advances`;
  const res = await fetch(url, {
    headers: authHeaders()
  });
  return safeJson(res);
}

/**
 * Lấy chi tiết 1 khoản tiền phơi trả hộ kèm lịch sử hoàn tiền
 */
export async function fetchEirAdvanceDetailApi(id) {
  const res = await fetch(`${API_BASE}/business/eir-advances/${encodeURIComponent(id)}`, {
    headers: authHeaders()
  });
  return safeJson(res);
}

/**
 * Tạo mới khoản tiền phơi trả hộ
 */
export async function createEirAdvanceApi(payload, requestId = null) {
  const res = await fetch(`${API_BASE}/business/eir-advances`, {
    method: 'POST',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify(payload)
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

/**
 * Cập nhật khoản tiền phơi trả hộ (số tiền, ngày hẹn hoàn, ghi chú...)
 */
export async function updateEirAdvanceApi(id, payload, requestId = null) {
  const res = await fetch(`${API_BASE}/business/eir-advances/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify(payload)
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

/**
 * Ghi nhận hoàn tiền phơi (một phần hoặc toàn bộ)
 */
export async function recordEirRefundApi(advanceId, payload, requestId = null) {
  const res = await fetch(`${API_BASE}/business/eir-advances/${encodeURIComponent(advanceId)}/refund`, {
    method: 'POST',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify(payload)
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

/**
 * Hủy giao dịch hoàn tiền phơi
 */
export async function cancelEirRefundApi(refundId, payload = {}, requestId = null) {
  const res = await fetch(`${API_BASE}/business/eir-refunds/${encodeURIComponent(refundId)}/cancel`, {
    method: 'POST',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify(payload)
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

/**
 * Lấy danh sách các khoản lịch sử chưa phân loại rõ (port_fee cũ, ghi chú K MẤT...)
 */
export async function fetchUnclassifiedItemsApi() {
  const res = await fetch(`${API_BASE}/business/unclassified-items`, {
    headers: authHeaders()
  });
  return safeJson(res);
}

// ================= EXCEL IMPORT APIS =================

/**
 * Tải file Excel lên để xem trước và đối chiếu chống trùng
 */
export async function previewExcelImportApi(file, mapping, sheetName = null) {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  if (mapping) formData.append('mapping', JSON.stringify(mapping));
  if (sheetName) formData.append('sheet_name', sheetName);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/excel/preview`, {
    method: 'POST',
    headers,
    body: formData
  });
  return safeJson(res);
}

/**
 * Xác nhận nhập các dòng đã kiểm tra vào cơ sở dữ liệu
 */
export async function commitExcelImportApi(payload, requestId = null) {
  const res = await fetch(`${API_BASE}/excel/commit`, {
    method: 'POST',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: JSON.stringify(payload)
  });
  const result=await safeJson(res);
  if(result.success&&!result.data?.failed)window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

/**
 * Lấy lịch sử các đợt nhập Excel
 */
export async function fetchExcelBatchesApi() {
  const res = await fetch(`${API_BASE}/excel/batches`, {
    headers: authHeaders()
  });
  return safeJson(res);
}

/**
 * Hoàn tác một đợt nhập
 */
export async function rollbackExcelBatchApi(batchId, requestId = null) {
  const res = await fetch(`${API_BASE}/excel/batches/${encodeURIComponent(batchId)}/rollback`, {
    method: 'POST',
    headers: { ...authHeaders(), ...(requestId ? { 'Idempotency-Key': requestId } : {}) }
  });
  return safeJson(res);
}

/**
 * Giám đốc làm sạch toàn bộ dữ liệu nghiệp vụ cũ
 */
export async function resetAllBusinessDataApi(reason) {
  const token = getAuthToken();
  const res = await fetch('/api/v1/manage/reset-business-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      confirm_token: 'CONFIRM_RESET_ALL_BUSINESS_DATA',
      reason: reason || 'Giám đốc làm sạch dữ liệu nghiệp vụ cũ để chuẩn bị nhập Excel mới'
    })
  });
  const result = await safeJson(res);
  if (result.success) window.dispatchEvent(new Event('business-data-changed'));
  return result;
}

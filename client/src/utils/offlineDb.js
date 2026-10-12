/**
 * Offline Database Engine (IndexedDB) cho PWA Logistics
 * Phục vụ tài xế và điều độ khi ra các góc khuất sóng 4G tại bãi cảng (Tân Vũ, Đình Vũ, PTSC, Chùa Vẽ...)
 * 
 * Tính năng:
 * - Lưu trữ cuốc xe ngoại tuyến (offline_trips)
 * - Lưu trữ ảnh phiếu phơi EIR ngoại tuyến (offline_eirs)
 * - Hàng đợi đồng bộ thông minh (Sync Queue) tự động kích hoạt khi có mạng trở lại
 */

const DB_NAME = 'hoachtoan_pwa_offline_db';
const DB_VERSION = 1;

/**
 * Khởi tạo hoặc kết nối IndexedDB
 */
export function openOfflineDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('Trình duyệt không hỗ trợ IndexedDB'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store lưu cuốc xe tạo ngoại tuyến
      if (!db.objectStoreNames.contains('offline_trips')) {
        const tripStore = db.createObjectStore('offline_trips', { keyPath: 'client_id' });
        tripStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Store lưu ảnh phiếu phơi EIR ngoại tuyến
      if (!db.objectStoreNames.contains('offline_eirs')) {
        const eirStore = db.createObjectStore('offline_eirs', { keyPath: 'client_id' });
        eirStore.createIndex('trip_id', 'trip_id', { unique: false });
        eirStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Store lưu cache danh mục chung
      if (!db.objectStoreNames.contains('cached_metadata')) {
        db.createObjectStore('cached_metadata', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Lưu cuốc xe tạo khi đang mất sóng ngoài bãi
 */
export async function saveOfflineTrip(tripData) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_trips', 'readwrite');
    const store = tx.objectStore('offline_trips');

    const item = {
      ...tripData,
      client_id: tripData.client_id || `offline_trip_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      created_at: new Date().toISOString(),
      sync_status: 'PENDING'
    };

    const req = store.put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lấy toàn bộ danh sách cuốc xe đang chờ sync
 */
export async function getOfflineTrips() {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_trips', 'readonly');
    const store = tx.objectStore('offline_trips');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Xóa một cuốc xe sau khi đã sync thành công lên server
 */
export async function deleteOfflineTrip(clientId) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_trips', 'readwrite');
    const store = tx.objectStore('offline_trips');
    const req = store.delete(clientId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lưu ảnh phiếu phơi EIR chụp khi mất sóng
 */
export async function saveOfflineEir(eirData) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_eirs', 'readwrite');
    const store = tx.objectStore('offline_eirs');

    const item = {
      ...eirData,
      client_id: eirData.client_id || `offline_eir_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      created_at: new Date().toISOString(),
      sync_status: 'PENDING'
    };

    const req = store.put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lấy danh sách ảnh phiếu phơi đang chờ sync
 */
export async function getOfflineEirs() {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_eirs', 'readonly');
    const store = tx.objectStore('offline_eirs');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Xóa phiếu phơi sau khi đã sync
 */
export async function deleteOfflineEir(clientId) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_eirs', 'readwrite');
    const store = tx.objectStore('offline_eirs');
    const req = store.delete(clientId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lấy tổng số mục đang nằm trong hàng đợi ngoại tuyến
 */
export async function getOfflineQueueStats() {
  try {
    const [trips, eirs] = await Promise.all([
      getOfflineTrips(),
      getOfflineEirs()
    ]);
    return {
      tripsCount: trips.length,
      eirsCount: eirs.length,
      totalPending: trips.length + eirs.length,
      trips,
      eirs
    };
  } catch (err) {
    console.error('[OfflineDB] Lỗi đọc hàng đợi:', err);
    return { tripsCount: 0, eirsCount: 0, totalPending: 0, trips: [], eirs: [] };
  }
}

/**
 * Đồng bộ hóa toàn bộ hàng đợi ngoại tuyến lên Backend Server
 * Gọi khi có mạng trở lại hoặc khi người dùng bấm nút "⚡ Đồng Bộ Ngay"
 */
export async function syncOfflineQueue(apiSyncHandlers = {}) {
  const stats = await getOfflineQueueStats();
  if (stats.totalPending === 0) {
    return { success: true, syncedTrips: 0, syncedEirs: 0, message: 'Hàng đợi ngoại tuyến trống.' };
  }

  let syncedTrips = 0;
  let syncedEirs = 0;
  const errors = [];

  // 1. Đồng bộ các cuốc xe ngoại tuyến
  for (const trip of stats.trips) {
    try {
      if (apiSyncHandlers.syncTrip) {
        await apiSyncHandlers.syncTrip(trip);
      } else {
        // Fallback fetch API trực tiếp
        const res = await fetch('/api/v1/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trip)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      await deleteOfflineTrip(trip.client_id);
      syncedTrips++;
    } catch (e) {
      console.error('[Sync] Lỗi đẩy cuốc xe offline:', trip.client_id, e);
      errors.push(`Cuốc ${trip.trip_code || trip.client_id}: ${e.message}`);
    }
  }

  // 2. Đồng bộ các ảnh phiếu phơi EIR ngoại tuyến
  for (const eir of stats.eirs) {
    try {
      if (apiSyncHandlers.syncEir) {
        await apiSyncHandlers.syncEir(eir);
      } else {
        const res = await fetch(`/api/v1/trips/${eir.trip_id}/eir-photo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoBase64: eir.photoBase64,
            note: eir.note || 'Tải lên từ hàng đợi ngoại tuyến ngoài bãi cảng'
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      await deleteOfflineEir(eir.client_id);
      syncedEirs++;
    } catch (e) {
      console.error('[Sync] Lỗi đẩy phơi offline:', eir.client_id, e);
      errors.push(`Phơi EIR xe: ${e.message}`);
    }
  }

  return {
    success: errors.length === 0,
    syncedTrips,
    syncedEirs,
    remaining: stats.totalPending - (syncedTrips + syncedEirs),
    errors,
    message: `Đã đồng bộ thành công ${syncedTrips} cuốc xe và ${syncedEirs} phiếu phơi lên hệ thống!`
  };
}

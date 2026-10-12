/**
 * Service Worker cho Hệ Thống Điều Vận Container - WED_HOACHTOAN
 * Phiên bản: v1.0.0
 * Chiến lược:
 * - App Shell & Tĩnh: Stale-While-Revalidate / Cache-First
 * - API GET danh mục: Network-first với Cache Fallback cho hoạt động ngoại tuyến ngoài bãi cảng
 * - API POST/PUT: Bỏ qua SW, xử lý hàng đợi qua IndexedDB Sync Engine
 */

const CACHE_NAME = 'wed-hoachtoan-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/apple-touch-icon.png',
  '/favicon.svg',
  '/icons.svg'
];

// Cài đặt Service Worker: Cache các tài nguyên cơ bản
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Đang cài đặt phiên bản mới:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Đang nạp trước App Shell vào Cache...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Cảnh báo nạp cache ban đầu:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Kích hoạt Service Worker: Xóa cache cũ không dùng nữa
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Đã kích hoạt Service Worker:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key.startsWith('wed-hoachtoan-cache-') && key !== CACHE_NAME) {
            console.log('[ServiceWorker] Xóa cache cũ:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Bắt và xử lý Fetch Request
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Không can thiệp các request không phải GET
  if (req.method !== 'GET') {
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Always request the current HTML so a saved app shell cannot hide a deployment.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || new Response('Không có kết nối mạng.', { status: 503 });
      })
    );
    return;
  }

  // Bỏ qua các endpoint SSE (Server-Sent Events) như /api/v1/pl/events
  if (url.pathname.includes('/api/v1/pl/events')) {
    return;
  }

  // 1. Đối với API GET danh mục (/api/v1/data/*, /api/v1/vehicles, /api/v1/trips, /api/v1/help/*):
  // Thử Network trước để lấy số mới nhất, nếu mất mạng (offline ngoài bãi) thì fallback sang Cache đã lưu
  if (url.pathname.startsWith('/api/v1/')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          // Lưu bản sao vào cache nếu thành công
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          // Khi offline, tìm lại trong cache
          return caches.match(req).then((cachedRes) => {
            if (cachedRes) {
              console.log('[ServiceWorker] 📶 Trả về dữ liệu Cache Offline cho:', url.pathname);
              return cachedRes;
            }
            return new Response(JSON.stringify({
              success: false,
              offline: true,
              message: 'Thiết bị đang ở chế độ Ngoại Tuyến (Offline ngoài bãi cảng). Dữ liệu này chưa được lưu đệm.'
            }), {
              headers: { 'Content-Type': 'application/json' },
              status: 503
            });
          });
        })
    );
    return;
  }

  // 2. Đối với Static Assets (JS, CSS, HTML, Fonts, Images):
  // Stale-While-Revalidate: trả về cache trước nếu có, song song fetch cập nhật cache
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch((err) => {
          // Nếu network lỗi mà có cache thì vẫn an toàn
          if (cachedRes) return cachedRes;
          // Fallback cho navigation HTML
          if (req.mode === 'navigate') {
            return caches.match('/index.html');
          }
          throw err;
        });

      return cachedRes || fetchPromise;
    })
  );
});

// Lắng nghe lệnh từ client (ví dụ skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * Đăng ký và quản lý Service Worker cho PWA
 */

export function registerServiceWorker(onUpdateFound) {
  if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          console.log('[PWA] Service Worker đăng ký thành công với scope:', registration.scope);

          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker == null) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[PWA] Đã có bản cập nhật mới, sẵn sàng tải lại trang.');
                  if (onUpdateFound) onUpdateFound(registration);
                } else {
                  console.log('[PWA] Ứng dụng đã được lưu vào bộ nhớ đệm để sử dụng ngoại tuyến!');
                }
              }
            };
          };
          registration.update().catch(() => {});
        })
        .catch((error) => {
          console.error('[PWA] Lỗi đăng ký Service Worker:', error);
        });
    });
  }
}

export function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerServiceWorker } from './utils/swRegister.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Khởi chạy Service Worker PWA
registerServiceWorker((registration) => {
  console.log('[PWA] Phiên bản mới đã sẵn sàng');
});


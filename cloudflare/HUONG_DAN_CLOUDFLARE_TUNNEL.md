# HƯỚNG DẪN CẤU HÌNH CLOUDFLARE TUNNEL (TRUY CẬP TỪ XA QUA INTERNET)

> **Mục đích:** Giúp Giám Đốc và các Lái xe có thể mở App trên điện thoại thông minh (4G/Wifi) từ bất kỳ đâu ngoài bãi cảng để xem báo cáo P&L real-time và tạo chuyến xe an toàn, bảo mật tuyệt đối qua HTTPS.

---

## ⚡ 1. CÁCH 1: DÙNG NGAY TRONG 3 GIÂY (QUICK TUNNEL - MIỄN PHÍ 100%)

Không cần tài khoản Cloudflare, không cần mua tên miền, không cần mở port modem:

1. Chạy file: `cloudflare\start_cloudflare_tunnel.bat`
2. Nhấn phím `1` (hoặc Enter).
3. Màn hình sẽ hiển thị đường link dạng:
   ```text
   Your quick Tunnel has been created! Visit it at:
   https://random-company-trucks.trycloudflare.com
   ```
4. Copy link HTTPS đó gửi qua Zalo/Telegram cho Giám Đốc hoặc Lái xe để mở trên điện thoại!
5. **Cài PWA Mobile:** Khi mở link trên Chrome điện thoại, bấm nút `[📲 Cài Đặt App (PWA)]` để đưa icon xe container ra màn hình chính điện thoại.

---

## 🔒 2. CÁCH 2: DÙNG TÊN MIỀN RIÊNG CỐ ĐỊNH (NAMED TUNNEL CHO DOANH NGHIỆP)

Nếu công ty bạn có tên miền riêng (ví dụ `dieuvan.congtyban.vn`):

1. Đăng nhập vào [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Vào mục **Networks** ➔ **Tunnels** ➔ Nhấn **Add a tunnel**.
3. Chọn loại **Cloudflared**, đặt tên tunnel: `hoachtoan-container`.
4. Copy mã **Tunnel Token** được cấp.
5. Chạy lệnh:
   ```bash
   cloudflared.exe tunnel run --token <MA_TOKEN_CUA_BAN>
   ```
6. Trong Cloudflare Dashboard, cấu hình Public Hostname:
   - **Subdomain:** `dieuvan`
   - **Domain:** `congtyban.vn`
   - **Service Type:** `HTTP`
   - **URL:** `localhost:5000`
7. Truy cập `https://dieuvan.congtyban.vn` từ bất kỳ nơi đâu với chứng chỉ SSL/TLS miễn phí trọn đời!

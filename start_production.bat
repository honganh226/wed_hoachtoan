@echo off
chcp 65001 >nul
title Khởi Động Hệ Thống Điều Vận Container (Production Mode)
color 0A

echo ================================================================
echo    HỆ THỐNG ĐIỀU VẬN CONTAINER - KHỞI ĐỘNG PRODUCTION (PORT 5000)
echo ================================================================
echo.

cd /d "%~dp0"

echo [*] Kiểm tra thư mục client\dist...
if not exist "client\dist\index.html" (
    echo [!] Chưa tìm thấy bản build giao diện client\dist. Đang tự động build...
    cd client
    call npm run build
    cd ..
)

echo.
echo [*] Bắt đầu khởi chạy Backend & PWA Web Server trên cổng 5000...
echo [*] Địa chỉ truy cập cục bộ: http://localhost:5000
echo [*] Địa chỉ mạng nội bộ LAN: Xem địa chỉ IP của máy này kèm :5000
echo.

set NODE_ENV=production
set PORT=5000

cd server
node src/index.js

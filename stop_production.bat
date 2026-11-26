@echo off
chcp 65001 >nul
title Dừng Hệ Thống Điều Vận Container
color 0C

echo ================================================================
echo    DỪNG CÁC TIẾN TRÌNH HỆ THỐNG ĐIỀU VẬN CONTAINER
echo ================================================================
echo.

echo [*] Kiểm tra PM2...
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    pm2 stop hoachtoan-service 2>nul
    echo [✓] Đã gửi lệnh dừng PM2 app hoachtoan-service
)

echo [*] Kiểm tra cổng 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo [*] Đang tắt tiến trình PID: %%a đang chiếm cổng 5000...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [✓] Đã dừng toàn bộ dịch vụ!
pause

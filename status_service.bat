@echo off
chcp 65001 >nul
title Kiểm Tra Trạng Thái Dịch Vụ
color 0B

echo ================================================================
echo    KIỂM TRA TRẠNG THÁI HỆ THỐNG ĐIỀU VẬN CONTAINER
echo ================================================================
echo.

echo 1. KIỂM TRA CỔNG 5000 (BACKEND & PWA SERVER):
netstat -aon | findstr :5000 | findstr LISTENING
if %errorlevel% equ 0 (
    echo [✓] Cổng 5000 ĐANG MỞ VÀ LẮNG NGHE KẾT NỐI!
) else (
    echo [!] Cổng 5000 CHƯA HOẠT ĐỘNG.
)

echo.
echo 2. KIỂM TRA TIẾN TRÌNH PM2:
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    pm2 status
) else (
    echo [i] PM2 chưa được cài đặt trong Command Prompt này.
)

echo.
echo 3. KIỂM TRA DỊCH VỤ WINDOWS (NSSM/SC):
sc query WED_HOACHTOAN_SERVICE 2>nul
if %errorlevel% neq 0 (
    echo [i] Dịch vụ Windows WED_HOACHTOAN_SERVICE chưa được đăng ký trong services.msc.
)

echo.
echo ================================================================
pause

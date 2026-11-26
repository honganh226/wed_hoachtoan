@echo off
chcp 65001 >nul
title Cloudflare Tunnel - Truy Cập Hệ Thống Từ Xa (HTTPS)
color 0B

echo ================================================================
echo    HỆ THỐNG ĐIỀU VẬN CONTAINER - CLOUDFLARE TUNNEL (HTTPS)
echo ================================================================
echo.

set CLOUDFLARED_BIN=%~dp0cloudflared.exe
if not exist "%CLOUDFLARED_BIN%" (
    where cloudflared >nul 2>nul
    if %errorlevel% equ 0 (
        set CLOUDFLARED_BIN=cloudflared
    ) else (
        echo [!] Chưa tìm thấy file cloudflared.exe!
        echo [*] Đang tự động chuyển sang bộ cài đặt tải về...
        call "%~dp0setup_cloudflare_tunnel.bat"
        if not exist "%~dp0cloudflared.exe" (
            echo [X] Chưa thể tải cloudflared.exe. Vui lòng thử lại.
            pause
            exit /b 1
        )
        set CLOUDFLARED_BIN=%~dp0cloudflared.exe
    )
)

echo [✓] Đã tìm thấy: %CLOUDFLARED_BIN%
echo.
echo Chọn chế độ khởi chạy Tunnel:
echo   1. QUICK TUNNEL (Miễn phí, 0-cấu hình, Cấp link HTTPS tạm thời ngay lập tức)
echo   2. NAMED TUNNEL (Sử dụng Token cố định cấu hình trong .env hoặc config.yml)
echo.
set /p MODE="Nhập lựa chọn của bạn [1 hoặc 2, mặc định là 1]: "
if "%MODE%"=="" set MODE=1

if "%MODE%"=="1" (
    echo.
    echo [*] Đang thiết lập Quick Tunnel trỏ về cổng Backend/PWA http://localhost:5000...
    echo [*] Cloudflare sẽ sinh ra đường dẫn HTTPS có đuôi .trycloudflare.com
    echo [*] Bạn có thể gửi đường link đó cho Giám Đốc hoặc Lái Xe để mở trên điện thoại!
    echo.
    "%CLOUDFLARED_BIN%" tunnel --url http://localhost:5000
) else (
    echo.
    echo [*] Đang khởi chạy Named Tunnel với file cấu hình config.yml...
    if exist "%~dp0config.yml" (
        "%CLOUDFLARED_BIN%" tunnel --config "%~dp0config.yml" run
    ) else (
        echo [!] Không tìm thấy file config.yml. Đang chạy ở chế độ Quick Tunnel dự phòng...
        "%CLOUDFLARED_BIN%" tunnel --url http://localhost:5000
    )
)

pause

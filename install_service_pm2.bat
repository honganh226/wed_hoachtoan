@echo off
chcp 65001 >nul
title Cài Đặt Dịch Vụ Windows Chạy Ngầm (PM2)
color 0E

echo ================================================================
echo    CÀI ĐẶT DỊCH VỤ TỰ KHỞI ĐỘNG CÙNG WINDOWS (PM2 ECOSYSTEM)
echo ================================================================
echo.

cd /d "%~dp0"

echo [*] Kiểm tra công cụ PM2...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] PM2 chưa được cài toàn cục. Đang cài đặt: npm install -g pm2 pm2-windows-startup...
    call npm install -g pm2 pm2-windows-startup
)

echo.
echo [*] Khởi động ứng dụng bằng PM2 với cấu hình ecosystem.config.cjs...
pm2 start ecosystem.config.cjs --env production

echo.
echo [*] Lưu danh sách tiến trình PM2 vào trạng thái khởi động...
pm2 save

echo.
echo [*] Kích hoạt tự động khởi chạy cùng Windows khi bật máy...
pm2-startup install

echo.
echo ================================================================
echo [✓] CÀI ĐẶT THÀNH CÔNG! 
echo Hệ thống Điều Vận Container giờ đây sẽ tự động chạy ngầm mỗi khi
echo máy chủ khởi động mà không cần người dùng phải đăng nhập hay mở cửa sổ đen.
echo ================================================================
echo.
echo Các lệnh quản lý nhanh:
echo   pm2 status          : Xem trạng thái hệ thống
echo   pm2 logs            : Xem nhật ký hoạt động thời gian thực
echo   pm2 restart all     : Khởi động lại dịch vụ
echo   pm2 stop all        : Tạm dừng dịch vụ
echo.
pause

@echo off
chcp 65001 >nul
title Cài Đặt Dịch Vụ Windows Chính Thống (NSSM Service)
color 0B

echo ================================================================
echo    CÀI ĐẶT WINDOWS SERVICE CHÍNH THỨC QUA NSSM (MICROSOFT SERVICES)
echo ================================================================
echo.

:: Yêu cầu quyền Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Vui lòng click chuột phải vào file này và chọn "Run as administrator"!
    echo.
    pause
    exit /b 1
)

set SERVICE_NAME=WED_HOACHTOAN_SERVICE
set APP_DIR=%~dp0
set NODE_EXE=node.exe
for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_EXE=%%i

echo [*] Đường dẫn ứng dụng: %APP_DIR%
echo [*] Đường dẫn Node.js:  %NODE_EXE%
echo [*] Tên Windows Service: %SERVICE_NAME%
echo.

where nssm >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Chưa tìm thấy công cụ nssm.exe trong hệ thống.
    echo [*] Bạn có thể tải nssm.exe từ https://nssm.cc/download và đặt vào C:\Windows\System32
    echo [*] HOẶC sử dụng file install_service_pm2.bat để cài đặt chạy ngầm bằng PM2!
    echo.
    pause
    exit /b 1
)

echo [*] Đang đăng ký dịch vụ %SERVICE_NAME% vào Windows Service Manager...
nssm install %SERVICE_NAME% "%NODE_EXE%" "src/index.js"
nssm set %SERVICE_NAME% AppDirectory "%APP_DIR%server"
nssm set %SERVICE_NAME% AppEnvironmentExtra "NODE_ENV=production" "PORT=5000"
nssm set %SERVICE_NAME% AppStdout "%APP_DIR%server\logs\service-stdout.log"
nssm set %SERVICE_NAME% AppStderr "%APP_DIR%server\logs\service-stderr.log"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% Description "Hệ Thống Web Điều Hành Vận Tải Container (Port 5000)"

echo.
echo [*] Bắt đầu khởi động dịch vụ...
nssm start %SERVICE_NAME%

echo.
echo [✓] Dịch vụ %SERVICE_NAME% đã được cài đặt và khởi động thành công!
echo     Bạn có thể xem trong services.msc của Windows.
pause

@echo off
chcp 65001 >nul
title Thiết Lập Lịch Tự Động Sao Lưu Hàng Đêm (Windows Task Scheduler)
color 0A

echo ================================================================
echo    ĐĂNG KÝ TÁC VỤ SAO LƯU 23:59 VÀO WINDOWS TASK SCHEDULER
echo ================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Vui lòng click chuột phải và chọn "Run as administrator" để đăng ký Task Scheduler!
    echo.
    pause
    exit /b 1
)

set TASK_NAME=WED_HOACHTOAN_DailyBackup
set SCRIPT_PATH=%~dp0server\src\scripts\offsiteBackup.js
set NODE_EXE=node.exe
for /f "tokens=*" %%i in ('where node 2^>nul') do set NODE_EXE=%%i

echo [*] Tên tác vụ:    %TASK_NAME%
echo [*] Thời gian chạy: 23:59 hàng ngày
echo [*] Lệnh thực thi:  "%NODE_EXE%" "%SCRIPT_PATH%"
echo.

schtasks /create /tn "%TASK_NAME%" /tr "\"%NODE_EXE%\" \"%SCRIPT_PATH%\"" /sc daily /st 23:59 /f /rl HIGHEST

if %errorlevel% equ 0 (
    echo.
    echo ================================================================
    echo [✓] ĐÃ ĐĂNG KÝ THÀNH CÔNG TÁC VỤ SAO LƯU TỰ ĐỘNG!
    echo Mỗi đêm vào đúng 23:59, Windows sẽ tự động chạy script và gửi
    echo file sao lưu snapshot SQLite vào Telegram của Giám Đốc.
    echo ================================================================
) else (
    echo.
    echo [X] Lỗi khi tạo tác vụ bằng schtasks.
)

echo.
pause

@echo off
chcp 65001 >nul
title Gỡ Cài Đặt Dịch Vụ Windows (NSSM)
color 0C

echo ================================================================
echo    GỠ BỎ DỊCH VỤ WINDOWS SERVICE
echo ================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Vui lòng click chuột phải và chọn "Run as administrator"!
    pause
    exit /b 1
)

set SERVICE_NAME=WED_HOACHTOAN_SERVICE

where nssm >nul 2>nul
if %errorlevel% neq 0 (
    sc stop %SERVICE_NAME% >nul 2>&1
    sc delete %SERVICE_NAME%
) else (
    nssm stop %SERVICE_NAME%
    nssm remove %SERVICE_NAME% confirm
)

echo.
echo [✓] Đã gỡ bỏ dịch vụ %SERVICE_NAME% thành công!
pause

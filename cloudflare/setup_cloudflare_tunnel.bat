@echo off
chcp 65001 >nul
title Cài Đặt Cloudflare Tunnel Client (cloudflared)
color 0A

echo ================================================================
echo    TẢI VÀ THIẾT LẬP CLOUDFLARED CLIENT CHÍNH THỨC (WINDOWS X64)
echo ================================================================
echo.

set TARGET_EXE=%~dp0cloudflared.exe

if exist "%TARGET_EXE%" (
    echo [✓] File cloudflared.exe đã tồn tại tại: %TARGET_EXE%
    echo [*] Kiểm tra phiên bản hiện tại:
    "%TARGET_EXE%" --version
    echo.
    goto done
)

echo [*] Đang tải bản mới nhất của cloudflared-windows-amd64.exe từ GitHub Cloudflare...
echo [*] Link tải: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
echo.

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', '%TARGET_EXE%')"

if exist "%TARGET_EXE%" (
    echo.
    echo [✓] Tải thành công cloudflared.exe!
    echo [*] Kiểm tra phiên bản:
    "%TARGET_EXE%" --version
    echo.
) else (
    echo.
    echo [X] Lỗi tải tự động. Vui lòng tải thủ công file cloudflared-windows-amd64.exe 
    echo     tại https://github.com/cloudflare/cloudflared/releases
    echo     sau đó đổi tên thành cloudflared.exe và đặt vào thư mục C:\WED_HOACHTOAN\cloudflare\
    echo.
)

:done
echo Hoàn tất cài đặt Cloudflare Tunnel!

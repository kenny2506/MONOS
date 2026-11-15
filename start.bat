@echo off
setlocal
cd /d %~dp0

echo [1/2] Iniciando Servidor Node.js...
start "Servidor Ventas Monos" node server.js

echo [2/2] Iniciando Cloudflare Tunnel...
echo.
echo ========================================================
echo TU PROYECTO ESTARA DISPONIBLE EN LA URL DE ABAJO
echo ========================================================
echo.
cloudflared.exe tunnel --url http://localhost:3020

pause

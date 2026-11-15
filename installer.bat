@echo off
chcp 65001 > nul
echo ====================================================================
echo      INSTALADOR Y MIGRACIÓN A SERVIDOR (WINDOWS) - MONOS MULTITIENDA
echo ====================================================================

cd /d "%~dp0"

echo.
echo [Paso 1/4] Comprobando Node.js y npm...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no está instalado en este servidor.
    echo Por favor descargue e instale Node.js LTS desde https://nodejs.org/
    pause
    exit /b 1
)
node -v
npm -v

echo.
echo [Paso 2/4] Instalando dependencias de producción...
call npm install --omit=dev

echo.
echo [Paso 3/4] Comprobando archivo de configuración .env...
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env > nul
        echo ✓ Archivo .env generado a partir de .env.example
    )
) else (
    echo ✓ Archivo .env existente detectado.
)

echo.
echo [Paso 4/4] Ejecutando migración de datos hacia PostgreSQL...
node migrate.js

echo.
echo ====================================================================
echo    ¡INSTALACIÓN Y CONFIGURACIÓN COMPLETADA CON ÉXITO!
echo ====================================================================
echo Para iniciar la aplicación ejecuta:
echo   node server.js
echo O utiliza un administrador de procesos como PM2:
echo   npm install -g pm2
echo   pm2 start server.js --name "monos-multitienda"
echo.
pause

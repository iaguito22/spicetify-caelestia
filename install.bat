@echo off
rem Instalador para Windows sin git ni permisos de scripts: doble clic (o "install.bat light").
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause

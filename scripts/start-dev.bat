@echo off
set "ROOT=%~dp0.."

start "MRD Backend" cmd /k "cd /d %ROOT%\backend && pnpm run dev"
start "MRD Frontend" cmd /k "cd /d %ROOT%\frontend && pnpm run dev"

echo Backend(3000)/Frontend(5173) dev servers starting in separate windows.

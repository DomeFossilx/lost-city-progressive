@echo off
cd /d %~dp0

echo Starting Bun Launcher...
cd engine

bun run launcher

pause
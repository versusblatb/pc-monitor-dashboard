@echo off
cd /d "C:\Users\IT-DEVELOPER\Documents\My"

if not exist "logs" mkdir "logs"

echo. >> "logs\agent.log"
echo ======================================== >> "logs\agent.log"
echo Agent started: %date% %time% >> "logs\agent.log"

call npm run start -w agent >> "logs\agent.log" 2>&1
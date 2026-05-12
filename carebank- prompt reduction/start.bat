@echo off

:: Get the root folder path (where this bat file is located)
set ROOT=%~dp0

:: Start Python Flask service from its own folder
start /B cmd /c "cd /d %ROOT%python-service && python script.py"

echo Waiting for Python Flask to start...

:: Wait 5 seconds for Flask to fully boot up before starting Node
timeout /t 5 /nobreak

:: Start Node app from root folder
cd /d %ROOT%
npm start
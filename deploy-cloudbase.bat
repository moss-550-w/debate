@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "ENV_ID=cloud1-d8g0k0m526d61652a"
cd /d "%~dp0"
if errorlevel 1 goto :fail

echo.
echo ================================================
echo CloudBase deployment: debate-api
echo Environment: %ENV_ID%
echo ================================================

where tcb >nul 2>&1
if errorlevel 1 (
    echo ERROR: CloudBase CLI was not found.
    echo Install it first: npm.cmd install -g @cloudbase/cli
    goto :fail
)

call tcb --version
if errorlevel 1 (
    echo ERROR: CloudBase CLI could not start.
    goto :fail
)

echo.
echo Deploying. Complete browser authorization if prompted.
call tcb cloudrun deploy --service-name debate-api --port 3000 --source . --force --wait
if errorlevel 1 (
    echo ERROR: Deployment failed. Copy the complete output above.
    goto :fail
)

echo.
echo ================================================
echo Deployment completed successfully.
echo ================================================
echo.
pause
endlocal
exit /b 0

:fail
set "EXIT_CODE=%errorlevel%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo ================================================
echo Deployment stopped with exit code %EXIT_CODE%.
echo ================================================
echo.
pause
endlocal & exit /b %EXIT_CODE%

@echo off
REM ============================================
REM  英语辩论训练平台 — 部署到微信云托管（云环境 cloud1-d8g0k0m526d61652a）
REM  前置条件：
REM    1) 已在 https://console.cloud.tencent.com/tcb 开通云托管
REM    2) 本地已安装 Node.js ≥ 16
REM    3) 第一次运行请先执行：  npm i -g @cloudbase/cli
REM    4) 授权登录：            tcb login
REM  部署命令（直接双击运行本脚本即可）
REM ============================================

cd /d %~dp0

echo.
echo =================================================
echo   Step 1. 检查 cloudbase (tcb) CLI 是否安装
echo =================================================
where tcb >nul 2>&1
if %errorlevel% neq 0 (
    echo [缺失] 未找到 tcb，正在安装 @cloudbase/cli...
    call npm i -g @cloudbase/cli
    if %errorlevel% neq 0 (
        echo [错误] CLI 安装失败，请手动执行： npm i -g @cloudbase/cli
        pause
        exit /b 1
    )
)
tcb --version

echo.
echo =================================================
echo   Step 2. 检查是否已登录
echo =================================================
for /f "delims=" %%i in ('tcb env:list --json 2^>nul ^| find /c /i "envId"') do set count=%%i
if "%count%"=="0" (
    echo [提示] 未登录，正在跳转扫码授权...
    call tcb login
) else (
    echo [OK] 已登录微信云开发
)

echo.
echo =================================================
echo   Step 3. 部署 debate-api 服务到云环境 cloud1-d8g0k0m526d61652a
echo =================================================
call tcb framework:deploy -e cloud1-d8g0k0m526d61652a

if %errorlevel% neq 0 (
    echo.
    echo [错误] 部署失败，请查看上面的日志
    pause
    exit /b 1
)

echo.
echo =================================================
echo   部署成功！正在拉取服务内网 / 公网域名...
echo =================================================
call tcb service:list -e cloud1-d8g0k0m526d61652a

echo.
echo 提示：
echo  - 云托管内网域名形如：https://debate-api-xxxx-xxxxx-xxxxxxxxxxxx.service.tcloudbase.com
echo  - 部署后到 腾讯云/微信云托管控制台 → 服务 → debate-api → 环境变量 → 把 .env 里的豆包/百度 key 等全部粘贴进去
echo  - 把得到的 HTTPS 域名填到 miniprogram/app.js 的 apiBaseUrl，以及小程序后台「服务器 request 合法域名」
echo  - pc-web 把 API 域名同步更新
echo.
pause

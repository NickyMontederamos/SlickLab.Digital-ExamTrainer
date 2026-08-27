@echo off
setlocal

REM ============================================================
REM CM-LAW SecureExam - Demo Launcher
REM Opens 3 isolated browser windows (Student / Proctor / Admin)
REM so all three role logins can stay signed in at the same time.
REM Each window has its own separate profile/cookie jar, so
REM logging into one role does not sign the others out.
REM ============================================================

set "URL=https://slick-lab-digital-exam-trainer.vercel.app/login"
set "PROFILE_ROOT=%USERPROFILE%\CMLawDemoProfiles"

REM --- Locate a Chromium browser (Chrome first, then Edge) ---
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if "%BROWSER%"=="" if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if "%BROWSER%"=="" (
  echo Could not find Chrome or Edge in the usual install locations.
  echo Edit this script and set BROWSER to your browser's .exe path manually.
  pause
  exit /b 1
)

echo Using browser: %BROWSER%
echo.

mkdir "%PROFILE_ROOT%\student" 2>nul
mkdir "%PROFILE_ROOT%\proctor" 2>nul
mkdir "%PROFILE_ROOT%\admin" 2>nul

REM --- Window layout tuned for a 1920x1080 screen. ---
REM If your screen is a different size, just drag the windows
REM after they open - this is only a starting position.

echo Opening STUDENT window (left)...
start "" "%BROWSER%" --user-data-dir="%PROFILE_ROOT%\student" --window-position=0,0 --window-size=960,1040 --new-window "%URL%"

"%SystemRoot%\System32\ping.exe" -n 3 127.0.0.1 >nul

echo Opening PROCTOR window (right)...
start "" "%BROWSER%" --user-data-dir="%PROFILE_ROOT%\proctor" --window-position=960,0 --window-size=960,1040 --new-window "%URL%"

"%SystemRoot%\System32\ping.exe" -n 3 127.0.0.1 >nul

echo Opening ADMIN window (center, on top)...
start "" "%BROWSER%" --user-data-dir="%PROFILE_ROOT%\admin" --window-position=480,80 --window-size=960,1040 --new-window "%URL%"

echo.
echo ============================================================
echo Three isolated browser windows are now open. Log in once in
echo each - the login will be remembered next time you run this.
echo.
echo   STUDENT window  -^> student@cmlaw.demo
echo   PROCTOR window  -^> proctor@cmlaw.demo
echo   ADMIN window    -^> admin@cmlaw.demo
echo.
echo   Password (all accounts): DemoPass!2026
echo ============================================================
echo.
pause

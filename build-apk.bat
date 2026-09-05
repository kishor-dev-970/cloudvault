@echo off
rem ============================================================
rem  CloudVault - Local Android APK build helper
rem  Uses the permanent D:\Android toolchain.
rem ============================================================
setlocal

set "JAVA_HOME=D:\Android\jdk-17"
set "ANDROID_HOME=D:\Android\Sdk"
set "ANDROID_SDK_ROOT=D:\Android\Sdk"
rem Persistent Gradle + Maven cache on D: so C: isn't bloated
set "GRADLE_USER_HOME=D:\Android\gradle-cache"
rem No server — YouTube OAuth + uploads happen directly from the phone

set "PROJECT=%~dp0"
set "ANDROID_DIR=%PROJECT%mobile\android"

rem Always rewrite local.properties with FORWARD slashes (backslashes are escape
rem chars in Java .properties, so they mangle the SDK path and break the build).
set "SDK_PROP=sdk.dir=%ANDROID_HOME:\=/%"
> "%ANDROID_DIR%\local.properties" echo %SDK_PROP%
if not exist "%ANDROID_DIR%\gradlew.bat" (
  echo Native android project missing. Run: cd mobile ^&^& npx expo prebuild --platform android
  exit /b 1
)

pushd "%ANDROID_DIR%"
call gradlew.bat --no-daemon :app:assembleRelease %*
set "GRADLE_RESULT=%ERRORLEVEL%"
popd

if %GRADLE_RESULT%==0 (
  echo.
  echo ============================================================
  echo  BUILD SUCCESS - APK location:
  for %%f in ("%ANDROID_DIR%\app\build\outputs\apk\release\*.apk") do echo   %%f
  echo ============================================================
)
exit /b %GRADLE_RESULT%

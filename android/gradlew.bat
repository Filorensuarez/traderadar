@echo off
setlocal
if not exist "%~dp0gradle\wrapper\gradle-wrapper.jar" (
  echo Gradle Wrapper jar is missing. Run npm run prepare:android:wrapper from the repository root with trusted Gradle 8.9 installed. 1>&2
  exit /b 1
)
set "JAVA_EXE=java.exe"
if defined JAVA_HOME set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"
"%JAVA_EXE%" -classpath "%~dp0gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
exit /b %ERRORLEVEL%

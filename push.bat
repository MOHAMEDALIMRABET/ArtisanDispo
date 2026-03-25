@echo off
REM Script pour Git Add + Commit + Push en une seule commande
REM Usage: push.bat "votre message de commit"

if "%~1"=="" (
    echo ❌ Erreur: Message de commit requis
    echo Usage: push.bat "votre message de commit"
    exit /b 1
)

echo 📦 Git Add...
git add -A

echo ✍️ Git Commit...
git commit -m "%~1"

if %errorlevel% neq 0 (
    echo ⚠️ Aucun changement à commiter ou erreur de commit
    exit /b 1
)

echo 🚀 Git Push...
git push origin main

if %errorlevel% equ 0 (
    echo ✅ Tous les changements ont été poussés avec succès !
) else (
    echo ❌ Erreur lors du push
    exit /b 1
)

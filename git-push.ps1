git add .
git commit -m "Mise à jour guide paiement utilisateurs"
git push origin main
Write-Host "`nTerminé! Appuyez sur une touche pour continuer..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

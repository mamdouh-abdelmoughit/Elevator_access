$chars = @('|', '/', '--', '\')
$i = 0
$maxWait = 30  # seconds before giving up

Write-Host ""
Write-Host "   Demarrage du serveur..." -ForegroundColor Cyan
Write-Host ""

$start = Get-Date
while ($true) {
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    if ($elapsed -ge $maxWait) {
        Write-Host "`r   [!] Timeout - verifiez que pm2 est installe.   " -ForegroundColor Red
        exit 1
    }
    Write-Host ("`r   Chargement  " + $chars[$i % 4] + "   (${elapsed}s)   ") -NoNewline -ForegroundColor Yellow
    $i++
    try {
        $null = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        break
    } catch {}
    Start-Sleep -Milliseconds 300
}

Write-Host "`r   Serveur pret !                              " -ForegroundColor Green
Write-Host ""
Write-Host "   Ouverture du navigateur..." -ForegroundColor Cyan
Start-Sleep -Milliseconds 800

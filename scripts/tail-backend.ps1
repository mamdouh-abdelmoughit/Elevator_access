# Live tail of the Cloud Run backend logs (polls every 3 s).
# Usage: powershell -File scripts\tail-backend.ps1
$filterBase = 'resource.type="cloud_run_revision" AND resource.labels.service_name="elevator-backend"'
$since = (Get-Date).ToUniversalTime().AddMinutes(-5).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
Write-Host "Tailing elevator-backend logs (Ctrl+C to stop)..." -ForegroundColor Cyan

while ($true) {
  $rows = gcloud logging read "$filterBase AND timestamp>`"$since`"" `
    --project bioswitch-elevator --order=asc --limit 200 `
    --format="value(timestamp,severity,textPayload,httpRequest.requestMethod,httpRequest.requestUrl,httpRequest.status)" 2>$null
  foreach ($row in $rows) {
    $parts = $row -split "`t"
    $since = $parts[0]
    $time = ([datetime]$parts[0]).ToLocalTime().ToString('HH:mm:ss')
    $text = ($parts[2..($parts.Length - 1)] | Where-Object { $_ }) -join ' '
    $color = if ($parts[1] -match 'ERROR') { 'Red' } elseif ($parts[1] -match 'WARN') { 'Yellow' } elseif ($text -match 'ACCESS|MQTT|Card') { 'Green' } else { 'Gray' }
    Write-Host "$time $text" -ForegroundColor $color
  }
  Start-Sleep -Seconds 3
}

# Opens one window per component for end-to-end testing.
# Usage (from Desktop\Project): powershell -ExecutionPolicy Bypass -File web_dashboard\scripts\start-test-env.ps1
# Close the ESP/Nano monitor windows before flashing (they hold the COM port).
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) # Desktop\Project
$pio  = "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe"

function Open-Window($title, $dir, $command) {
  $cmd = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$dir'; $command"
  Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $cmd
}

Open-Window 'ESP32 master (COM16)' $root "& '$pio' device monitor -p COM16 -b 115200 -f time"
Open-Window 'Nano bridge (COM3)'   $root "& '$pio' device monitor -p COM3 -b 115200 -f time"
Open-Window 'Backend logs (Cloud Run)' $root "& '$PSScriptRoot\tail-backend.ps1'"
Open-Window 'Syndic app (Expo :8081)' "$root\frontend_syndic\Elevator_access"  'npx expo start --port 8081'
Start-Sleep -Seconds 20 # two Expo CLIs starting at the same moment clash
Open-Window 'Admin app (Expo :8082)'"$root\frontend_elevator\Elevator_access" 'npx expo start --port 8082'
Open-Window 'Web dashboard (:3000)'   "$root\web_dashboard" 'npm run dev'

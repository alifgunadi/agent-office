# Stops the Agent Office server listening on port 4317 (or AGENT_OFFICE_PORT).
$port = if ($env:AGENT_OFFICE_PORT) { [int]$env:AGENT_OFFICE_PORT } else { 4317 }
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) {
  Write-Host "Agent Office is not running on port $port." -ForegroundColor Yellow
  exit 0
}
$proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
if ($proc -and $proc.ProcessName -match '^(node|bun)$') {
  Stop-Process -Id $proc.Id
  Write-Host "Agent Office stopped (PID $($proc.Id))." -ForegroundColor Green
} else {
  Write-Host "Port $port is used by '$($proc.ProcessName)', not Agent Office. Nothing stopped." -ForegroundColor Red
}

# Removes the "AgentOffice" logon task created by install-autostart.ps1.
$ErrorActionPreference = "Stop"
if (Get-ScheduledTask -TaskName "AgentOffice" -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName "AgentOffice" -Confirm:$false
  Write-Host "Scheduled task 'AgentOffice' removed." -ForegroundColor Green
} else {
  Write-Host "Scheduled task 'AgentOffice' not found." -ForegroundColor Yellow
}

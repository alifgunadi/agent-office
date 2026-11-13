# Optional: start Agent Office automatically when you log in to Windows.
# Registers a per-user scheduled task "AgentOffice" that runs ensure-server.js at logon.
# Remove it with uninstall-autostart.ps1.
$ErrorActionPreference = "Stop"

$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot "ensure-server.js"

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "AgentOffice" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Starts the Agent Office server (http://127.0.0.1:4317) at logon." -Force | Out-Null

Write-Host "Scheduled task 'AgentOffice' registered. It runs at your next logon." -ForegroundColor Green
Write-Host "Test it now with: Start-ScheduledTask -TaskName AgentOffice" -ForegroundColor Yellow

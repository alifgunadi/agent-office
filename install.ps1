# Copies Agent Office from this folder to %USERPROFILE%\agent-office (stable location for the hook path).
$ErrorActionPreference = "Stop"
$dst = Join-Path $env:USERPROFILE "agent-office"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "*") $dst -Exclude "install.ps1"
Write-Host "Agent Office installed to $dst" -ForegroundColor Green
Write-Host "Next: merge hooks-settings-snippet.json into $env:USERPROFILE\.claude\settings.json" -ForegroundColor Yellow

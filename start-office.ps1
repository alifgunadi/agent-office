# Starts Agent Office in the background (if not already running) and opens it in the browser.
$ErrorActionPreference = "Stop"
$port = if ($env:AGENT_OFFICE_PORT) { [int]$env:AGENT_OFFICE_PORT } else { 4317 }
node (Join-Path $PSScriptRoot "ensure-server.js")
Start-Sleep -Milliseconds 800
Start-Process "http://127.0.0.1:$port"

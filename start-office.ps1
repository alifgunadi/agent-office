# Starts the Agent Office server and opens it in the browser.
$ErrorActionPreference = "Stop"
Start-Process "http://127.0.0.1:4317"
node (Join-Path $PSScriptRoot "server.js")

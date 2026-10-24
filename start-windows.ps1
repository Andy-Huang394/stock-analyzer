# Stock Analyzer launcher (independent of the parent QuantKit project).
# Frontend: 3000; backend: 8000. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\start-windows.ps1
param([int]$FrontendPort = 3000)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'
$reactScripts = Join-Path $root 'frontend\node_modules\react-scripts\bin\react-scripts.js'
if (-not (Test-Path $python)) { throw 'Backend venv missing. See README.' }
if (-not (Test-Path $reactScripts)) { throw 'Frontend packages missing. Run npm ci in frontend.' }
$node = (Get-Command node -ErrorAction Stop).Source
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:BROWSER = 'none'
$env:PORT = "$FrontendPort"
# CRA reads the API proxy (port 8000) from frontend/package.json.
Write-Host "Frontend http://127.0.0.1:$FrontendPort  API http://127.0.0.1:8000/docs"
Write-Host 'Ctrl+C to stop. Research/paper trading only; no live orders.'
$front = $null
try {
    $front = Start-Process -FilePath $node -ArgumentList @('"' + $reactScripts + '"', 'start') -WorkingDirectory (Join-Path $root 'frontend') -PassThru -NoNewWindow
    Push-Location (Join-Path $root 'backend')
    try { & $python -m uvicorn main:app --host 127.0.0.1 --port 8000 }
    finally { Pop-Location }
}
finally {
    if ($front -and -not $front.HasExited) { Stop-Process -Id $front.Id -Force -ErrorAction SilentlyContinue }
}

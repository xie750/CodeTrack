#requires -version 5.1
[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$LogDir = Join-Path $ProjectRoot "var\logs"
$LogFile = Join-Path $LogDir "codetrack.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

if (!(Test-Path $Python)) {
    throw "Python virtual environment was not found at $Python. Run deploy\windows\install-codetrack.ps1 first."
}

Set-Location $ProjectRoot
& $Python -m uvicorn teacher_backend.app.main:app --host 0.0.0.0 --port $Port 2>&1 |
    Tee-Object -FilePath $LogFile -Append

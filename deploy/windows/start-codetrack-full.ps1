#requires -version 5.1
[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [int]$PublicPort = 8000,
    [int]$TeacherPort = 8001,
    [int]$UnifiedPort = 8002
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$LogDir = Join-Path $ProjectRoot "var\logs"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

if (!(Test-Path $Python)) {
    throw "Python virtual environment was not found at $Python."
}
if (!(Test-Path (Join-Path $ProjectRoot "dist\index.html"))) {
    throw "Frontend dist was not found at $ProjectRoot\dist\index.html."
}
if (!(Test-Path (Join-Path $ProjectRoot "deploy\windows\codetrack_gateway.py"))) {
    throw "Production gateway was not found at $ProjectRoot\deploy\windows\codetrack_gateway.py."
}

function Start-CodeTrackService {
    param(
        [string]$Name,
        [string]$Module,
        [string]$HostValue,
        [int]$Port
    )

    $logFile = Join-Path $LogDir "$Name.log"
    $command = @"
Set-Location '$ProjectRoot'
& '$Python' -m uvicorn $Module --host $HostValue --port $Port *> '$logFile'
"@
    Start-Process -FilePath "powershell.exe" `
        -WindowStyle Hidden `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) | Out-Null
    Write-Host "Started $Name on ${HostValue}:$Port, log: $logFile"
}

Start-CodeTrackService -Name "codetrack-teacher-api" -Module "teacher_backend.app.main:app" -HostValue "127.0.0.1" -Port $TeacherPort
Start-CodeTrackService -Name "codetrack-unified-api" -Module "backend.app.main:app" -HostValue "127.0.0.1" -Port $UnifiedPort
Start-CodeTrackService -Name "codetrack-gateway" -Module "deploy.windows.codetrack_gateway:app" -HostValue "0.0.0.0" -Port $PublicPort

Start-Sleep -Seconds 5

Write-Host "Checking public gateway..."
try {
    Invoke-RestMethod "http://127.0.0.1:$PublicPort/api/v1/health" | ConvertTo-Json -Compress
    Write-Host "CodeTrack full deployment is reachable at http://<server-public-ip>:$PublicPort/"
} catch {
    Write-Warning "Gateway health check failed. Check logs in $LogDir."
    throw
}

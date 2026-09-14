#requires -version 5.1
[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [int]$PublicPort = 8000,
    [int]$TeacherPort = 8001,
    [int]$UnifiedPort = 8002,
    [string]$TaskName = "CodeTrack",
    [switch]$SkipDependencies,
    [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $ScriptRoot "..\..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$StartScript = Join-Path $ProjectRoot "deploy\windows\start-codetrack-full.ps1"
$OpenMaicRoot = Join-Path $ProjectRoot "third_party\openmaic"
$OpenMaicEntry = Join-Path $OpenMaicRoot "node_modules\@openmaic\generation\dist\index.js"

function Invoke-Native {
    param([scriptblock]$Script)
    & $Script
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE."
    }
}

if (!(Test-Path $Python)) {
    throw "Python virtual environment was not found at $Python."
}
if (!(Test-Path (Join-Path $ProjectRoot "dist\index.html"))) {
    throw "Frontend dist was not found. Upload a release package containing dist\index.html first."
}
if (!(Test-Path $StartScript)) {
    throw "Full deployment start script was not found at $StartScript."
}
if (!(Test-Path (Join-Path $OpenMaicRoot "scripts\codetrack-generate.mjs"))) {
    throw "OpenMAIC classroom generator files are missing from the release package."
}

Set-Location $ProjectRoot

if (!$SkipDependencies) {
    $Mirror = "https://mirrors.aliyun.com/pypi/simple"
    Invoke-Native { & $Python -m pip install -r ".\teacher_backend\requirements.txt" -i $Mirror --trusted-host mirrors.aliyun.com --timeout 300 --retries 10 }
    Invoke-Native { & $Python -m pip install httpx redis celery boto3 pypdf python-docx python-pptx PyMuPDF -i $Mirror --trusted-host mirrors.aliyun.com --timeout 300 --retries 10 }
}

if (!(Test-Path $OpenMaicEntry)) {
    $Pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if (!$Pnpm) {
        throw "pnpm is required for the AI classroom generator. Install pnpm 10+ and rerun this script."
    }
    $Node = Get-Command node -ErrorAction SilentlyContinue
    if (!$Node) {
        throw "Node.js 22.19+ is required for the AI classroom generator."
    }
    Push-Location $OpenMaicRoot
    try {
        Invoke-Native { & $Pnpm.Source install --filter "@openmaic/generation..." --prod --ignore-scripts --frozen-lockfile }
    } finally {
        Pop-Location
    }
}
if (!(Test-Path $OpenMaicEntry)) {
    throw "OpenMAIC generation runtime was not installed correctly."
}

foreach ($Port in @($PublicPort, $TeacherPort, $UnifiedPort)) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force }
}

if (!$SkipFirewall) {
    $RuleName = "CodeTrack $PublicPort"
    if (!(Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $PublicPort | Out-Null
    }
}

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -ProjectRoot `"$ProjectRoot`" -PublicPort $PublicPort -TeacherPort $TeacherPort -UnifiedPort $UnifiedPort"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$TeacherHealthUrl = "http://127.0.0.1:$TeacherPort/api/v1/health"
$UnifiedHealthUrl = "http://127.0.0.1:$UnifiedPort/api/v1/health"
$GatewayHealthUrl = "http://127.0.0.1:$PublicPort/api/v1/health"
$Deadline = (Get-Date).AddSeconds(60)
do {
    Start-Sleep -Seconds 2
    try {
        $TeacherHealth = Invoke-RestMethod -Uri $TeacherHealthUrl -TimeoutSec 5
        $UnifiedHealth = Invoke-RestMethod -Uri $UnifiedHealthUrl -TimeoutSec 5
        $GatewayHealth = Invoke-RestMethod -Uri $GatewayHealthUrl -TimeoutSec 5
        Write-Host ("Teacher: {0}; Unified: {1}; Gateway: {2}" -f $TeacherHealth.status, $UnifiedHealth.status, $GatewayHealth.status)
        Write-Host "Public URL: http://<server-public-ip>:$PublicPort/"
        exit 0
    } catch {
        if ((Get-Date) -ge $Deadline) {
            throw "CodeTrack did not become healthy. Check var\logs\codetrack-*.log."
        }
    }
} while ($true)

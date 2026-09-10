#requires -version 5.1
[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [int]$Port = 8000,
    [string]$PythonCommand = "python",
    [string]$TaskName = "CodeTrack",
    [switch]$SkipFrontendInstall,
    [switch]$SkipFrontendBuild,
    [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$StartScript = Join-Path $ProjectRoot "deploy\windows\start-codetrack.ps1"

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Script
    )

    Write-Host "==> $Name"
    & $Script
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Script
    )

    & $Script
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE."
    }
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$IsAdmin = Test-Administrator
if (!$IsAdmin -and !$SkipFirewall) {
    Write-Warning "This shell is not running as Administrator, so the Windows Firewall rule will be skipped."
    $SkipFirewall = $true
}

Set-Location $ProjectRoot

Invoke-Step "Create Python virtual environment" {
    if (!(Test-Path $VenvPython)) {
        Invoke-Native { & $PythonCommand -m venv .venv }
    }
}

Invoke-Step "Install backend dependencies" {
    Invoke-Native { & $VenvPython -m pip install --upgrade pip }
    Invoke-Native { & $VenvPython -m pip install -r (Join-Path $ProjectRoot "teacher_backend\requirements.txt") }
}

if (!$SkipFrontendInstall) {
    Invoke-Step "Install frontend dependencies" {
        Invoke-Native { npm --prefix frontend ci }
    }
}

if (!$SkipFrontendBuild) {
    Invoke-Step "Build frontend production assets" {
        $previousNodeOptions = $env:NODE_OPTIONS
        $env:NODE_OPTIONS = "--max-old-space-size=1536"
        try {
            Invoke-Native { npm --prefix frontend run build }
        } finally {
            $env:NODE_OPTIONS = $previousNodeOptions
        }
    }
} else {
    $distIndex = Join-Path $ProjectRoot "dist\index.html"
    if (!(Test-Path $distIndex)) {
        throw "Frontend build was skipped, but $distIndex does not exist."
    }
    Write-Host "==> Skip frontend build because dist\index.html already exists"
}

Invoke-Step "Run database migrations" {
    Invoke-Native { & $VenvPython -m alembic -c (Join-Path $ProjectRoot "teacher_backend\alembic.ini") upgrade head }
}

if (!$SkipFirewall) {
    Invoke-Step "Open Windows Firewall TCP port $Port" {
        $rule = Get-NetFirewallRule -DisplayName "CodeTrack $Port" -ErrorAction SilentlyContinue
        if (!$rule) {
            New-NetFirewallRule -DisplayName "CodeTrack $Port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
        }
    }
}

Invoke-Step "Register Windows startup task" {
    $actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -ProjectRoot `"$ProjectRoot`" -Port $Port"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
}

Invoke-Step "Check local health endpoint" {
    $healthUrl = "http://127.0.0.1:$Port/api/v1/health"
    $deadline = (Get-Date).AddSeconds(45)
    do {
        Start-Sleep -Seconds 2
        try {
            $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
            Write-Host "CodeTrack is running: $($response.status)"
            Write-Host "Public URL should be: http://<server-public-ip>:$Port/"
            return
        } catch {
            if ((Get-Date) -ge $deadline) {
                throw "CodeTrack did not become healthy in time. Check var\logs\codetrack.log."
            }
        }
    } while ($true)
}

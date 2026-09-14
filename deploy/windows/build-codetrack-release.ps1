#requires -version 5.1
[CmdletBinding()]
param(
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $ScriptRoot "..\..")).Path
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$DeployRoot = Join-Path $ProjectRoot "var\deploy"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Stage = Join-Path $DeployRoot "codetrack-release-$Stamp"
$Zip = Join-Path $DeployRoot "codetrack-release-$Stamp.zip"

New-Item -ItemType Directory -Path $Stage -Force | Out-Null

$Directories = @(
    "backend\app",
    "backend\migrations",
    "teacher_backend\app",
    "teacher_backend\alembic",
    "sandbox",
    "deploy",
    "dist",
    "third_party\openmaic\packages\@openmaic\dsl",
    "third_party\openmaic\packages\@openmaic\generation",
    "third_party\openmaic\scripts"
)

foreach ($Directory in $Directories) {
    $Source = Join-Path $ProjectRoot $Directory
    if (Test-Path $Source) {
        Copy-Item $Source (Join-Path $Stage $Directory) -Recurse -Force
    }
}

$Files = @(
    "package.json",
    "README.md",
    "RUNBOOK.md",
    "AGENTS.md",
    "pytest.ini",
    "docker-compose.yml",
    ".env.example",
    "backend\requirements.txt",
    "backend\alembic.ini",
    "teacher_backend\__init__.py",
    "teacher_backend\requirements.txt",
    "teacher_backend\alembic.ini",
    "third_party\openmaic\package.json",
    "third_party\openmaic\pnpm-lock.yaml",
    "third_party\openmaic\pnpm-workspace.yaml",
    "third_party\openmaic\.npmrc",
    "third_party\openmaic\.nvmrc"
)

foreach ($File in $Files) {
    $Source = Join-Path $ProjectRoot $File
    if (Test-Path $Source) {
        Copy-Item $Source (Join-Path $Stage $File) -Force
    }
}

Get-ChildItem $Stage -Recurse -Force -Directory |
    Where-Object { $_.Name -in @("__pycache__", "node_modules", ".git", ".pytest_cache", "uploads") } |
    Sort-Object FullName -Descending |
    Remove-Item -Recurse -Force

Get-ChildItem $Stage -Recurse -Force -File |
    Where-Object {
        $_.Name -like "*.db" -or
        $_.Name -like "*.db-*" -or
        $_.Name -like "*.log" -or
        $_.FullName -match "\\uploads\\"
    } |
    Remove-Item -Force

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -CompressionLevel Optimal -Force

if (!(Test-Path (Join-Path $Stage "dist\index.html"))) {
    throw "Release is missing dist\index.html. Build the frontend before packaging."
}
if (!(Test-Path (Join-Path $Stage "deploy\windows\codetrack_gateway.py"))) {
    throw "Release is missing the production gateway."
}

Write-Host "Release package: $Zip"
Write-Host "Release size: $((Get-Item $Zip).Length) bytes"

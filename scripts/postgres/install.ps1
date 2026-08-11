[CmdletBinding()]
param(
  [string]$PackageId = 'PostgreSQL.PostgreSQL.17'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'winget is required to install native PostgreSQL on Windows.'
}

winget install --id $PackageId --exact --source winget --accept-source-agreements --accept-package-agreements
Write-Host 'PostgreSQL installation requested. Verify psql, the Windows service, and the database credentials before running migrations.'

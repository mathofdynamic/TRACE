[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = 'Stop'

if (-not $DatabaseUrl) {
  throw 'DATABASE_URL is required.'
}

$env:DATABASE_URL = $DatabaseUrl
if ($env:OS -eq 'Windows_NT') {
  & cmd.exe /d /c 'pnpm.cmd db:migrate 2>&1'
} else {
  & pnpm db:migrate
}
$migrationExitCode = $LASTEXITCODE
if ($migrationExitCode -ne 0) {
  exit $migrationExitCode
}

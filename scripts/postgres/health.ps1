[CmdletBinding()]
param(
  [string]$DatabaseUrl = $(if ($env:DATABASE_URL) { $env:DATABASE_URL } else { 'postgresql://trace:change-me@127.0.0.1:3002/trace_dev' })
)

$ErrorActionPreference = 'Stop'

if (-not $DatabaseUrl) {
  throw 'DATABASE_URL is required.'
}

$psqlPath = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psqlPath) {
  $psqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
}
if (-not (Test-Path $psqlPath)) {
  throw 'psql is not available. Install native PostgreSQL first.'
}

& $psqlPath $DatabaseUrl -v ON_ERROR_STOP=1 -c 'select 1 as trace_database_health;'

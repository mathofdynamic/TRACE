[CmdletBinding()]
param(
  [int]$Port = 3002,
  [string]$Database = 'trace_dev',
  [string]$TraceRole = 'trace',
  [string]$Password = 'change-me'
)

$ErrorActionPreference = 'Stop'
$postgresBin = 'C:\Program Files\PostgreSQL\17\bin'
$dataDirectory = Join-Path (Get-Location) '.trace-cache\postgres-data'
$logFile = Join-Path $env:TEMP 'trace-postgres-local.log'
$passwordFile = Join-Path $env:TEMP 'trace-postgres-local-password.txt'

foreach ($binary in @('initdb.exe', 'pg_ctl.exe', 'pg_isready.exe', 'psql.exe')) {
  if (-not (Test-Path (Join-Path $postgresBin $binary))) {
    throw "PostgreSQL binary not found: $binary. Run scripts/postgres/install.ps1 first."
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path $dataDirectory) | Out-Null
try {
  Set-Content -LiteralPath $passwordFile -Value $Password -NoNewline
  if (-not (Test-Path (Join-Path $dataDirectory 'PG_VERSION'))) {
    & (Join-Path $postgresBin 'initdb.exe') -D $dataDirectory -U $TraceRole -A scram-sha-256 --pwfile=$passwordFile
  }

  & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataDirectory status *> $null
  if ($LASTEXITCODE -ne 0) {
    & (Join-Path $postgresBin 'pg_ctl.exe') -D $dataDirectory -l $logFile -o "-p $Port" start
  }
} finally {
  Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
$env:PGPASSWORD = $Password
& (Join-Path $postgresBin 'pg_isready.exe') -h 127.0.0.1 -p $Port
if ($LASTEXITCODE -ne 0) {
  throw "Local PostgreSQL did not become ready. Check $logFile."
}

$databaseExists = & (Join-Path $postgresBin 'psql.exe') -h 127.0.0.1 -p $Port -U trace -d postgres -tAc "select 1 from pg_database where datname='$Database';"
if (-not $databaseExists -or $databaseExists.Trim() -ne '1') {
  & (Join-Path $postgresBin 'psql.exe') -h 127.0.0.1 -p $Port -U trace -d postgres -v ON_ERROR_STOP=1 -c "create database `"$Database`";"
}

Write-Host "Local PostgreSQL is ready at 127.0.0.1:$Port/$Database for user $TraceRole."

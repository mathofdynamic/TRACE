[CmdletBinding()]
param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$PsqlPath = 'C:\Program Files\PostgreSQL\17\bin\psql.exe',
  [switch]$ConfirmReset
)

$ErrorActionPreference = 'Stop'

if (-not $ConfirmReset) {
  throw 'Pass -ConfirmReset to drop and recreate the local database. This is destructive.'
}

if (-not $DatabaseUrl) {
  throw 'DATABASE_URL is required.'
}

if (-not (Test-Path -LiteralPath $PsqlPath)) {
  $psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
  if ($psqlCommand) {
    $PsqlPath = $psqlCommand.Source
  } else {
    throw "psql was not found at '$PsqlPath' or on PATH."
  }
}

$uri = [Uri]$DatabaseUrl
$database = $uri.AbsolutePath.TrimStart('/')
$adminUrl = "$($uri.Scheme)://$($uri.UserInfo)@$($uri.Host):$($uri.Port)/postgres"
& $PsqlPath $adminUrl -v ON_ERROR_STOP=1 -c "drop database if exists `"$database`";"
& $PsqlPath $adminUrl -v ON_ERROR_STOP=1 -c "create database `"$database`";"
Write-Host "Reset local database '$database'."

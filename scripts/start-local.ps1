$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
node scripts/local-setup.mjs
if ($LASTEXITCODE -ne 0) { throw 'Docker services failed. Start Docker Desktop and retry.' }
npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
npm.cmd run db:seed
if ($LASTEXITCODE -ne 0) { throw 'Seed failed.' }
Write-Host 'Open http://127.0.0.1:5173'
npm.cmd run dev

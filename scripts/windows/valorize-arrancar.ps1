# Valorize Finance - arranque local en Windows
# Clona (o actualiza) el proyecto, levanta Postgres/Redis/MinIO/Mailpit (sin Docker),
# instala dependencias, prepara la base de datos y arranca la API y la web.
$ErrorActionPreference = 'Stop'
$Docs   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Repo   = Join-Path $Docs 'valorize-finance'
$Logs   = Join-Path $Docs 'valorize-logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
Start-Transcript -Path (Join-Path $Logs 'setup.log') -Force | Out-Null

function Step($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Green }
function Fail($t) { Write-Host ""; Write-Host "ERROR: $t" -ForegroundColor Red; Stop-Transcript | Out-Null; exit 1 }
function Has($c)  { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Run($cmd) {
  Write-Host "> $cmd" -ForegroundColor DarkGray
  cmd /c "$cmd 2>&1"
  if ($LASTEXITCODE -ne 0) { Fail "Fallo al ejecutar: $cmd" }
}

Step 'Comprobando herramientas'
if (-not (Has git))    { Fail 'Falta Git. Instalalo desde https://git-scm.com/download/win y vuelve a ejecutar.' }
if (-not (Has node))   { Fail 'Falta Node.js 22. Instalalo desde https://nodejs.org (version LTS) y vuelve a ejecutar.' }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
Write-Host "$(git --version) | node $(node -v)"
if ($nodeMajor -lt 20) { Fail "Node $(node -v) es antiguo. Instala Node 22 LTS." }
if (-not (Has pnpm)) {
  Step 'Instalando pnpm'
  Run 'npm install -g pnpm@10.28.0'
  $env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
  if (-not (Has pnpm)) { $env:Path += ";$env:APPDATA\npm" }
}
Write-Host "pnpm $(pnpm -v)"

Step 'Descargando el proyecto'
if (Test-Path (Join-Path $Repo '.git')) {
  Set-Location $Repo; Run 'git pull --ff-only'
} else {
  Set-Location $Docs; Run 'git clone https://github.com/solertesting-prog/valorize-finance.git'
  Set-Location $Repo
}

Step 'Configuracion local'
if (-not (Test-Path 'apps\api\.env'))       { Copy-Item 'apps\api\.env.example' 'apps\api\.env' }
if (-not (Test-Path 'apps\web\.env.local')) { Copy-Item 'apps\web\.env.example' 'apps\web\.env.local' }

Step 'Instalando dependencias (la primera vez tarda unos minutos)'
Run 'pnpm install --filter @valorize/api... --filter @valorize/web...'

Step 'Arrancando PostgreSQL, Redis, MinIO y Mailpit (la primera vez descarga unos 300 MB)'
$ready = Join-Path $Repo '.local-services\ready'
# Marca de una ejecucion anterior cerrada de golpe: si Redis no escucha, los servicios no estan en marcha.
if ((Test-Path $ready) -and -not (Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue)) { Remove-Item $ready -Force }
if (-not (Test-Path $ready)) {
  $svcLog = Join-Path $Repo '.local-services\servicios.log'
  Start-Process cmd -ArgumentList '/k', "title Valorize SERVICIOS && cd /d `"$Repo`" && node infra/local-services.mjs"
  for ($i = 0; $i -lt 200; $i++) { if (Test-Path $ready) { break }; Start-Sleep 3 }
  if (-not (Test-Path $ready)) { Fail "Los servicios no arrancan. Mira la ventana 'Valorize SERVICIOS' y $svcLog" }
}
Write-Host 'Servicios en marcha'

Step 'Preparando base de datos'
Run 'pnpm --filter @valorize/shared build'
Run 'pnpm --filter @valorize/api exec prisma generate'
Run 'pnpm --filter @valorize/api exec prisma migrate deploy'
$env:SEED_ADMIN_EMAIL = 'admin@valorize.local'
$env:SEED_ADMIN_PASSWORD = 'Admin123456'
$env:SEED_DEMO = 'true'
Run 'pnpm --filter @valorize/api seed'

Step 'Arrancando API (puerto 4000) y web (puerto 3000)'
$apiLog = Join-Path $Logs 'api.log'; $webLog = Join-Path $Logs 'web.log'
Start-Process cmd -ArgumentList '/k', "title Valorize API && cd /d `"$Repo`" && pnpm --filter @valorize/api dev > `"$apiLog`" 2>&1"
Start-Process cmd -ArgumentList '/k', "title Valorize WEB && cd /d `"$Repo`" && pnpm --filter @valorize/web dev > `"$webLog`" 2>&1"

function WaitUrl($u, $secs) {
  for ($i = 0; $i -lt $secs; $i += 3) {
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 5; if ($r.StatusCode -lt 500) { return $true } } catch {}
    Start-Sleep 3
  }
  return $false
}
Write-Host 'Esperando a la API...'
if (-not (WaitUrl 'http://localhost:4000/health/live' 180)) { Fail "La API no arranca. Mira $apiLog" }
Write-Host 'API lista. Esperando a la web (la primera compilacion tarda)...'
if (-not (WaitUrl 'http://localhost:3000/' 300)) { Fail "La web no arranca. Mira $webLog" }

Step 'Todo listo'
Write-Host 'Web:            http://localhost:3000'
Write-Host 'API (Swagger):  http://localhost:4000/docs'
Write-Host 'Correos:        http://localhost:8025'
Write-Host 'Cuentas: admin@valorize.local / Admin123456 | cliente@demo.valorize / Cliente1234 | empleado@demo.valorize / Empleado1234'
Start-Process 'http://localhost:3000'
Stop-Transcript | Out-Null

<#
  PrintCopilot on this machine. Nothing here knows where production is.

    .\local.ps1            start the database, the API and the website, and print the addresses
    .\local.ps1 stop       stop all three (the data is kept)
    .\local.ps1 status     say what is running
    .\local.ps1 seed       fill the local database with the demo shop (safe to repeat)
    .\local.ps1 reset      throw the local database away and build it again with the demo shop

  Or double-click start-local.cmd.

  The database and the cache run in Docker (docker-compose.local.yml), on this
  machine only. The API is started by backend\run_local.py, which points it at
  that database and blanks every key that reaches a real service: no mail, no
  payments, no labels, no supplier orders, no image uploads, no AI.
#>
param([string]$Command = "start")

$Root = $PSScriptRoot
$Compose = Join-Path $Root "docker-compose.local.yml"
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$Db = "printcopilot-local-db"

function Say($text, $colour = "Gray") { Write-Host $text -ForegroundColor $colour }
function Quiet($line) { cmd /c "$line >nul 2>&1"; return ($LASTEXITCODE -eq 0) }
function Listening($port) { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Stop-Port($port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -Confirm:$false -ErrorAction SilentlyContinue }
}
function Answers($url) {
  try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4; return ($r.StatusCode -lt 500) } catch { return $false }
}

function Start-Docker {
  if (Quiet "docker info") { return }
  $exe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path $exe)) { throw "Docker Desktop is not installed. The local database runs in it." }
  Say "Starting Docker Desktop (about a minute)..."
  Start-Process $exe -WindowStyle Minimized
  for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Seconds 2; if (Quiet "docker info") { return } }
  throw "Docker did not start. Open Docker Desktop by hand, wait for it, and run this again."
}

function Start-Database {
  Start-Docker
  cmd /c "docker compose -f `"$Compose`" up -d >nul 2>&1"
  for ($i = 0; $i -lt 40; $i++) {
    $state = (cmd /c "docker inspect -f {{.State.Health.Status}} $Db 2>nul")
    if ($state -eq "healthy") { return }
    Start-Sleep -Seconds 2
  }
  throw "The local database did not come up. Look at: docker logs $Db"
}

function Run-Backend($what) {
  if (-not (Test-Path $Python)) { throw "backend\.venv is missing. Make it: cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt" }
  Push-Location $Backend
  try {
    $env:PYTHONIOENCODING = "utf-8"
    # The migration and mail chatter is left out; what is made, and what failed, is shown.
    & $Python run_local.py $what 2>&1 |
      Where-Object { "$_" -notmatch "^(INFO|DEBUG)|No Resend key|sqlalchemy|^\s*$" } |
      ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { Say "  ($what ended with an error; see above)" "Yellow" }
  }
  finally { Pop-Location }
}

function Shops { return [int](cmd /c "docker exec $Db psql -U postgres -d printcopilot_local -At -c `"select count(*) from tenants`" 2>nul") }

function Show-Addresses {
  Say ""
  Say "  PrintCopilot is running on this machine. Production is not involved." "Green"
  Say ""
  Say "  Demo shop's admin   http://demo.localhost:3000/admin/dashboard" "White"
  Say "      sign in         admin@example.com  /  Local@12345"
  Say "  Demo shop's site    http://demo.localhost:3000"
  Say "      a customer      maya.thompson@example.com  /  Local@12345"
  Say "  Platform console    http://localhost:3000/platform"
  Say "      sign in         platform@example.com  /  Local@12345   (at http://localhost:3000/login?tenant=)"
  Say "  API                 http://localhost:8000/docs"
  Say ""
  Say "  Stop everything:    .\local.ps1 stop"
  Say ""
}

switch ($Command.ToLower()) {
  "start" {
    Say "Local database..."; Start-Database
    Say "Tables up to date..."; Run-Backend "migrate"
    if ((Shops) -eq 0) { Say "First run: making the demo shop (two or three minutes)..."; Run-Backend "seed" }
    # Each in a window of its own, minimized to the taskbar: its log is there to
    # look at, and closing the window stops it.
    if (Listening 8000) { Say "API already running." } else {
      Say "API (about half a minute to load)..."
      Start-Process cmd -WindowStyle Minimized -ArgumentList "/k", "title PrintCopilot LOCAL - API && cd /d `"$Backend`" && `"$Python`" run_local.py"
    }
    if (Listening 3000) { Say "Website already running." } else {
      Say "Website..."
      # The website is told where the local API is; nothing else is in reach of it.
      $web = "title PrintCopilot LOCAL - Website && cd /d `"$Frontend`" && " +
             "set NEXT_PUBLIC_API_URL=http://localhost:8000&& set INTERNAL_API_URL=http://127.0.0.1:8000&& " +
             "set NEXT_PUBLIC_PLATFORM_DOMAIN=localhost&& npm run dev"
      Start-Process cmd -WindowStyle Minimized -ArgumentList "/k", $web
    }
    for ($i = 0; $i -lt 75; $i++) { if ((Answers "http://127.0.0.1:8000/health") -and (Listening 3000)) { break }; Start-Sleep -Seconds 2 }
    if (-not (Answers "http://127.0.0.1:8000/health")) { Say "The API has not answered yet. Look at its window for the reason." "Yellow" }
    Show-Addresses
  }
  "stop" {
    Stop-Port 3000; Stop-Port 8000
    if (Quiet "docker info") { cmd /c "docker compose -f `"$Compose`" stop >nul 2>&1" }
    Say "Stopped. The local data is kept; .\local.ps1 starts it again."
  }
  "status" {
    $db = if (Quiet "docker info") { (cmd /c "docker inspect -f {{.State.Health.Status}} $Db 2>nul") } else { "docker is not running" }
    Say ("database  : " + $(if ($db) { $db } else { "not started" }))
    Say ("API       : " + $(if (Answers "http://127.0.0.1:8000/health") { "running, http://localhost:8000" } else { "not running" }))
    Say ("website   : " + $(if (Listening 3000) { "running, http://demo.localhost:3000" } else { "not running" }))
  }
  "seed" { Start-Database; Run-Backend "migrate"; Run-Backend "seed" }
  "reset" {
    Say "Throwing the LOCAL database away (this machine only) and building it again..."
    Stop-Port 8000
    Start-Docker
    cmd /c "docker compose -f `"$Compose`" down -v >nul 2>&1"
    Start-Database
    Run-Backend "migrate"
    Run-Backend "seed"
    Say "Done. Start it with .\local.ps1"
  }
  default { Say "Unknown: $Command. One of: start, stop, status, seed, reset" "Yellow" }
}

# Start the bot with proper error handling
Write-Host "[START] Starting ClickCS-VCBot..." -ForegroundColor Cyan

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "[OK] npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] npm is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Install dependencies if node_modules doesn't exist
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "[WARN] .env file not found. Creating a default one..." -ForegroundColor Yellow
    @'
# Discord Bot Token
DISCORD_TOKEN=your_discord_bot_token_here

# Bot Configuration
PREFIX=!
VERSION=1.0.0

# Logging
LOG_LEVEL=debug
'@ | Out-File -FilePath ".env" -Encoding utf8 -NoNewline
    Write-Host "[INFO] Please edit the .env file with your bot token and restart the bot" -ForegroundColor Yellow
    Start-Process "notepad.exe" ".env"
    exit 1
}

# Start the bot
Write-Host "[START] Starting the bot..." -ForegroundColor Cyan
node main.js

# Keep the window open if there's an error
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Bot stopped with error code $LASTEXITCODE" -ForegroundColor Red
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}

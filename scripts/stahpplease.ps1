# PowerShell script to stop the Discord bot
# Set execution policy for this script
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Find and stop the Node.js process running the bot
$botProcess = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*main.js*' }
if ($botProcess) {
    Stop-Process -Id $botProcess.Id -Force
    Write-Host "Bot process stopped"
} else {
    Write-Host "No bot process found"
}

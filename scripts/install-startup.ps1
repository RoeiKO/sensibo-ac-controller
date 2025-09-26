# AC Controller Startup Installation Script

param(
    [switch]$Run,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$StartupFileName = "ac-controller.bat"

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    switch ($Type) {
        "Success" { Write-Host "[OK] $Message" -ForegroundColor Green }
        "Error" { Write-Host "[ERROR] $Message" -ForegroundColor Red }
        default { Write-Host $Message }
    }
}

function Install-ACControllerStartup {
    Write-Host "`nAC Controller Startup Installation" -ForegroundColor Blue
    
    # Enforce running from project root
    if (-not (Test-Path "package.json")) {
        Write-Status "Must run from project root directory!" -Type "Error"
        Write-Host "Current location: $(Get-Location)"
        Write-Host "Please run: .\scripts\install-startup.ps1"
        exit 1
    }
    
    $projectDir = Get-Location
    $scriptDir = Join-Path $projectDir "scripts"
    Write-Host "Project: $projectDir"
    
    # Check Node.js
    try {
        $nodeVersion = & node --version 2>$null
        Write-Status "Node.js $nodeVersion found"
    }
    catch {
        Write-Status "Node.js not found - install from https://nodejs.org/" -Type "Error"
        exit 1
    }
    
    # Install dependencies if needed
    if (-not (Test-Path (Join-Path $projectDir "node_modules"))) {
        Write-Host "Installing dependencies..."
        Push-Location $projectDir
        & npm install
        Pop-Location
    }
    
    # Build if needed
    if (-not (Test-Path (Join-Path $projectDir "dist"))) {
        Write-Host "Building project..."
        Push-Location $projectDir
        & npm run build
        Pop-Location
    }
    
    # Create startup batch file in scripts folder
    $startupBatPath = Join-Path $scriptDir "start-ac-controller.bat"
    Write-Host "Creating startup file..."
    
    $batContent = @'
@echo off
echo Starting AC Controller...
cd /d "PROJECTDIR"

if not exist ".env" (
    echo ERROR: .env file not found. Please create it with your Sensibo credentials.
    pause
    exit /b 1
)

npm start
if errorlevel 1 pause
'@
    
    # Replace placeholder with actual project directory
    $batContent = $batContent.Replace("PROJECTDIR", $projectDir)
    
    $batContent | Out-File -FilePath $startupBatPath -Encoding ASCII -Force
    
    # Check if already installed
    $startupFolder = [Environment]::GetFolderPath("Startup")
    $startupLinkPath = Join-Path $startupFolder $StartupFileName
    
    if (Test-Path $startupLinkPath) {
        Write-Status "AC Controller is already installed in Windows startup" -Type "Success"
        Write-Host "To reinstall, run: scripts\install-startup.ps1 -Uninstall first"
        return
    }
    
    try {
        Copy-Item $startupBatPath $startupLinkPath -Force
        Write-Status "Successfully installed to Windows startup!" -Type "Success"
        Write-Host "`nNext steps:"
        Write-Host "1. Create .env file with your Sensibo credentials"
        Write-Host "2. (optional) Run manually with: scripts\install-startup.ps1 -Run"
        Write-Host "3. (optional) Restart Windows to verify auto-start"
        
        # Ask if user wants to run it now
        Write-Host ""
        $runNow = Read-Host "Start AC Controller in the background now? (y/N)"
        if ($runNow -eq "y" -or $runNow -eq "Y") {
            Write-Host "`nStarting AC Controller..."
            Start-Process -FilePath $startupBatPath -WindowStyle Normal
        }
    }
    catch {
        Write-Status "Failed to copy to startup folder" -Type "Error"
        Write-Host "`nManual steps:"
        Write-Host "1. Press Win+R, type: shell:startup"
        Write-Host "2. Copy: $startupBatPath"
    }
}

function Start-ACControllerService {
    Write-Host "`nStarting AC Controller..." -ForegroundColor Blue
    
    # Enforce running from project root
    if (-not (Test-Path "package.json")) {
        Write-Status "Must run from project root directory!" -Type "Error"
        Write-Host "Current location: $(Get-Location)"
        Write-Host "Please run: .\scripts\install-startup.ps1 -Run"
        exit 1
    }
    
    $projectDir = Get-Location
    $scriptDir = Join-Path $projectDir "scripts"
    $startupBatPath = Join-Path $scriptDir "start-ac-controller.bat"
    
    if (Test-Path $startupBatPath) {
        Write-Host "Press Ctrl+C to stop the AC Controller"
        Start-Sleep 2
        & cmd.exe /c "$startupBatPath"
    } else {
        Write-Status "Startup file not found. Run installation first." -Type "Error"
    }
}

function Uninstall-ACControllerStartup {
    Write-Host "`nUninstalling AC Controller..." -ForegroundColor Blue
    
    $startupFolder = [Environment]::GetFolderPath("Startup")
    $startupLinkPath = Join-Path $startupFolder $StartupFileName
    
    if (Test-Path $startupLinkPath) {
        Remove-Item $startupLinkPath -Force
        Write-Status "Removed from Windows startup" -Type "Success"
    } else {
        Write-Status "Not found in startup folder" -Type "Error"
    }
}

# Main execution
try {
    if ($Uninstall) {
        Uninstall-ACControllerStartup
    }
    elseif ($Run) {
        Start-ACControllerService
    }
    else {
        Install-ACControllerStartup
    }
}
catch {
    Write-Status "Error: $_" -Type "Error"
    exit 1
}

Write-Host "`nDone!" -ForegroundColor Green
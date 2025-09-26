# AC Controller Startup Installation Script

param(
    [switch]$Test,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$StartupFileName = "AC Controller.bat"

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
    
    # Get project directory
    $scriptDir = Split-Path -Parent $PSCommandPath
    $projectDir = Resolve-Path (Join-Path $scriptDir "..")
    Write-Host "Project: $projectDir"
    
    # Verify project
    if (-not (Test-Path (Join-Path $projectDir "package.json"))) {
        Write-Status "package.json not found" -Type "Error"
        exit 1
    }
    
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
    
    # Create startup batch file
    $startupBatPath = Join-Path $projectDir "start-ac-controller.bat"
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
        Write-Host "2. Test: scripts\install-startup.ps1 -Test"
        Write-Host "3. Restart Windows to verify auto-start"
    }
    catch {
        Write-Status "Failed to copy to startup folder" -Type "Error"
        Write-Host "`nManual steps:"
        Write-Host "1. Press Win+R, type: shell:startup"
        Write-Host "2. Copy: $startupBatPath"
    }
}

function Test-ACControllerStartup {
    Write-Host "`nTesting AC Controller..." -ForegroundColor Blue
    $scriptDir = Split-Path -Parent $PSCommandPath
    $projectDir = Resolve-Path (Join-Path $scriptDir "..")
    $startupBatPath = Join-Path $projectDir "start-ac-controller.bat"
    
    if (Test-Path $startupBatPath) {
        Write-Host "Press Ctrl+C to stop test"
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
    elseif ($Test) {
        Test-ACControllerStartup
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
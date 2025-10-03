Param(
    [switch]$SkipVenv,
    [switch]$SkipRequirements,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Info([string]$Message) {
    if (-not $Quiet) {
        Write-Host "[INFO] $Message"
    }
}

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
Push-Location $repoRoot

try {
    Write-Info "Working directory: $repoRoot"

    $venvPath = Join-Path $repoRoot '.venv'
    $activateScript = Join-Path $venvPath 'Scripts/Activate.ps1'

    if (-not $SkipVenv) {
        if (-not (Test-Path $venvPath)) {
            Write-Info 'Creating virtual environment (.venv)'
            py -m venv $venvPath
        }

        if (-not (Test-Path $activateScript)) {
            throw "Activation script not found: $activateScript"
        }

        Write-Info 'Activating virtual environment'
        . $activateScript
    }
    elseif (Test-Path $activateScript) {
        Write-Info 'Activating existing virtual environment (SkipVenv)'
        . $activateScript
    }
    else {
        Write-Info 'Skipping virtual environment setup (no .venv)'
    }

    if (-not $SkipRequirements) {
        Write-Info 'Upgrading pip'
        python -m pip install --upgrade pip |
            ForEach-Object { if (-not $Quiet) { Write-Host $_ } }

        Write-Info 'Installing requirements-build.txt'
        python -m pip install -r requirements-build.txt |
            ForEach-Object { if (-not $Quiet) { Write-Host $_ } }
    }

    $pyinstallerArgs = @('--clean', '--noconfirm', 'pyinstaller.spec')
    Write-Info ("Running PyInstaller: pyinstaller {0}" -f ($pyinstallerArgs -join ' '))
    pyinstaller @pyinstallerArgs

    $distPath = Join-Path $repoRoot 'dist/nightreign-relic'
    Write-Info "Build completed: $distPath"
    Write-Host "
[RESULT] Distribution folder: $distPath" -ForegroundColor Green
    Write-Host "  - nightreign-relic.exe (GUI launcher)" -ForegroundColor Green
    Write-Host "  - videos/ keeps previous contents" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}

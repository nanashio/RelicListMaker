<#
.SYNOPSIS
    WSL 上のプロジェクトを同期しながら Windows で NightReign Relic をビルドします。

.DESCRIPTION
    指定された WSL パスからプロジェクト一式を現在の Windows ワークスペースにコピーし、
    仮想環境の準備・依存パッケージのインストール・PyInstaller によるビルドを行います。

.PARAMETER SkipVenv
    仮想環境 (.venv) の作成と有効化をスキップします (既存の .venv がある場合のみ有効化)。

.PARAMETER SkipRequirements
    requirements-build.txt によるパッケージインストールをスキップします。

.PARAMETER Quiet
    情報メッセージの多くを非表示にします。

.PARAMETER WslPath
    コピー元となる WSL 側のプロジェクトディレクトリのパス (既定値: ~/nightreign-relic)。
#>


Param(
    [switch]$SkipVenv,
    [switch]$SkipRequirements,
    [switch]$Quiet,
    [string]$WslPath = '~/nightreign-relic'
)

if (-not $env:BUILD_WINDOWS_EXEC_POLICY_BYPASS) {
    $env:BUILD_WINDOWS_EXEC_POLICY_BYPASS = '1'
    $arguments = @('-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
    foreach ($param in $PSBoundParameters.GetEnumerator()) {
        if ($param.Value -is [System.Management.Automation.SwitchParameter]) {
            if ($param.Value.IsPresent) {
                $arguments += ('-{0}' -f $param.Key)
            }
        }
        elseif ($param.Value -ne $null -and $param.Value.ToString().Length -gt 0) {
            $arguments += ('-{0}' -f $param.Key)
            $arguments += $param.Value
        }
    }
    if ($MyInvocation.UnboundArguments) {
        $arguments += $MyInvocation.UnboundArguments
    }
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Wait -PassThru
    exit $process.ExitCode
}

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

    Write-Info ("Resolving WSL project path ({0})" -f $WslPath)
    $wslPathResult = & wsl.exe wslpath -w $WslPath
    $wslSource = $wslPathResult.Trim()
    $skipCopy = $false
    $copyReport = $null
    if (-not $wslSource) {
        Write-Warning ('WSL パスを解決できませんでした。コピーをスキップします: {0}' -f $WslPath)
        $skipCopy = $true
    }
    elseif (-not (Test-Path $wslSource)) {
        Write-Warning ('WSL コピー元パスが見つかりません。コピーをスキップします: {0}' -f $wslSource)
        $skipCopy = $true
    }

    if (-not $skipCopy) {
        Write-Info 'Copying files from WSL'
        Write-Host ("  Source: {0}" -f $wslSource) -ForegroundColor Cyan
        Write-Host ("  Destination: {0}" -f $repoRoot) -ForegroundColor Cyan
        $robocopyArgs = @(
            $wslSource,
            $repoRoot,
            '/E',
            '/MT:4',
            '/R:1',
            '/W:1',
            '/NJH',
            '/NJS',
            '/NP',
            '/XD', '.git', '.venv', 'results', 'videos'
        )
        $robocopyOutput = & robocopy @robocopyArgs
        $rc = $LASTEXITCODE
        if ($rc -gt 3) {
            throw "robocopy failed with exit code $rc"
        }

        $copiedLines = $robocopyOutput | Where-Object { $_ -match '\\' }
        $copiedLines = $copiedLines | Where-Object { $_ -match '\s+\d+\s+\w' }
        $copyReport = {
            Write-Info 'Files copied:'
            if ($copiedLines -and $copiedLines.Count -gt 0) {
                foreach ($line in $copiedLines) {
                    $normalized = ($line -replace '\s{2,}', ' ').Trim()
                    $parts = $normalized -split ' ' | Where-Object { $_ }
                    $rawPath = $parts[-1]
                    $relative = $rawPath.Replace($repoRoot, '').TrimStart('\\')
                    if (-not $relative) {
                        $relative = $rawPath
                    }
                    Write-Host ("    - {0}" -f $relative)
                }
            } else {
                Write-Host '    (No files copied)'
            }
        }
    }
    else {
        Write-Info 'Skipping copy step. Proceeding with build using current Windows files.'
    }

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
    if ($copyReport) {
        & $copyReport
    }
    Write-Host "  - nightreign-relic.exe (GUI launcher)" -ForegroundColor Green
    Write-Host "  - videos/ keeps previous contents" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location

    if (-not $Quiet -and $Host.Name -eq 'ConsoleHost') {
        Write-Host 'Press Enter to exit...' -ForegroundColor Yellow
        [void](Read-Host)
    }
}

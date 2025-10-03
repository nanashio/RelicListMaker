Param(
    [switch]$SkipVenv,
    [switch]$SkipRequirements,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) {
    if (-not $Quiet) {
        Write-Host "[INFO] $Message"
    }
}

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
Push-Location $repoRoot

try {
    Write-Info "作業ディレクトリ: $repoRoot"

    $venvPath = Join-Path $repoRoot '.venv'
    $activateScript = Join-Path $venvPath 'Scripts/Activate.ps1'

    if (-not $SkipVenv) {
        if (-not (Test-Path $venvPath)) {
            Write-Info '仮想環境を作成します (.venv)'
            py -m venv $venvPath
        }

        if (-not (Test-Path $activateScript)) {
            throw "仮想環境のアクティベートスクリプトが見つかりません: $activateScript"
        }

        Write-Info '仮想環境をアクティベートします'
        . $activateScript
    }
    elseif (Test-Path $activateScript) {
        Write-Info '仮想環境をアクティベートします (SkipVenv 指定)'
        . $activateScript
    }
    else {
        Write-Info '仮想環境をスキップします (.venv 未作成)'
    }

    if (-not $SkipRequirements) {
        Write-Info 'pip を最新化します'
        python -m pip install --upgrade pip |
            ForEach-Object { if (-not $Quiet) { Write-Host $_ } }

        Write-Info 'requirements-build.txt をインストールします'
        python -m pip install -r requirements-build.txt |
            ForEach-Object { if (-not $Quiet) { Write-Host $_ } }
    }

    $pyinstallerArgs = @('--clean', '--noconfirm', 'pyinstaller.spec')
    Write-Info "PyInstaller を実行します: pyinstaller $($pyinstallerArgs -join ' ')"
    pyinstaller @pyinstallerArgs

    $distPath = Join-Path $repoRoot 'dist/nightreign-relic'
    Write-Info "ビルドが完了しました: $distPath"
    Write-Host "\n[RESULT] 配布フォルダ: $distPath" -ForegroundColor Green
    Write-Host "  - 'nightreign-relic.exe' (GUI ランチャー)" -ForegroundColor Green
    Write-Host "  - 'videos/' は既存内容を保持します" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}

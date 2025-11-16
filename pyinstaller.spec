# -*- mode: python ; coding: utf-8 -*-

import shutil
from pathlib import Path

block_cipher = None

# __file__ が定義されない状況でもプロジェクトルートを指すようにする
project_dir = Path.cwd()

templates_dir = project_dir / "templates"
tesseract_dir = project_dir / "tesseract"


def collect_datas(source: Path, prefix: str):
    entries = []
    if not source.exists():
        return entries
    base_prefix = Path(prefix)
    for file_path in source.rglob('*'):
        if not file_path.is_file():
            continue
        relative_path = file_path.relative_to(source)
        target_dir = base_prefix
        if relative_path.parent != Path('.'):
            target_dir = target_dir / relative_path.parent
        entries.append((str(file_path), str(target_dir)))
    return entries

try:
    import tkinterdnd2  # type: ignore
except ImportError:  # tkinterdnd2 は任意依存
    tkinterdnd2 = None
    TKDND_DATAS = []
else:
    tkdnd_dir = Path(tkinterdnd2.__file__).resolve().parent / 'tkdnd'
    TKDND_DATAS = collect_datas(tkdnd_dir, 'tkdnd') if tkdnd_dir.exists() else []

datas = []
datas.extend(collect_datas(templates_dir, "templates"))
datas.extend(collect_datas(tesseract_dir, "tesseract"))

datas.extend(TKDND_DATAS)

version_file = project_dir / "RELEASE_VERSION"
if version_file.exists():
    datas.append((str(version_file), "."))

placeholder_root = project_dir / "build" / "__pyinstaller_placeholders__"
placeholder_root.mkdir(parents=True, exist_ok=True)
videos_placeholder = placeholder_root / "videos_placeholder.txt"
if not videos_placeholder.exists():
    videos_placeholder.write_text("", encoding="utf-8")
datas.append((str(videos_placeholder), "videos/.placeholder"))

dist_root = project_dir / 'dist' / 'RelicListMaker'
legacy_videos_dir = dist_root / 'videos'
backup_videos_dir = placeholder_root / "videos_backup"
if backup_videos_dir.exists():
    shutil.rmtree(backup_videos_dir)
if legacy_videos_dir.exists():
    shutil.copytree(legacy_videos_dir, backup_videos_dir)

hiddenimports = [
    "cv2",
    "rapidfuzz.process",
    "rapidfuzz.fuzz",
    "pytesseract",
]

if tkinterdnd2 is not None:
    hiddenimports.append("tkinterdnd2")


a = Analysis(
    ["gui/__main__.py"],
    pathex=[str(project_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

gui_exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='RelicListMaker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

cli_analysis = Analysis(
    ["relic_pipeline/cli/__main__.py"],
    pathex=[str(project_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
cli_pyz = PYZ(cli_analysis.pure, cli_analysis.zipped_data, cipher=block_cipher)

cli_exe = EXE(
    cli_pyz,
    cli_analysis.scripts,
    [],
    exclude_binaries=True,
    name="RelicListMakerCLI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    gui_exe,
    cli_exe,
    a.binaries,
    cli_analysis.binaries,
    a.zipfiles,
    cli_analysis.zipfiles,
    a.datas,
    cli_analysis.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='RelicListMaker',
)

# dist 出力に videos ディレクトリを確保
if dist_root.exists() and dist_root.is_file():
    dist_root.unlink()
videos_target_dir = dist_root / 'videos'
if backup_videos_dir.exists():
    if videos_target_dir.exists():
        shutil.rmtree(videos_target_dir)
    shutil.copytree(backup_videos_dir, videos_target_dir)
else:
    videos_target_dir.mkdir(parents=True, exist_ok=True)

# -*- mode: python ; coding: utf-8 -*-

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

datas = []
datas.extend(collect_datas(templates_dir, "templates"))
datas.extend(collect_datas(tesseract_dir, "tesseract"))

placeholder_root = project_dir / "build" / "__pyinstaller_placeholders__"
placeholder_root.mkdir(parents=True, exist_ok=True)
videos_placeholder = placeholder_root / "videos_placeholder.txt"
if not videos_placeholder.exists():
    videos_placeholder.write_text("", encoding="utf-8")
datas.append((str(videos_placeholder), "videos/.placeholder"))

hiddenimports = [
    "cv2",
    "rapidfuzz.process",
    "rapidfuzz.fuzz",
    "pytesseract",
]


a = Analysis(
    ['main.py'],
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

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='nightreign-relic',
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

viewer_analysis = Analysis(
    ['viewer_server.py'],
    pathex=[str(project_dir)],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
viewer_pyz = PYZ(viewer_analysis.pure, viewer_analysis.zipped_data, cipher=block_cipher)

viewer_exe = EXE(
    viewer_pyz,
    viewer_analysis.scripts,
    [],
    exclude_binaries=True,
    name='nightreign-relic-viewer',
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
    exe,
    viewer_exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    viewer_analysis.binaries,
    viewer_analysis.zipfiles,
    viewer_analysis.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='nightreign-relic',
)

# dist 出力に videos ディレクトリを確保
dist_root = project_dir / 'dist' / 'nightreign-relic'
if dist_root.exists() and dist_root.is_file():
    dist_root.unlink()
legacy_exe = project_dir / 'dist' / 'nightreign-relic.exe'
if legacy_exe.exists():
    legacy_exe.unlink()
(dist_root / 'videos').mkdir(parents=True, exist_ok=True)

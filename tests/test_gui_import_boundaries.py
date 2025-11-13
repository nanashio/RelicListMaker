from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SKIP_TOP_LEVEL = {
    "gui",
    "tests",
    "node_modules",
    ".git",
    "__pycache__",
}

ALLOWLIST = {
    Path("gui_app.py"),
    Path("gui_adapters.py"),
    Path("gui_services.py"),
}

TARGET_MODULES = {
    "gui",
    "gui.adapters",
    "gui.services",
    "gui.app",
    "gui_adapters",
    "gui_services",
    "gui_app",
}


def iter_python_files() -> list[Path]:
    for path in ROOT.rglob("*.py"):
        rel = path.relative_to(ROOT)
        if rel in ALLOWLIST:
            continue
        if any(part == "__pycache__" for part in rel.parts):
            continue
        if rel.parts[0] in SKIP_TOP_LEVEL:
            continue
        yield path


def collect_import_violations() -> list[str]:
    offenders: list[str] = []
    for path in iter_python_files():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in TARGET_MODULES:
                        offenders.append(f"{path.relative_to(ROOT)}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module
                if module in TARGET_MODULES:
                    offenders.append(
                        f"{path.relative_to(ROOT)}: from {module} import ..."
                    )
    return offenders


def test_non_gui_modules_do_not_import_gui_components():
    offenders = collect_import_violations()
    assert not offenders, (
        "非 GUI モジュールが GUI 実装を直接参照しています:\n" + "\n".join(offenders)
    )

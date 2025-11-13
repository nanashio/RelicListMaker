import shutil
import subprocess
import sys
from pathlib import Path

import pytest

def test_gallery_js_modules():
    if shutil.which('node') is None:
        pytest.skip('node executable not available')

    project_root = Path(__file__).resolve().parent.parent
    script_path = project_root / 'tests' / 'js' / 'gallery_modules.test.mjs'
    result = subprocess.run(
        ['node', '--test', str(script_path)],
        cwd=project_root,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
    assert result.returncode == 0

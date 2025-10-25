import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import generate_gallery


def test_copy_gallery_modules_copies_required_viewer_scripts(tmp_path):
    """`generate_gallery` が効果ビューの必須モジュールをコピーすることを検証する."""
    output_dir = tmp_path / "viewer"

    generate_gallery._copy_gallery_modules(str(output_dir))

    expected_files = [
        Path("gallery/render/effectViewModel.js"),
        Path("gallery/utils/filter.js"),
    ]

    for relative_path in expected_files:
        copied_file = output_dir / relative_path
        assert copied_file.is_file(), f"{copied_file} が出力されていません"

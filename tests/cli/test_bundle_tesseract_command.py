from argparse import Namespace
from pathlib import Path

from tesseract_bundle import TesseractInfo

from relic_cli.commands import bundle_tesseract as command


def test_bundle_tesseract_require_flag_fails_when_missing(monkeypatch, capsys):
    monkeypatch.setattr(command, "find_bundled_tesseract", lambda: None)

    exit_code = command._handle(Namespace(activate=False, require=True))

    assert exit_code == 1
    captured = capsys.readouterr().out
    assert "見つかりません" in captured


def test_bundle_tesseract_activate_configures(monkeypatch, tmp_path, capsys):
    info = TesseractInfo(cmd=tmp_path / "bin" / "tesseract.exe", tessdata_prefix=tmp_path / "tessdata")
    monkeypatch.setattr(command, "find_bundled_tesseract", lambda: info)

    captured: dict[str, Path] = {}

    def fake_configure():
        captured["cmd"] = info.cmd
        return info

    monkeypatch.setattr(command, "configure_pytesseract", fake_configure)
    monkeypatch.setattr(command, "is_system_tesseract_preferred", lambda: False)

    exit_code = command._handle(Namespace(activate=True, require=False))

    assert exit_code == 0
    assert captured["cmd"] == info.cmd
    output = capsys.readouterr().out
    assert "pytesseract" in output
    assert str(info.cmd) in output


def test_bundle_tesseract_activate_prefers_system(monkeypatch, capsys):
    monkeypatch.setattr(command, "find_bundled_tesseract", lambda: None)
    monkeypatch.setattr(command, "configure_pytesseract", lambda: None)
    monkeypatch.setattr(command, "is_system_tesseract_preferred", lambda: True)
    monkeypatch.setattr(command, "system_tesseract_reason", lambda: "wsl")

    exit_code = command._handle(Namespace(activate=True, require=False))

    assert exit_code == 0
    output = capsys.readouterr().out
    assert "システムの Tesseract" in output
    assert "wsl" in output

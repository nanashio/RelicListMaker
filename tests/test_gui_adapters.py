"""gui.adapters の補助機能テスト."""
from __future__ import annotations

import queue
import sys

from gui.adapters import QueueWriter, redirect_streams


def test_queue_writer_stores_messages() -> None:
    target = queue.Queue[str]()
    writer = QueueWriter(target)

    written = writer.write("hello")
    writer.write("\nworld")

    assert written == len("hello")
    collected = []
    while not target.empty():
        collected.append(target.get_nowait())
    assert "hello" in collected[0]
    assert any("world" in chunk for chunk in collected)


def test_redirect_streams_restores_stdout_and_stderr() -> None:
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    target = queue.Queue[str]()

    with redirect_streams(target):
        print("standard", end="")
        sys.stderr.write("error")

    assert sys.stdout is original_stdout
    assert sys.stderr is original_stderr

    captured = []
    while not target.empty():
        captured.append(target.get_nowait())
    combined = "".join(captured)
    assert "standard" in combined
    assert "error" in combined

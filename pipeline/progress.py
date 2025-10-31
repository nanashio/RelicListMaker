"""進行状況通知の抽象化."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional, Protocol


class ProgressReporter(Protocol):
    """進行状況を通知するためのインターフェース."""

    def prepare(self, total_steps: int) -> None:
        """処理開始前に全ステップ数を通知する."""

    def step(self, message: str) -> None:
        """現在のステップでの進行状況メッセージを通知する."""

    def advance(self, message: str) -> None:
        """ステップを 1 進めてメッセージを通知する."""


class NullProgressReporter:
    """何もしない進行レポーター."""

    def prepare(self, total_steps: int) -> None:  # noqa: D401 - インターフェースの空実装
        return

    def step(self, message: str) -> None:  # noqa: D401 - インターフェースの空実装
        return

    def advance(self, message: str) -> None:  # noqa: D401 - インターフェースの空実装
        return


@dataclass
class CallbackProgressReporter:
    """コールバックを通じて進行状況を通知するレポーター."""

    callback: Optional[Callable[[int, int, str], None]] = None
    _current_step: int = field(default=0, init=False)
    _total_steps: int = field(default=1, init=False)

    def prepare(self, total_steps: int) -> None:
        self._total_steps = max(total_steps, 1)
        self._current_step = 0

    def step(self, message: str) -> None:
        self._notify(message)

    def advance(self, message: str) -> None:
        self._current_step = min(self._current_step + 1, self._total_steps)
        self._notify(message)

    def _notify(self, message: str) -> None:
        if not self.callback:
            return
        try:
            self.callback(self._current_step, self._total_steps, message)
        except Exception as callback_err:  # pragma: no cover - 通知失敗は致命的でない
            print(f"[WARN] プログレス更新に失敗しました: {callback_err}")


@dataclass
class CliProgressReporter:
    """標準出力へシンプルに進行状況を表示するレポーター."""

    callback: Optional[Callable[[int, int, str], None]] = None
    _current_step: int = field(default=0, init=False)
    _total_steps: int = field(default=1, init=False)

    def prepare(self, total_steps: int) -> None:
        self._total_steps = max(total_steps, 1)
        self._current_step = 0

    def step(self, message: str) -> None:
        self._emit(message)

    def advance(self, message: str) -> None:
        self._current_step = min(self._current_step + 1, self._total_steps)
        self._emit(message)

    def _emit(self, message: str) -> None:
        print(f"[PROGRESS] ({self._current_step}/{self._total_steps}) {message}")
        if self.callback:
            try:
                self.callback(self._current_step, self._total_steps, message)
            except Exception as callback_err:  # pragma: no cover - 通知失敗は致命的でない
                print(f"[WARN] プログレス更新に失敗しました: {callback_err}")

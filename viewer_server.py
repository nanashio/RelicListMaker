"""結果ビューワ用の軽量HTTPサーバー."""
from __future__ import annotations

import argparse
import contextlib
import csv
import html
import json
import socket
import sys
import threading
import traceback
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from string import Template
from typing import Iterable, Optional
from urllib.parse import quote

API_SAVE_PATH = "/__viewer_api__/save"
_RESERVED_FIELDS = [
    "Image",
    "BaseImage",
    "Dataset",
    "DatasetFolder",
    "SourceCsv",
    "SourceImage",
    "Duplicate",
    "ItemColor",
]
_EXTRA_FIELD_PREFIXES = ("Effect", "RawText")
_SAVE_LOCK = threading.Lock()

INDEX_TEMPLATE = Template(
    """<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>NightReign Relic Viewer Index</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:2rem;}h1{font-size:1.8rem;}ul{list-style:none;padding:0;}li{margin:.4rem 0;}a{text-decoration:none;color:#1e61d1;}a:hover{text-decoration:underline;}code{background:#f5f5f5;padding:.1rem .3rem;border-radius:4px;}</style></head><body><h1>結果ビューワ一覧</h1>$body</body></html>"""
)


@dataclass
class ServerContext:
    """GUIなどから制御するためのHTTPサーバー情報."""

    server: ThreadingHTTPServer
    host: str
    port: int
    results_dir: Path
    initial_viewer: Optional[Path]
    matched_initial: bool

    def start_in_thread(self) -> threading.Thread:
        """サーバーをバックグラウンドスレッドで起動する."""
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        return thread

    def stop(self) -> None:
        """サーバーを停止し、ソケットを解放する."""
        self.server.shutdown()
        self.server.server_close()


class GalleryRequestHandler(SimpleHTTPRequestHandler):
    """結果ディレクトリを配信し、トップでHTML一覧を表示するハンドラ."""

    def __init__(self, *args, results_dir: Path, **kwargs):
        self.results_dir = results_dir
        super().__init__(*args, directory=str(results_dir), **kwargs)

    def _iter_gallery_files(self) -> Iterable[Path]:
        pattern = "*_viewer.html"
        files = list(self.results_dir.rglob(pattern))
        root_viewer = self.results_dir / "viewer.html"
        if root_viewer.exists():
            files.append(root_viewer)
        return sorted({path.resolve() for path in files})

    def _build_index_html(self) -> str:
        entries = []
        for html_path in self._iter_gallery_files():
            try:
                relative = html_path.relative_to(self.results_dir)
            except ValueError:
                # 念のため結果ディレクトリ配下のみを想定
                continue
            rel_posix = relative.as_posix()
            display = rel_posix
            if display.endswith("_viewer.html"):
                display = display[:-len("_viewer.html")]
            item = f'<li><a href="/{quote(rel_posix)}">{html.escape(display)}</a></li>'
            entries.append(item)
        if entries:
            body = "<p>クリックすると対象のビューワを開きます。</p><ul>" + "\n".join(entries) + "</ul>"
        else:
            body = (
                "<p>表示できるビューワが見つかりませんでした。"
                " `results/` に <code>*_viewer.html</code> を出力してから再度アクセスしてください。</p>"
            )
        return INDEX_TEMPLATE.substitute(body=body)

    def _send_json(self, data: dict, status: int = HTTPStatus.OK) -> None:
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _collect_field_order(self, records: list[dict], existing_order: list[str]) -> list[str]:
        order: list[str] = []
        seen: set[str] = set()

        def register(name: str) -> None:
            if name and name not in seen:
                seen.add(name)
                order.append(name)

        for field in existing_order:
            register(field)

        for field in _RESERVED_FIELDS:
            register(field)

        extra_fields: set[str] = set()
        for record in records:
            if not isinstance(record, dict):
                continue
            for key in record.keys():
                if key in seen:
                    continue
                if any(key.startswith(prefix) for prefix in _EXTRA_FIELD_PREFIXES):
                    extra_fields.add(key)
                else:
                    register(key)

        for key in sorted(extra_fields, key=lambda value: (value.rstrip("0123456789"), value)):
            register(key)

        return order

    def _resolve_csv_path(self, csv_path: str) -> Optional[Path]:
        if not csv_path:
            return None
        normalized = csv_path.lstrip("/")
        candidate = (self.results_dir / normalized).resolve()
        try:
            candidate.relative_to(self.results_dir)
        except ValueError:
            return None
        return candidate

    def _handle_save_request(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json({"error": "invalid-content-length"}, HTTPStatus.BAD_REQUEST)
            return

        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json({"error": "invalid-json"}, HTTPStatus.BAD_REQUEST)
            return

        if not isinstance(payload, dict):
            self._send_json({"error": "invalid-payload"}, HTTPStatus.BAD_REQUEST)
            return

        csv_path_text = payload.get("csvPath")
        records = payload.get("records")
        dataset_label = payload.get("datasetLabel", "")

        if not isinstance(csv_path_text, str) or not csv_path_text:
            self._send_json({"error": "invalid-csv-path"}, HTTPStatus.BAD_REQUEST)
            return

        if not isinstance(records, list):
            self._send_json({"error": "invalid-records"}, HTTPStatus.BAD_REQUEST)
            return

        csv_abs_path = self._resolve_csv_path(csv_path_text)
        if csv_abs_path is None:
            self._send_json({"error": "csv-path-outside-root"}, HTTPStatus.BAD_REQUEST)
            return

        existing_fields: list[str] = []
        if csv_abs_path.exists():
            try:
                with csv_abs_path.open("r", encoding="utf-8", newline="") as handle:
                    reader = csv.DictReader(handle)
                    existing_fields = list(reader.fieldnames or [])
            except OSError as exc:
                self._send_json({"error": f"read-failed: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return

        try:
            field_order = self._collect_field_order(records, existing_fields)
        except Exception as exc:  # noqa: BLE001 - field解析時の予期せぬエラーを捕捉
            self._send_json({"error": f"field-order-failed: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        csv_abs_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = csv_abs_path.with_suffix(csv_abs_path.suffix + ".tmp")

        with _SAVE_LOCK:
            try:
                with tmp_path.open("w", encoding="utf-8", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=field_order)
                    writer.writeheader()
                    for record in records:
                        if not isinstance(record, dict):
                            continue
                        row = {field: record.get(field, "") for field in field_order}
                        writer.writerow(row)
                tmp_path.replace(csv_abs_path)
            except OSError as exc:
                if tmp_path.exists():
                    with contextlib.suppress(OSError):
                        tmp_path.unlink()
                self._send_json({"error": f"write-failed: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return

        label = dataset_label if isinstance(dataset_label, str) and dataset_label else csv_abs_path.name
        print(f"[INFO] CSVを更新しました: {csv_abs_path} ({label})")
        self._send_json({"status": "ok"})

    def do_GET(self) -> None:  # noqa: N802 (標準ライブラリの命名に合わせる)
        try:
            if self.path in ("/", "/index.html"):
                html_body = self._build_index_html().encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html_body)))
                self.end_headers()
                self.wfile.write(html_body)
                return
            super().do_GET()
        except Exception as exc:  # noqa: BLE001 - 500ページを返すため広く捕捉
            self._handle_exception(exc)

    def do_POST(self) -> None:  # noqa: N802
        if self.path == API_SAVE_PATH:
            self._handle_save_request()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def log_message(self, format: str, *args) -> None:  # noqa: A003 - 継承元のシグネチャ維持
        message = "[HTTP] " + format % args + "\n"
        stream = getattr(sys, "stdout", None)
        if stream is None:
            stream = getattr(sys, "__stdout__", None)
        if stream is None:
            return
        try:
            stream.write(message)
        except AttributeError:
            # QueueWriter など file-like オブジェクト以外のケースに備えて print にフォールバック
            print(message, end="")

    def _handle_exception(self, exc: Exception) -> None:
        error_lines = traceback.format_exception(type(exc), exc, exc.__traceback__)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {''.join(error_lines)}\n"

        try:
            log_path = self.results_dir / "viewer_server_error.log"
            with log_path.open("a", encoding="utf-8") as log_file:
                log_file.write(log_entry)
        except OSError:
            pass

        try:
            body = (
                "<!DOCTYPE html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
                "<title>内部エラー</title><style>body{font-family:sans-serif;margin:2rem;}"
                "pre{background:#f5f5f5;padding:1rem;border-radius:6px;overflow:auto;}</style></head><body>"
                "<h1>内部エラーが発生しました</h1>"
                "<p>詳細は <code>viewer_server_error.log</code> を確認してください。</p>"
                "</body></html>"
            ).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError:
            # 送信に失敗した場合はソケットを閉じるだけ
            self.close_connection = True


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ビューワ用の静的ファイルサーバーを起動する")
    parser.add_argument("--results-dir", default="results", help="ビューワを含む結果ディレクトリ")
    parser.add_argument("--host", default="127.0.0.1", help="バインドするホスト。0.0.0.0 で全インターフェース")
    parser.add_argument("--port", type=int, default=0, help="リッスンポート。0 を指定すると空きポートを自動割当")
    parser.add_argument("--open-browser", action="store_true", help="起動後にブラウザでインデックスを開く")
    parser.add_argument("--video", help="特定動画のビューワを自動で開きたい場合に動画名を指定")
    return parser.parse_args()


def _resolve_results_dir(path_str: str) -> Path:
    path = Path(path_str).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _find_viewer(results_dir: Path, video_name: Optional[str]) -> tuple[Optional[Path], bool]:
    candidates = sorted(results_dir.rglob("*_viewer.html"))
    if not candidates:
        return None, False
    if not video_name:
        return candidates[0], True
    suffix = "_viewer.html"
    for candidate in candidates:
        name = candidate.name
        stem = candidate.stem
        parent_name = candidate.parent.name
        if name == f"{video_name}{suffix}" or stem == f"{video_name}_viewer" or parent_name == video_name:
            return candidate, True
    return candidates[0], False


def _pick_port(host: str, port: int) -> int:
    if port != 0:
        return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def create_server(
    results_dir: str | Path,
    host: str = "127.0.0.1",
    port: int = 0,
    video: Optional[str] = None,
) -> ServerContext:
    """ビューワサーバーを生成し、外部から制御しやすいコンテキストを返す."""

    resolved_results = _resolve_results_dir(str(Path(results_dir)))
    actual_port = _pick_port(host, port)
    handler_factory = partial(GalleryRequestHandler, results_dir=resolved_results)
    server = ThreadingHTTPServer((host, actual_port), handler_factory)
    server.daemon_threads = True
    initial_viewer, matched = _find_viewer(resolved_results, video)
    return ServerContext(
        server=server,
        host=host,
        port=actual_port,
        results_dir=resolved_results,
        initial_viewer=initial_viewer,
        matched_initial=matched,
    )


def _open_browser(results_dir: Path, target: Optional[Path], host: str, port: int) -> None:
    if target is None:
        url_path = ""
    else:
        try:
            rel = target.relative_to(results_dir)
            url_path = quote(rel.as_posix())
        except ValueError:
            url_path = quote(target.as_posix())
    browser_host = "localhost" if host in {"0.0.0.0", "::"} else host
    url = f"http://{browser_host}:{port}/{url_path}" if url_path else f"http://{browser_host}:{port}/"
    threading.Thread(target=lambda: webbrowser.open(url), daemon=True).start()


def main() -> None:
    args = _parse_args()
    context = create_server(
        results_dir=args.results_dir,
        host=args.host,
        port=args.port,
        video=args.video,
    )

    print("[INFO] ビューワサーバーを起動します")
    print(f"[INFO] ルートディレクトリ: {context.results_dir}")
    print(f"[INFO] アクセスURL: http://{context.host}:{context.port}/")
    if context.initial_viewer:
        rel = context.initial_viewer.relative_to(context.results_dir)
        print(f"[INFO] 初期表示対象: {rel}")
    if args.video and not context.matched_initial:
        print(f"[WARN] 指定された動画 {args.video!r} のビューワは見つかりませんでした")

    if args.open_browser or args.video:
        browser_target = context.initial_viewer if context.initial_viewer else None
        _open_browser(context.results_dir, browser_target, context.host, context.port)

    try:
        context.server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] サーバーを停止します")
    finally:
        context.stop()


if __name__ == "__main__":
    main()

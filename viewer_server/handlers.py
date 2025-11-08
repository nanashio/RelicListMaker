"""HTTP ハンドラの実装."""
from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

from . import index_page, storage, validation

API_SAVE_PATH = "/__viewer_api__/save"


class GalleryRequestHandler(SimpleHTTPRequestHandler):
    """結果ディレクトリを配信し、トップでHTML一覧を表示するハンドラ."""

    def __init__(self, *args, results_dir: Path, **kwargs):
        self.results_dir = results_dir
        super().__init__(*args, directory=str(results_dir), **kwargs)

    def _send_json(self, data: dict, status: int = HTTPStatus.OK) -> None:
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _handle_save_request(self) -> None:
        try:
            length = validation.parse_content_length(self.headers)
        except validation.RequestValidationError as exc:
            self._send_json(exc.to_payload(), exc.status)
            return

        raw_body = self.rfile.read(length)
        try:
            payload_dict = validation.parse_json_body(raw_body)
            payload = validation.validate_save_payload(payload_dict, self.results_dir)
            save_request = validation.build_save_request(payload)
        except validation.RequestValidationError as exc:
            self._send_json(exc.to_payload(), exc.status)
            return

        try:
            _, existing_fields = storage.load_csv_records(save_request.csv_path)
        except storage.StorageError as exc:
            self._send_json(exc.to_payload(), exc.status)
            return

        try:
            field_order = storage.resolve_field_order(save_request.records, existing_fields)
        except Exception as exc:  # noqa: BLE001 - フィールド解析時の予期せぬエラーを捕捉
            self._send_json({"error": f"field-order-failed: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        try:
            storage.write_records(save_request.csv_path, save_request.records, field_order)
        except storage.StorageError as exc:
            self._send_json(exc.to_payload(), exc.status)
            return

        label = save_request.dataset_label if save_request.dataset_label else save_request.csv_path.name
        print(f"[INFO] CSVを更新しました: {save_request.csv_path} ({label})")
        self._send_json({"status": "ok"})

    def _build_index_html(self) -> str:
        files = index_page.iter_gallery_files(self.results_dir)
        return index_page.render_index(self.results_dir, files)

    def do_GET(self) -> None:  # noqa: N802 (標準ライブラリの命名に合わせる)
        try:
            if self.path in ("/", "/index.html"):
                html_body = self._build_index_html().encode("utf-8")
                self.send_response(HTTPStatus.OK)
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
            self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError:
            self.close_connection = True

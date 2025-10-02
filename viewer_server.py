"""結果ビューワ用の軽量HTTPサーバー."""
from __future__ import annotations

import argparse
import html
import socket
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from string import Template
from typing import Iterable, Optional
from urllib.parse import quote

INDEX_TEMPLATE = Template(
    """<!DOCTYPE html><html lang=\"ja\"><head><meta charset=\"utf-8\"><title>NightReign Relic Viewer Index</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:2rem;}h1{font-size:1.8rem;}ul{list-style:none;padding:0;}li{margin:.4rem 0;}a{text-decoration:none;color:#1e61d1;}a:hover{text-decoration:underline;}code{background:#f5f5f5;padding:.1rem .3rem;border-radius:4px;}</style></head><body><h1>結果ビューワ一覧</h1>$body</body></html>"""
)


class GalleryRequestHandler(SimpleHTTPRequestHandler):
    """結果ディレクトリを配信し、トップでHTML一覧を表示するハンドラ."""

    def __init__(self, *args, results_dir: Path, **kwargs):
        self.results_dir = results_dir
        super().__init__(*args, directory=str(results_dir), **kwargs)

    def _iter_gallery_files(self) -> Iterable[Path]:
        pattern = "*_viewer.html"
        return sorted(self.results_dir.rglob(pattern))

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
            item = (
                f"<li><a href=\"/{quote(rel_posix)}\">"
                f"{html.escape(display)}</a></li>"
            )
            entries.append(item)
        if entries:
            body = "<p>クリックすると対象のビューワを開きます。</p><ul>" + "\n".join(entries) + "</ul>"
        else:
            body = (
                "<p>表示できるビューワが見つかりませんでした。"
                " `results/` に <code>*_viewer.html</code> を出力してから再度アクセスしてください。</p>"
            )
        return INDEX_TEMPLATE.substitute(body=body)

    def do_GET(self) -> None:  # noqa: N802 (標準ライブラリの命名に合わせる)
        if self.path in ("/", "/index.html"):
            html_body = self._build_index_html().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html_body)))
            self.end_headers()
            self.wfile.write(html_body)
            return
        super().do_GET()

    def log_message(self, format: str, *args) -> None:  # noqa: A003 - 継承元のシグネチャ維持
        sys.stdout.write("[HTTP] " + format % args + "\n")


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
    results_dir = _resolve_results_dir(args.results_dir)
    host = args.host
    port = _pick_port(host, args.port)

    handler_factory = partial(GalleryRequestHandler, results_dir=results_dir)
    server = ThreadingHTTPServer((host, port), handler_factory)
    server.daemon_threads = True

    specific_viewer, matched = _find_viewer(results_dir, args.video)

    print("[INFO] ビューワサーバーを起動します")
    print(f"[INFO] ルートディレクトリ: {results_dir}")
    print(f"[INFO] アクセスURL: http://{host}:{port}/")
    if specific_viewer:
        rel = specific_viewer.relative_to(results_dir)
        print(f"[INFO] 初期表示対象: {rel}")
    if args.video and not matched:
        print(f"[WARN] 指定された動画 {args.video!r} のビューワは見つかりませんでした")

    if args.open_browser or args.video:
        browser_target = specific_viewer if specific_viewer else None
        _open_browser(results_dir, browser_target, host, port)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] サーバーを停止します")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

"""CLI エントリポイントとサーバー生成."""
from __future__ import annotations

import argparse
import socket
from functools import partial
from http.server import ThreadingHTTPServer
from typing import Optional

from .app import ServerContext, find_viewer, open_browser, resolve_results_dir
from .handlers import GalleryRequestHandler


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ビューワ用の静的ファイルサーバーを起動する")
    parser.add_argument("--results-dir", default="results", help="ビューワを含む結果ディレクトリ")
    parser.add_argument("--host", default="127.0.0.1", help="バインドするホスト。0.0.0.0 で全インターフェース")
    parser.add_argument("--port", type=int, default=0, help="リッスンポート。0 を指定すると空きポートを自動割当")
    parser.add_argument("--open-browser", action="store_true", help="起動後にブラウザでインデックスを開く")
    parser.add_argument("--video", help="特定動画のビューワを自動で開きたい場合に動画名を指定")
    return parser.parse_args()


def _pick_port(host: str, port: int) -> int:
    if port != 0:
        return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def create_server(
    results_dir: str | bytes,
    host: str = "127.0.0.1",
    port: int = 0,
    video: Optional[str] = None,
) -> ServerContext:
    """ビューワサーバーを生成し、外部から制御しやすいコンテキストを返す."""

    resolved_results = resolve_results_dir(str(results_dir))
    actual_port = _pick_port(host, port)
    handler_factory = partial(GalleryRequestHandler, results_dir=resolved_results)
    server = ThreadingHTTPServer((host, actual_port), handler_factory)
    server.daemon_threads = True
    initial_viewer, matched = find_viewer(resolved_results, video)
    return ServerContext(
        server=server,
        host=host,
        port=actual_port,
        results_dir=resolved_results,
        initial_viewer=initial_viewer,
        matched_initial=matched,
    )


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
        open_browser(context.results_dir, browser_target, context.host, context.port)

    try:
        context.server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] サーバーを停止します")
    finally:
        context.stop()


if __name__ == "__main__":  # pragma: no cover - CLI 実行用
    main()

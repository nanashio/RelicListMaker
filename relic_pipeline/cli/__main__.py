"""Module entrypoint for `python -m relic_pipeline.cli`."""

from __future__ import annotations

from .main import main

if __name__ == "__main__":  # pragma: no cover - module entry point
    raise SystemExit(main())

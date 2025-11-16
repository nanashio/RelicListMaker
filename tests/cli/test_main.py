from argparse import Namespace

import relic_pipeline.cli.main as cli_main


def test_main_invokes_process_images_command(monkeypatch):
    captured = {}

    def fake_command(args: Namespace) -> int:
        captured["args"] = args
        return 0

    monkeypatch.setattr(cli_main, "process_images_command", fake_command)

    exit_code = cli_main.main(["input", "--output", "out.csv", "--upsample", "2"])

    assert exit_code == 0
    assert captured["args"].image_dir == "input"
    assert captured["args"].output_path == "out.csv"
    assert captured["args"].upsample == 2


def test_build_arg_parser_sets_defaults():
    parser = cli_main.build_arg_parser()
    args = parser.parse_args([])

    assert args.image_dir == "crops"
    assert args.output_path == "results.csv"
    assert args.preprocess is True

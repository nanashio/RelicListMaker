import json
import time
import urllib.request
from pathlib import Path

from viewer_server import API_SAVE_PATH, create_server


def test_save_endpoint_updates_csv(tmp_path: Path) -> None:
    results_dir = tmp_path / "results"
    results_dir.mkdir()
    csv_path = results_dir / "sample.csv"
    csv_path.write_text(
        "Image,Duplicate,Effect1Status\nfoo.png,False,pending\n",
        encoding="utf-8",
    )

    context = create_server(results_dir=results_dir, host="127.0.0.1", port=0)
    thread = context.start_in_thread()
    try:
        time.sleep(0.1)
        url = f"http://{context.host}:{context.port}{API_SAVE_PATH}"
        payload = {
            "csvPath": "/sample.csv",
            "datasetLabel": "sample",
            "records": [
                {"Image": "foo.png", "Duplicate": "False", "Effect1Status": "pass"},
                {"Image": "bar.png", "Duplicate": "True", "Effect1Status": "pending"},
            ],
        }
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            assert response.status == 200
            body = json.loads(response.read().decode("utf-8"))
            assert body.get("status") == "ok"

        content = csv_path.read_text(encoding="utf-8").strip().splitlines()
        header = content[0].split(',')
        assert header[:3] == ["Image", "Duplicate", "Effect1Status"]
        assert any(line.startswith("bar.png,True,pending") for line in content[1:])
    finally:
        context.stop()
        thread.join(timeout=2)

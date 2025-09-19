import pandas as pd
import os

# 設定
CSV_PATH = "results_input_video.csv"       # OCR結果CSV（動画ごとに出力されたファイル）
IMG_DIR = "crops/input_video"              # 画像ディレクトリ
OUTPUT_HTML = "viewer.html"                # 出力HTMLファイル名


def generate_html(csv_path, img_dir, output_html):
    # CSV読み込み
    if not os.path.exists(csv_path):
        print(f"[!] CSVが見つかりません: {csv_path}")
        return

    df = pd.read_csv(csv_path)

    # HTMLヘッダー
    html = f"""
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <title>OCR結果ギャラリー</title>
        <style>
            body {{ font-family: sans-serif; background: #f4f4f4; }}
            h1 {{ text-align: center; }}
            .gallery {{ display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }}
            .item {{ background: #fff; padding: 10px; border: 1px solid #ccc; border-radius: 8px;
                     width: 280px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }}
            .item img {{ max-width: 260px; height: auto; border-radius: 4px; }}
            .filename {{ font-weight: bold; font-size: 14px; margin-top: 5px; }}
            .effects {{ margin-top: 6px; font-size: 13px; white-space: pre-line; }}
        </style>
    </head>
    <body>
        <h1>OCR結果ギャラリー</h1>
        <div class="gallery">
    """

    # 各行をHTMLに追加
    for _, row in df.iterrows():
        image_file = row["Image"]
        effect1 = row.get("Effect1", "")
        effect2 = row.get("Effect2", "")
        effect3 = row.get("Effect3", "")

        html += f"""
        <div class="item">
            <img src="{img_dir}/{image_file}" alt="{image_file}">
            <div class="filename">{image_file}</div>
            <div class="effects">① {effect1}</div>
            <div class="effects">② {effect2}</div>
            <div class="effects">③ {effect3}</div>
        </div>
        """

    # HTMLフッター
    html += """
        </div>
    </body>
    </html>
    """

    # 書き出し
    with open(output_html, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"[✓] {output_html} を生成しました！ ブラウザで開いてください。")


if __name__ == "__main__":
    generate_html(CSV_PATH, IMG_DIR, OUTPUT_HTML)

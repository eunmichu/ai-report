"""데이터까지 담은 단일 HTML 스냅숏을 만든다(메일 첨부·오프라인 열람용).

    python tools/build_snapshot.py               # data/ → snapshot.html
    python tools/build_snapshot.py -o radar.html --days 14
"""
from __future__ import annotations

import argparse
import base64
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default="snapshot.html")
    ap.add_argument("--data-dir", default=str(ROOT / "data"))
    ap.add_argument("--days", type=int, default=0, help="최근 며칠치만 담기(0=전부)")
    a = ap.parse_args()
    d = Path(a.data_dir)
    items = []
    for name in ("items-recent.json", "items-archive.json"):
        f = d / name
        if f.exists():
            items += json.loads(f.read_text(encoding="utf-8")).get("items", [])
    if a.days:
        cut = (datetime.now(timezone.utc) - timedelta(days=a.days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        items = [i for i in items if i["date"] >= cut]
    meta = json.loads((d / "meta.json").read_text(encoding="utf-8")) if (d / "meta.json").exists() else {}
    tax = json.loads((ROOT / "assets/taxonomy.json").read_text(encoding="utf-8"))
    reps = json.loads((ROOT / "assets/reports.json").read_text(encoding="utf-8"))
    mets = json.loads((ROOT / "assets/metrics.json").read_text(encoding="utf-8"))
    iss = json.loads((ROOT / "assets/issues.json").read_text(encoding="utf-8"))
    chs = json.loads((ROOT / "assets/chapters.json").read_text(encoding="utf-8"))

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "assets/style.css").read_text(encoding="utf-8")
    search = (ROOT / "assets/search.js").read_text(encoding="utf-8")
    app = (ROOT / "assets/app.js").read_text(encoding="utf-8")
    search = re.sub(r"^export \{[^}]*\};?\s*$", "", search, flags=re.M).replace("export function", "function").replace("export const", "const")
    app = re.sub(r"^import .*?;\s*$", "", app, flags=re.M)
    data = json.dumps({"items": items, "meta": meta, "taxonomy": tax, "reports": reps, "metrics": mets, "issues": iss, "chapters": chs}, ensure_ascii=False, separators=(",", ":"))
    data = data.replace("</", "<\\/")
    icon = "data:image/svg+xml;base64," + base64.b64encode((ROOT / "assets/favicon.svg").read_bytes()).decode()

    html = html.replace('<link rel="stylesheet" href="assets/style.css">', f"<style>\n{css}\n</style>")
    html = html.replace('href="assets/favicon.svg"', f'href="{icon}"')
    html = html.replace('<script type="module" src="assets/app.js"></script>',
                        f"<script>window.__ARR_DATA__={data};</script>\n<script type=\"module\">\n{search}\n{app}\n</script>")
    Path(a.out).write_text(html, encoding="utf-8")
    print(f"{a.out} — {len(items)}건, {len(html) / 1024:.0f} KB")


if __name__ == "__main__":
    main()

"""AI Report Radar 수집 설정 — 국내외 AI 보고서의 '새 소식'(새 판 발표·보도)을 모은다.

어떤 보고서를 지켜볼지는 assets/reports.json 의 watch 낱말이, 소식의 주제 분류와 검색 동의어는
assets/taxonomy.json 이 정한다. 여기에는 '어디서, 얼마나, 얼마나 자주' 모을지만 둔다.
숫자는 환경변수로 덮어쓸 수 있다.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAXONOMY_PATH = ROOT / "assets" / "taxonomy.json"
REPORTS_PATH = ROOT / "assets" / "reports.json"
DATA_DIR = Path(os.getenv("ATR_DATA_DIR", ROOT / "data"))


def _f(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def _i(name: str, default: int) -> int:
    return int(_f(name, default))


TYPES = ("news",)

# ── 수집 주기(시간) ─ 워크플로는 3시간마다 돈다. 0 이면 매 실행.
INTERVAL_HOURS = {"news": _f("NEWS_EVERY_HOURS", 0)}

# ── 보존 ─ 기간이 지나거나 개수를 넘으면 오래된 것부터 지운다.
RETENTION_DAYS = {"news": _i("NEWS_RETENTION_DAYS", 400)}   # 보고서 소식은 1년 넘게 둔다(다음 판과 비교)
MAX_ITEMS = {"news": _i("NEWS_MAX_ITEMS", 3000)}
# 첫 화면이 빨리 뜨도록 최근 며칠치는 별도 파일(items-recent.json)로 나눈다.
RECENT_DAYS = _i("RECENT_DAYS", 30)
SUMMARY_MAX = {"news": 240}

# ── 중복 제거 ─ 같은 발표를 여러 매체가 낸 기사를 하나로 묶는다.
DEDUP_SIM = _f("DEDUP_SIM", 0.55)          # 제목 2-gram 자카드 유사도 임계값(0~1)
DEDUP_WINDOW_DAYS = _f("DEDUP_WINDOW_DAYS", 3)
ALSO_MAX = 8

REQUEST_TIMEOUT = _i("REQUEST_TIMEOUT", 25)

# ── Google 뉴스 RSS(키 불필요) ─ 검색어는 reports.json 의 watch 낱말로 자동으로 만든다.
GNEWS_WINDOW = os.getenv("GNEWS_WINDOW", "3d")      # 검색어에 when:3d 를 붙여 최근 기사만
GNEWS_PER_QUERY = _i("GNEWS_PER_QUERY", 30)
GNEWS_TERMS_PER_QUERY = _i("GNEWS_TERMS_PER_QUERY", 6)   # 낱말 몇 개를 OR 로 묶어 한 번에 찾을지

# ── 매체 RSS ─ watch 낱말이 제목·요약에 있는 기사만 담는다.
FEEDS = [
    {"name": "AI타임스", "url": "https://www.aitimes.com/rss/allArticle.xml", "lang": "ko", "tz": "Asia/Seoul"},
]
FEED_LOOKBACK_DAYS = _i("FEED_LOOKBACK_DAYS", 7)
FEED_PER_SOURCE = _i("FEED_PER_SOURCE", 40)

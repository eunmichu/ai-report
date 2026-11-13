"""보고서 연결 — 기사 제목·요약에서 reports.json 의 watch 낱말을 찾아 어떤 보고서의 소식인지 정한다.

- 영문 낱말은 대소문자 무시·단어 단위로, 한글 낱말은 띄어쓰기를 무시하고 찾는다.
- 기사에 보고서의 최신판보다 뒤의 연도(예: 'AI Index 2027')가 함께 나오면 '새 판 가능성'으로 표시한다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from . import config

_ASCII = re.compile(r"^[\x00-\x7f]+$")
_YEAR = re.compile(r"(?<!\d)(20[2-4]\d)(?!\d)")
_WS = re.compile(r"\s+")


def load_reports(path: Path | None = None) -> list[dict]:
    with open(path or config.REPORTS_PATH, encoding="utf-8") as f:
        return json.load(f).get("reports", [])


def edition_year(r: dict) -> int:
    """보고서 최신판의 연도 — 제목의 연도가 있으면 그것, 없으면 발간일 연도."""
    years = [int(y) for y in _YEAR.findall(r.get("title", ""))]
    if years:
        return max(years)
    m = _YEAR.search(str(r.get("date", "")))
    return int(m.group(1)) if m else 0


class ReportMatcher:
    def __init__(self, reports: list[dict]):
        self.rules = []
        for r in reports:
            words = [w for w in r.get("watch") or [] if w.strip()]
            if not words:
                continue
            en = sorted({w.lower() for w in words if _ASCII.match(w)}, key=len, reverse=True)
            ko = sorted({_WS.sub("", w.lower()) for w in words if not _ASCII.match(w)}, key=len, reverse=True)
            rx = re.compile(r"(?<![a-z0-9])(?:" + "|".join(re.escape(w).replace(r"\ ", r"\s+") for w in en) + r")(?:s|es)?(?![a-z0-9])") if en else None
            self.rules.append({"id": r["id"], "rx": rx, "ko": ko, "year": edition_year(r), "kr": r.get("region") == "kr"})

    def match(self, *texts: str) -> list[str]:
        t = " ".join(x for x in texts if x).lower()
        c = _WS.sub("", t)
        return [r["id"] for r in self.rules if (r["rx"] and r["rx"].search(t)) or any(k in c for k in r["ko"])]

    def domestic(self, ids: list[str]) -> bool:
        return any(r["kr"] for r in self.rules if r["id"] in ids)

    def newer(self, title: str, ids: list[str], max_year: int) -> list[str]:
        """제목에 최신판보다 뒤의 연도가 있으면 새 판 소식일 수 있다.
        '2030년까지' 같은 전망 연도와 헷갈리지 않게 내년(max_year)까지만 본다."""
        years = [int(y) for y in _YEAR.findall(title or "") if int(y) <= max_year]
        if not years:
            return []
        top = max(years)
        return [r["id"] for r in self.rules if r["id"] in ids and r["year"] and top > r["year"]]


def build_queries(reports: list[dict], per: int) -> list[dict]:
    """Google 뉴스 검색어 — watch 낱말을 언어별로 per 개씩 OR 로 묶는다."""
    en, ko = [], []
    for r in reports:
        for w in r.get("watch") or []:
            (en if _ASCII.match(w) else ko).append(w)
    en, ko = list(dict.fromkeys(en)), list(dict.fromkeys(ko))
    out = []
    for lang, words in (("en", en), ("ko", ko)):
        for i in range(0, len(words), per):
            out.append({"q": " OR ".join(f'"{w}"' for w in words[i:i + per]), "lang": lang})
    return out

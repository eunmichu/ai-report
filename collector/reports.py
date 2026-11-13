"""보고서 연결 — 기사 제목·요약에서 reports.json 의 watch 낱말을 찾아 어떤 보고서의 소식인지 정한다.

- 영문 낱말은 대소문자 무시·단어 단위(복수형 허용)로, 한글 낱말은 띄어쓰기를 무시하고 찾는다.
- 'AI Index'·'Hype Cycle' 처럼 흔한 이름은 watchIf 로 두어, 기관명(with) 같은 낱말이 함께 있을 때만 연결한다.
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


# 보고서 상태(reports.json 의 status, 없으면 active)
#   active: 새 소식을 찾는다 · paused: 잠시 찾지 않는다 · ended: 폐간·발간 중단(기록과 화면은 남긴다)
STATUSES = ("active", "paused", "ended")


def load_reports(path: Path | None = None) -> list[dict]:
    with open(path or config.REPORTS_PATH, encoding="utf-8") as f:
        return json.load(f).get("reports", [])


def status(r: dict) -> str:
    return r.get("status") or "active"


def active_reports(reports: list[dict]) -> list[dict]:
    """새 소식을 찾을 보고서만(수집 중지·발간 중단은 뺀다)."""
    return [r for r in reports if status(r) == "active"]


REQUIRED = ("id", "region", "title", "short", "org", "date", "url", "about", "cycle", "when", "next")


def check_reports(reports: list[dict], chapters: dict | None = None) -> list[str]:
    """보고서 목록 점검 — 문제 문장 목록(비었으면 정상)."""
    out, seen = [], set()
    for i, r in enumerate(reports):
        rid = r.get("id") or f"#{i + 1}"
        if rid in seen:
            out.append(f"{rid}: id가 겹칩니다")
        seen.add(rid)
        miss = [k for k in REQUIRED if not r.get(k)]
        if miss:
            out.append(f"{rid}: 빠진 칸 {', '.join(miss)}")
        if status(r) not in STATUSES:
            out.append(f"{rid}: status는 {'/'.join(STATUSES)} 가운데 하나여야 합니다")
        if status(r) == "active" and not (r.get("watch") or r.get("watchIf")):
            out.append(f"{rid}: 새 소식을 찾을 낱말(watch 또는 watchIf)이 없습니다")
        if status(r) == "ended" and not r.get("statusNote"):
            out.append(f"{rid}: 발간 중단 사유·시점(statusNote)을 적어 주세요")
        if chapters is not None and rid not in chapters:
            out.append(f"{rid}: chapters.json에 챕터 정리가 없습니다")
    return out


def edition_year(r: dict) -> int:
    """보고서 최신판의 연도 — 제목의 연도가 있으면 그것, 없으면 발간일 연도."""
    years = [int(y) for y in _YEAR.findall(r.get("title", ""))]
    if years:
        return max(years)
    m = _YEAR.search(str(r.get("date", "")))
    return int(m.group(1)) if m else 0


class _Words:
    """낱말 묶음 — 영문은 정규식, 한글은 공백을 지운 부분 문자열."""

    def __init__(self, words: list[str]):
        words = [w for w in words if w and w.strip()]
        en = sorted({w.lower() for w in words if _ASCII.match(w)}, key=len, reverse=True)
        self.ko = sorted({_WS.sub("", w.lower()) for w in words if not _ASCII.match(w)}, key=len, reverse=True)
        alt = "|".join(re.escape(w).replace(r"\ ", r"\s+") for w in en)
        self.rx = re.compile(rf"(?<![a-z0-9])(?:{alt})(?:s|es)?(?![a-z0-9])") if en else None

    def __bool__(self) -> bool:
        return bool(self.rx or self.ko)

    def found(self, t: str, c: str) -> bool:
        return bool((self.rx and self.rx.search(t)) or any(k in c for k in self.ko))


class ReportMatcher:
    def __init__(self, reports: list[dict]):
        self.rules = []
        for r in reports:
            alone = _Words(r.get("watch") or [])
            pairs = [(_Words(g.get("terms") or []), _Words(g.get("with") or [])) for g in r.get("watchIf") or []]
            pairs = [(a, b) for a, b in pairs if a and b]
            if not alone and not pairs:
                continue
            self.rules.append({"id": r["id"], "alone": alone, "pairs": pairs,
                               "year": edition_year(r), "kr": r.get("region") == "kr"})

    def match(self, *texts: str) -> list[str]:
        t = " ".join(x for x in texts if x).lower()
        c = _WS.sub("", t)
        out = []
        for r in self.rules:
            if (r["alone"] and r["alone"].found(t, c)) or any(a.found(t, c) and b.found(t, c) for a, b in r["pairs"]):
                out.append(r["id"])
        return out

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
    """Google 뉴스 검색어 — watch 낱말은 언어별로 per 개씩 OR 로 묶고,
    watchIf 묶음은 '흔한 이름 + 기관명' 검색어를 따로 만든다."""
    en, ko, pairs = [], [], []
    for r in reports:
        for w in r.get("watch") or []:
            (en if _ASCII.match(w) else ko).append(w)
        for g in r.get("watchIf") or []:
            terms, with_ = g.get("terms") or [], g.get("with") or []
            if terms and with_:
                for lang, ok in (("en", True), ("ko", False)):
                    ts = [t for t in terms if bool(_ASCII.match(t)) == ok]
                    ws = [w for w in with_ if bool(_ASCII.match(w)) == ok] or with_
                    if ts:
                        pairs.append({"q": f'"{ts[0]}" {ws[0]}', "lang": lang})
    en, ko = list(dict.fromkeys(en)), list(dict.fromkeys(ko))
    out = []
    for lang, words in (("en", en), ("ko", ko)):
        for i in range(0, len(words), per):
            out.append({"q": " OR ".join(f'"{w}"' for w in words[i:i + per]), "lang": lang})
    seen = set()
    for p in pairs:
        if (p["q"], p["lang"]) not in seen:
            seen.add((p["q"], p["lang"]))
            out.append(p)
    return out

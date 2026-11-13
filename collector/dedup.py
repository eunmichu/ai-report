"""중복 제거 — ① 정규화한 고유키(URL·arXiv ID·출원번호) ② 제목 유사도.

① 같은 키면 같은 항목이다. URL 은 추적 파라미터(utm_* 등)·www·끝 슬래시를 지워 맞춘다.
   논문은 arXiv ID(버전 제외), 특허는 '특허청+출원번호' 가 키다 → arXiv 와 HF 가,
   공개공보와 등록공보가 각각 한 항목으로 합쳐진다.
② 키가 달라도 같은 사건을 여러 매체가 다룬 기사는 제목 문자 2-gram 의 자카드 유사도로
   찾아 하나로 묶고, 나머지 매체는 '같은 소식(also)' 목록에 남긴다.
   역색인으로 후보만 비교하므로 수천 건에서도 빠르다.
"""
from __future__ import annotations

import re
import urllib.parse
from collections import defaultdict
from datetime import datetime

_TRACK = re.compile(r"^(utm_.*|fbclid|gclid|dclid|mc_cid|mc_eid|igshid|ocid|cmpid|oc|ito|ref|ref_src|"
                    r"referrer|source|from|spm|share|s_ref|rss|feed|output)$", re.I)


def canon_url(url: str) -> str:
    try:
        p = urllib.parse.urlsplit((url or "").strip())
    except ValueError:
        return (url or "").strip()
    if not p.netloc:
        return (url or "").strip()
    host = p.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith("m.") and host.count(".") >= 2:  # 모바일 주소
        host = host[2:]
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=False) if not _TRACK.match(k)]
    q.sort()
    path = p.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit(("https", host, path, urllib.parse.urlencode(q), ""))


_BRACKET = re.compile(r"^\s*(\[[^\]]{1,12}\]|【[^】]{1,12}】|\([^)]{1,8}\)|<[^>]{1,10}>)\s*")
_SUFFIX = re.compile(r"\s+[-|–—]\s+[^-|–—]{1,30}$")
_NONWORD = re.compile(r"[^0-9a-z가-힣]+")


def norm_title(title: str) -> str:
    """비교용 제목 — 말머리([단독]·(종합))·매체명 꼬리·기호를 지운다."""
    t = (title or "").strip()
    for _ in range(3):
        t2 = _BRACKET.sub("", t)
        if t2 == t:
            break
        t = t2
    t = _SUFFIX.sub("", t)
    t = re.sub(r"\((종합|속보|1보|2보|상보|업데이트)\)", "", t)
    return _NONWORD.sub("", t.lower())


def bigrams(title: str) -> frozenset[str]:
    s = norm_title(title)
    if len(s) < 3:
        return frozenset({s}) if s else frozenset()
    return frozenset(s[i:i + 2] for i in range(len(s) - 1))


class TitleIndex:
    """같은 유형 안에서 제목이 비슷한 항목을 찾는 역색인."""

    def __init__(self, threshold: float, window_days: float):
        self.th = threshold
        self.window = window_days * 86400
        self.grams: dict[str, frozenset[str]] = {}
        self.when: dict[str, float] = {}
        self.inv: dict[tuple[str, str], list[str]] = defaultdict(list)

    def add(self, item: dict, ts: datetime) -> None:
        g = bigrams(item["title"])
        if not g:
            return
        k = item["key"]
        self.grams[k] = g
        self.when[k] = ts.timestamp()
        for b in g:
            self.inv[(item["type"], b)].append(k)

    def find(self, item: dict, ts: datetime) -> str | None:
        g = bigrams(item["title"])
        if len(g) < 4:  # 너무 짧은 제목은 오탐이 많다
            return None
        counts: dict[str, int] = defaultdict(int)
        for b in g:
            for k in self.inv.get((item["type"], b), ()):
                counts[k] += 1
        best, best_sim = None, 0.0
        t0 = ts.timestamp()
        for k, inter in counts.items():
            if abs(self.when[k] - t0) > self.window:
                continue
            other = self.grams[k]
            sim = inter / (len(g) + len(other) - inter)
            if sim > best_sim:
                best, best_sim = k, sim
        return best if best_sim >= self.th else None

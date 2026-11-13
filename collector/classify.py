"""주제 분류 — 키워드 점수(제목 가중)로 소식에 주제를 붙인다(arXiv·IPC 가중치는 쓰지 않으면 무시).

규칙은 assets/taxonomy.json 하나에서 온다. 한 항목에 최대 3개 분야를 붙이고,
아무 데도 걸리지 않으면 'etc' 로 둔다.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from . import config

_ASCII = re.compile(r"^[\x00-\x7f]+$")


def load_taxonomy(path: Path | None = None) -> dict:
    with open(path or config.TAXONOMY_PATH, encoding="utf-8") as f:
        return json.load(f)


def norm_ipc(code: str) -> str:
    return re.sub(r"\s+", "", code or "").upper()


def _matcher(words: list[str]):
    """영문은 단어 경계(복수형 허용) 정규식, 한글은 부분 문자열 목록."""
    en = sorted({k.lower() for k in words if _ASCII.match(k)}, key=len, reverse=True)
    ko = sorted({k.lower() for k in words if not _ASCII.match(k)}, key=len, reverse=True)
    rx = None
    if en:
        alt = "|".join(re.escape(k) for k in en)
        rx = re.compile(rf"(?<![a-z0-9])(?:{alt})(?:s|es)?(?![a-z0-9])")
    return rx, ko


class Classifier:
    TITLE_W, SUMMARY_W, SUMMARY_CAP = 3, 1, 3
    ARXIV_PRIMARY_W, ARXIV_CROSS_W = 2, 1
    IPC_W, IPC_MAIN_BONUS = 3, 1
    THRESHOLD, MAX_CATS = 2, 3

    def __init__(self, taxonomy: dict):
        self.fallback = taxonomy.get("fallback", {}).get("key", "etc")
        self.gates = {name: _matcher(words) for name, words in (taxonomy.get("gates") or {}).items()
                      if not name.startswith("_") and isinstance(words, list)}
        self.cats = []
        for c in taxonomy["categories"]:
            rx, ko = _matcher(c.get("keywords", []))
            self.cats.append({
                "key": c["key"], "en": rx, "ko": ko,
                "arxiv": set(c.get("arxiv", [])),
                "ipc": [norm_ipc(p) for p in c.get("ipc", [])],
            })

    def passes(self, gate: str | None, *texts: str) -> bool:
        """주제 필터. gate 가 없거나 정의되지 않았으면 통과."""
        if not gate or gate not in self.gates:
            return True
        rx, ko = self.gates[gate]
        t = " ".join(x for x in texts if x).lower()
        return bool((rx and rx.search(t)) or any(k in t for k in ko))

    def _hits(self, cat: dict, text: str) -> int:
        if not text:
            return 0
        n = len({re.sub(r"(es|s)$", "", m) for m in cat["en"].findall(text)}) if cat["en"] else 0
        n += sum(1 for k in cat["ko"] if k in text)
        return n

    def classify(self, title: str, summary: str = "", *, arxiv_primary: str = "",
                 arxiv_cats: list[str] | tuple = (), ipcs: list[str] | tuple = ()) -> list[str]:
        t, s = (title or "").lower(), (summary or "").lower()
        ipcs = [norm_ipc(x) for x in ipcs if x]
        scored = []
        for cat in self.cats:
            sc = self.TITLE_W * self._hits(cat, t)
            sc += self.SUMMARY_W * min(self.SUMMARY_CAP, self._hits(cat, s))
            if arxiv_primary and arxiv_primary in cat["arxiv"]:
                sc += self.ARXIV_PRIMARY_W
            sc += self.ARXIV_CROSS_W * sum(1 for a in arxiv_cats if a != arxiv_primary and a in cat["arxiv"])
            if ipcs and cat["ipc"]:
                if any(i.startswith(p) for i in ipcs for p in cat["ipc"]):
                    sc += self.IPC_W
                    if any(ipcs[0].startswith(p) for p in cat["ipc"]):
                        sc += self.IPC_MAIN_BONUS
            if sc >= self.THRESHOLD:
                scored.append((sc, cat["key"]))
        scored.sort(key=lambda x: -x[0])
        keys = [k for _, k in scored[: self.MAX_CATS]]
        return keys or [self.fallback]

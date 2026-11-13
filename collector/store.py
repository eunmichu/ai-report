"""누적 저장소 — 기존 데이터에 새 수집분을 병합(중복 제거)하고, 보존 기간을 지나면 정리한다.

출력 파일
  data/items-recent.json   최근 RECENT_DAYS 일 (첫 화면용, 작다)
  data/items-archive.json  그 이전 (화면이 뒤에서 따로 불러온다)
  data/meta.json           갱신 시각·건수·소스별 상태
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from . import config, util
from .dedup import TitleIndex, canon_url

RECENT, ARCHIVE, META = "items-recent.json", "items-archive.json", "meta.json"


def _read(path: Path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except (json.JSONDecodeError, OSError) as e:
        print(f"⚠️ {path.name} 를 읽지 못해 비우고 시작합니다: {e}")
        return default


def load(data_dir: Path) -> tuple[list[dict], dict]:
    items = []
    for name in (RECENT, ARCHIVE):
        doc = _read(data_dir / name, {})
        items.extend(doc.get("items", []) if isinstance(doc, dict) else [])
    seen, uniq = set(), []
    for it in items:
        if it.get("key") and it["key"] not in seen:
            seen.add(it["key"])
            uniq.append(it)
    return uniq, _read(data_dir / META, {})


def _is_gnews(url: str) -> bool:
    return "news.google.com" in (url or "")


def _absorb(primary: dict, dup: dict) -> None:
    """같은 소식(다른 매체)을 primary 에 흡수한다."""
    also = primary.setdefault("also", [])
    known = {canon_url(primary["url"])} | {canon_url(a["url"]) for a in also}
    srcs = {primary.get("source")} | {a.get("source") for a in also}
    # 원문 주소가 Google 뉴스 리디렉트이고, 새 쪽이 언론사 직접 주소면 대표를 바꾼다.
    if _is_gnews(primary["url"]) and not _is_gnews(dup["url"]):
        if primary.get("source") != dup.get("source"):
            also.insert(0, {"source": primary.get("source", ""), "url": primary["url"]})
        primary["url"], primary["source"] = dup["url"], dup.get("source") or primary.get("source")
        primary["key_alt"] = primary.get("key_alt", []) + [dup["key"]]
    elif canon_url(dup["url"]) not in known and dup.get("source") not in srcs:
        also.append({"source": dup.get("source", ""), "url": dup["url"]})
    del also[config.ALSO_MAX:]
    if not primary.get("summary") and dup.get("summary"):
        primary["summary"] = dup["summary"]
    primary["cats"] = list(dict.fromkeys(primary.get("cats", []) + [c for c in dup.get("cats", []) if c != "etc"]))[:3]
    if len(primary["cats"]) > 1 and "etc" in primary["cats"]:
        primary["cats"].remove("etc")
    if dup["date"] < primary["date"]:  # 가장 먼저 보도된 시각을 남긴다
        primary["date"] = dup["date"]


def _update(old: dict, new: dict) -> None:
    """같은 주소의 기사가 다시 들어왔을 때 비어 있던 요약만 채운다."""
    if new.get("summary") and not old.get("summary"):
        old["summary"] = new["summary"]


def merge(existing: list[dict], incoming: list[dict], now: datetime) -> tuple[list[dict], dict]:
    by_key: dict[str, dict] = {}
    for it in existing:
        by_key[it["key"]] = it
        for alt in it.get("key_alt", []):
            by_key.setdefault(alt, it)
    index = TitleIndex(config.DEDUP_SIM, config.DEDUP_WINDOW_DAYS)
    for it in existing:
        index.add(it, util.parse_iso(it["date"]) or now)
    stats = {"new": 0, "updated": 0, "merged": 0, "stale": 0}
    for new in incoming:
        old = by_key.get(new["key"])
        if old is not None:
            _update(old, new)
            stats["updated"] += 1
            continue
        ts = util.parse_iso(new["date"]) or now
        if ts < now - timedelta(days=config.RETENTION_DAYS[new["type"]]):
            stats["stale"] += 1
            continue
        hit = index.find(new, ts)
        if hit and hit in by_key:
            _absorb(by_key[hit], new)
            by_key[new["key"]] = by_key[hit]
            stats["merged"] += 1
            continue
        new["added"] = util.iso(now)
        existing.append(new)
        by_key[new["key"]] = new
        index.add(new, ts)
        stats["new"] += 1
    return existing, stats


def trim(items: list[dict], now: datetime) -> list[dict]:
    """보존 기간·최대 건수를 넘는 오래된 항목을 지운다."""
    out = []
    for t in config.TYPES:
        cutoff = util.iso(now - timedelta(days=config.RETENTION_DAYS[t]))
        group = sorted((i for i in items if i["type"] == t and i["date"] >= cutoff),
                       key=lambda i: i["date"], reverse=True)
        out.extend(group[: config.MAX_ITEMS[t]])
    return out


def _dump(path: Path, doc) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)


def save(data_dir: Path, items: list[dict], meta: dict, now: datetime) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    items = sorted(items, key=lambda i: i["date"], reverse=True)
    cut = util.iso(now - timedelta(days=config.RECENT_DAYS))
    recent = [i for i in items if i["date"] >= cut]
    archive = [i for i in items if i["date"] < cut]
    stamp = util.iso(now)
    _dump(data_dir / RECENT, {"generated": stamp, "items": recent})
    _dump(data_dir / ARCHIVE, {"generated": stamp, "items": archive})
    _dump(data_dir / META, meta)

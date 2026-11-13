"""AI Report Radar 수집기 진입점 — 국내외 AI 보고서의 새 소식을 모은다.

    python -m collector                # 주기가 돌아왔으면 수집(기본, Actions 용)
    python -m collector --force        # 주기와 상관없이 수집
    python -m collector --demo         # 네트워크 없이 샘플 데이터 생성(화면 확인용)
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path

from . import config, demo, sources_news, store, util
from .classify import Classifier, load_taxonomy
from .reports import ReportMatcher, build_queries, load_reports

TYPES = config.TYPES


def _registry() -> list[tuple[str, str, callable]]:
    """(유형, 소스 이름, 수집 함수). 매체 RSS 를 Google 뉴스보다 먼저 돌려
    같은 기사가 겹칠 때 언론사 직접 주소가 대표 링크가 되게 한다."""
    reg = []
    for spec in config.FEEDS:
        reg.append(("news", spec["name"], lambda now, ctx, s=spec: sources_news.collect_feed(s, now, ctx)))
    reg.append(("news", "Google 뉴스", sources_news.collect_google_news))
    return reg


def _retag(items: list[dict], ctx: sources_news.Ctx, now) -> list[dict]:
    """reports.json·taxonomy.json 을 고치면 저장된 항목에도 바로 반영한다.
    더는 어떤 보고서에도 연결되지 않는 기사는 지운다."""
    return [it for it in items if sources_news.tag(it, ctx, now)]


def _due(meta: dict, now, force: bool) -> list[str]:
    if force:
        return list(TYPES)
    due = []
    last = meta.get("last_run", {})
    for t in TYPES:
        prev = util.parse_iso(last.get(t))
        if prev is None or now - prev >= timedelta(hours=config.INTERVAL_HOURS[t]) - timedelta(minutes=10):
            due.append(t)
    return due


def _summary_md(meta: dict, stats: dict, due: list[str]) -> str:
    lines = ["### AI Report Radar 수집 결과", "",
             f"- 수집: {', '.join(due) or '없음(주기 미도래)'}",
             f"- 신규 {stats['new']} · 갱신 {stats['updated']} · 중복 병합 {stats['merged']}",
             f"- 누적 소식 {meta['counts']['news']}건 · 새 판 가능성 {meta.get('newer', 0)}건",
             "", "| 소스 | 상태 | 건수 | 메모 |", "|---|---|---:|---|"]
    for s in meta["sources"]:
        lines.append(f"| {s['name']} | {'✅' if s['ok'] else '⚠️'} | {s.get('count', 0)} | "
                     f"{(s.get('error') or '').replace('|', '/')[:120]} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m collector", description="AI Report Radar 수집기")
    ap.add_argument("--data-dir", type=Path, default=config.DATA_DIR)
    ap.add_argument("--force", action="store_true", help="주기와 무관하게 수집")
    ap.add_argument("--demo", action="store_true", help="샘플 데이터로 생성(네트워크 불필요)")
    args = ap.parse_args(argv)

    now = util.now_utc()
    reports = load_reports()
    rm = ReportMatcher(reports)
    ctx = sources_news.Ctx(Classifier(load_taxonomy()), rm, build_queries(reports, config.GNEWS_TERMS_PER_QUERY))
    items, meta = store.load(args.data_dir)
    if meta.get("demo") and not args.demo:
        print("이전 데이터가 샘플이라 비우고 실제 수집을 시작합니다.")
        items, meta = [], {}

    prev_status = {s["name"]: s for s in meta.get("sources", [])}
    statuses: dict[str, dict] = {}
    incoming: list[dict] = []

    if args.demo:
        items, due = [], list(TYPES)
        incoming = demo.generate(now, ctx)
        statuses["샘플 데이터"] = {"name": "샘플 데이터", "type": "demo", "ok": True,
                               "count": len(incoming), "error": None, "at": util.iso(now)}
    else:
        due = _due(meta, now, args.force)
        print(f"수집: {', '.join(due) or '없음(주기 미도래 — 데이터만 다시 씀)'} · 검색어 {len(ctx.queries)}개")
        for typ, name, fn in _registry():
            if typ not in due:
                if name in prev_status:
                    statuses[name] = prev_status[name]
                continue
            try:
                got = fn(now, ctx)
                incoming.extend(got)
                statuses[name] = {"name": name, "type": typ, "ok": True, "count": len(got),
                                  "error": None, "at": util.iso(now)}
                print(f"  ✓ {name}: {len(got)}건")
            except Exception as e:  # noqa: BLE001 — 소스 하나가 죽어도 나머지는 계속
                msg = util.redact(str(e))[:300]
                statuses[name] = {"name": name, "type": typ, "ok": False, "count": 0,
                                  "error": msg, "at": util.iso(now)}
                print(f"  ✗ {name}: {msg}")

    items, stats = store.merge(items, incoming, now)
    items = store.trim(items, now)
    before = len(items)
    items = _retag(items, ctx, now)
    if before != len(items):
        print(f"보고서와 연결되지 않는 기존 항목 {before - len(items)}건 정리")

    last_run = dict(meta.get("last_run", {}))
    for t in due:
        last_run[t] = util.iso(now)
    meta = {
        "generated": util.iso(now),
        "demo": bool(args.demo),
        "last_run": last_run,
        "counts": {t: sum(1 for i in items if i["type"] == t) for t in TYPES},
        "newer": sum(1 for i in items if i.get("newer")),
        "recent_days": config.RECENT_DAYS,
        "retention_days": config.RETENTION_DAYS,
        "sources": list(statuses.values()),
    }
    store.save(args.data_dir, items, meta, now)
    print(f"신규 {stats['new']} · 갱신 {stats['updated']} · 중복 병합 {stats['merged']} · "
          f"오래되어 제외 {stats['stale']} → 누적 {meta['counts']} · 새 판 가능성 {meta['newer']}")

    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write(_summary_md(meta, stats, due))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""보고서 소식 수집 — Google 뉴스 RSS(보고서 이름 검색) + 매체 RSS.

모든 기사는 reports.json 의 watch 낱말로 어떤 보고서의 소식인지 확인된 것만 담는다."""
from __future__ import annotations

import re
import urllib.parse
from datetime import datetime, timedelta

from . import config, util
from .classify import Classifier
from .feeds import parse_feed
from .reports import ReportMatcher

GNEWS = {
    "ko": "https://news.google.com/rss/search?q={q}&hl=ko&gl=KR&ceid=KR:ko",
    "en": "https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en",
}

_DOMAIN = re.compile(r"^(www\.)?[\w-]+(\.[\w-]+)*\.[a-z]{2,}$", re.I)


class Ctx:
    """수집 함수가 함께 쓰는 분류기·보고서 연결기."""

    def __init__(self, clf: Classifier, rm: ReportMatcher, queries: list[dict]):
        self.clf, self.rm, self.queries = clf, rm, queries


def _split_source(title: str) -> tuple[str, str]:
    """Google 뉴스 제목 '헤드라인 - 언론사' 에서 언론사를 떼어 낸다(같은 꼬리가 반복되면 모두 지운다)."""
    head, src = title.strip(), ""
    if " - " in head:
        h, _, tail = head.rpartition(" - ")
        if h.strip() and 0 < len(tail.strip()) <= 30:
            head, src = h.strip(), tail.strip()
            while head.endswith(" - " + src):
                head = head[: -len(" - " + src)].rstrip()
    return head, src


def _source_name(tag: str, tail: str) -> str:
    """<source> 가 도메인(www.ebn.co.kr)이면 제목 꼬리의 매체명을 쓰고, 없으면 www. 만 뗀다."""
    tag = (tag or "").strip()
    name = (tail or tag) if (tag and _DOMAIN.match(tag)) else (tag or tail)
    return re.sub(r"^www\.", "", name, flags=re.I)


def _useful_summary(summary: str, title: str) -> str:
    """요약이 제목 반복(Google 뉴스 기본 description)이면 버린다."""
    s = util.clean_text(summary)
    if len(s) < 20:
        return ""
    t = re.sub(r"\W+", "", title.lower())
    if re.sub(r"\W+", "", s.lower()).startswith(t[: max(8, len(t) // 2)]):
        return ""
    return s


def tag(item: dict, ctx: Ctx, now: datetime) -> bool:
    """분야·보고서·새 판 표시를 붙인다. 어떤 보고서에도 연결되지 않으면 False."""
    reps = ctx.rm.match(item["title"], item.get("summary", ""))
    item["reps"] = reps
    item["newer"] = ctx.rm.newer(item["title"], reps, now.year + 1)
    cats = ctx.clf.classify(item["title"], item.get("summary", ""))
    if ctx.rm.domestic(reps) and "korea" not in cats:   # 국내 보고서 소식은 늘 '한국 관련'
        cats = ["korea"] + [c for c in cats if c != ctx.clf.fallback][:2]
    item["cats"] = cats
    return bool(reps)


def _make(title: str, url: str, source: str, date: datetime, summary: str, lang: str,
          now: datetime, via: str) -> dict:
    from .dedup import canon_url
    key = "url:" + canon_url(url)
    return {
        "key": key,
        "id": util.short_id(key),
        "type": "news",
        "title": title,
        "url": url,
        "source": source or urllib.parse.urlsplit(url).netloc.replace("www.", ""),
        "date": util.iso(min(date, now)),
        "summary": util.clip(summary, config.SUMMARY_MAX["news"]),
        "lang": lang,
        "via": via,
    }


def collect_google_news(now: datetime, ctx: Ctx) -> list[dict]:
    out: list[dict] = []
    errors = []
    for spec in ctx.queries:
        q = f"{spec['q']} when:{config.GNEWS_WINDOW}"
        url = GNEWS[spec.get("lang", "ko")].format(q=urllib.parse.quote(q))
        try:
            rows = parse_feed(util.fetch(url))
        except Exception as e:  # noqa: BLE001 — 검색어 하나 실패는 건너뛴다
            errors.append(f"{spec['q'][:40]}: {e}")
            continue
        rows.sort(key=lambda r: util.parse_date(r["date"], "UTC") or now, reverse=True)
        for r in rows[: config.GNEWS_PER_QUERY]:
            if not r["title"] or not r["link"]:
                continue
            title, src_tail = _split_source(util.clean_text(r["title"]))
            it = _make(title, r["link"], _source_name(r["source"], src_tail),
                       util.parse_date(r["date"], "UTC") or now, _useful_summary(r["summary"], title),
                       "ko" if util.is_korean(title) else spec.get("lang", "ko"), now, "gnews")
            if tag(it, ctx, now):
                out.append(it)
    if errors and not out:
        raise RuntimeError("모든 검색어 실패 — " + errors[0])
    if errors:
        print(f"  · Google 뉴스: 검색어 {len(errors)}개 실패 (첫 오류: {errors[0][:120]})")
    return out


def collect_feed(spec: dict, now: datetime, ctx: Ctx) -> list[dict]:
    rows = parse_feed(util.fetch(spec["url"]))
    oldest = now - timedelta(days=spec.get("lookback", config.FEED_LOOKBACK_DAYS))
    out = []
    for r in rows:
        title = util.clean_text(r["title"])
        if not title or not r["link"]:
            continue
        date = util.parse_date(r["date"], spec.get("tz", "UTC"))
        if date is None or date.year < 1990 or date < oldest:
            continue
        it = _make(title, r["link"], spec["name"], date, util.clean_text(r["summary"]),
                   "ko" if util.is_korean(title) else spec.get("lang", "en"), now, "feed")
        if tag(it, ctx, now):
            out.append(it)
    out.sort(key=lambda x: x["date"], reverse=True)
    return out[: config.FEED_PER_SOURCE]

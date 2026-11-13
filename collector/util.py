"""HTTP·날짜·텍스트 도우미(표준 라이브러리만 사용)."""
from __future__ import annotations

import email.utils
import gzip
import hashlib
import html
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from . import config

UTC = timezone.utc
KST = timezone(timedelta(hours=9))
TZS = {"Asia/Seoul": KST, "UTC": UTC}
UA = "Mozilla/5.0 (compatible; AI-Report-Radar/1.0; +https://github.com/)"

_SECRETS: list[str] = []


def register_secret(value: str) -> None:
    """로그·meta.json 에 남지 않게 가릴 값(API 키)."""
    if value:
        import urllib.parse
        for v in (value, urllib.parse.quote(value, safe=""), urllib.parse.quote_plus(value)):
            if v and v not in _SECRETS:
                _SECRETS.append(v)


def redact(text: str) -> str:
    text = str(text)
    for s in _SECRETS:
        text = text.replace(s, "***")
    return text


def http_get(url: str, *, timeout: int | None = None, retries: int = 2,
             headers: dict | None = None) -> bytes:
    """GET 후 본문 바이트. 일시 오류는 재시도, 4xx 는 즉시 실패.

    오류 메시지에는 질의 문자열을 넣지 않는다(키가 URL 에 실리는 API 가 있다).
    """
    h = {"User-Agent": UA, "Accept-Encoding": "gzip", "Accept": "*/*"}
    h.update(headers or {})
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout or config.REQUEST_TIMEOUT) as r:
                data = r.read()
                if r.headers.get("Content-Encoding", "").lower() == "gzip":
                    data = gzip.decompress(data)
                return data
        except urllib.error.HTTPError as e:
            last = e
            if 400 <= e.code < 500 and e.code != 429:
                break
        except Exception as e:  # noqa: BLE001 — 네트워크 오류는 모두 재시도 대상
            last = e
        if attempt < retries:
            time.sleep(2.0 * (attempt + 1))
    where = url.split("?", 1)[0]
    raise RuntimeError(redact(f"{where} 요청 실패: {last}"))


# 테스트에서 바꿔 끼우는 지점. 모든 소스는 util.fetch 로만 네트워크에 나간다.
fetch = http_get


# ── 날짜 ─────────────────────────────────────────────────────────
def now_utc() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


_NAIVE_PATTERNS = [
    ("%Y-%m-%d %H:%M:%S", re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")),
    ("%Y-%m-%d %H:%M", re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")),
    ("%Y.%m.%d %H:%M", re.compile(r"^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$")),
    ("%Y-%m-%d", re.compile(r"^\d{4}-\d{2}-\d{2}$")),
    ("%Y.%m.%d", re.compile(r"^\d{4}\.\d{2}\.\d{2}$")),
    ("%Y%m%d", re.compile(r"^\d{8}$")),
]


def parse_date(s: str | None, tz: str = "Asia/Seoul") -> datetime | None:
    """RFC 822 · ISO 8601 · 'YYYY-MM-DD HH:MM:SS' · 'YYYYMMDD' 등 → UTC datetime.

    시간대 표기가 없으면 tz 로 해석한다(국내 매체 RSS 는 대개 KST 를 그냥 적는다).
    """
    s = (s or "").strip()
    if not s:
        return None
    assume = TZS.get(tz, KST)
    # ISO 8601
    if re.match(r"^\d{4}-\d{2}-\d{2}T", s):
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=assume)
            return dt.astimezone(UTC)
        except ValueError:
            pass
    for fmt, rx in _NAIVE_PATTERNS:
        if rx.match(s):
            try:
                return datetime.strptime(s, fmt).replace(tzinfo=assume).astimezone(UTC)
            except ValueError:
                return None
    # RFC 822 (Thu, 12 Nov 2026 22:42:51 +0000 / GMT)
    try:
        dt = email.utils.parsedate_to_datetime(s)
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=assume)
            return dt.astimezone(UTC)
    except (TypeError, ValueError, IndexError, OverflowError):
        pass
    return None


# ── 텍스트 ───────────────────────────────────────────────────────
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def clean_text(s: str | None) -> str:
    """HTML 태그·실체참조를 걷어내고 공백을 하나로."""
    if not s:
        return ""
    s = _TAG.sub(" ", s)
    for _ in range(2):  # 두 번 감싼 실체참조(&amp;amp;)가 흔하다
        un = html.unescape(s)
        if un == s:
            break
        s = un
    s = _TAG.sub(" ", s)
    return _WS.sub(" ", s).strip()


def clip(s: str, n: int) -> str:
    s = s.strip()
    if len(s) <= n:
        return s
    cut = s[:n].rstrip()
    sp = cut.rfind(" ")
    if sp > n * 0.7:
        cut = cut[:sp]
    return cut.rstrip(" ,.;:·") + "…"


def short_id(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def is_korean(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s or ""))


def join_authors(names: list[str], keep: int = 3) -> str:
    names = [n.strip() for n in names if n and n.strip()]
    if len(names) <= keep:
        return ", ".join(names)
    return ", ".join(names[:keep]) + f" 외 {len(names) - keep}명"

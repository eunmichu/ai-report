"""화면 확인용 샘플 데이터(네트워크 불필요). 실제 기사가 아니다.

`python -m collector --demo` 로 만들며 meta.json 에 demo=true 가 기록되어
웹사이트 상단에 '샘플 데이터' 안내가 표시된다. 링크는 모두 example.com 이다.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from . import util

# (제목, 요약, 언어) — 제목에는 reports.json 의 watch 낱말이 들어 있어야 보고서와 연결된다.
SAMPLES = [
    ("2026 인터넷이용실태조사 착수…생성형 AI 유료 구독 문항 확대", "올해 조사부터 AI 서비스 이용 목적을 더 자세히 묻는다.", "ko"),
    ("AI Index 2027 to add new chapter on AI agents, organizers say", "The next edition will track agent deployments across industries.", "en"),
    ("글로벌 혁신지수 4위 유지 비결은 인적 자본…연구 투자 지표 최상위", "한국은 연구개발 지출과 연구 인력에서 높은 점수를 받았다.", "ko"),
    ("Microsoft AI Diffusion Report: emerging markets close part of the gap", "Usage in the Global South rose faster than expected in the latest quarter.", "en"),
    ("한국은행 이슈노트 \"AI 효과, 조직이 바뀌어야 생산성으로\"", "업무시간 절감이 산출 증가로 이어지려면 업무 재설계가 필요하다는 분석.", "ko"),
    ("Hype Cycle 2026: agentic AI slides toward the trough", "Analysts expect expectations to reset as deployments mature.", "en"),
    ("부가통신사업 실태조사, 생성형 AI 검색 대체 흐름 뚜렷", "이용자 다수가 기존 검색의 상당 부분을 AI로 대신하고 있다.", "ko"),
    ("OECD Digital Economy and Society Outlook flags SME adoption gap", "Small firms lag far behind large enterprises in AI use.", "en"),
    ("2025 인공지능산업 실태조사 발표…AI 기업 수 3천 곳 넘어", "샘플 기사입니다. 실제 수치가 아닙니다.", "ko"),
    ("Government AI Readiness Index 2026 methodology note published", "The index team describes changes to infrastructure indicators.", "en"),
    ("지능정보사회 이용자 패널조사로 본 고령층 AI 격차", "고령층의 생성형 AI 이용률은 여전히 낮다.", "ko"),
    ("International AI Safety Report key update on agent risks", "The interim update reviews new evidence on autonomous agents.", "en"),
    ("국제 IP 지수 10위…AI 저작권 정책은 모범 사례로", "저작권 분야는 상위권을 지켰다.", "ko"),
    ("Future of Jobs survey opens for 2027 edition", "Employers are asked about AI-driven skills demand.", "en"),
    ("디지털산업 실태조사 \"AI 의사결정 활용 기업 늘었다\"", "현장 자동화는 아직 초기 단계로 나타났다.", "ko"),
    ("Foundation Model Transparency Index: what changed for open models", "Open developers split into transparent and opaque groups.", "en"),
]
SOURCES = {"ko": ["테스트일보", "샘플경제", "예시뉴스"], "en": ["Example News", "Sample Tribune"]}


def generate(now: datetime, ctx) -> list[dict]:
    from .sources_news import tag
    rnd = random.Random(7)
    out = []
    for i, (title, summary, lang) in enumerate(SAMPLES):
        when = now - timedelta(hours=3 + i * 19 + rnd.randint(0, 6))
        key = f"url:example.com/report-news/{i}"
        it = {
            "key": key, "id": util.short_id(key), "type": "news", "title": title,
            "url": f"https://example.com/report-news/{i}",
            "source": rnd.choice(SOURCES[lang]), "date": util.iso(when), "summary": summary,
            "lang": lang, "via": "demo",
        }
        if tag(it, ctx, now):
            out.append(it)
    return out

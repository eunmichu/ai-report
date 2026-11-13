[Uploading README.md…]()
# AI Report Radar

**국내외 대표 AI 보고서를 깊게 읽기 위한** 정적 웹사이트입니다. 네 개의 탭으로 되어 있습니다.

| 탭 | 내용 |
|---|---|
| **최근 주요 소식** (맨 위) | 모든 탭 위에 보고서 관련 기사 3~5건을 카드로 보여 줍니다. 최근 2주(부족하면 45일) 기사 가운데 새 판 신호, 여러 매체 보도, 한국 관련, 여러 보고서 연결, 최신 순으로 점수를 매겨 고릅니다. |
| **새 소식** | 보고서 이름이 들어간 기사만 3시간마다 모읍니다. 기사마다 어떤 보고서의 소식인지 표시하고, 최신판보다 뒤의 연도가 나오면 **새 판 가능성**으로 표시합니다. |
| **보고서** (첫 화면, 두 번째 탭) | 해외 19종·국내 6종. 첫 화면은 **발간 주기** — 한 해 발간 달력(달마다 해외·국내 칸을 나눠 표시)과 '앞으로 3개월 안에 나올 보고서', 주기별(분기·매년·2년·5년·특별판) 목록을 **해외와 국내를 나란히** 보여 줍니다. **보고서를 누르면 상세 화면**으로 넘어가 ① 조사 방법·읽을 때 주의할 점·한국에 주는 시사점, ② **한 장 요약**(첫 문단·핵심 수치 4개·챕터별 요약 줄), ③ **챕터별 상세 정리**(핵심 내용·주요 수치·한국 관련, **더보기**를 누르면 상세가 더 펼쳐짐), ④ 핵심 발견을 봅니다. **A4 한 장 인쇄** 버튼을 누르면 미리보기가 열리고, 글자 크기와 담을 상세 줄 수를 자동으로 맞춰 A4 한 장을 꽉 채운 요약을 인쇄하거나 PDF로 저장할 수 있습니다(상세 화면에서 Ctrl+P를 눌러도 같은 한 장이 인쇄됨). **보고서 전체 인쇄** 버튼(챕터별 상세 맨 위)은 1쪽 한 장 요약에 이어 모든 챕터(요약·대표 그림·핵심 정리·더 자세히·한국 관련)를 **이어 쓰기**로 인쇄합니다. 한 챕터가 한 장을 다 채우지 못하면 다음 챕터가 같은 장에 이어지고, 글자 크기(9.5~11.5pt)는 장 수가 늘지 않는 범위에서 가장 크게 골라 마지막 장까지 채웁니다. 챕터의 **대표 그림**은 원문 그림을 복제하지 않고 보고서에 나온 수치로 다시 그린 막대·추이 그림입니다. 보고서별·주제별 보기로도 바꿀 수 있습니다. |
| **지표 추적** | 판별 수치를 모은 차트 10개 — 한국 순위(글로벌 혁신 지수·MS AI 확산·정부 AI 준비도·국제 IP 지수·AI Index), 한국 생성형 AI 이용률을 조사별로 비교, 세계 지표(MS·맥킨지·OECD·투명성 지수). 차트마다 표 보기와 툴팁이 있습니다. 차트마다 **A4 인쇄** 버튼이 있어, 그림과 함께 이 지표는·읽는 법·핵심·한국·수치 표를 A4 한 장에 꽉 채워 인쇄합니다(설명은 `metrics.json`의 `print`). |
| **쟁점 분석** | 같은 질문에 대한 여러 보고서의 답을 나란히 놓고 **숫자가 다른 이유 → 종합 판단 → 한국 시사점**으로 정리합니다. (한국인 몇 %가 생성형 AI를 쓰나? · AI는 생산성으로 이어지나? · AI가 일자리를 줄이나? · 한국의 AI 경쟁력은 몇 위인가? · AI는 안전하고 투명한가?) |

다룬 보고서

- 해외 — Stanford AI Index · AI100 · 국제 AI 안전 보고서 · State of AI · 맥킨지 AI 현황 · 국제 IP 지수 · WIPO 생성형 AI 특허 ·
  글로벌 혁신 지수 · IEA 에너지와 AI · OECD 디지털 경제·사회 전망 · WEF 일자리의 미래 · UNCTAD 기술혁신 보고서 ·
  EUIPO 생성형 AI와 저작권 · MS 글로벌 AI 확산 · 가트너 AI 하이프 사이클 · 파운데이션 모델 투명성 지수 · 정부 AI 준비도 지수
- 국내 — 인터넷이용실태조사 · 지능정보사회 이용자 패널조사 · 부가통신사업 실태조사 · 디지털산업 실태조사 ·
  인공지능산업 실태조사 · 한국은행 BOK 이슈노트(AI의 생산성·고용 효과)

```
https://<계정>.github.io/<저장소>/                               발간 주기(첫 화면, 해외·국내 함께)
https://<계정>.github.io/<저장소>/#r=ai-index-2026                AI Index 상세(챕터별 요약)
https://<계정>.github.io/<저장소>/#view=report&region=kr          국내 보고서를 보고서별로
https://<계정>.github.io/<저장소>/#tab=issue&cat=work             일자리 관련 쟁점
https://<계정>.github.io/<저장소>/#tab=news&newer=1               새 판 가능성이 있는 소식
```

## 폴더 구성

```
index.html               화면(한 장)
assets/
  reports.json           ★ 보고서·핵심 발견·발간 주기·분석 노트 — 직접 고치는 파일
  chapters.json          ★ 보고서별 챕터 정리(한 장 요약·상세) — 직접 고치는 파일
  metrics.json           ★ 지표 추적 차트(판별 수치) — 직접 고치는 파일
  issues.json            ★ 쟁점 분석(질문·보고서별 답·이유·판단·시사점) — 직접 고치는 파일
  taxonomy.json          새 소식 주제 분류 키워드와 검색 동의어
  app.js · search.js · style.css   화면 로직·한국어 검색·디자인
collector/               새 소식 수집기(파이썬 표준 라이브러리만 사용)
  config.py              주기·보존 기간·RSS·검색어 묶음 크기
  reports.py             기사 → 보고서 연결, 새 판 감지, 검색어 생성
  sources_news.py        Google 뉴스 RSS, 매체 RSS
tools/build_snapshot.py  데이터까지 담은 단일 HTML 파일 만들기
tests/                   오프라인 테스트(파이썬 20개, 검색 9개)
.github/workflows/update.yml   3시간마다 수집 → gh-pages 배포
```

## GitHub Pages에 올리기 (처음 한 번)

1. **파일 올리기** — 저장소(예: `ai-report`)에 이 폴더의 내용을 그대로 올립니다. `.github` 폴더까지 포함되어야 합니다.
2. **첫 실행** — Actions 탭 → `AI Report Radar 소식 수집·배포` → **Run workflow**. 몇 분 뒤 `gh-pages` 브랜치가 생깁니다.
3. **Pages 켜기** — Settings → Pages → Source: **Deploy from a branch** → Branch: **gh-pages** / **(root)** → Save.
4. 1~2분 뒤 `https://<계정>.github.io/<저장소>/` 에서 열립니다. 이후 새 소식은 3시간마다 자동으로 갱신됩니다.

API 키는 필요 없습니다. 워크플로가 `Permission denied`로 실패하면 Settings → Actions → General →
Workflow permissions를 **Read and write permissions**로 바꾸세요.

## 내용 고치기

보고서·지표·쟁점은 자동 수집이 아니라 **직접 고치는 JSON 파일**입니다. GitHub에서 파일을 열고 연필 아이콘으로 고친 뒤
Commit하면 몇 분 안에 다시 배포됩니다. 형식이 틀리면 배포 전 테스트에서 걸리므로, Actions에 빨간 X가 뜨면 고친 줄을 확인하세요.

| 바꿀 것 | 파일·필드 |
|---|---|
| 보고서 추가·새 판 반영 | `reports.json` → `reports`. 필수: `id`, `region`(`intl`/`kr`), `title`, `short`(짧은 이름), `org`, `date`, `url`, `about`, `cycle`(`quarterly`·`annual`·`biennial`·`5y`·`adhoc`), `months`(보통 나오는 달), `when`, `next`, `method`·`limits`·`korea`(분석 노트), `watch`(새 소식을 찾을 낱말), `findings`. 선택: `status`(`active`·`paused`·`ended`), `statusNote`(중지·폐간 사유와 시점), `refs`(참고 링크) |
| 핵심 발견 | `findings` 의 `t`(요약), `n`(강조 수치, 선택), `topics`(주제 키) |
| 달력의 '앞으로 3개월' | `nextYM`(`YYYY-MM`), 중간판은 `minor`·`minorLabel` |
| 참고 링크 | `reports.json`의 보고서에 `refs: [{label, url}]`를 적으면 원문 링크 옆에 함께 나옵니다(예: AI Index의 한국어 요약). |
| 챕터 정리 | `chapters.json` → `reports.<보고서 id>`: `basis`(챕터를 나눈 기준), `structure`(원문 구성 설명, 선택), `lead`(한 장 요약 첫 문단), `keys`(핵심 수치 4개 `[{v, l}]`), `chapters[]` — `t`(챕터 제목), `en`(원문 제목), `n`(핵심 수치), `s`(한 줄 요약, 90자 이내), `b`(한 장 요약 줄 2~5개, 한 줄 45자 이내), `p`(상세 정리), `more`(더보기를 누르면 펼쳐지는 상세, 선택), `k`(한국 관련, 선택), `fig`(대표 그림, 선택 — `type` bar·bar2·line, `title`, `unit`, bar는 `items: [[라벨, 값]]`·`hl`(강조 라벨), bar2는 `series: [이름1, 이름2]`·`items: [[라벨, 값1, 값2]]`, line은 `x`·`series: [{name, values}]`, `note`), `img`(직접 넣은 그림, 선택 — `{src, alt, cap, credit}`. 이미지는 `assets/fig/`에 두고, **보고서 라이선스가 재게시를 허용하는 경우에만** 출처와 함께 넣으세요) |
| 지표 차트 | `metrics.json` → `charts`(`type`: `line`·`time`·`bar`, 순위는 `invert: true`) 와 `groups` |
| 쟁점 | `issues.json` → `issues`(`rows[].r` 은 보고서 id, `chart` 는 차트 id) |
| 새 소식 주제 분류·검색 동의어 | `taxonomy.json` |
| 수집 주기·보존 기간 | 환경변수 `NEWS_EVERY_HOURS`(0), `NEWS_RETENTION_DAYS`(400), `GNEWS_WINDOW`(3d) |

### 보고서 목록 관리(추가·중지·폐간)

| 하려는 일 | 고칠 곳 |
|---|---|
| 새 보고서 추가 | `reports.json`의 `reports`에 항목을 넣고(필수 칸은 위 표), `chapters.json`에 같은 `id`로 챕터 정리를 넣습니다. 새 소식은 `watch`·`watchIf` 낱말로 다음 수집부터 찾습니다. |
| 수집 잠시 중지 | 해당 보고서에 `"status": "paused"`를 적습니다. 화면에는 그대로 남고 '수집 중지' 표시가 붙으며, 새 소식만 찾지 않습니다. 다시 찾으려면 `status`를 지우거나 `"active"`로 바꿉니다. |
| 폐간·발간 중단 | `"status": "ended"`와 `"statusNote": "2027년 발간 중단 발표"`처럼 사유·시점을 적습니다. 새 소식 수집과 발간 달력·'앞으로 3개월'에서 빠지고, 주기별 목록 맨 뒤에 '발간 중단' 표시와 함께 남습니다. 지난 판 정리와 이미 모은 소식은 지우지 않습니다. |
| 완전히 삭제 | `reports.json`과 `chapters.json`에서 항목을 지우고, `metrics.json`·`issues.json`에서 그 `id`를 쓰는 곳을 정리합니다. 그 보고서에만 연결된 소식은 다음 수집 때 자동으로 지워집니다. |

고친 뒤 `python -m collector --list-reports`를 실행하면 보고서별 상태·주기·다음 판을 표로 보여 주고, 빠진 칸·겹친 id·챕터 정리 누락·검색 낱말 누락·발간 중단 사유 누락을 점검합니다(수집은 하지 않음). 같은 점검은 테스트(`test_report_status`)에도 들어 있어, 잘못 고치면 자동 갱신 작업이 배포 전에 멈춥니다.

새 판이 나오면: `reports.json` 에서 해당 보고서의 `title`·`date`·`edition`·`findings`·`next` 를, `chapters.json` 에서 챕터 정리를 고치고,
`metrics.json` 의 판별 수치에 새 값을 더하면 지표 추적 차트도 함께 늘어납니다.

## 내 컴퓨터에서 실행

파이썬 3.10 이상만 있으면 됩니다(설치할 패키지 없음).

```bash
python -m collector --force      # 실제 소식 수집 (또는 --demo 로 샘플 데이터)
python -m http.server 8000       # → http://localhost:8000
```

테스트: `python -m unittest discover -s tests -v` · `node --test tests/search.test.mjs`
단일 파일: `python tools/build_snapshot.py -o report-radar.html` → 서버 없이 열리는 HTML 한 장.

## 참고

- 보고서 요약·지표는 **2026-11-13 기준** 원문·공식 발표와 신뢰할 만한 보도를 대조해 정리했습니다.
  일부 국내 보고서는 공식 페이지 대신 발표 자료·보도로 연결되며, 링크 이름(발표 자료·관련 보도)으로 구분했습니다.
- 조사 방법·주의할 점·시사점, 쟁점의 '종합 판단'은 정리자의 분석입니다. 정확한 수치와 맥락은 원문에서 확인하세요.
- '다음 판'과 '새 판 가능성'은 예상·자동 감지이므로 실제 발표로 확인해야 합니다.
- 새 소식은 제목·요약·링크만 보여 줍니다. 원문과 저작권은 각 출처에 있습니다.

// AI Report Radar — 국내외 AI 보고서 분석(빌드 도구 없이 동작하는 ES 모듈)
import { buildLexicon, parseQuery, prepareHaystack, matchScore, highlight, escHTML } from './search.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TABS = [['news', '새 소식'], ['report', '보고서'], ['metric', '지표 추적'], ['issue', '쟁점 분석']];
const VIEWS = [['cycle', '발간 주기'], ['report', '보고서별'], ['topic', '주제별']];
const DEFAULT_VIEW = 'cycle';
const REGIONS = [['all', '전체'], ['intl', '해외'], ['kr', '국내']];
const PERIODS = [['7d', '7일'], ['30d', '30일'], ['90d', '90일'], ['all', '전체'], ['custom', '기간 지정']];
const SORTS = ['latest', 'relevance'];
const PAGE = 30;
const DEFAULT_TAB = 'report';
const DEFAULT_PERIOD = '90d';
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const S = { tab: DEFAULT_TAB, view: DEFAULT_VIEW, open: '', region: 'all', cat: [], q: '', period: DEFAULT_PERIOD, from: '', to: '', sort: 'latest', saved: false, newer: false, rep: '' };
let ITEMS = [];                      // 보고서 핵심 발견(rfind) + 새 소식(news)
let META = {};
let REPORTS = [];                    // 최신순
let REP = {};                        // id → 보고서
let RTOPICS = [];
let RTOPIC = {};
let RCYCLES = [];
let RCYC = {};
let UPDATED = '';
let CHARTS = {};                     // id → 차트 정의
let MGROUPS = [];
let ISSUES = [];
let CHAPTERS = {};                   // id → { basis, structure, chapters[] }
let FALLBACK = { key: 'etc', label: '일반·기타', short: '기타' };
let LEX = new Map();
let parsed = null;
let shown = PAGE;
let archive = 'idle';                // idle | loading | done | error
let firstPaint = true;

// ── 저장소(브라우저별) ─────────────────────────────────────
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};
const saved = new Set(ls.get('arr.saved', []));
const prevVisit = ls.get('arr.lastVisit', 0);
setTimeout(() => ls.set('arr.lastVisit', Date.now()), 4000);

// ── 날짜(한국 시간 기준) ───────────────────────────────────
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtWeek = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' });
const dayOf = (ms) => fmtDay.format(ms);
const today = () => dayOf(Date.now());
const toMs = (day) => Date.parse(`${day}T12:00:00+09:00`);
const addDays = (day, n) => dayOf(toMs(day) + n * 86400000);
const md = (day) => `${+day.slice(5, 7)}월 ${+day.slice(8, 10)}일`;
const fmtRDate = (d) => {
  const s = String(d || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(0, 4)}. ${+s.slice(5, 7)}. ${+s.slice(8, 10)}.`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s.slice(0, 4)}. ${+s.slice(5, 7)}.`;
  return s;
};

function dayTitle(day) {
  const t = today();
  const wk = fmtWeek.format(toMs(day));
  if (day === t) return ['오늘', `${md(day)} ${wk}`];
  if (day === addDays(t, -1)) return ['어제', `${md(day)} ${wk}`];
  return [`${md(day)} (${wk})`, day.slice(0, 4) !== t.slice(0, 4) ? day.slice(0, 4) + '년' : ''];
}
function when(it) {
  const diff = Date.now() - it._t;
  if (diff < 0) return '방금';
  if (diff < 3600e3) return `${Math.max(1, Math.round(diff / 60e3))}분 전`;
  if (diff < 86400e3) return `${Math.round(diff / 3600e3)}시간 전`;
  return fmtTime.format(it._t);
}

// ── 주소창 상태(공유 가능한 링크) ──────────────────────────
const keys = (arr) => arr.map(([k]) => k);
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  S.tab = keys(TABS).includes(p.get('tab')) ? p.get('tab') : DEFAULT_TAB;
  S.view = keys(VIEWS).includes(p.get('view')) ? p.get('view') : DEFAULT_VIEW;
  S.open = p.get('r') || '';
  S.region = keys(REGIONS).includes(p.get('region')) ? p.get('region') : 'all';
  S.cat = (p.get('cat') || '').split(',').map((s) => s.trim()).filter(Boolean);
  S.from = p.get('from') || '';
  S.to = p.get('to') || '';
  const per = p.get('period');
  S.period = keys(PERIODS).includes(per) ? per : (S.from || S.to ? 'custom' : DEFAULT_PERIOD);
  S.q = p.get('q') || '';
  S.sort = SORTS.includes(p.get('sort')) ? p.get('sort') : 'latest';
  S.saved = p.get('saved') === '1';
  S.newer = p.get('newer') === '1';
  S.rep = p.get('rep') || '';
}
function writeHash() {
  const kv = [];
  const put = (k, v) => kv.push(`${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`);
  if (S.tab !== DEFAULT_TAB) put('tab', S.tab);
  if (S.tab === 'report' && S.view !== DEFAULT_VIEW) put('view', S.view);
  if (S.tab === 'report' && S.open) put('r', S.open);
  if ((S.tab === 'report' || S.tab === 'news') && S.region !== 'all') put('region', S.region);
  if (S.cat.length) put('cat', S.cat.join(','));
  if (S.tab === 'news') {
    if (S.period !== DEFAULT_PERIOD) put('period', S.period);
    if (S.period === 'custom') { if (S.from) put('from', S.from); if (S.to) put('to', S.to); }
    if (S.sort !== 'latest') put('sort', S.sort);
    if (S.newer) put('newer', '1');
    if (S.rep) put('rep', S.rep);
  }
  if (S.q.trim()) put('q', S.q.trim());
  if (S.saved) put('saved', '1');
  const h = kv.join('&');
  try { history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search); } catch { /* 샌드박스 */ }
}

// ── 데이터 ────────────────────────────────────────────────
async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function setTaxonomy(tax) {
  if (tax && tax.fallback) FALLBACK = tax.fallback;
  LEX = buildLexicon((tax && tax.synonyms) || []);
}

// 보고서 → 핵심 발견 하나하나를 항목으로 만든다(검색·주제 필터를 그대로 쓴다).
function setReports(doc) {
  if (!doc || !Array.isArray(doc.reports)) return [];
  RTOPICS = doc.topics || [];
  RTOPIC = Object.fromEntries(RTOPICS.map((t) => [t.key, t]));
  RCYCLES = doc.cycles || [];
  RCYC = Object.fromEntries(RCYCLES.map((c) => [c.key, c]));
  UPDATED = doc.updated || '';
  REPORTS = [...doc.reports].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  REP = Object.fromEntries(REPORTS.map((r) => [r.id, r]));
  const out = [];
  REPORTS.forEach((r, ri) => {
    r._ord = ri;
    (r.findings || []).forEach((f, fi) => {
      out.push({
        id: `rep-${r.id}-${fi}`, type: 'rfind', title: f.t, n: f.n || '', url: r.url, source: r.org,
        authors: `${r.title} ${r.ko || ''} ${r.short || ''}`, date: `${String(r.date).slice(0, 4)}-01-01T00:00:00Z`,
        cats: f.topics && f.topics.length ? f.topics : ['etc'], report: r, _ord: ri * 1000 + fi, lang: 'ko',
        kw: [r.edition, r.kind, String(r.date).slice(0, 4), r.region === 'kr' ? '국내' : '해외'].filter(Boolean),
      });
    });
  });
  return out;
}

function setMetrics(doc) {
  if (!doc || !Array.isArray(doc.charts)) return;
  MGROUPS = doc.groups || [];
  CHARTS = Object.fromEntries(doc.charts.map((c) => [c.id, c]));
  for (const c of doc.charts) {
    const names = (c.series || []).map((s) => `${s.name} ${s.basis || ''} ${(s.report && REP[s.report]) ? REP[s.report].short : ''}`).join(' ');
    const rep = c.report && REP[c.report] ? `${REP[c.report].short} ${REP[c.report].org}` : '';
    prepareHaystack(Object.assign(c, { summary: `${c.note || ''} ${names}`, source: rep }), (c.topics || []).map((k) => RTOPIC[k] ? RTOPIC[k].label : '').join(' '));
  }
}

function setChapters(doc) {
  CHAPTERS = (doc && doc.reports) || {};
}

function setIssues(doc) {
  if (!doc || !Array.isArray(doc.issues)) return;
  ISSUES = doc.issues;
  for (const it of ISSUES) {
    const rows = (it.rows || []).map((r) => `${REP[r.r] ? `${REP[r.r].short} ${REP[r.r].org}` : ''} ${r.n} ${r.basis} ${r.t}`).join(' ');
    prepareHaystack(Object.assign(it, { title: it.q, summary: `${it.short} ${it.verdict} ${(it.why || []).join(' ')} ${it.korea} ${rows}` }),
      (it.topics || []).map((k) => RTOPIC[k] ? RTOPIC[k].label : '').join(' '));
  }
}

function ingest(list) {
  const have = new Set(ITEMS.map((i) => i.id));
  for (const it of list || []) {
    if (!it || !it.id || have.has(it.id)) continue;
    have.add(it.id);
    it._t = Date.parse(it.date) || Date.now();
    it._day = dayOf(it._t);
    it._added = it.type === 'rfind' ? 0 : (Date.parse(it.added || it.date) || it._t);
    it.cats = it.cats && it.cats.length ? it.cats : ['etc'];
    it.reps = (it.reps || []).filter((id) => REP[id]);
    const labels = it.cats.map((c) => (RTOPIC[c] ? RTOPIC[c].label : '')).join(' ');
    const reps = it.type === 'news' ? it.reps.map((id) => `${REP[id].short} ${REP[id].title}`).join(' ') : '';
    prepareHaystack(it, [labels, it.n, reps].join(' '));
    ITEMS.push(it);
  }
  ITEMS.sort((a, b) => b._t - a._t);
}

// ── 필터 계산 ─────────────────────────────────────────────
const isStatic = () => S.tab !== 'news';
const cats = () => (S.tab === 'news' ? [...RTOPICS, FALLBACK] : RTOPICS);
const regionOK = (r) => S.region === 'all' || (r && (r.region || 'intl') === S.region);
function range() {
  const t = today();
  switch (S.period) {
    case '7d': return [addDays(t, -6), t];
    case '30d': return [addDays(t, -29), t];
    case '90d': return [addDays(t, -89), t];
    case 'custom': return [S.from || '0000-01-01', S.to || '9999-12-31'];
    default: return null;
  }
}
const needsArchive = () => {
  if (S.tab !== 'news') return false;
  const r = range();
  return !r || r[0] < addDays(today(), -((META.recent_days || 30) - 1)) || !!S.q.trim() || S.saved || !!S.rep;
};

function compute() {
  parsed = S.q.trim() ? parseQuery(S.q, LEX) : null;
  const catOK = (keysOf) => !S.cat.length || keysOf.some((c) => S.cat.includes(c));
  const qOK = (o) => { const sc = parsed ? matchScore(o, parsed) : 1; o._score = sc; return sc > 0; };
  const counts = {};
  const catCount = Object.fromEntries(cats().map((c) => [c.key, 0]));
  const t0 = today();
  const days = Array.from({ length: 14 }, (_, i) => ({ day: addDays(t0, i - 13), n: 0 }));
  const dayIdx = Object.fromEntries(days.map((d, i) => [d.day, i]));
  const r = range();

  // 보고서 핵심 발견
  const finds = [];
  const repSet = new Set();
  for (const it of ITEMS) {
    if (it.type !== 'rfind' || !regionOK(it.report) || (S.saved && !saved.has(it.id)) || !qOK(it)) continue;
    if (S.tab === 'report') for (const k of it.cats) if (k in catCount) catCount[k]++;
    if (!catOK(it.cats)) continue;
    finds.push(it);
    repSet.add(it.report.id);
  }
  finds.sort((a, b) => a._ord - b._ord);
  counts.report = repSet.size;

  // 지표 차트
  const charts = [];
  for (const c of Object.values(CHARTS)) {
    if (!qOK(c)) continue;
    if (S.tab === 'metric') for (const k of c.topics || []) if (k in catCount) catCount[k]++;
    if (catOK(c.topics || [])) charts.push(c);
  }
  counts.metric = charts.length;

  // 쟁점
  const issues = [];
  for (const it of ISSUES) {
    if (!qOK(it)) continue;
    if (S.tab === 'issue') for (const k of it.topics || []) if (k in catCount) catCount[k]++;
    if (catOK(it.topics || [])) issues.push(it);
  }
  counts.issue = issues.length;

  // 새 소식
  const news = [];
  for (const it of ITEMS) {
    if (it.type !== 'news') continue;
    if (S.region !== 'all' && !it.reps.some((id) => regionOK(REP[id]))) continue;
    if (S.rep && !it.reps.includes(S.rep)) continue;
    if (S.newer && !(it.newer || []).length) continue;
    if (S.saved && !saved.has(it.id)) continue;
    if (!qOK(it)) continue;
    const inPeriod = !r || (it._day >= r[0] && it._day <= r[1]);
    if (S.tab === 'news' && inPeriod) for (const k of it.cats) if (k in catCount) catCount[k]++;
    if (!catOK(it.cats)) continue;
    if (it._day in dayIdx) days[dayIdx[it._day]].n++;
    if (inPeriod) news.push(it);
  }
  if (S.sort === 'relevance' && parsed) news.sort((a, b) => b._score - a._score || b._t - a._t);
  counts.news = news.length;

  return { finds, charts, issues, news, counts, catCount, days };
}

// ── 공용 조각 ─────────────────────────────────────────────
const ICON_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const star = (id) => { const on = saved.has(id); return `<button type="button" class="star" data-star="${id}" aria-pressed="${on}" aria-label="${on ? '저장 해제' : '저장'}">${ICON_STAR}</button>`; };
const tagBtn = (c) => (RTOPIC[c] ? `<button type="button" class="tag${S.cat.includes(c) ? ' on' : ''}${c === 'korea' ? ' tag-korea' : ''}" data-cat="${c}">${escHTML(RTOPIC[c].label)}</button>` : '');
const regionChip = (r) => `<span class="rg rg-${r.region === 'kr' ? 'kr' : 'intl'}">${r.region === 'kr' ? '국내' : '해외'}</span>`;
const cycChip = (r) => (RCYC[r.cycle] ? `<span class="rc cy-${escHTML(r.cycle)} inline">${escHTML(RCYC[r.cycle].label)}</span>` : '');
const repBtn = (id, cls = 'rbadge') => (REP[id] ? `<button type="button" class="${cls}" data-goto="${escHTML(id)}">${escHTML(REP[id].short || REP[id].title)}</button>` : '');
const newsCount = (id) => ITEMS.filter((i) => i.type === 'news' && i.reps.includes(id)).length;
const segHTML = (label, attr, opts, cur) => `<span class="view-seg" role="group" aria-label="${label}">${opts.map(([k, l]) =>
  `<button type="button" data-${attr}="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</span>`;
function emptyHTML(title, body, reset = true) {
  return `<div class="empty"><h3>${title}</h3><p>${body}</p>${reset ? '<button type="button" data-reset>필터 초기화</button>' : ''}</div>`;
}

// ── 머리·옆 패널 ──────────────────────────────────────────
function renderTabs(cnt) {
  const el = $('#tabs');
  el.style.setProperty('--n', TABS.length);
  el.innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" data-type="${k}" aria-selected="${S.tab === k}">${l}<span class="n">${(cnt[k] || 0).toLocaleString('ko-KR')}</span></button>`).join('');
}

function renderPeriods() {
  const off = isStatic();
  $('#bar').hidden = off;
  $('#periods').innerHTML = PERIODS.map(([k, l]) => `<button type="button" class="chip" data-period="${k}" aria-pressed="${S.period === k}">${l}</button>`).join('');
  $('#range').hidden = off || S.period !== 'custom';
  $('#from').value = S.from; $('#to').value = S.to;
  $('#sort').value = S.sort;
  $('#days').hidden = off;
}

function renderCats(cc) {
  const list = cats();
  const max = Math.max(1, ...Object.values(cc));
  $('#cats').innerHTML = list.map((c) => {
    const n = cc[c.key] || 0;
    const on = S.cat.includes(c.key);
    return `<button type="button" class="cat${n ? '' : ' zero'}" data-cat="${c.key}" aria-pressed="${on}">
      <span>${escHTML(c.label)}</span><span class="n">${n.toLocaleString('ko-KR')}</span>
      <span class="meter" aria-hidden="true"><i style="width:${(n / max) * 100}%"></i></span></button>`;
  }).join('');
  const box = $('#cats');
  const sel = box.querySelector('[aria-pressed="true"]');
  if (sel && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, sel.offsetLeft - box.offsetLeft - 16);
}

const UNIT = { report: '핵심 발견', metric: '차트', issue: '쟁점', news: '소식' };
function renderRadar(cc) {
  const list = RTOPICS;
  const N = list.length;
  const W = 300, H = 280, cx = 150, cy = 138, R = 86;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const poly = (rs) => rs.map((r, i) => pt(i, r).map((v) => v.toFixed(1)).join(',')).join(' ');
  const color = S.tab === 'news' ? 'var(--t-news)' : 'var(--t-rfind)';
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="주제별 분포" style="--cx:${cx}px;--cy:${cy}px">`;
  for (const f of [0.25, 0.5, 0.75, 1]) s += `<polygon class="ring" points="${poly(list.map(() => R * f))}"/>`;
  list.forEach((_, i) => { const [x, y] = pt(i, R); s += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
  const vals = list.map((c) => cc[c.key] || 0);
  const mx = Math.max(...vals);
  if (mx) {
    const rs = vals.map((v) => (v ? Math.max(0.08, Math.sqrt(v / mx)) : 0) * R);
    s += `<polygon class="shape" points="${poly(rs)}" style="fill:${color};fill-opacity:.12;stroke:${color}"/>`;
  }
  list.forEach((c, i) => {
    const [x, y] = pt(i, R + 15);
    const cos = Math.cos(ang(i));
    const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
    const dy = Math.sin(ang(i)) > 0.6 ? 10 : Math.sin(ang(i)) < -0.6 ? -2 : 4;
    const on = S.cat.includes(c.key);
    s += `<g class="ax${on ? ' on' : ''}" data-cat="${c.key}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${escHTML(c.label)} ${vals[i]}건">
      <title>${escHTML(c.label)} — ${UNIT[S.tab]} ${vals[i]}</title>
      <text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${escHTML(c.short)}<tspan class="cnt" dx="3">${vals[i]}</tspan></text></g>`;
  });
  $('#radar').innerHTML = s + '</svg>';
  if (firstPaint) { $('#radar').classList.add('boot'); setTimeout(() => $('#radar').classList.remove('boot'), 1300); }
  $('#legend').innerHTML = `<span style="--c:${color}"><i></i>${UNIT[S.tab]} 수</span>`;
}

function renderTimeline(days) {
  const W = 280, H = 74, top = 6, base = 52, gap = 4;
  const bw = (W - gap * 13) / 14;
  const max = Math.max(1, ...days.map((d) => d.n));
  const t = today();
  const r = range();
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 14일 소식 수">`;
  days.forEach((d, i) => {
    const x = i * (bw + gap);
    const on = S.period === 'custom' && r && d.day >= r[0] && d.day <= r[1];
    s += `<g class="day${d.day === t ? ' today' : ''}${on ? ' on' : ''}" data-day="${d.day}" role="button" tabindex="0" aria-label="${md(d.day)} ${d.n}건">
      <title>${md(d.day)} — 소식 ${d.n}건</title><rect class="bg" x="${(x - 1).toFixed(1)}" y="0" width="${(bw + 2).toFixed(1)}" height="${H}" rx="4"/>`;
    const h = (d.n / max) * (base - top);
    s += h > 0 ? `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1.5" fill="var(--t-news)"/>`
      : `<rect x="${x.toFixed(1)}" y="${base - 1}" width="${bw.toFixed(1)}" height="1" fill="var(--line)"/>`;
    s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${+d.day.slice(8)}</text></g>`;
  });
  $('#timeline').innerHTML = s + '</svg>';
}

function renderResultBar(r) {
  if (isDetail()) {
    const v = VIEWS.find(([k]) => k === S.view);
    $('#result-bar').innerHTML = `<button type="button" class="back" data-back>← ${v ? v[1] : '목록'}로 돌아가기</button>
      <span class="bar-end">${CHAPTERS[S.open] ? `<button type="button" class="chip" data-print>A4 한 장 인쇄</button><button type="button" class="chip" data-print-all>보고서 전체 인쇄</button>` : ''}</span>`;
    return;
  }
  const pills = [];
  if (S.q.trim()) pills.push(`<button type="button" class="pill" data-clear="q">“${escHTML(S.q.trim())}” ${ICON_X}<span class="vh">검색어 지우기</span></button>`);
  for (const k of S.cat) {
    const c = RTOPIC[k] || (k === FALLBACK.key ? FALLBACK : null);
    if (c) pills.push(`<button type="button" class="pill" data-clear-cat="${k}">${escHTML(c.label)} ${ICON_X}<span class="vh">주제 해제</span></button>`);
  }
  if (S.tab === 'news' && S.rep && REP[S.rep]) pills.push(`<button type="button" class="pill" data-clear="rep">${escHTML(REP[S.rep].short)} 소식 ${ICON_X}<span class="vh">보고서 선택 해제</span></button>`);
  if (S.tab === 'news' && S.period === 'custom' && (S.from || S.to)) pills.push(`<button type="button" class="pill" data-clear="period">${S.from ? md(S.from) : '처음'} ~ ${S.to ? md(S.to) : '오늘'} ${ICON_X}</button>`);
  const dirty = pills.length || S.saved || S.newer || S.region !== 'all' || (S.tab === 'news' && S.period !== DEFAULT_PERIOD);
  let lead = '';
  let total = '';
  if (S.tab === 'report') {
    lead = segHTML('보기 방식', 'view', VIEWS, S.view) + segHTML('지역', 'region', REGIONS, S.region);
    const repIds = new Set(r.finds.map((it) => it.report.id));
    const nKr = [...repIds].filter((id) => REP[id].region === 'kr').length;
    total = S.view === 'cycle' ? `보고서 ${repIds.size}종 <small>해외 ${repIds.size - nKr} · 국내 ${nKr}</small>`
      : `보고서 ${r.counts.report}종 · 핵심 발견 ${r.finds.length.toLocaleString('ko-KR')}건`;
  } else if (S.tab === 'news') {
    lead = segHTML('지역', 'region', REGIONS, S.region);
    total = `소식 ${r.news.length.toLocaleString('ko-KR')}건`;
  } else if (S.tab === 'metric') total = `차트 ${r.charts.length}개`;
  else total = `쟁점 ${r.issues.length}개`;
  const tail = [];
  if (S.tab === 'news') tail.push(`<button type="button" class="chip" data-newer aria-pressed="${S.newer}">새 판 가능성만</button>`);
  if (S.tab === 'report' || S.tab === 'news') tail.push(`<button type="button" class="chip" data-saved aria-pressed="${S.saved}">저장한 항목 ${saved.size}</button>`);
  if (S.tab === 'metric' && r.charts.length) tail.push(`<button type="button" class="chip primary" data-mprint-all>지표 전체 인쇄 · A4 ${r.charts.length}장</button>`);
  $('#result-bar').innerHTML = `${lead}<span class="total">${total}</span>${pills.join('')}
    ${dirty ? '<button type="button" class="linkish" data-reset>필터 초기화</button>' : ''}<span class="bar-end">${tail.join('')}</span>`;
}

// ── 보고서 탭 ─────────────────────────────────────────────
function findingHTML(it, withReport) {
  const r = it.report;
  const badge = withReport ? `<button type="button" class="rbadge" data-goto="${escHTML(r.id)}">${escHTML(r.short || r.title)}</button>` : '';
  return `<li class="finding" data-id="${it.id}">
    <span class="fig${it.n ? '' : ' none'}">${it.n ? highlight(it.n, parsed) : ''}</span>
    <div class="fbody">${badge}<p>${highlight(it.title, parsed)}</p><div class="row-foot">${it.cats.map(tagBtn).join('')}</div></div>
    ${star(it.id)}</li>`;
}

// 참고 링크(한국어 요약 등): reports.json의 refs [{label, url}]
const refLinks = (r) => (r.refs || []).filter((x) => /^https?:\/\//.test(x.url)).map((x) => `<a class="sub-link" href="${escHTML(x.url)}" target="_blank" rel="noopener">${escHTML(x.label)}</a>`);
function reportHeadHTML(r, cnt) {
  const total = (r.findings || []).length;
  const links = [`<a class="sub-link" href="${escHTML(r.url)}" target="_blank" rel="noopener">${escHTML(r.urlLabel || '원문 페이지')}</a>`];
  if (r.pdf) links.push(`<a class="sub-link" href="${escHTML(r.pdf)}" target="_blank" rel="noopener">PDF</a>`);
  links.push(...refLinks(r));
  const nc = newsCount(r.id);
  if (nc) links.push(`<button type="button" class="goto" data-news="${escHTML(r.id)}">관련 소식 ${nc}건</button>`);
  if (CHAPTERS[r.id]) links.push(`<button type="button" class="goto" data-goto="${escHTML(r.id)}">챕터별 요약</button>`);
  const notes = [['조사 방법', r.method], ['읽을 때 주의할 점', r.limits], ['한국에 주는 시사점', r.korea]].filter(([, v]) => v);
  return `<header class="rhead">
    <div class="row-meta">${regionChip(r)}<span class="kind">${escHTML(r.kind || '보고서')}</span>${cycChip(r)}<span class="src">${highlight(r.org, parsed)}</span>
      <time>${escHTML(fmtRDate(r.date))}</time>${r.edition ? `<span>${escHTML(r.edition)}</span>` : ''}</div>
    <h3><button type="button" class="tlink" data-goto="${escHTML(r.id)}" lang="${/[가-힣]/.test(r.title) ? 'ko' : 'en'}">${highlight(r.title, parsed)}</button></h3>
    ${r.ko ? `<p class="rko">${highlight(r.ko, parsed)}</p>` : ''}
    <p class="sum full">${escHTML(r.about || '')}</p>
    <div class="row-foot">${r.scope ? `<span class="status-badge">${escHTML(r.scope)}</span>` : ''}${links.join('')}
      <span class="meta-txt">핵심 발견 ${cnt < total ? `${cnt}/${total}` : total}건</span>${r.next ? `<span class="meta-txt">다음 판 ${escHTML(r.next)}</span>` : ''}</div>
    ${notes.length ? `<dl class="rnotes">${notes.map(([k, v]) => `<div><dt>${k}</dt><dd>${escHTML(v)}</dd></div>`).join('')}</dl>` : ''}
  </header>`;
}

function upcoming(reps, n = 3) {
  const t = today();
  const y = +t.slice(0, 4), m = +t.slice(5, 7);
  const end = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  return reps.filter((r) => /^\d{4}-\d{2}$/.test(r.nextYM || '') && r.nextYM >= t.slice(0, 7) && r.nextYM < end)
    .sort((a, b) => a.nextYM.localeCompare(b.nextYM));
}
function topTopics(r, k = 4) {
  const c = {};
  for (const f of r.findings || []) for (const t of f.topics || []) c[t] = (c[t] || 0) + 1;
  const pos = (key) => RTOPICS.findIndex((x) => x.key === key);
  return Object.entries(c).sort((a, b) => b[1] - a[1] || pos(a[0]) - pos(b[0])).slice(0, k).map(([key]) => key);
}

function calendarHTML(reps) {
  const cur = +today().slice(5, 7);
  const chip = (r, minor) => `<button type="button" class="rc cy-${escHTML(r.cycle)}${minor ? ' minor' : ''}" data-goto="${escHTML(r.id)}"
      title="${escHTML(`${r.ko || r.title} — ${r.when || ''}`)}">${escHTML(r.short || r.title)}${minor ? `<small>${escHTML(r.minorLabel || '중간판')}</small>` : ''}</button>`;
  const lane = (label, rs, m, cls) => {
    const main = rs.filter((r) => (r.months || []).includes(m));
    const minor = rs.filter((r) => (r.minor || []).includes(m));
    return main.length || minor.length
      ? `<div class="lane ${cls}"><span class="lane-h">${label}</span>${main.map((r) => chip(r, false)).join('')}${minor.map((r) => chip(r, true)).join('')}</div>` : '';
  };
  const intl = reps.filter((r) => r.region !== 'kr');
  const kr = reps.filter((r) => r.region === 'kr');
  const cells = MONTHS.map((m) => `<li class="mcell${m === cur ? ' now' : ''}"${m === cur ? ' aria-current="date"' : ''}>
      <span class="mlabel">${m}월${m === cur ? '<em>이번 달</em>' : ''}</span>${lane('해외', intl, m, 'intl')}${lane('국내', kr, m, 'kr')}</li>`).join('');
  const soon = upcoming(reps);
  const soonHTML = soon.length ? `<p class="soon"><span class="soon-h">앞으로 3개월</span>${soon.map((r) =>
    `<button type="button" class="soon-i" data-goto="${escHTML(r.id)}"><b>${+r.nextYM.slice(5)}월</b>${escHTML(r.short || r.title)}</button>`).join('')}</p>` : '';
  const legend = RCYCLES.filter((c) => reps.some((r) => r.cycle === c.key))
    .map((c) => `<span><i class="rc cy-${escHTML(c.key)} sw" aria-hidden="true"></i>${escHTML(c.label)}</span>`).join('')
    + (reps.some((r) => r.minor && r.minor.length) ? '<span><i class="rc minor sw" aria-hidden="true"></i>중간판</span>' : '');
  return `<section class="cal sheet" aria-labelledby="cal-h">
    <h2 class="cal-h" id="cal-h">한 해 발간 달력<span class="sub">보통 나오는 달 기준 · 이름을 누르면 챕터별 요약</span></h2>
    ${soonHTML}<ol class="cal-grid">${cells}</ol><p class="cal-legend">${legend}</p></section>`;
}

function cycleRowHTML(r, cnt) {
  const total = (r.findings || []).length;
  const latest = [`최신판 ${escHTML(fmtRDate(r.date))}`, r.edition ? escHTML(r.edition) : '', r.since ? `${r.since}년부터` : ''].filter(Boolean).join(' · ');
  return `<article class="crow" id="c-${escHTML(r.id)}">
    <div class="cwhen"><b>${(r.months || []).join('·')}월</b></div>
    <div class="cbody">
      <div class="row-meta"><span class="kind">${escHTML(r.kind || '보고서')}</span><span class="src">${highlight(r.org, parsed)}</span></div>
      <h3><button type="button" class="tlink" data-goto="${escHTML(r.id)}">${highlight(r.ko || r.title, parsed)}</button></h3>
      <p class="cline">${latest}</p>
      <p class="cline">${escHTML(r.when || '')}<span class="nx">다음 판 ${escHTML(r.next || '미정')}</span></p>
      <div class="row-foot">${topTopics(r, 3).map(tagBtn).join('')}<button type="button" class="goto" data-goto="${escHTML(r.id)}">${CHAPTERS[r.id] ? `챕터 ${CHAPTERS[r.id].chapters.length}개 요약` : `핵심 ${cnt < total ? `${cnt}/${total}` : total}건`} 보기</button></div>
    </div></article>`;
}

// ── 보고서 상세(챕터별 한 장 요약 + 상세) ─────────────────────
const isDetail = () => S.tab === 'report' && !!S.open && !!REP[S.open];

function cycleOrder() {
  const out = [];
  for (const c of RCYCLES) {
    const rows = REPORTS.filter((r) => r.cycle === c.key).sort((a, b) => (a.region === 'kr') - (b.region === 'kr') || (a.months[0] || 13) - (b.months[0] || 13) || a._ord - b._ord);
    out.push(...rows);
  }
  return out;
}

function renderDetail(id) {
  const r = REP[id];
  const ch = CHAPTERS[id] || { chapters: [] };
  const list = ch.chapters || [];
  const total = (r.findings || []).length;
  const anchor = (i) => `ch-${escHTML(id)}-${i + 1}`;
  const keys = (ch.keys || []).slice(0, 4);
  const onepage = list.length ? `<section class="onepage sheet" aria-labelledby="op-h">
      <div class="op-head"><h2 id="op-h">한 장 요약</h2><span class="sub">${escHTML(ch.basis || '')} · 챕터 ${list.length}개</span>
        <button type="button" class="chip op-print" data-print>A4 한 장으로 인쇄</button></div>
      ${ch.lead ? `<p class="op-lead">${escHTML(ch.lead)}</p>` : ''}
      ${keys.length ? `<ul class="op-keys">${keys.map((k) => `<li><b>${escHTML(k.v)}</b><span>${escHTML(k.l)}</span></li>`).join('')}</ul>` : ''}
      ${ch.structure ? `<p class="op-struct">${escHTML(ch.structure)}</p>` : ''}
      <ol class="op-grid">${list.map((c, i) => `<li><a href="#${anchor(i)}" data-jump="${anchor(i)}">
        <span class="op-no">${i + 1}</span><span class="op-main"><span class="op-t">${escHTML(c.t)}</span>${c.n ? `<span class="op-n">${escHTML(c.n)}</span>` : ''}
        ${(c.b || []).length ? `<span class="op-b">${c.b.map((x) => `<span>${escHTML(x)}</span>`).join('')}</span>` : `<span class="op-s">${escHTML(c.s)}</span>`}</span></a></li>`).join('')}</ol>
      <p class="op-src">${escHTML(r.org)} · ${escHTML(r.title)} · ${escHTML(fmtRDate(r.date))} — AI Report Radar 정리(${escHTML(UPDATED)} 기준)</p>
    </section>` : '<p class="hint">이 보고서의 챕터 정리는 아직 없습니다.</p>';
  const hasMore = (c) => (c.more || []).length || c.fig || c.img;
  const moreCount = list.filter(hasMore).length;
  const chapters = list.map((c, i) => {
    const a = anchor(i);
    const more = c.more || [];
    const open = MORE_OPEN.has(a);
    const lab = [c.fig || c.img ? '그림' : '', more.length ? `상세 ${more.length}개` : ''].filter(Boolean).join(' · ');
    return `<section class="chap sheet" id="${a}" aria-labelledby="${a}-h">
      <header class="ch-head"><span class="ch-no">${i + 1}</span><div><h3 id="${a}-h">${escHTML(c.t)}</h3>${c.en ? `<p class="ch-en" lang="en">${escHTML(c.en)}</p>` : ''}</div>
        ${c.n ? `<span class="ch-n">${escHTML(c.n)}</span>` : ''}</header>
      <p class="ch-s">${escHTML(c.s)}</p>
      <ul class="ch-p">${(c.p || []).map((p) => `<li>${escHTML(p)}</li>`).join('')}</ul>
      ${c.k ? `<p class="ch-k"><span class="rg rg-kr">한국</span>${escHTML(c.k)}</p>` : ''}
      ${hasMore(c) ? `<div class="ch-more" id="${a}-more"${open ? '' : ' hidden'}>${chFigs(c, r)}
        ${more.length ? `<p class="ch-more-h">더 자세히</p><ul class="ch-p ch-x">${more.map((p) => `<li>${escHTML(p)}</li>`).join('')}</ul>` : ''}</div>
        <button type="button" class="more-btn" data-chmore="${a}" data-lab="${escHTML(lab)}" aria-expanded="${open}" aria-controls="${a}-more">${moreLabel(open, lab)}</button>` : ''}
    </section>`;
  }).join('');
  const allOpen = moreCount && list.every((c, i) => !hasMore(c) || MORE_OPEN.has(anchor(i)));
  const finds = ITEMS.filter((it) => it.type === 'rfind' && it.report.id === id).sort((a, b) => a._ord - b._ord);
  const order = cycleOrder();
  const at = order.findIndex((x) => x.id === id);
  const prev = order[at - 1], next = order[at + 1];
  const pager = `<nav class="dpager" aria-label="다른 보고서">${prev ? `<button type="button" class="goto" data-goto="${escHTML(prev.id)}">← ${escHTML(prev.short)}</button>` : '<span></span>'}
    ${next ? `<button type="button" class="goto" data-goto="${escHTML(next.id)}">${escHTML(next.short)} →</button>` : ''}</nav>`;
  const nc = newsCount(id);
  $('#list').innerHTML = `<article class="detail${r.region === 'kr' ? ' is-kr' : ''}">
    <header class="dhead sheet">
      <div class="row-meta">${regionChip(r)}<span class="kind">${escHTML(r.kind || '보고서')}</span>${cycChip(r)}<span class="src">${escHTML(r.org)}</span>
        <time>${escHTML(fmtRDate(r.date))}</time>${r.edition ? `<span>${escHTML(r.edition)}</span>` : ''}</div>
      <h2 lang="${/[가-힣]/.test(r.title) ? 'ko' : 'en'}">${escHTML(r.title)}</h2>
      ${r.ko ? `<p class="rko">${escHTML(r.ko)}</p>` : ''}
      <p class="sum full">${escHTML(r.about || '')}</p>
      <div class="row-foot">${r.scope ? `<span class="status-badge">${escHTML(r.scope)}</span>` : ''}
        <a class="sub-link" href="${escHTML(r.url)}" target="_blank" rel="noopener">${escHTML(r.urlLabel || '원문 페이지')}</a>
        ${r.pdf ? `<a class="sub-link" href="${escHTML(r.pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}
        ${refLinks(r).join('')}
        ${nc ? `<button type="button" class="goto" data-news="${escHTML(id)}">관련 소식 ${nc}건</button>` : ''}
        <span class="meta-txt">${escHTML(r.when || '')} · 다음 판 ${escHTML(r.next || '미정')}</span></div>
      ${[['조사 방법', r.method], ['읽을 때 주의할 점', r.limits], ['한국에 주는 시사점', r.korea]].some(([, v]) => v)
        ? `<dl class="rnotes">${[['조사 방법', r.method], ['읽을 때 주의할 점', r.limits], ['한국에 주는 시사점', r.korea]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${escHTML(v)}</dd></div>`).join('')}</dl>` : ''}
    </header>
    ${onepage}
    ${list.length ? `<section class="chapters" aria-label="챕터별 상세"><h2 class="stage-h">챕터별 상세<span class="sub">${list.length}개</span>
      <span class="ch-tools">${moreCount ? `<button type="button" class="chip" data-chmore-all aria-pressed="${!!allOpen}">${allOpen ? '모두 접기' : '더보기 모두 펼치기'}</button>` : ''}
      <button type="button" class="chip" data-print-all>보고서 전체 인쇄(A4)</button></span></h2>${chapters}</section>` : ''}
    <section class="stage dfind"><h2 class="stage-h">핵심 발견 모아 보기<span class="sub">${total}건</span></h2>
      <ul class="sheet findings${(r.findings || []).some((f) => f.n) ? '' : ' nofig'}">${finds.map((it) => findingHTML(it, false)).join('')}</ul></section>
    <p class="hint rnote">챕터 정리는 원문·공식 요약·신뢰할 만한 보도를 바탕으로 직접 요약했습니다(${escHTML(UPDATED)} 기준). 정확한 수치와 맥락은 원문에서 확인하세요.</p>
    ${pager}
  </article>`;
}

function renderReports(list) {
  if (isDetail()) { renderDetail(S.open); return; }
  if (!list.length) {
    $('#list').innerHTML = emptyHTML('조건에 맞는 보고서 내용이 없습니다', '검색어를 바꾸거나 주제·지역 선택을 풀어 보세요.');
    return;
  }
  const cnt = {};
  for (const it of list) cnt[it.report.id] = (cnt[it.report.id] || 0) + 1;
  const reps = REPORTS.filter((r) => cnt[r.id]);
  let html = '';
  if (S.view === 'cycle') {
    html = calendarHTML(reps);
    const both = S.region === 'all';
    for (const c of RCYCLES) {
      const rows = reps.filter((r) => r.cycle === c.key).sort((a, b) => (a.months[0] || 13) - (b.months[0] || 13) || a._ord - b._ord);
      if (!rows.length) continue;
      const col = (label, rs) => `<div class="ccol"><h3 class="ccol-h">${label}<span>${rs.length}종</span></h3>${rs.length
        ? `<div class="sheet">${rs.map((r) => cycleRowHTML(r, cnt[r.id])).join('')}</div>`
        : `<p class="ccol-empty">이 주기의 ${label} 보고서는 아직 없습니다.</p>`}</div>`;
      const intl = rows.filter((r) => r.region !== 'kr'), kr = rows.filter((r) => r.region === 'kr');
      html += `<section class="stage"><h2 class="stage-h">${escHTML(c.label)}<span class="sub">해외 ${intl.length} · 국내 ${kr.length}</span></h2>
        <p class="stage-d">${escHTML(c.desc || '')}</p>
        <div class="ccols${both ? '' : ' one'}">${both || S.region === 'intl' ? col('해외', intl) : ''}${both || S.region === 'kr' ? col('국내', kr) : ''}</div></section>`;
    }
    html += `<p class="hint rnote">발간 시기는 지난 판들의 발표일을 바탕으로 정리했고, '다음 판'은 예상입니다(${escHTML(UPDATED)} 기준).</p>`;
  } else if (S.view === 'topic') {
    for (const t of S.cat.length ? RTOPICS.filter((x) => S.cat.includes(x.key)) : RTOPICS) {
      const rows = list.filter((it) => it.cats.includes(t.key));
      if (!rows.length) continue;
      const nRep = new Set(rows.map((it) => it.report.id)).size;
      html += `<section class="stage"><h2 class="stage-h">${escHTML(t.label)}<span class="sub">보고서 ${nRep}종 · ${rows.length}건</span></h2>
        <ul class="sheet findings">${rows.map((it) => findingHTML(it, true)).join('')}</ul></section>`;
    }
  } else {
    for (const r of reps) {
      const rows = list.filter((it) => it.report.id === r.id);
      const nofig = !(r.findings || []).some((f) => f.n);
      html += `<section class="report sheet${nofig ? ' nofig' : ''}${r.region === 'kr' ? ' is-kr' : ''}" id="r-${escHTML(r.id)}">${reportHeadHTML(r, rows.length)}
        <ul class="findings">${rows.map((it) => findingHTML(it, false)).join('')}</ul></section>`;
    }
  }
  if (S.view !== 'cycle') html += `<p class="hint rnote">핵심 발견은 원문을 바탕으로 직접 요약했고, 조사 방법·주의할 점·시사점은 정리자의 분석입니다(${escHTML(UPDATED)} 기준). 정확한 수치와 맥락은 원문에서 확인하세요.</p>`;
  $('#list').innerHTML = html;
}

// ── 차트(지표 추적·쟁점 분석) ─────────────────────────────
const fmtNum = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const valTxt = (c, v) => (c.unit === '위' ? `${fmtNum(v)}위` : c.unit === '%' ? `${fmtNum(v)}%` : `${fmtNum(v)}${c.unit || ''}`);
const seriesColor = (c, i) => ((c.series || []).length > 1 ? `var(--s${i + 1})` : 'var(--t-rfind)');
const tipAttr = (val, label) => `data-tip="${escHTML(val)}" data-tip-sub="${escHTML(label)}"`;

function niceMax(v) {
  const steps = [5, 10, 20, 25, 50, 100];
  return steps.find((s) => s >= v) || Math.ceil(v / 50) * 50;
}

// 끝 값 표시 — 서로 겹치면 아래쪽 것을 빼고 범례·툴팁·표에 맡긴다.
function endLabels(labels) {
  const kept = [];
  for (const l of [...labels].sort((a, b) => a.y - b.y)) {
    if (kept.every((k) => Math.abs(k.y - l.y) >= 13 || Math.abs(k.x - l.x) >= 70)) kept.push(l);
  }
  return kept.map((l) => (l.above
    ? `<text class="endlab" x="${l.x.toFixed(1)}" y="${(l.y - 9).toFixed(1)}" text-anchor="middle">${escHTML(l.t)}</text>`
    : `<text class="endlab" x="${(l.x + 9).toFixed(1)}" y="${(l.y + 4).toFixed(1)}">${escHTML(l.t)}</text>`)).join('');
}

function lineSVG(c) {
  const W = c.W || 340, H = c.H || 176, L = 30, R = 46, T = 14, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const xs = c.x || [];
  const xAt = (i) => L + (xs.length > 1 ? (i * pw) / (xs.length - 1) : pw / 2);
  const all = c.series.flatMap((s) => s.values).filter((v) => v != null);
  let yAt, ticks;
  if (c.invert) {
    const top = 1, bot = Math.max(5, Math.ceil((Math.max(...all) + 1) / 5) * 5);
    yAt = (v) => T + ((v - top) / (bot - top)) * ph;
    ticks = [1, ...Array.from({ length: bot / 5 }, (_, i) => (i + 1) * 5)].filter((v, i, a) => a.indexOf(v) === i);
  } else {
    const lo = c.yMin ?? 0, hi = c.yMax ?? niceMax(Math.max(...all) * 1.1);
    yAt = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;
    const step = (hi - lo) / 4;
    ticks = Array.from({ length: 5 }, (_, i) => lo + i * step);
  }
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escHTML(c.title)}">`;
  for (const t of ticks) s += `<line class="grid" x1="${L}" x2="${W - R + 8}" y1="${yAt(t).toFixed(1)}" y2="${yAt(t).toFixed(1)}"/><text class="tick" x="${L - 6}" y="${(yAt(t) + 3.5).toFixed(1)}" text-anchor="end">${fmtNum(t)}</text>`;
  const step = Math.max(1, Math.ceil(xs.length / 6));
  xs.forEach((x, i) => { if (i % step === 0 || i === xs.length - 1) s += `<text class="tick" x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${escHTML(x)}</text>`; });
  const labels = [];
  const hits = [];
  c.series.forEach((ser, si) => {
    const col = seriesColor(c, si);
    let d = '', pen = false;
    ser.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`;
      pen = true;
    });
    if (d) s += `<path class="ln" d="${d}" style="stroke:${col}"/>`;
    let last = -1;
    ser.values.forEach((v, i) => {
      if (v == null) return;
      last = i;
      s += `<circle class="dot" cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="4" style="fill:${col}"/>`;
      hits.push(`<circle class="hit" cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="12" tabindex="0" ${tipAttr(valTxt(c, v), `${c.series.length > 1 ? `${ser.name} · ` : ''}${xs[i]}`)} aria-label="${escHTML(`${ser.name} ${xs[i]} ${valTxt(c, v)}`)}"/>`);
    });
    if (last >= 0) labels.push({ x: xAt(last), y: yAt(ser.values[last]), t: valTxt(c, ser.values[last]) });
    // 계열이 하나면 시작 값도 적는다(처음과 끝을 함께 읽게).
    const first = ser.values.findIndex((v) => v != null);
    if (c.series.length === 1 && first >= 0 && first !== last) {
      const v = ser.values[first];
      labels.push({ x: xAt(first), y: yAt(v), t: valTxt(c, v), above: true });
    }
  });
  return s + endLabels(labels) + hits.join('') + '</svg>';
}

const narrow = () => matchMedia('(max-width: 640px)').matches;
function timeSVG(c) {
  const W = c.W || (narrow() ? 360 : 680), H = c.H || (narrow() ? 250 : 280), L = 36, R = narrow() && !c.W ? 50 : 64, T = 16, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const x0 = c.xMin, x1 = c.xMax, lo = c.yMin ?? 0, hi = c.yMax ?? 100;
  const xAt = (x) => L + ((x - x0) / (x1 - x0)) * pw;
  const yAt = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;
  let s = `<svg class="chart wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escHTML(c.title)}">`;
  for (let v = lo; v <= hi; v += (hi - lo) / 4) s += `<line class="grid" x1="${L}" x2="${W - R + 8}" y1="${yAt(v).toFixed(1)}" y2="${yAt(v).toFixed(1)}"/><text class="tick" x="${L - 6}" y="${(yAt(v) + 3.5).toFixed(1)}" text-anchor="end">${fmtNum(v)}${c.unit === '%' ? '%' : ''}</text>`;
  for (let y = Math.ceil(x0); y <= x1; y++) s += `<line class="grid v" x1="${xAt(y).toFixed(1)}" x2="${xAt(y).toFixed(1)}" y1="${T}" y2="${T + ph}"/><text class="tick" x="${xAt(y).toFixed(1)}" y="${H - 9}" text-anchor="middle">${y}</text>`;
  const labels = [];
  const hits = [];
  c.series.forEach((ser, si) => {
    const col = `var(--s${si + 1})`;
    const pts = ser.points || [];
    if (pts.length > 1) s += `<path class="ln" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.x).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join('')}" style="stroke:${col}"/>`;
    for (const p of pts) {
      s += `<circle class="dot" cx="${xAt(p.x).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="4.5" style="fill:${col}"/>`;
      hits.push(`<circle class="hit" cx="${xAt(p.x).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="13" tabindex="0" ${tipAttr(valTxt(c, p.y), `${ser.name} · ${p.label} · ${ser.basis || ''}`)} aria-label="${escHTML(`${ser.name} ${p.label} ${valTxt(c, p.y)}`)}"/>`);
    }
    const lp = pts[pts.length - 1];
    if (lp) labels.push({ x: xAt(lp.x), y: yAt(lp.y), t: valTxt(c, lp.y) });
  });
  return s + endLabels(labels) + hits.join('') + '</svg>';
}

function barSVG(c) {
  const W = c.W || 340, rowH = 40, T = 6, L = 0, R = 46;
  const H = T + c.x.length * rowH + 4;
  const vals = c.series[0].values;
  const max = c.yMax ?? niceMax(Math.max(...vals));
  const pw = W - L - R;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escHTML(c.title)}">`;
  c.x.forEach((name, i) => {
    const y = T + i * rowH;
    const w = Math.max(2, (vals[i] / max) * pw);
    const h = 18;
    s += `<text class="tick lft" x="${L}" y="${y + 11}">${escHTML(name)}</text>`;
    s += `<path class="bar" d="M${L} ${y + 16}h${(w - 4).toFixed(1)}a4 4 0 0 1 4 4v${h - 8}a4 4 0 0 1 -4 4h-${(w - 4).toFixed(1)}z" style="fill:var(--t-rfind)"/>`;
    s += `<text class="endlab" x="${(L + w + 6).toFixed(1)}" y="${y + 29}">${valTxt(c, vals[i])}</text>`;
    s += `<rect class="hit" x="${L}" y="${y + 12}" width="${pw}" height="26" tabindex="0" ${tipAttr(valTxt(c, vals[i]), name)} aria-label="${escHTML(`${name} ${valTxt(c, vals[i])}`)}"/>`;
  });
  return s + '</svg>';
}

function tableHTML(c) {
  return `<details class="tview"><summary>표로 보기</summary><div class="tscroll">${tableCore(c)}</div></details>`;
}
function tableCore(c) {
  let head, body;
  if (c.type === 'time') {
    head = '<tr><th>조사</th><th>시점</th><th>값</th><th>기준</th></tr>';
    body = c.series.flatMap((ser) => (ser.points || []).map((p) => `<tr><td>${escHTML(ser.name)}</td><td>${escHTML(p.label)}</td><td class="num">${valTxt(c, p.y)}</td><td>${escHTML(ser.basis || '')}</td></tr>`)).join('');
  } else {
    head = `<tr><th></th>${c.x.map((x) => `<th>${escHTML(x)}</th>`).join('')}</tr>`;
    body = c.series.map((ser) => `<tr><td>${escHTML(ser.name)}</td>${ser.values.map((v) => `<td class="num">${v == null ? '–' : valTxt(c, v)}</td>`).join('')}</tr>`).join('');
  }
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function chartCardHTML(c, { wide = false } = {}) {
  const multi = c.series.length > 1;
  const svg = c.type === 'time' ? timeSVG(c) : c.type === 'bar' ? barSVG(c) : lineSVG(c);
  const legend = multi ? `<p class="lkeys">${c.series.map((ser, i) => `<span><i style="background:var(--s${i + 1})"></i>${escHTML(ser.name)}${ser.basis ? `<small>${escHTML(ser.basis)}</small>` : ''}</span>`).join('')}</p>` : '';
  const src = c.report ? repBtn(c.report, 'goto') : '';
  return `<figure class="mcard sheet${wide || c.type === 'time' ? ' wide' : ''}" id="m-${escHTML(c.id)}">
    <figcaption><h3>${highlight(c.title, parsed)}</h3>${src ? `<span class="msrc">${src}</span>` : ''}<button type="button" class="chip mprint" data-mprint="${escHTML(c.id)}" aria-label="${escHTML(c.title)} A4로 인쇄">A4 인쇄</button></figcaption>
    ${c.invert ? '<p class="mhint">위로 갈수록 높은 순위</p>' : ''}${svg}${legend}
    ${c.note ? `<p class="mnote">${escHTML(c.note)}</p>` : ''}${tableHTML(c)}</figure>`;
}

// ── 챕터 대표 그림: 보고서에 나온 수치로 다시 그린다(원문 그림을 복제하지 않음) ──
const figNum = (f, v) => `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${f.unit || ''}`;
function figHTML(f, r) {
  if (!f) return '';
  let body = '', key = '';
  if (f.type === 'line') {
    body = lineSVG({ title: f.title, x: f.x, series: f.series, unit: f.unit, yMin: f.yMin ?? 0 });
    if (f.series.length > 1) key = `<p class="fg-key">${f.series.map((x, i) => `<span><i style="background:var(--s${i + 1})"></i>${escHTML(x.name)}</span>`).join('')}</p>`;
  } else {
    const two = f.type === 'bar2';
    const max = Math.max(...f.items.flatMap((it) => it.slice(1).filter((v) => v != null)));
    const bar = (v, k) => (v == null ? '' : `<span class="fg-bar${k ? ' b2' : ''}" style="--w:${(v / max).toFixed(4)}"><i></i><b>${escHTML(figNum(f, v))}</b></span>`);
    body = `<div class="fg-rows${two ? ' two' : ''}" role="list">${f.items.map(([l, a, b]) => `<div class="fg-row${(f.hl || []).includes(l) ? ' hl' : ''}" role="listitem"><span class="fg-l">${escHTML(l)}</span><span class="fg-v">${bar(a, 0)}${two ? bar(b, 1) : ''}</span></div>`).join('')}</div>`;
    if (two) key = `<p class="fg-key"><span><i></i>${escHTML(f.series[0])}</span><span><i class="b2"></i>${escHTML(f.series[1])}</span></p>`;
  }
  const src = `${f.note ? `${f.note} · ` : ''}자료: ${r.org}, ${r.short || r.title} — 보고서 수치로 다시 그림`;
  return `<figure class="fig"><figcaption>${escHTML(f.title)}</figcaption>${key}${body}<p class="fg-src">${escHTML(src)}</p></figure>`;
}
// 직접 캡처해 넣은 그림(chapters.json의 img). 라이선스를 확인한 경우에만 넣는다.
function imgHTML(m) {
  return `<figure class="fig img"><img src="${escHTML(m.src)}" alt="${escHTML(m.alt || m.cap || '')}" loading="lazy">${m.cap ? `<figcaption>${escHTML(m.cap)}</figcaption>` : ''}${m.credit ? `<p class="fg-src">${escHTML(m.credit)}</p>` : ''}</figure>`;
}
const chFigs = (c, r) => `${c.fig ? figHTML(c.fig, r) : ''}${c.img ? imgHTML(c.img) : ''}`;

function renderMetrics(list) {
  if (!list.length) { $('#list').innerHTML = emptyHTML('조건에 맞는 지표가 없습니다', '검색어를 바꾸거나 주제 선택을 풀어 보세요.'); return; }
  const ids = new Set(list.map((c) => c.id));
  let html = '';
  for (const g of MGROUPS) {
    const cs = g.charts.filter((id) => ids.has(id)).map((id) => CHARTS[id]);
    if (!cs.length) continue;
    html += `<section class="stage"><h2 class="stage-h">${escHTML(g.label)}<span class="sub">${cs.length}개</span></h2>
      <p class="stage-d">${escHTML(g.desc || '')}</p><div class="mgrid">${cs.map((c) => chartCardHTML(c)).join('')}</div></section>`;
  }
  html += `<p class="hint rnote">각 수치는 보고서 원문·공식 발표에서 옮겼습니다. 계산으로 채운 값은 차트 아래에 밝혔습니다(${escHTML(UPDATED)} 기준).</p>`;
  $('#list').innerHTML = html;
}

// ── 지표 A4 한 장: 그림 + 이 지표는·읽는 법·핵심·한국·표 ──────────
const MMPX = 96 / 25.4;             // 1mm의 화면 픽셀
const mSVG = (c) => { const big = { ...c, W: 600, H: 330 }; return c.type === 'time' ? timeSVG(big) : c.type === 'bar' ? barSVG(big) : lineSVG(big); };
function metricHTML(c) {
  const g = MGROUPS.find((x) => x.charts.includes(c.id));
  const pr = c.print || {};
  const reps = [...new Set([c.report, ...(c.series || []).map((x) => x.report)].filter((x) => x && REP[x]))];
  const legend = c.series.length > 1 ? `<p class="fg-key">${c.series.map((x, i) => `<span><i style="background:var(--s${i + 1})"></i>${escHTML(x.name)}${x.basis ? ` <small>${escHTML(x.basis)}</small>` : ''}</span>`).join('')}</p>` : '';
  const list = (h, arr) => (arr && arr.length ? `<section><h2 class="a4-h">${h}</h2><ul class="a4-p">${arr.map((t) => `<li>${escHTML(t)}</li>`).join('')}</ul></section>` : '');
  return `<div class="a4-in a4-metric">
    <p class="a4-run"><span>AI Report Radar · 지표 추적${g ? ` · ${escHTML(g.label)}` : ''}</span><span>${escHTML(UPDATED)} 기준</span></p>
    <header class="a4-mhead"><h1>${escHTML(c.title)}</h1>
      <p class="a4-meta">${reps.map((id) => `<span>${escHTML(REP[id].org)} · ${escHTML(REP[id].short)} (${escHTML(fmtRDate(REP[id].date))})</span>`).join('')}</p></header>
    ${pr.desc ? `<p class="a4-lead">${escHTML(pr.desc)}</p>` : ''}
    <div class="a4-chartbox">${c.invert ? '<p class="a4-hint">위로 갈수록 높은 순위</p>' : ''}${legend}<div class="a4-chart">${mSVG(c)}</div></div>
    <div class="a4-two">${list('읽는 법', pr.read)}${list('핵심', pr.points)}</div>
    ${pr.korea ? `<p class="a4-k2"><b>한국</b>${escHTML(pr.korea)}</p>` : ''}
    <div class="a4-tbl">${tableCore(c)}</div>
    <p class="a4-src">${c.note ? `${escHTML(c.note)} · ` : ''}출처: ${reps.map((id) => `${escHTML(REP[id].org)}, ${escHTML(REP[id].title)} (${escHTML(REP[id].url)})`).join(' / ')} · AI Report Radar 정리</p>
  </div>`;
}
// 글자는 그림 자리(72mm 이상)를 남기는 가장 큰 크기로, 남는 자리는 그림이 모두 차지한다
function metricBuild(sheet, c) {
  sheet.innerHTML = metricHTML(c);
  const inner = sheet.firstElementChild, box = inner.querySelector('.a4-chart');
  const room = inner.clientHeight, want = 72 * MMPX;
  const ok = (pt) => { sheet.style.setProperty('--fs', `${pt}pt`); return inner.scrollHeight <= room + 0.5 && box.clientHeight >= want; };
  let lo = 8.5, hi = 12.5;
  if (ok(hi)) return hi;
  if (!ok(lo)) { sheet.style.setProperty('--fs', `${lo}pt`); return lo; }
  while (hi - lo > 0.1) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  const pt = Math.floor(lo * 10) / 10;
  sheet.style.setProperty('--fs', `${pt}pt`);
  return pt;
}
function a4Metric(id, from) {
  const c = CHARTS[id];
  if (!c) return;
  const m = a4Modal();
  m.hidden = false;
  a4Id = `@${id}`;
  document.body.classList.add('a4-open');
  const pt = metricBuild(a4Pages(1)[0], c);
  $('#a4-title').textContent = '지표 A4 미리보기';
  $('#a4-info').textContent = `글자 크기 ${pt.toFixed(1)}pt · 남는 자리는 그림을 키워 채움`;
  m.querySelector('.a4-stage').scrollTop = 0;
  a4Scale();
  a4Prev = from || null;
  m.querySelector('[data-a4-print]').focus();
}

// 지표 전체: 지금 보이는(검색·주제 필터 반영) 지표를 화면 순서대로 A4 한 장씩
function a4MetricsAll(from) {
  const shown = new Set(compute().charts.map((c) => c.id));
  const ids = MGROUPS.flatMap((g) => g.charts).filter((id) => shown.has(id) && CHARTS[id]);
  if (!ids.length) return;
  const m = a4Modal();
  m.hidden = false;
  a4Id = '@all';
  document.body.classList.add('a4-open');
  const sheets = a4Pages(ids.length);
  const pts = ids.map((id, i) => metricBuild(sheets[i], CHARTS[id]));
  sheets.forEach((sh, i) => { const run = sh.querySelector('.a4-run span:last-child'); if (run) run.textContent = `${UPDATED} 기준 · ${i + 1} / ${ids.length}`; });
  $('#a4-title').textContent = '지표 전체 인쇄 미리보기';
  $('#a4-info').textContent = `A4 ${ids.length}장 — 지표마다 한 장 · 글자 ${Math.min(...pts).toFixed(1)}~${Math.max(...pts).toFixed(1)}pt`;
  m.querySelector('.a4-stage').scrollTop = 0;
  a4Scale();
  a4Prev = from || null;
  m.querySelector('[data-a4-print]').focus();
}

// ── 최근 주요 소식(맨 위) ───────────────────────────────────
// 최근 2주(부족하면 45일) 소식 가운데 새 판 신호·여러 매체 보도·한국 관련·여러 보고서 연결·최신일수록 점수를 높게 준다
function hotNews() {
  const news = ITEMS.filter((it) => it.type === 'news');
  if (!news.length) return [];
  const t = today();
  const day = (it) => String(it.date || '').slice(0, 10);
  let pool = news.filter((it) => day(it) >= addDays(t, -14));
  if (pool.length < 3) pool = news.filter((it) => day(it) >= addDays(t, -45));
  if (pool.length < 3) pool = news;
  const score = (it) => ((it.newer || []).length ? 3 : 0) + Math.min((it.also || []).length, 3) + (it.cats.includes('korea') ? 1 : 0)
    + ((it.reps || []).length > 1 ? 1 : 0) + Math.max(0, 2 - (toMs(t) - toMs(day(it))) / (7 * 86400000));
  return pool.map((it) => [score(it), it]).sort((a, b) => b[0] - a[0] || (day(b[1]) > day(a[1]) ? 1 : -1))
    .slice(0, 5).map((x) => x[1]).sort((a, b) => (day(a) < day(b) ? 1 : -1));
}
function renderHot() {
  const el = $('#hot');
  if (!el) return;
  const list = hotNews();
  el.hidden = !list.length;
  if (!list.length) return;
  el.innerHTML = `<div class="hot-h"><h2>최근 주요 소식</h2><span class="sub">보고서 관련 기사 가운데 새 판 소식, 여러 매체가 다룬 기사, 한국 관련 기사를 앞에 둡니다</span>
      ${S.tab !== 'news' ? '<button type="button" class="chip" data-tab="news">새 소식 전체 보기</button>' : ''}</div>
    <ol class="hot-list">${list.map((it) => {
      const d = String(it.date || '').slice(0, 10);
      return `<li class="hot-i"><p class="hot-m"><time datetime="${escHTML(d)}">${escHTML(md(d))}</time><span>${escHTML(it.source || '')}</span>${(it.newer || []).length ? '<span class="newer">새 판 가능성</span>' : ''}</p>
        <a class="hot-t" href="${escHTML(it.url)}" target="_blank" rel="noopener" lang="${it.lang === 'en' ? 'en' : 'ko'}">${escHTML(it.title)}</a>
        <p class="hot-r">${(it.reps || []).slice(0, 2).map((id) => repBtn(id)).join('')}${(it.also || []).length ? `<span class="hot-also">외 ${it.also.length}곳 보도</span>` : ''}</p></li>`;
    }).join('')}</ol>`;
}

// ── 쟁점 분석 탭 ──────────────────────────────────────────
function issueHTML(it) {
  const rows = (it.rows || []).map((r) => {
    const rep = REP[r.r];
    return `<tr><th scope="row">${rep ? `${regionChip(rep)}${repBtn(r.r)}` : ''}</th><td class="ifig">${r.n ? highlight(r.n, parsed) : '–'}</td>
      <td class="ibasis">${highlight(r.basis || '', parsed)}</td><td>${highlight(r.t, parsed)}</td></tr>`;
  }).join('');
  const chart = it.chart && CHARTS[it.chart] ? chartCardHTML(CHARTS[it.chart], { wide: true }) : '';
  return `<article class="issue sheet" id="i-${escHTML(it.id)}">
    <header class="ihead"><div class="row-foot">${(it.topics || []).map(tagBtn).join('')}</div>
      <h2>${highlight(it.q, parsed)}</h2><p class="ilead">${highlight(it.short, parsed)}</p></header>
    <div class="ibody">
      <table class="icmp"><thead><tr><th>보고서</th><th>숫자</th><th>무엇을 쟀나</th><th>내용</th></tr></thead><tbody>${rows}</tbody></table>
      ${chart}
      <section class="iblock"><h3>숫자가 다른 이유</h3><ul>${(it.why || []).map((w) => `<li>${highlight(w, parsed)}</li>`).join('')}</ul></section>
      <div class="itwo">
        <section class="iblock verdict"><h3>종합 판단</h3><p>${highlight(it.verdict, parsed)}</p></section>
        <section class="iblock"><h3>한국에 주는 시사점</h3><p>${highlight(it.korea, parsed)}</p></section>
      </div>
    </div></article>`;
}

function renderIssues(list) {
  if (!list.length) { $('#list').innerHTML = emptyHTML('조건에 맞는 쟁점이 없습니다', '검색어를 바꾸거나 주제 선택을 풀어 보세요.'); return; }
  $('#list').innerHTML = `<nav class="itoc" aria-label="쟁점 목록">${list.map((it) => `<a href="#i-${escHTML(it.id)}" data-jump="i-${escHTML(it.id)}">${escHTML(it.q)}</a>`).join('')}</nav>`
    + list.map(issueHTML).join('')
    + `<p class="hint rnote">표의 숫자는 각 보고서에서 옮겼고, '숫자가 다른 이유'·'종합 판단'·'시사점'은 정리자의 분석입니다(${escHTML(UPDATED)} 기준).</p>`;
}

// ── 새 소식 탭 ────────────────────────────────────────────
function newsRowHTML(it) {
  const foot = [];
  for (const id of it.newer || []) if (REP[id]) foot.push(`<span class="newer">새 판 가능성 · ${escHTML(REP[id].short)}</span>`);
  foot.push(...it.reps.map((id) => repBtn(id)));
  foot.push(...it.cats.map(tagBtn));
  if (it.also && it.also.length) {
    foot.push(`<details class="also"><summary>같은 소식 ${it.also.length}곳</summary><ul>${it.also.map((a) =>
      `<li><a href="${escHTML(a.url)}" target="_blank" rel="noopener">${escHTML(a.source || '다른 매체')}</a></li>`).join('')}</ul></details>`);
  }
  const isNew = prevVisit && it._added > prevVisit;
  return `<article class="row" data-type="news" data-id="${it.id}">
    <div class="row-meta"><span class="kind">소식</span><span class="src">${escHTML(it.source || '')}</span>
      <time datetime="${escHTML(it.date)}">${when(it)}</time>${isNew ? '<span class="fresh">새 항목</span>' : ''}${star(it.id)}</div>
    <h3><a href="${escHTML(it.url)}" target="_blank" rel="noopener" lang="${it.lang === 'en' ? 'en' : 'ko'}">${highlight(it.title, parsed)}</a></h3>
    ${it.summary ? `<p class="sum">${highlight(it.summary, parsed)}</p>` : ''}
    <div class="row-foot">${foot.join('')}</div></article>`;
}

function renderNews(list) {
  const el = $('#list');
  if (!ITEMS.some((i) => i.type === 'news')) {
    el.innerHTML = `<div class="empty"><h3>아직 모은 소식이 없습니다</h3>
      <p>GitHub 저장소의 Actions 탭에서 수집 워크플로를 한 번 실행하면 몇 분 뒤 채워집니다. 보고서 이름이 들어간 기사만 모읍니다.</p>
      <p>로컬에서는 <code>python -m collector</code> 실행 후 <code>python -m http.server</code> 로 엽니다.</p></div>`;
    $('#more').innerHTML = '';
    return;
  }
  if (!list.length) {
    const wait = archive === 'loading' && needsArchive();
    el.innerHTML = wait ? emptyHTML('이전 기록을 불러오는 중입니다', '잠시 후 결과가 나타납니다.', false)
      : emptyHTML('조건에 맞는 소식이 없습니다', '기간을 넓히거나 주제·지역 선택을 풀어 보세요.');
    $('#more').innerHTML = '';
    return;
  }
  const page = list.slice(0, shown);
  let html = '';
  if (S.sort === 'latest') {
    let cur = null, buf = [];
    const flush = () => {
      if (!cur) return;
      const [a, b] = dayTitle(cur);
      html += `<h2 class="day-h">${a}<span class="sub">${b ? b + ' ' : ''}${list.filter((x) => x._day === cur).length}건</span></h2><div class="sheet">${buf.join('')}</div>`;
    };
    for (const it of page) {
      if (it._day !== cur) { flush(); cur = it._day; buf = []; }
      buf.push(newsRowHTML(it));
    }
    flush();
  } else html = `<div class="sheet">${page.map(newsRowHTML).join('')}</div>`;
  el.innerHTML = html;
  const left = list.length - page.length;
  $('#more').innerHTML = left > 0
    ? `<button type="button" data-more>${Math.min(PAGE, left)}건 더 보기 <span style="color:var(--ink-3)">(남은 ${left.toLocaleString('ko-KR')}건)</span></button>`
    : (archive === 'loading' && needsArchive() ? '이전 기록을 불러오는 중…' : '');
  observeMore();
}

function renderMeta() {
  const g = Date.parse(META.generated || '');
  $('#updated').textContent = g ? `소식 ${md(dayOf(g))} ${fmtTime.format(g)} 갱신` : '';
  const note = $('#notice');
  if (META.demo) { note.hidden = false; note.textContent = '샘플 데이터로 만든 미리보기입니다. 새 소식 탭의 기사는 실제 기사가 아니며 링크는 example.com 으로 연결됩니다. 보고서·지표·쟁점 탭은 실제 자료입니다.'; }
  const rows = (META.sources || []).map((s) => {
    const t = Date.parse(s.at || '');
    return `<tr><td>${escHTML(s.name)}</td><td class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '정상' : '실패'}</td><td>${s.ok ? `${s.count}건` : escHTML(s.error || '')}</td>
      <td>${t ? `${md(dayOf(t))} ${fmtTime.format(t)}` : ''}</td></tr>`;
  }).join('');
  const c = META.counts || {};
  $('#status-list').innerHTML = (META.sources || []).length
    ? `<p>누적 소식 ${(c.news || 0).toLocaleString('ko-KR')}건 · 새 판 가능성 ${META.newer || 0}건.</p>
       <table><thead><tr><th>소스</th><th>상태</th><th>결과</th><th>마지막 시도</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p>수집 기록이 없습니다.</p>';
}

function render({ keepPage = false } = {}) {
  if (!keepPage) shown = PAGE;
  if (a4Id && (a4Id.startsWith('@') ? S.tab !== 'metric' : (!isDetail() || S.open !== a4Id))) a4Close();
  renderHot();
  const r = compute();
  renderTabs(r.counts);
  renderPeriods();
  renderCats(r.catCount);
  renderRadar(r.catCount);
  if (S.tab === 'news') renderTimeline(r.days);
  renderResultBar(r);
  if (S.tab !== 'news') $('#more').innerHTML = '';
  if (S.tab === 'report') renderReports(r.finds);
  else if (S.tab === 'metric') renderMetrics(r.charts);
  else if (S.tab === 'issue') renderIssues(r.issues);
  else renderNews(r.news);
  document.body.dataset.page = S.tab;
  firstPaint = false;
  writeHash();
  if (needsArchive() && archive === 'idle') loadArchive();
}

// ── 더 보기(스크롤 시 자동) ───────────────────────────────
let io;
function observeMore() {
  if (!('IntersectionObserver' in window)) return;
  io ||= new IntersectionObserver((ents) => {
    if (ents.some((e) => e.isIntersecting) && $('#more [data-more]')) { shown += PAGE; render({ keepPage: true }); }
  }, { rootMargin: '600px 0px' });
  io.disconnect();
  const b = $('#more [data-more]');
  if (b) io.observe(b);
}

async function loadArchive() {
  if (archive !== 'idle' || window.__ARR_DATA__) return;
  archive = 'loading';
  try {
    const doc = await getJSON(`data/items-archive.json?v=${encodeURIComponent(META.generated || '')}`);
    ingest(doc.items);
    archive = 'done';
  } catch { archive = 'error'; }
  render({ keepPage: true });
}

// ── 이동 ──────────────────────────────────────────────────
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function scrollToEl(el) {
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
  const a = el.querySelector('h2, h3 a, h3');
  if (a) { if (!a.matches('a')) a.tabIndex = -1; a.focus({ preventScroll: true }); }
}
function goToReport(id) {
  if (!REP[id]) return;
  Object.assign(S, { tab: 'report', open: id });
  render();
  window.scrollTo({ top: 0 });
  const h = $('.dhead h2');
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function closeReport() {
  const id = S.open;
  S.open = '';
  render();
  const el = document.getElementById(`c-${id}`) || document.getElementById(`r-${id}`);
  if (el) { el.scrollIntoView({ block: 'center' }); const b = el.querySelector('[data-goto]'); if (b) b.focus({ preventScroll: true }); }
}
// ── 챕터 상세 '더보기' ────────────────────────────────────
const MORE_OPEN = new Set();        // 펼친 챕터 앵커(다시 그려도 유지)
const moreLabel = (open, lab) => (open ? '접기' : `더보기${lab ? ` <span class="n">${escHTML(lab)}</span>` : ''}`);
function setMore(btn, open) {
  const a = btn.dataset.chmore;
  const box = document.getElementById(`${a}-more`);
  if (!box) return;
  box.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  btn.innerHTML = moreLabel(open, btn.dataset.lab || '');
  if (open) MORE_OPEN.add(a); else MORE_OPEN.delete(a);
}
function syncAllMore() {
  const all = $('[data-chmore-all]');
  if (!all) return;
  const on = $$('[data-chmore]').every((b) => b.getAttribute('aria-expanded') === 'true');
  all.setAttribute('aria-pressed', String(on));
  all.textContent = on ? '모두 접기' : '더보기 모두 펼치기';
}

// ── A4 한 장 요약(미리보기·인쇄) ─────────────────────────
// 시트는 210×297mm 고정. 내용 단계(L)와 글자 크기(pt)를 바꿔 가며 한 장에 꽉 차는 조합을 찾는다.
//   L0: 요약 줄(b) · L1: + 한국 관련(k) · L2~: + 더보기 상세(more)를 챕터마다 한 줄씩 · 마지막: + 조사 방법
const A4 = { min: 7.2, max: 13.5, read: 9 };
// 요약 줄(b)의 수치만 되풀이하는 상세 줄은 종이에서 뺀다(화면 '더보기'에는 그대로 둔다)
const nums = (t) => new Set(String(t).match(/\d[\d,.]*\d|\d/g) || []);
const A4MORE = new WeakMap();
function a4More(c) {
  if (A4MORE.has(c)) return A4MORE.get(c);
  const bn = new Set((c.b || []).flatMap((t) => [...nums(t)]));
  const out = (c.more || []).filter((t) => { const n = [...nums(t)]; return !n.length || n.some((x) => !bn.has(x)); });
  A4MORE.set(c, out);
  return out;
}
const a4MaxMore = (list) => Math.max(0, ...list.map((c) => a4More(c).length));
const a4Levels = (list) => 2 + a4MaxMore(list);
function a4HTML(r, ch, L) {
  const list = ch.chapters || [];
  const keys = (ch.keys || []).slice(0, 4);
  const meta = [r.org, fmtRDate(r.date), r.edition, RCYC[r.cycle] ? `${RCYC[r.cycle].label} 발간` : ''].filter(Boolean);
  const cards = list.map((c, i) => {
    const b = (c.b && c.b.length ? c.b : [c.s]);
    const x = L >= 2 ? a4More(c).slice(0, L - 1) : [];
    return `<li class="a4-c"><div class="a4-ct"><span class="a4-no">${i + 1}</span><strong>${escHTML(c.t)}</strong>${c.n ? `<em>${escHTML(c.n)}</em>` : ''}</div>
      <ul class="a4-b">${b.map((t) => `<li>${escHTML(t)}</li>`).join('')}</ul>
      ${L >= 1 && c.k ? `<p class="a4-k"><b>한국</b>${escHTML(c.k)}</p>` : ''}
      ${x.length ? `<ul class="a4-x">${x.map((t) => `<li>${escHTML(t)}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
  const notes = [L >= a4Levels(list) ? ['조사 방법', r.method] : null, ['한국에 주는 시사점', r.korea], ['읽을 때 주의할 점', r.limits]].filter((x) => x && x[1]);
  return `<div class="a4-in">
    <header class="a4-head">
      <p class="a4-meta"><span class="a4-rg${r.region === 'kr' ? ' kr' : ''}">${r.region === 'kr' ? '국내' : '해외'}</span>${meta.map((m) => `<span>${escHTML(m)}</span>`).join('')}</p>
      <h1 lang="${/[가-힣]/.test(r.title) ? 'ko' : 'en'}">${escHTML(r.title)}</h1>
      ${r.ko ? `<p class="a4-ko">${escHTML(r.ko)}</p>` : ''}
    </header>
    ${ch.lead ? `<p class="a4-lead">${escHTML(ch.lead)}</p>` : ''}
    ${keys.length ? `<ul class="a4-keys">${keys.map((k) => `<li><b>${escHTML(k.v)}</b><span>${escHTML(k.l)}</span></li>`).join('')}</ul>` : ''}
    <ol class="a4-grid">${cards}</ol>
    ${notes.length ? `<div class="a4-notes" style="--cols:${notes.length}">${notes.map(([h, v]) => `<section><h2>${h}</h2><p>${escHTML(v)}</p></section>`).join('')}</div>` : ''}
    <p class="a4-src">출처 ${escHTML(r.org)}, ${escHTML(r.title)} (${escHTML(fmtRDate(r.date))}) · ${escHTML(r.url)} · 다음 판 ${escHTML(r.next || '미정')} · AI Report Radar 정리(${escHTML(UPDATED)} 기준), 정확한 수치는 원문 확인</p>
  </div>`;
}
// 시트 안 내용이 한 장(297mm − 여백)에 들어가는 가장 큰 글자 크기. 안 들어가면 null.
function a4Fit(sheet, r, ch, L) {
  sheet.innerHTML = a4HTML(r, ch, L);
  const inner = sheet.firstElementChild;
  const room = inner.clientHeight;          // 고정 높이(CSS)
  const fits = (pt) => { sheet.style.setProperty('--fs', `${pt}pt`); return inner.scrollHeight <= room + 0.5; };
  if (!fits(A4.min)) return null;
  if (fits(A4.max)) return A4.max;
  let lo = A4.min, hi = A4.max;
  while (hi - lo > 0.08) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
  return Math.floor(lo * 20) / 20;
}
function a4Build(sheet, id) {
  const r = REP[id], ch = CHAPTERS[id];
  if (!r || !ch) return null;
  const modal = sheet.closest('.a4-modal');
  const hidden = modal && modal.hidden;
  if (hidden) { modal.hidden = false; modal.style.visibility = 'hidden'; }   // 재려면 화면에 배치돼 있어야 한다
  sheet.classList.add('measuring');           // 잴 때는 칸 늘리기를 끈다(내용 본래 높이)
  const tried = [];
  const maxL = a4Levels(ch.chapters || []);
  for (let L = 0; L <= maxL; L++) {
    const pt = a4Fit(sheet, r, ch, L);
    if (pt == null) break;
    tried.push({ L, pt });
    if (pt < A4.read) break;                // 더 넣으면 글자가 너무 작아진다
  }
  // 읽을 만한 크기(9pt 이상) 가운데 내용이 가장 많은 단계. 최대 크기로도 남는 자리는 칸을 늘려 채운다(CSS).
  const pick = tried.filter((t) => t.pt >= A4.read).pop() || tried[0] || { L: 0, pt: A4.min };
  sheet.innerHTML = a4HTML(r, ch, pick.L);
  sheet.style.setProperty('--fs', `${pick.pt}pt`);
  sheet.classList.remove('measuring');
  if (hidden) { modal.hidden = true; modal.style.visibility = ''; }
  return pick;
}
let a4Prev = null;                  // 미리보기를 연 버튼(닫을 때 포커스 복귀)
let a4Id = '';                      // 미리보기에 띄운 보고서
// 보고서 전체: 챕터를 이어 쓴다. 한 챕터가 한 장을 다 못 채우면 다음 챕터가 같은 장에 이어지고,
// 넘치면 다음 장으로 넘어간다(제목은 다음 덩어리와 붙여서, 목록은 항목 단위로 나눈다).
const FLOW = { min: 9.5, max: 11.5, step: 0.25 };
function chBlocks(r, ch) {
  const out = [];                    // { i: 챕터 번호, kind: head|fig|text, html }
  (ch.chapters || []).forEach((c, i) => {
    out.push({ i, kind: 'head', html: `<section class="a4-cs"><header class="a4-chead"><span class="a4-cno">${i + 1}</span><div><h1>${escHTML(c.t)}</h1>${c.en ? `<p class="a4-en" lang="en">${escHTML(c.en)}</p>` : ''}</div>${c.n ? `<em>${escHTML(c.n)}</em>` : ''}</header>
      <p class="a4-lead">${escHTML(c.s)}</p></section>` });
    if (c.fig || c.img) out.push({ i, kind: 'fig', html: `<div class="a4-blk"><div class="a4-fig">${chFigs(c, r)}</div></div>` });
    const sec = (h, list, cls) => list.forEach((t, j) => out.push({ i, kind: 'text', html: `<div class="a4-blk">${j ? '' : `<h2 class="a4-h">${h}</h2>`}<ul class="a4-p${cls}"><li>${escHTML(t)}</li></ul></div>` }));
    sec('핵심 정리', c.p || [], '');
    sec('더 자세히', c.more || [], ' a4-pm');
    if (c.k) out.push({ i, kind: 'text', html: `<div class="a4-blk"><p class="a4-k2"><b>한국</b>${escHTML(c.k)}</p></div>` });
  });
  return out;
}
function flowPage(r) {
  const box = $('#a4-modal .a4-pages');
  const f = document.createElement('div');
  f.className = 'a4-frame';
  f.innerHTML = `<div class="a4-sheet" style="--fs:${FLOW.cur}pt"><div class="a4-in a4-flow">
    <p class="a4-run"><span>${r.region === 'kr' ? '국내' : '해외'} · ${escHTML(r.org)} · ${escHTML(r.short || r.title)}</span><span class="a4-chs">&nbsp;</span></p>
    <div class="a4-body"></div><p class="a4-pno">&nbsp;</p></div></div>`;
  box.append(f);
  return f.querySelector('.a4-body');
}
// 덩어리를 차례로 붙이다 넘치면 다음 장으로. 그림은 자리가 없으면 뒤 글을 먼저 채우고 다음 장 맨 위로 미룬다.
// 챕터 제목은 바로 뒤 글 한 덩어리와 같은 장에 있어야 한다(장 끝에 제목만 남지 않게).
function flowLayout(r, blocks, pt) {
  FLOW.cur = pt;
  $$('#a4-modal .a4-pages .a4-frame').slice(1).forEach((x) => x.remove());   // 1쪽(한 장 요약)은 둔다
  const tpl = document.createElement('template');
  const make = (blk) => { tpl.innerHTML = blk.html.trim(); const el = tpl.content.firstElementChild; el._i = blk.i; return el; };
  const pages = [];
  let body, pending = [];
  const over = () => body.scrollHeight > body.clientHeight + 0.5;
  const mark = (el) => pages[pages.length - 1].chs.add(el._i + 1);
  const newPage = () => {
    body = flowPage(r);
    pages.push({ body, chs: new Set() });
    for (const el of pending) { body.append(el); mark(el); }
    pending = [];
  };
  const put = (el) => {                  // 넘치면 새 장에 넣는다
    body.append(el);
    if (over() && body.children.length > 1) { el.remove(); newPage(); body.append(el); }
    mark(el);
  };
  newPage();
  blocks.forEach((blk, n) => {
    const el = make(blk);
    if (blk.kind === 'fig') {
      body.append(el);
      if (over() && body.children.length > 1) { el.remove(); pending.push(el); } else mark(el);
      return;
    }
    if (blk.kind === 'head') {
      if (pending.length) newPage();     // 앞 챕터 그림이 밀려 있으면 먼저 내보낸다
      const next = blocks.slice(n + 1).find((x) => x.kind === 'text' && x.i === blk.i);
      body.append(el);
      let ok = !over();
      if (ok && next) { const t = make(next); body.append(t); ok = !over(); t.remove(); }
      if (!ok && body.children.length > 1) { el.remove(); newPage(); body.append(el); }
      mark(el);
      return;
    }
    put(el);
  });
  if (pending.length) newPage();
  return pages;
}
function flowBuild(id) {
  const r = REP[id], ch = CHAPTERS[id];
  const blocks = chBlocks(r, ch);
  // 가장 작은 글자로 필요한 장 수를 구하고, 같은 장 수 안에서 가장 큰 글자를 고른다(마지막 장까지 꽉 차게)
  const need = flowLayout(r, blocks, FLOW.min).length;
  let pt = FLOW.min;
  for (let x = FLOW.max; x > FLOW.min; x -= FLOW.step) {
    if (flowLayout(r, blocks, x).length <= need) { pt = x; break; }
  }
  const pages = flowLayout(r, blocks, pt);
  const total = pages.length + 1;
  pages.forEach((pg, k) => {
    const sheet = pg.body.closest('.a4-in');
    const nums = [...pg.chs];
    sheet.querySelector('.a4-chs').textContent = nums.length > 1 ? `챕터 ${nums[0]}–${nums[nums.length - 1]}` : `챕터 ${nums[0]}`;
    sheet.querySelector('.a4-pno').textContent = `${k + 2} / ${total}`;
  });
  return { pages: pages.length, pt };
}
function a4Pages(n) {
  const box = $('#a4-modal .a4-pages');
  box.innerHTML = Array.from({ length: n }, () => '<div class="a4-frame"><div class="a4-sheet"></div></div>').join('');
  return $$('.a4-sheet', box);
}
function a4Scale() {
  const m = $('#a4-modal');
  if (!m || m.hidden) return;
  const stage = m.querySelector('.a4-stage');
  for (const frame of $$('.a4-frame', m)) {
    const sheet = frame.firstElementChild;
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    const k = Math.min(1, (stage.clientWidth - 32) / w);
    sheet.style.transform = `scale(${k})`;
    frame.style.width = `${Math.round(w * k)}px`;
    frame.style.height = `${Math.round(h * k)}px`;
  }
}
function a4Modal() {
  let m = $('#a4-modal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'a4-modal';
  m.className = 'a4-modal';
  m.hidden = true;
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-labelledby', 'a4-title');
  m.innerHTML = `<div class="a4-bar"><h2 id="a4-title">A4 한 장 미리보기</h2><span class="a4-info" id="a4-info"></span>
      <span class="a4-act"><button type="button" class="a4-btn primary" data-a4-print>인쇄 · PDF로 저장</button><button type="button" class="a4-btn" data-a4-close>닫기</button></span></div>
    <div class="a4-stage"><div class="a4-pages"></div></div>`;
  document.body.append(m);
  m.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); a4Close(); return; }
    if (e.key === 'Tab') {                    // 포커스를 대화상자 안에 가둔다
      const f = [...m.querySelectorAll('button')];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  m.addEventListener('click', (e) => {
    if (e.target.closest('[data-a4-close]') || e.target === m) { a4Close(); return; }
    if (e.target.closest('[data-a4-print]')) window.print();
  });
  window.addEventListener('resize', a4Scale);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden && !m.contains(e.target)) a4Close(); });
  return m;
}
// mode 'one' = 한 장 요약 1장, 'all' = 한 장 요약 + 챕터마다 1장(보고서 전체)
function a4Open(id, from, mode = 'one') {
  const m = a4Modal();
  const ch = CHAPTERS[id];
  if (!ch) return;
  m.hidden = false;
  a4Id = id;
  document.body.classList.add('a4-open');
  const sheets = a4Pages(1);
  const pick = a4Build(sheets[0], id);
  let info = '';
  if (mode === 'all') {
    const res = flowBuild(id);
    info = `A4 ${res.pages + 1}장 — 1쪽 한 장 요약 + 챕터 ${ch.chapters.length}개를 이어서 ${res.pages}쪽 · 글자 ${res.pt.toFixed(2).replace(/0$/, '')}pt`;
    $('#a4-title').textContent = '보고서 전체 인쇄 미리보기';
  } else {
    const top = pick && pick.L >= a4Levels(ch.chapters || []);
    const extra = !pick || pick.L < 2 ? '' : top ? ' · 더보기 상세와 조사 방법까지 모두 담음' : ` · 챕터마다 더보기 상세 ${pick.L - 1}줄까지 담음`;
    info = pick ? `글자 크기 ${pick.pt.toFixed(1)}pt로 한 장에 맞춤${extra}` : '';
    $('#a4-title').textContent = 'A4 한 장 미리보기';
  }
  $('#a4-info').textContent = info;
  m.querySelector('.a4-stage').scrollTop = 0;
  a4Scale();
  a4Prev = from || null;
  m.querySelector('[data-a4-print]').focus();
}
function a4Close() {
  const m = $('#a4-modal');
  if (!m || m.hidden) return;
  m.hidden = true;
  a4Id = '';
  document.body.classList.remove('a4-open');
  if (a4Prev && document.contains(a4Prev)) a4Prev.focus();
  a4Prev = null;
}
// 미리보기 없이 Ctrl+P를 눌러도 상세 화면에서는 한 장 요약이 인쇄되게 한다
window.addEventListener('beforeprint', () => {
  const m = $('#a4-modal');
  if (m && !m.hidden) { document.body.classList.add('print-a4'); return; }
  if (!isDetail() || !CHAPTERS[S.open]) return;
  a4Modal();
  a4Build(a4Pages(1)[0], S.open);
  document.body.classList.add('print-a4');
});
window.addEventListener('afterprint', () => document.body.classList.remove('print-a4'));

// ── 툴팁(차트) ────────────────────────────────────────────
function bindTips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  const v = document.createElement('strong');
  const l = document.createElement('span');
  tip.append(v, l);
  document.body.append(tip);
  const show = (el) => {
    v.textContent = el.getAttribute('data-tip');
    l.textContent = el.getAttribute('data-tip-sub') || '';
    tip.hidden = false;
    const b = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = Math.min(window.innerWidth - tw - 8, Math.max(8, b.left + b.width / 2 - tw / 2));
    const y = b.top - th - 8 < 8 ? b.bottom + 8 : b.top - th - 8;
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.classList.add('on');
  };
  const hide = (el) => { tip.hidden = true; if (el) el.classList.remove('on'); };
  document.addEventListener('pointerover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el); });
  document.addEventListener('pointerout', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) hide(el); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) show(el); });
  document.addEventListener('focusout', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) hide(el); });
  window.addEventListener('scroll', () => { if (!tip.hidden) hide(document.querySelector('[data-tip].on')); }, { passive: true });
}

// ── 이벤트 ────────────────────────────────────────────────
function toggleCat(k) {
  S.open = '';
  S.cat = S.cat.includes(k) ? S.cat.filter((x) => x !== k) : [...S.cat, k];
  render();
}
function reset() {
  Object.assign(S, { open: '', cat: [], region: 'all', period: DEFAULT_PERIOD, q: '', sort: 'latest', from: '', to: '', saved: false, newer: false, rep: '' });
  $('#q').value = '';
  render();
}

function bind() {
  const q = $('#q');
  q.value = S.q;
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { S.q = q.value; S.open = ''; render(); }, 140); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; S.q = ''; render(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });

  document.addEventListener('click', (e) => {
    const j = e.target.closest('a[data-jump]');
    if (j) { e.preventDefault(); scrollToEl(document.getElementById(j.dataset.jump)); return; }
    const t = e.target.closest('button, g[role=button]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) {
      const was = S.tab === 'news';
      S.tab = d.tab;
      S.open = '';
      if (was !== (S.tab === 'news')) S.cat = S.cat.filter((k) => RTOPIC[k]);
      render(); window.scrollTo({ top: 0 }); return;
    }
    if (d.view) { S.view = d.view; S.open = ''; render(); return; }
    if (t.hasAttribute('data-back')) { closeReport(); return; }
    if (t.hasAttribute('data-print')) { if (S.open) a4Open(S.open, t); return; }
    if (d.mprint) { a4Metric(d.mprint, t); return; }
    if (t.hasAttribute('data-mprint-all')) { a4MetricsAll(t); return; }
    if (t.hasAttribute('data-print-all')) { if (S.open) a4Open(S.open, t, 'all'); return; }
    if (d.chmore) { setMore(t, t.getAttribute('aria-expanded') !== 'true'); syncAllMore(); return; }
    if (t.hasAttribute('data-chmore-all')) {
      const on = t.getAttribute('aria-pressed') !== 'true';
      $$('[data-chmore]').forEach((b) => setMore(b, on));
      syncAllMore(); return;
    }
    if (d.region) { S.region = d.region; render(); return; }
    if (d.goto) { goToReport(d.goto); return; }
    if (d.news) { Object.assign(S, { tab: 'news', rep: d.news, period: 'all', cat: [], q: '' }); $('#q').value = ''; render(); window.scrollTo({ top: 0 }); return; }
    if (d.period) {
      S.period = d.period;
      if (S.period === 'custom' && !S.from && !S.to) { S.from = addDays(today(), -13); S.to = today(); }
      if (S.period !== 'custom') { S.from = ''; S.to = ''; }
      render(); return;
    }
    if (d.cat) { toggleCat(d.cat); return; }
    if (d.day) {
      if (S.period === 'custom' && S.from === d.day && S.to === d.day) { S.period = DEFAULT_PERIOD; S.from = S.to = ''; }
      else { S.period = 'custom'; S.from = S.to = d.day; }
      render(); return;
    }
    if (d.star) {
      const id = d.star;
      if (saved.has(id)) saved.delete(id); else saved.add(id);
      ls.set('arr.saved', [...saved]);
      const on = saved.has(id);
      t.setAttribute('aria-pressed', on); t.setAttribute('aria-label', on ? '저장 해제' : '저장');
      const st = $('[data-saved]'); if (st) st.textContent = `저장한 항목 ${saved.size}`;
      if (S.saved) render({ keepPage: true });
      return;
    }
    if (t.hasAttribute('data-saved')) { S.saved = !S.saved; render(); return; }
    if (t.hasAttribute('data-newer')) { S.newer = !S.newer; render(); return; }
    if (t.hasAttribute('data-reset')) { reset(); return; }
    if (t.hasAttribute('data-more')) { shown += PAGE; render({ keepPage: true }); return; }
    if (d.clear === 'q') { S.q = ''; q.value = ''; render(); return; }
    if (d.clear === 'rep') { S.rep = ''; render(); return; }
    if (d.clear === 'period') { S.period = DEFAULT_PERIOD; S.from = S.to = ''; render(); return; }
    if (d.clearCat) { toggleCat(d.clearCat); return; }
  });
  document.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('g[role=button]');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  $('#sort').addEventListener('change', (e) => { S.sort = e.target.value; render(); });
  for (const id of ['from', 'to']) $(`#${id}`).addEventListener('change', (e) => { S[id] = e.target.value; S.period = 'custom'; render(); });
  window.addEventListener('hashchange', () => { readHash(); $('#q').value = S.q; render(); });
  matchMedia('(max-width: 640px)').addEventListener('change', () => { if (S.tab === 'metric' || S.tab === 'issue') render({ keepPage: true }); });
  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('arr.theme', root.dataset.theme); } catch { /* 무시 */ }
  });
  if (matchMedia('(max-width: 960px)').matches) $('#viz').open = false;
  if (matchMedia('(max-width: 520px)').matches) q.placeholder = '검색어 — 예: 이용률, 한국은행';
  bindTips();
}

// ── 시작 ──────────────────────────────────────────────────
async function boot() {
  readHash();
  bind();
  const inline = window.__ARR_DATA__;
  if (inline) {
    setTaxonomy(inline.taxonomy);
    META = inline.meta || {};
    ingest(setReports(inline.reports));
    setMetrics(inline.metrics);
    setIssues(inline.issues);
    setChapters(inline.chapters);
    ingest(inline.items);
    archive = 'done';
  } else {
    const [tax, meta, rep, met, iss, chs] = await Promise.allSettled([
      getJSON('assets/taxonomy.json'), getJSON('data/meta.json'), getJSON('assets/reports.json'),
      getJSON('assets/metrics.json'), getJSON('assets/issues.json'), getJSON('assets/chapters.json')]);
    setTaxonomy(tax.status === 'fulfilled' ? tax.value : null);
    META = meta.status === 'fulfilled' ? meta.value : {};
    if (rep.status === 'fulfilled') ingest(setReports(rep.value));
    if (met.status === 'fulfilled') setMetrics(met.value);
    if (iss.status === 'fulfilled') setIssues(iss.value);
    if (chs.status === 'fulfilled') setChapters(chs.value);
    try {
      const doc = await getJSON(`data/items-recent.json?v=${encodeURIComponent(META.generated || '')}`);
      ingest(doc.items);
    } catch { /* 첫 배포 전 */ }
  }
  renderMeta();
  render();
  if (!inline) setTimeout(() => { if (archive === 'idle') loadArchive(); }, 1500);
}
boot();

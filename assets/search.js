// 한국어 검색 엔진 — 띄어쓰기 무시 · 한영 동의어 확장 · 초성 검색 · 제외어(-) · 구문("…")
// 순수 함수만 둔다(브라우저·Node 테스트 공용).

const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JOSA = ['에서','으로','에게','까지','부터','은','는','이','가','을','를','의','에','로','와','과','도','만'];
const PUNCT = /[\s\-_·•.,:;!?'"‘’“”`~()[\]{}<>/\\|…]+/g;

export const normText = (s) => String(s ?? '').normalize('NFKC').toLowerCase();
export const compact = (s) => normText(s).replace(PUNCT, '');

export function chosung(s) {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
    else if (!/\s/.test(ch)) out += ch.toLowerCase();
  }
  return out;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isShortAscii = (s) => /^[a-z0-9+#]{1,3}$/.test(s);
const isCho = (s) => /^[ㄱ-ㅎ]{2,}$/.test(s);

// 동의어 표 → compact(단어) ⇒ 묶음
export function buildLexicon(groups = []) {
  const map = new Map();
  for (const g of groups) {
    const words = [...new Set(g.map(normText))];
    for (const w of words) {
      const k = compact(w);
      if (!k) continue;
      map.set(k, [...new Set([...(map.get(k) || []), ...words])]);
    }
  }
  return map;
}

function variantsOf(term, lex) {
  const base = normText(term);
  let group = lex.get(compact(base));
  if (!group && /[가-힣]$/.test(base)) {           // '엔비디아의' → '엔비디아'
    for (const j of JOSA) {
      if (base.endsWith(j) && base.length > j.length + 1) {
        const stem = base.slice(0, -j.length);
        group = lex.get(compact(stem));
        if (group) { group = [stem, ...group]; break; }
      }
    }
  }
  const words = [...new Set([base, ...(group || [])])];
  return words.map((w) => {
    const v = { text: w, compact: compact(w) };
    if (isShortAscii(w)) v.re = new RegExp(`(?<![a-z0-9])${escRe(w)}(?![a-z0-9])`);
    return v;
  });
}

// 질의 문자열 → { terms: [{neg, cho, phrase, variants}] }
export function parseQuery(q, lex = new Map()) {
  const terms = [];
  const rx = /(-?)"([^"]+)"|(\S+)/g;
  let m;
  const src = String(q ?? '').trim();
  const toks = [];
  while ((m = rx.exec(src))) {
    if (m[2] !== undefined) toks.push({ neg: m[1] === '-', raw: m[2], phrase: true });
    else {
      let raw = m[3], neg = false;
      if (raw.length > 1 && raw.startsWith('-')) { neg = true; raw = raw.slice(1); }
      toks.push({ neg, raw, phrase: false });
    }
  }
  // 띄어 쓴 동의어 구('도구 호출', 'tool use')는 한 낱말로 묶어 동의어를 찾는다.
  for (let i = 0; i < toks.length; i++) {
    for (const n of [3, 2]) {
      const span = toks.slice(i, i + n);
      if (span.length < n || span.some((t) => t.phrase || t.neg)) continue;
      if (lex.has(compact(span.map((t) => t.raw).join('')))) {
        toks.splice(i, n, { neg: false, raw: span.map((t) => t.raw).join(' '), phrase: false });
        break;
      }
    }
  }
  for (const tk of toks) {
    const { neg, phrase } = tk;
    const raw = tk.raw.trim();
    if (!raw) continue;
    if (!phrase && isCho(raw)) { terms.push({ neg, cho: true, text: raw, variants: [] }); continue; }
    // A|B 는 둘 중 하나
    const alts = phrase ? [raw] : raw.split('|').filter(Boolean);
    const variants = phrase
      ? [{ text: normText(raw), compact: compact(raw) }]
      : alts.flatMap((a) => variantsOf(a, lex));
    terms.push({ neg, cho: false, phrase, text: raw, variants });
  }
  return { terms };
}

function hit(v, h, c) {
  if (v.re) return v.re.test(h);
  if (h.includes(v.text)) return true;
  return v.compact.length >= 2 && c.includes(v.compact);
}

// 항목 준비: 검색용 필드를 미리 만든다(_ht 제목, _hr 나머지, _ct/_cr 공백 제거, _cho 초성)
export function prepareHaystack(it, extra = '') {
  it._ht = normText(it.title);
  it._hr = normText([it.summary, it.hf_sum, it.source, it.authors, it.number, it.appno, it.arxiv,
    (it.kw || []).join(' '), (it.ipc || []).join(' '), (it.also || []).map((a) => a.source).join(' '), extra].filter(Boolean).join(' '));
  it._ct = compact(it._ht);
  it._cr = compact(it._hr);
  it._cho = chosung(it.title);
  return it;
}

// 점수: 0 이면 불일치. 제목 일치 3점, 그 밖 1점, 최신일수록 소폭 가산은 호출 쪽에서.
export function matchScore(it, parsed) {
  if (!parsed || !parsed.terms.length) return 1;
  let score = 0;
  for (const t of parsed.terms) {
    let inTitle = false, inRest = false;
    if (t.cho) {
      inTitle = it._cho.includes(t.text);
    } else {
      inTitle = t.variants.some((v) => hit(v, it._ht, it._ct));
      inRest = !inTitle && t.variants.some((v) => hit(v, it._hr, it._cr));
    }
    if (t.neg) { if (inTitle || inRest) return 0; continue; }
    if (!inTitle && !inRest) return 0;
    score += inTitle ? 3 : 1;
  }
  return score || 1;
}

const escHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { escHTML };

// 원문 텍스트에서 일치한 부분을 찾아 <mark> 로 감싸고 나머지는 이스케이프한다.
export function highlight(text, parsed) {
  const raw = String(text ?? '');
  if (!parsed || !parsed.terms.length || !raw) return escHTML(raw);
  const pats = [];
  for (const t of parsed.terms) {
    if (t.neg || t.cho) continue;
    for (const v of t.variants) {
      if (!v.text) continue;
      if (isShortAscii(v.text)) { pats.push(`(?<![A-Za-z0-9])${escRe(v.text)}(?![A-Za-z0-9])`); continue; }
      const chars = [...(v.compact || v.text)];
      if (chars.length) pats.push(chars.map(escRe).join('[\\s\\-_·.]*'));  // '생성형AI' ↔ '생성형 AI'
    }
  }
  if (!pats.length) return escHTML(raw);
  pats.sort((a, b) => b.length - a.length);
  let rx;
  try { rx = new RegExp(pats.join('|'), 'gi'); } catch { return escHTML(raw); }
  let out = '', last = 0, m;
  while ((m = rx.exec(raw))) {
    if (!m[0]) { rx.lastIndex++; continue; }
    out += escHTML(raw.slice(last, m.index)) + '<mark>' + escHTML(m[0]) + '</mark>';
    last = m.index + m[0].length;
  }
  return out + escHTML(raw.slice(last));
}

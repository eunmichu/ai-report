// 검색 엔진 테스트 — node --test tests/search.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLexicon, parseQuery, prepareHaystack, matchScore, highlight, chosung } from '../assets/search.js';

const tax = JSON.parse(readFileSync(new URL('../assets/taxonomy.json', import.meta.url), 'utf8'));
const lex = buildLexicon(tax.synonyms);
const item = (o) => prepareHaystack({ title: '', summary: '', ...o });
const score = (it, q) => matchScore(it, parseQuery(q, lex));

const en = item({ title: 'Future of Jobs: employers expect AI to reshape skills', summary: 'Employment and productivity survey', source: 'World Economic Forum' });
const ko = item({ title: '국민 44.5%가 생성형 AI를 경험', summary: '인터넷이용실태조사 결과', source: '과학기술정보통신부' });
const pat = item({ title: 'WIPO patent landscape on generative AI', summary: 'Copyright and patents', source: 'WIPO' });

test('한글 질의가 영문 항목을 찾는다(동의어)', () => {
  assert.ok(score(en, '일자리') > 0);       // → jobs
  assert.ok(score(en, '생산성') > 0);       // → productivity
  assert.ok(score(pat, '특허') > 0);        // → patent
  assert.ok(score(pat, '저작권') > 0);      // → copyright
  assert.ok(score(en, '세계경제포럼') > 0);  // 기관명 동의어
  assert.equal(score(ko, '특허'), 0);
});

test('띄어쓰기를 무시한다', () => {
  assert.ok(score(ko, '생성형AI') > 0);
  assert.ok(score(ko, '인터넷 이용 실태조사') > 0);
});

test('초성 검색', () => {
  assert.equal(chosung('생성형 AI'), 'ㅅㅅㅎai');
  assert.ok(score(ko, 'ㄱㅁ') > 0);          // 국민
  assert.equal(score(en, 'ㄱㅁ'), 0);
});

test('숫자로 찾는다', () => {
  assert.ok(score(ko, '44.5%') > 0);
  assert.equal(score(en, '44.5%'), 0);
});

test('짧은 영문은 단어 경계로만 맞춘다', () => {
  const x = item({ title: 'Supply chain update', summary: 'said' });
  assert.equal(score(x, 'ai'), 0);            // chain·said 안의 ai 는 무시
  assert.ok(score(ko, 'ai') > 0);
});

test('제외어·구문·OR', () => {
  assert.equal(score(en, 'jobs -employers'), 0);
  assert.ok(score(en, '"future of jobs"') > 0);
  assert.equal(score(en, '"jobs of future"'), 0);
  assert.ok(score(en, 'zzz|skills') > 0);
});

test('조사가 붙어도 동의어를 찾는다', () => {
  assert.ok(score(en, '일자리의') > 0);
});

test('제목 일치가 더 높은 점수', () => {
  assert.ok(score(ko, '생성형 AI') > score(ko, '과학기술정보통신부'));
});

test('하이라이트는 안전하게 이스케이프한다', () => {
  const p = parseQuery('생성형ai', lex);
  assert.equal(highlight('<b>생성형 AI</b>', p), '&lt;b&gt;<mark>생성형 AI</mark>&lt;/b&gt;');
  assert.equal(highlight('A & B', parseQuery('amp', lex)), 'A &amp; B');
});

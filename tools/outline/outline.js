const $ = id => document.getElementById(id);
const LS = 'outline.blocks.v2';
const SAMPLE = `프로젝트 아이디어
ㄴ목표
ㄴㄴ사용자 100명
ㄴㄴ월 매출 목표
ㄴ기능
l  ㄴ로그인
l  ㄴ검색
- 일정
  - 1주차
  - 2주차
    - 디자인
    - 개발`;

// ---------- 텍스트 → [{text, depth}] ----------
const MARK = new Set(['ㄴ', '└', '├', '↳', '⎿']);
const GUIDE = new Set(['l', '|', '│', '┃', '¦']);
const BULLET = /^([-*•·▪‣◦+]|\d+[.)]|\d+(\.\d+)+\.?)\s+/;

function parseFlat(text, guideAsIndent) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  let unit = 0; // 공백 들여쓰기 단위: 0이 아닌 최소 앞 공백 수 (최대 4)
  for (const l of lines) {
    const m = l.match(/^( +)\S/);
    if (m && !/^ *(ㄴ|l |\|)/.test(l)) unit = unit ? Math.min(unit, m[1].length) : m[1].length;
  }
  unit = Math.min(unit || 2, 4);
  const out = [];
  let prev = -1;
  for (const raw of lines) {
    let i = 0, depth = 0, marked = false;
    while (i < raw.length) {
      const c = raw[i];
      if (c === '\t') { depth++; i++; }
      else if (c === ' ') {
        let n = 0; while (raw[i] === ' ') { n++; i++; }
        if (!marked) depth += Math.floor(n / unit);
      }
      else if (MARK.has(c)) { depth++; marked = true; i++; while (raw[i] === '─' || raw[i] === '-') i++; }
      else if (guideAsIndent && GUIDE.has(c) && /[\sㄴ└├]/.test(raw[i + 1] || ' ')) { depth++; marked = true; i++; }
      else break;
    }
    const body = raw.slice(i).replace(/\s+$/, '').replace(BULLET, '');
    depth = Math.min(depth, prev + 1);
    prev = depth;
    out.push({ text: body, depth });
  }
  return out;
}

// ---------- 상태 ----------
let blocks = [];          // {id, text, depth, collapsed}
let mode = 'bullet';      // bullet | num | ㄴ
let cur = null;           // 마지막으로 포커스된 블록 id
let pending = null;       // 다음 렌더 후 포커스 {id, pos}
const undo = [];
const nid = () => Math.random().toString(36).slice(2, 9);
const mkBlock = (text = '', depth = 0) => ({ id: nid(), text, depth, collapsed: false });
const idx = id => blocks.findIndex(b => b.id === id);
const subEnd = i => { let j = i + 1; while (j < blocks.length && blocks[j].depth > blocks[i].depth) j++; return j; };
const hasKids = i => i + 1 < blocks.length && blocks[i + 1].depth > blocks[i].depth;
function normalize() {
  if (!blocks.length) blocks.push(mkBlock());
  let p = -1;
  for (const b of blocks) { b.depth = Math.max(0, Math.min(b.depth, p + 1)); p = b.depth; }
}
function save() { try { localStorage.setItem(LS, JSON.stringify({ blocks, mode })); } catch (e) {} }
function act(fn) { // 구조 변경: 되돌리기 저장 → 변경 → 다시 그리기
  undo.push(JSON.stringify(blocks)); if (undo.length > 100) undo.shift();
  fn(); normalize(); render(); save();
}

// ---------- 구조 연산 ----------
function indent(i) {
  if (i < 1 || blocks[i].depth > blocks[i - 1].depth) return;
  const e = subEnd(i);
  for (let j = i; j < e; j++) blocks[j].depth++;
  for (let k = i - 1; k >= 0; k--) if (blocks[k].depth === blocks[i].depth - 1) { blocks[k].collapsed = false; break; }
}
function outdent(i) {
  if (blocks[i].depth < 1) return;
  const e = subEnd(i);
  for (let j = i; j < e; j++) blocks[j].depth--;
}
function move(i, dir) {
  const d = blocks[i].depth, e = subEnd(i);
  if (dir < 0) {
    let j = i - 1;
    while (j >= 0 && blocks[j].depth > d) j--;
    if (j < 0 || blocks[j].depth < d) return;
    blocks.splice(j, 0, ...blocks.splice(i, e - i));
  } else {
    if (e >= blocks.length || blocks[e].depth !== d) return;
    const e2 = subEnd(e), chunk = blocks.splice(i, e - i);
    blocks.splice(e2 - chunk.length, 0, ...chunk);
  }
}
function visibleNeighbor(id, dir) {
  const row = document.querySelector(`.row[data-id="${id}"]`);
  const n = row && (dir < 0 ? row.previousElementSibling : row.nextElementSibling);
  return n ? n.dataset.id : null;
}
function focusNeighbor(id, dir) {
  const n = visibleNeighbor(id, dir); if (!n) return;
  const t = document.querySelector(`.row[data-id="${n}"] textarea`);
  t.focus(); const p = dir < 0 ? t.value.length : 0; t.setSelectionRange(p, p);
}
function insertParsed(i, items) {
  const base = blocks[i].depth;
  const fresh = items.map(it => mkBlock(it.text, base + it.depth));
  const empty = blocks[i].text.trim() === '';
  act(() => {
    if (empty) blocks.splice(i, 1, ...fresh); else blocks.splice(subEnd(i), 0, ...fresh);
    pending = { id: fresh[fresh.length - 1].id, pos: fresh[fresh.length - 1].text.length };
  });
}

// ---------- 렌더 ----------
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function autosize(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
function labels() {
  const c = [];
  return blocks.map(b => { c.length = b.depth + 1; c[b.depth] = (c[b.depth] || 0) + 1; return c.join('.'); });
}

function render() {
  const root = $('blocks'); root.textContent = '';
  const nums = labels();
  let hide = null;
  blocks.forEach((b, i) => {
    if (hide !== null && b.depth > hide) return;
    hide = null;
    const kids = hasKids(i);
    if (b.collapsed && kids) hide = b.depth;

    const row = el('div', 'row'); row.dataset.id = b.id;
    for (let d = 0; d < b.depth; d++) row.append(el('i', 'guide'));
    const m = el('button', 'mk' + (kids ? ' has' : '') + (kids && b.collapsed ? ' closed' : ''));
    m.type = 'button'; m.tabIndex = -1;
    m.title = kids ? (b.collapsed ? '하위 블록 펼치기' : '하위 블록 접기') : '';
    if (mode === 'num') m.textContent = nums[i];
    else if (mode === 'ㄴ' && b.depth > 0) m.textContent = 'ㄴ';
    else { m.textContent = '●'; m.classList.add('dot'); }
    m.onmousedown = e => e.preventDefault();
    m.onclick = () => {
      if (kids) { b.collapsed = !b.collapsed; pending = { id: b.id, pos: b.text.length }; render(); save(); }
      else document.querySelector(`.row[data-id="${b.id}"] textarea`).focus();
    };

    const t = el('textarea'); t.rows = 1; t.value = b.text; t.spellcheck = false;
    if (blocks.length === 1 && !b.text) t.placeholder = '여기에 입력하거나, 계층형 텍스트를 붙여넣으세요';
    t.addEventListener('focus', () => { cur = b.id; });
    t.addEventListener('input', () => { b.text = t.value; autosize(t); save(); stat(); });
    t.addEventListener('keydown', e => onKey(e, b, t));
    t.addEventListener('paste', e => onPaste(e, b, t));
    row.append(m, t); root.append(row);
  });
  root.querySelectorAll('textarea').forEach(autosize);
  if (pending) {
    const t = document.querySelector(`.row[data-id="${pending.id}"] textarea`);
    if (t) { t.focus(); const p = Math.min(pending.pos, t.value.length); t.setSelectionRange(p, p); }
    pending = null;
  }
  stat();
}
function stat() {
  let maxD = 0; blocks.forEach(b => { maxD = Math.max(maxD, b.depth + 1); });
  const n = blocks.filter(b => b.text.trim()).length;
  $('stat').textContent = n ? `${n}개 · ${maxD}단계` : '';
  updateLevels();
}

// ---------- 키보드 / 붙여넣기 ----------
function onKey(e, b, t) {
  if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중에는 건드리지 않음
  const i = idx(b.id);
  const s = t.selectionStart, en = t.selectionEnd, caretOnly = s === en;

  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    if (!b.text && b.depth > 0) { act(() => { outdent(i); pending = { id: b.id, pos: 0 }; }); return; }
    if (s === 0 && b.text) { // 맨 앞에서 Enter: 위에 빈 블록
      act(() => { blocks.splice(i, 0, mkBlock('', b.depth)); pending = { id: b.id, pos: 0 }; });
      return;
    }
    const before = t.value.slice(0, s), after = t.value.slice(en);
    act(() => {
      const open = hasKids(i) && !b.collapsed;
      const at = hasKids(i) && b.collapsed ? subEnd(i) : i + 1;
      const nb = mkBlock(after, open ? b.depth + 1 : b.depth);
      b.text = before;
      blocks.splice(at, 0, nb);
      pending = { id: nb.id, pos: 0 };
    });
  } else if (e.key === 'Tab') {
    e.preventDefault();
    act(() => { e.shiftKey ? outdent(i) : indent(i); pending = { id: b.id, pos: s }; });
  } else if (e.key === 'Backspace' && caretOnly && s === 0) {
    if (!b.text) {
      if (b.depth > 0) { e.preventDefault(); act(() => { outdent(i); pending = { id: b.id, pos: 0 }; }); return; }
      if (blocks.length === 1) return;
      e.preventDefault();
      const prev = visibleNeighbor(b.id, -1) || visibleNeighbor(b.id, 1);
      const pj = prev ? idx(prev) : -1;
      act(() => { blocks.splice(i, 1); if (prev) pending = { id: prev, pos: pj >= 0 && pj < i ? blocks[pj].text.length : 0 }; });
    } else if (b.depth > 0) {
      e.preventDefault(); act(() => { outdent(i); pending = { id: b.id, pos: 0 }; });
    } else if (i > 0 && visibleNeighbor(b.id, -1) === blocks[i - 1].id) {
      e.preventDefault();
      const p = blocks[i - 1], pos = p.text.length;
      act(() => { p.text += b.text; blocks.splice(i, 1); pending = { id: p.id, pos }; });
    }
  } else if (e.key === 'ArrowUp' && e.altKey) {
    e.preventDefault(); act(() => { move(i, -1); pending = { id: b.id, pos: s }; });
  } else if (e.key === 'ArrowDown' && e.altKey) {
    e.preventDefault(); act(() => { move(i, 1); pending = { id: b.id, pos: s }; });
  } else if (e.key === 'ArrowUp' && !e.shiftKey && caretOnly && s === 0) {
    e.preventDefault(); focusNeighbor(b.id, -1);
  } else if (e.key === 'ArrowDown' && !e.shiftKey && caretOnly && s === t.value.length) {
    e.preventDefault(); focusNeighbor(b.id, 1);
  }
}
function onPaste(e, b, t) {
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!/\n/.test(text.replace(/\s+$/, ''))) return; // 한 줄은 기본 붙여넣기
  e.preventDefault();
  const items = parseFlat(text, $('optL').checked);
  if (items.length) insertParsed(idx(b.id), items);
}

// ---------- 내보내기 ----------
function serialize(kind) {
  const c = [];
  return blocks.map(b => {
    const d = b.depth, tx = b.text.replace(/\s*\n\s*/g, ' ');
    c.length = d + 1; c[d] = (c[d] || 0) + 1;
    if (kind === 'tab') return '\t'.repeat(d) + tx;
    if (kind === 'md') return '  '.repeat(d) + '- ' + tx;
    if (kind === 'ㄴ') return 'ㄴ'.repeat(d) + tx;
    return c.join('.') + '. ' + tx;
  }).join('\n');
}
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1400); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const a = document.createElement('textarea'); a.value = text; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
  toast('복사됨');
}

// ---------- 버튼 ----------
function setMode(m) {
  mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  render(); save();
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
function foldAll(fn) {
  blocks.forEach((b, i) => { b.collapsed = hasKids(i) && fn(b); });
  render(); save();
}
$('expand').onclick = () => foldAll(() => false);
$('collapse').onclick = () => foldAll(() => true);
// 단계별 보기: 버튼은 최대 3단계까지, 그 이상은 숫자 입력(휠/화살표)으로
function showLevel(n) { foldAll(x => x.depth >= n - 1); }
function updateLevels() {
  const max = Math.max(1, ...blocks.map(b => b.depth + 1));
  const box = $('lvBtns'), want = Math.min(max, 3);
  if (box.children.length !== want) {
    box.textContent = '';
    for (let n = 1; n <= want; n++) {
      const btn = el('button', 'chip'); btn.textContent = n + '단계';
      btn.onclick = () => { $('lvNum').value = n; showLevel(n); };
      box.append(btn);
    }
  }
  const inp = $('lvNum');
  inp.max = max;
  if (!inp.dataset.touched || +inp.value > max) inp.value = max;
}
$('lvNum').addEventListener('input', e => {
  const inp = e.target, max = +inp.max;
  if (inp.value === '') return;
  inp.dataset.touched = '1';
  const v = Math.max(1, Math.min(max, Math.round(+inp.value) || 1));
  inp.value = v; showLevel(v);
});
$('lvNum').addEventListener('wheel', e => {
  e.preventDefault();
  const inp = e.target, max = +inp.max;
  const v = Math.max(1, Math.min(max, (+inp.value || max) + (e.deltaY < 0 ? 1 : -1)));
  inp.dataset.touched = '1'; inp.value = v; showLevel(v);
}, { passive: false });

// 내보내기: 버튼을 누르면 형식 메뉴가 뜨고, 고르면 복사 / TXT 저장
const FORMATS = [['tab', '탭 들여쓰기', '⇥ a'], ['md', '마크다운', '- a'], ['ㄴ', 'ㄴ 형식', 'ㄴa'], ['num', '번호', '1.1.']];
const hasText = () => blocks.some(b => b.text.trim());
function doCopy(kind) { copy(serialize(kind)); }
function doDownload(kind) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = `아이디어정리_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.txt`;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + serialize(kind) + '\n'], { type: 'text/plain;charset=utf-8' }));
  const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('TXT 저장됨');
}
function closeMenus() {
  document.querySelectorAll('.menu').forEach(m => { m.hidden = true; });
  document.querySelectorAll('[aria-haspopup]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function setupMenu(btnId, menuId, run, emptyMsg) {
  const btn = $(btnId), menu = $(menuId);
  FORMATS.forEach(([k, label, ex]) => {
    const it = el('button'); it.type = 'button';
    it.innerHTML = `<span>${label}</span><i>${ex}</i>`;
    it.onclick = () => { closeMenus(); run(k); };
    menu.append(it);
  });
  btn.onclick = e => {
    e.stopPropagation();
    const open = menu.hidden;
    closeMenus();
    if (!open) return;
    if (!hasText()) return toast(emptyMsg);
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  };
}
setupMenu('copyBtn', 'copyMenu', doCopy, '복사할 내용이 없습니다');
setupMenu('dlBtn', 'dlMenu', doDownload, '저장할 내용이 없습니다');
document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
$('undo').onclick = () => {
  const s = undo.pop(); if (!s) return toast('되돌릴 내용이 없습니다');
  blocks = JSON.parse(s); normalize(); render(); save();
};
$('clear').onclick = () => {
  if (blocks.length > 1 || blocks[0].text) act(() => { blocks = [mkBlock()]; pending = { id: blocks[0].id, pos: 0 }; });
};
$('sample').onclick = () => act(() => { blocks = parseFlat(SAMPLE, true).map(x => mkBlock(x.text, x.depth)); });
$('add').onclick = () => act(() => { const nb = mkBlock('', 0); blocks.push(nb); pending = { id: nb.id, pos: 0 }; });

// 아래 도구 막대: 마지막으로 포커스한 블록에 적용
document.querySelectorAll('#dock [data-act]').forEach(btn => {
  btn.onmousedown = e => e.preventDefault(); // 키보드/포커스 유지
  btn.onclick = () => {
    const i = idx(cur); if (i < 0) return toast('블록을 먼저 선택하세요');
    const id = cur, a = btn.dataset.act;
    act(() => {
      if (a === 'in') indent(i); else if (a === 'out') outdent(i);
      else if (a === 'up') move(i, -1); else if (a === 'down') move(i, 1);
      else if (a === 'del') { blocks.splice(i, subEnd(i) - i); cur = null; return; }
      pending = { id, pos: 1e9 };
    });
  };
});

// 일괄 붙여넣기
const dlg = $('dlg');
$('bulk').onclick = () => { $('bulkText').value = ''; dlg.showModal(); $('bulkText').focus(); };
$('dlgClose').onclick = () => dlg.close();
function bulk(replace) {
  const items = parseFlat($('bulkText').value, $('optL').checked);
  if (!items.length) return dlg.close();
  act(() => {
    const fresh = items.map(x => mkBlock(x.text, x.depth));
    const keep = blocks.filter(b => b.text.trim());
    blocks = replace ? fresh : keep.concat(fresh);
  });
  dlg.close();
}
$('dlgReplace').onclick = () => bulk(true);
$('dlgAppend').onclick = () => bulk(false);
window.addEventListener('resize', () => document.querySelectorAll('#blocks textarea').forEach(autosize));

// ---------- 시작 ----------
try {
  const d = JSON.parse(localStorage.getItem(LS) || 'null');
  if (d && Array.isArray(d.blocks)) { blocks = d.blocks; mode = d.mode || 'bullet'; }
} catch (e) {}
if (!blocks.length) blocks = [mkBlock()];
normalize();
setMode(mode);

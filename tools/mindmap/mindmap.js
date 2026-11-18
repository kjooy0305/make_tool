(() => {
'use strict';
const $ = s => document.querySelector(s);
const cv = $('#cv'), world = $('#world'), lp = $('#lp'), pct = $('#pct');
const GAP_X = 84, GAP_Y = 14, MIN_S = 1e-4, MAX_S = 1e4, KEY = 'maketool.mindmap.v1';

// ---------- 데이터 ----------
let seq = 0;
const mk = (text = '', children = []) => ({ id: 'n' + (++seq) + Math.random().toString(36).slice(2, 6), text, children, collapsed: false });
let root = mk('중심 주제', [mk('가지 A', [mk('하위 A-1'), mk('하위 A-2')]), mk('가지 B')]);
let selId = root.id, editId = null, editFresh = false, editBefore = '';
let view = { x: 0, y: 0, s: 1 };
const undo = [];
const idx = new Map();   // id -> { n, p }
const els = new Map();   // id -> element

const walk = (n, p, f) => { f(n, p); n.children.forEach(c => walk(c, n, f)); };
const snap = () => JSON.stringify(root);
const clean = s => (s || '').replace(/[\r\n\u2028\u2029\u00a0]+/g, ' ').replace(/\s+/g, ' ').trim();
const count = n => 1 + n.children.reduce((a, c) => a + count(c), 0);
const get = id => idx.get(id);

function save() { try { localStorage.setItem(KEY, snap()); } catch (e) {} }
function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r && typeof r.text === 'string' && Array.isArray(r.children)) { root = revive(r); selId = root.id; }
  } catch (e) {}
}
const revive = o => Object.assign(mk(String(o.text || ''), (o.children || []).map(revive)), { collapsed: !!o.collapsed });

// ---------- 텍스트 입출력 ----------
const HEADER = [
  '# 마인드맵 텍스트 (mindmap-txt v1)',
  '# 한 줄이 가지 하나입니다. 들여쓰기(공백 2칸)가 깊을수록 바로 윗줄의 하위 가지입니다.',
  '# 들여쓰기 없는 첫 줄이 중심 주제이고, 하위 줄은 "- " 뒤가 내용입니다.',
  '# This is an indented outline of a mind map: each line is one branch, deeper indentation = child of the line above.',
  '# 불러올 때 맨 위의 # 설명줄은 무시됩니다.'
];
function serialize() {
  const out = HEADER.slice(); out.push('');
  const w = (n, d) => { const t = n.text || '(제목 없음)'; out.push(d ? '  '.repeat(d) + '- ' + t : t); n.children.forEach(c => w(c, d + 1)); };
  w(root, 0);
  return out.join('\n') + '\n';
}
const MARK = /^(?:[-*+•▪◦‣]\s+|ㄴ\s*|\d+(?:\.\d+)*[.)]\s+|\d+(?:\.\d+)+\s+|#{1,6}\s+)/;
function parse(txt) {
  const lines = txt.replace(/^\uFEFF/, '').split(/\r?\n/);
  let i = 0;
  const signed = lines.some(l => l.includes('mindmap-txt'));
  if (signed) while (i < lines.length && (/^\s*#/.test(lines[i]) || !lines[i].trim())) i++;
  const top = []; const stack = [];
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^([ \t]*)(.*)$/); if (!m[2].trim()) continue;
    let w = 0; for (const ch of m[1]) w += ch === '\t' ? 4 : 1;
    const text = clean(m[2].replace(MARK, ''));
    if (!text) continue;
    const n = mk(text);
    while (stack.length && stack[stack.length - 1].w >= w) stack.pop();
    if (stack.length) stack[stack.length - 1].n.children.push(n); else top.push(n);
    stack.push({ w, n });
  }
  if (!top.length) return null;
  if (top.length === 1) return { node: top[0], virtual: false };
  return { node: mk('마인드맵', top), virtual: true };
}

// ---------- 화면 반영 ----------
function mkEl(id) {
  const el = document.createElement('div');
  el.className = 'node'; el.dataset.id = id;
  el.innerHTML = '<span class="t" spellcheck="false"></span><span class="acts"></span>';
  const t = el.querySelector('.t');
  t.addEventListener('input', () => {
    const e = get(id); if (!e) return;
    e.n.text = clean(t.textContent); layout(); keepVisible(e.n); save();
  });
  t.addEventListener('blur', () => { if (editId === id) commitEdit(); });
  t.addEventListener('paste', ev => {
    ev.preventDefault();
    document.execCommand('insertText', false, clean(ev.clipboardData.getData('text/plain')));
  });
  t.addEventListener('keydown', ev => {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Enter') { ev.preventDefault(); const n = get(id).n; commitEdit(); addSibling(n.id); }
    else if (ev.key === 'Tab') { ev.preventDefault(); commitEdit(); addChild(id); }
    else if (ev.key === 'Escape') { ev.preventDefault(); commitEdit(); }
    ev.stopPropagation();
  });
  world.appendChild(el); els.set(id, el);
  return el;
}

function render() {
  idx.clear(); walk(root, null, (n, p) => idx.set(n.id, { n, p }));
  for (const [id, el] of els) if (!idx.has(id)) { el.remove(); els.delete(id); }
  if (!idx.has(selId)) selId = root.id;
  for (const [id, { n }] of idx) {
    const el = els.get(id) || mkEl(id);
    el.classList.toggle('root', n === root);
    el.classList.toggle('sel', id === selId);
    el.classList.toggle('closed', n.collapsed && n.children.length > 0);
    const t = el.querySelector('.t');
    if (editId !== id && t.textContent !== n.text) t.textContent = n.text;
    let a = '';
    if (n.children.length) a += n.collapsed
      ? `<button class="ab tg shut" data-a="tg" aria-label="펼치기">+${count(n) - 1}</button>`
      : `<button class="ab tg" data-a="tg" aria-label="접기">−</button>`;
    if (id === selId) a += '<button class="ab add" data-a="add" aria-label="하위 가지 추가">＋</button>';
    const acts = el.querySelector('.acts'); if (acts.innerHTML !== a) acts.innerHTML = a;
  }
  layout();
  const sel = get(selId).n;
  $('#bDel').disabled = sel === root;
  $('#bFold').disabled = !sel.children.length;
  $('#bUndo').disabled = !undo.length;
}

function layout() {
  const vis = [];
  const collect = n => { vis.push(n); if (!n.collapsed) n.children.forEach(collect); };
  collect(root);
  const shown = new Set(vis.map(n => n.id));
  for (const [id, el] of els) el.hidden = !shown.has(id);
  for (const n of vis) { const el = els.get(n.id); n.w = el.offsetWidth; n.h = el.offsetHeight; }
  const kids = n => n.collapsed ? [] : n.children;
  const sub = n => {
    const ch = kids(n); let tot = 0; ch.forEach(c => { sub(c); tot += c.sh; });
    tot += Math.max(0, ch.length - 1) * GAP_Y; n.ct = tot; n.sh = Math.max(n.h, tot);
  };
  const place = (n, x, top) => {
    n.x = x; n.y = top + n.sh / 2 - n.h / 2;
    let cy = top + (n.sh - n.ct) / 2;
    kids(n).forEach(c => { place(c, x + n.w + GAP_X, cy); cy += c.sh + GAP_Y; });
  };
  sub(root); place(root, 0, 0);
  const dy = -(root.y + root.h / 2);
  let d = '';
  for (const n of vis) {
    n.y += dy;
    const el = els.get(n.id); el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
  }
  for (const n of vis) for (const c of kids(n)) {
    const x1 = n.x + n.w, y1 = n.y + n.h / 2, x2 = c.x, y2 = c.y + c.h / 2, xm = (x1 + x2) / 2;
    d += `M${x1} ${y1}C${xm} ${y1} ${xm} ${y2} ${x2} ${y2}`;
  }
  lp.setAttribute('d', d);
}

// ---------- 화면 이동·확대 ----------
function applyView() {
  world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`;
  const p = view.s * 100;
  pct.textContent = (p >= 10 ? Math.round(p) : p >= 1 ? p.toFixed(1) : p.toPrecision(2)) + '%';
}
function zoomAt(cx, cy, k) {
  const s = Math.min(MAX_S, Math.max(MIN_S, view.s * k)); k = s / view.s;
  view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = s; applyView();
}
const center = () => { const r = cv.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
function resetView() {
  const r = cv.getBoundingClientRect(), n = get(selId).n;
  view.s = 1;
  if (n === root) { view.x = 70; view.y = r.height / 2 - (root.y + root.h / 2); }
  else { view.x = r.width / 2 - (n.x + n.w / 2); view.y = r.height / 2 - (n.y + n.h / 2); }
  applyView();
}
function fitView() {
  const r = cv.getBoundingClientRect(); let x1 = 0, y1 = 1e18, x2 = 0, y2 = -1e18;
  for (const [id, el] of els) if (!el.hidden) { const n = get(id).n; x1 = Math.min(x1, n.x); x2 = Math.max(x2, n.x + n.w + 40); y1 = Math.min(y1, n.y); y2 = Math.max(y2, n.y + n.h); }
  const bw = x2 - x1 + 80, bh = y2 - y1 + 80;
  view.s = Math.min(2, r.width / bw, (r.height - 70) / bh);
  view.x = r.width / 2 - ((x1 + x2) / 2) * view.s; view.y = (r.height - 60) / 2 - ((y1 + y2) / 2) * view.s; applyView();
}
function keepVisible(n) {
  const r = cv.getBoundingClientRect(), s = view.s, m = 50;
  const l = view.x + n.x * s, t = view.y + n.y * s, rr = l + (n.w + 80) * s, b = t + n.h * s;
  if (rr - l < r.width - 2 * m) { if (l < m) view.x += m - l; else if (rr > r.width - m) view.x -= rr - (r.width - m); }
  if (b - t < r.height - 2 * m) { if (t < m) view.y += m - t; else if (b > r.height - 90) view.y -= b - (r.height - 90); }
  applyView();
}

const ptrs = new Map(); let travel = 0, suppress = false;
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('.zoom') || e.target.closest('.t[contenteditable="true"]')) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) travel = 0; else travel = 99;
});
window.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const r = cv.getBoundingClientRect();
  if (ptrs.size === 1) {
    const dx = e.clientX - p.x, dy = e.clientY - p.y; travel += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX; p.y = e.clientY;
    if (travel > 6) { cv.classList.add('pan'); view.x += dx; view.y += dy; applyView(); }
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d0 = Math.hypot(a.x - b.x, a.y - b.y), m0x = (a.x + b.x) / 2, m0y = (a.y + b.y) / 2;
    p.x = e.clientX; p.y = e.clientY;
    const d1 = Math.hypot(a.x - b.x, a.y - b.y), m1x = (a.x + b.x) / 2, m1y = (a.y + b.y) / 2;
    view.x += m1x - m0x; view.y += m1y - m0y;
    if (d0 > 0) zoomAt(m1x - r.left, m1y - r.top, d1 / d0); else applyView();
  }
});
const endPtr = e => {
  if (!ptrs.delete(e.pointerId)) return;
  if (!ptrs.size) { cv.classList.remove('pan'); if (travel > 6) { suppress = true; setTimeout(() => suppress = false, 60); } }
};
window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
cv.addEventListener('click', e => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });

// ---------- 편집 동작 ----------
function select(id) { commitEdit(); selId = id; render(); keepVisible(get(id).n); }
function startEdit(id, fresh) {
  commitEdit(); selId = id; editId = id; editFresh = !!fresh; editBefore = snap(); render();
  const el = els.get(id), t = el.querySelector('.t');
  el.classList.add('editing'); t.contentEditable = 'true'; t.focus();
  const r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  keepVisible(get(id).n);
}
function commitEdit() {
  if (!editId) return;
  const id = editId, fresh = editFresh; editId = null; editFresh = false;
  const el = els.get(id), e = get(id);
  if (el) { const t = el.querySelector('.t'); t.contentEditable = 'false'; el.classList.remove('editing'); if (e) e.n.text = clean(t.textContent); }
  if (e && !e.n.text && fresh && !e.n.children.length && e.n !== root) {
    e.p.children.splice(e.p.children.indexOf(e.n), 1); selId = e.p.id; undo.pop();
  } else if (!fresh && snap() !== editBefore) push(editBefore);
  save(); render();
}
function push(before) { undo.push(before); if (undo.length > 100) undo.shift(); }
function mutate(fn) { commitEdit(); const before = snap(); fn(); push(before); save(); render(); }

function addChild(id) {
  commitEdit(); const n = get(id).n; let c;
  mutate(() => { n.collapsed = false; c = mk(''); n.children.push(c); });
  startEdit(c.id, true);
}
function addSibling(id) {
  commitEdit(); const e = get(id); if (!e.p) return addChild(id);
  let c;
  mutate(() => { c = mk(''); e.p.children.splice(e.p.children.indexOf(e.n) + 1, 0, c); });
  startEdit(c.id, true);
}
function del(id) {
  commitEdit(); const e = get(id);
  if (!e.p) return toast('중심 주제는 삭제할 수 없어요');
  const k = count(e.n), sibs = e.p.children, i = sibs.indexOf(e.n);
  mutate(() => { sibs.splice(i, 1); selId = (sibs[i] || sibs[i - 1] || e.p).id; });
  toast(k > 1 ? `가지 ${k}개 삭제됨 (↶ 실행취소)` : '삭제됨 (↶ 실행취소)');
}
function fold(id, v) {
  commitEdit(); const n = get(id).n; if (!n.children.length) return;
  n.collapsed = v === undefined ? !n.collapsed : v;
  if (n.collapsed) { let hide = false; walk(n, null, (x, p) => { if (p && x.id === selId) hide = true; }); if (hide) selId = n.id; }
  save(); render(); keepVisible(n);
}
function unfoldAll() { commitEdit(); walk(root, null, n => n.collapsed = false); save(); render(); fitView(); }
function doUndo() {
  commitEdit(); const prev = undo.pop(); if (!prev) return;
  const keep = selId; root = reviveKeep(JSON.parse(prev)); selId = keep; save(); render();
}
function reviveKeep(o) { return { id: o.id, text: o.text, collapsed: !!o.collapsed, children: o.children.map(reviveKeep) }; }

world.addEventListener('click', e => {
  const el = e.target.closest('.node'); if (!el) return;
  e.stopPropagation(); // 버튼이 다시 그려지면 배경 클릭으로 오인되므로 위로 올리지 않는다
  const id = el.dataset.id, b = e.target.closest('.ab');
  if (b) { b.dataset.a === 'add' ? addChild(id) : fold(id); return; }
  if (editId === id) return;
  if (selId === id) startEdit(id); else select(id);
});
cv.addEventListener('click', e => { if (!e.target.closest('.node') && !e.target.closest('.zoom')) commitEdit(); });

document.addEventListener('keydown', e => {
  if (e.target.closest('textarea,input,dialog')) return;
  if (e.isComposing || e.ctrlKey && !(e.key === 'z' || e.key === 'Z')) return;
  if (editId) return;
  const e0 = get(selId), n = e0.n; let h = true;
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) doUndo();
  else if (e.key === 'Enter') addSibling(selId);
  else if (e.key === 'Tab') addChild(selId);
  else if (e.key === 'F2') startEdit(selId);
  else if (e.key === 'Delete' || e.key === 'Backspace') del(selId);
  else if (e.key === ' ') fold(selId);
  else if (e.key === 'ArrowRight') { if (n.collapsed) fold(selId, false); else if (n.children[0]) select(n.children[0].id); }
  else if (e.key === 'ArrowLeft') { if (e0.p) select(e0.p.id); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (e0.p) { const s = e0.p.children, j = s.indexOf(n) + (e.key === 'ArrowDown' ? 1 : -1); if (s[j]) select(s[j].id); }
  } else if (e.key === '0') resetView();
  else h = false;
  if (h) e.preventDefault();
});

// ---------- 도구 모음 ----------
$('#bAdd').onclick = () => addChild(selId);
$('#bSib').onclick = () => addSibling(selId);
$('#bDel').onclick = () => del(selId);
$('#bFold').onclick = () => fold(selId);
$('#bAll').onclick = unfoldAll;
$('#bUndo').onclick = doUndo;
$('#zIn').onclick = () => zoomAt(...center(), 1.4);
$('#zOut').onclick = () => zoomAt(...center(), 1 / 1.4);
$('#zReset').onclick = resetView;
$('#zFit').onclick = fitView;

let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 1800); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

const dExp = $('#dExp'), dImp = $('#dImp');
$('#bExp').onclick = () => { commitEdit(); $('#expText').value = serialize(); dExp.showModal(); };
$('#expCopy').onclick = async () => {
  const ta = $('#expText');
  try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); }
  toast('복사됨');
};
$('#expSave').onclick = () => {
  const d = new Date(), p = v => String(v).padStart(2, '0');
  const name = `마인드맵_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.txt`;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + $('#expText').value], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000); toast('TXT 저장됨');
};
$('#bImp').onclick = () => { commitEdit(); $('#impText').value = ''; dImp.showModal(); };
$('#impPick').onclick = () => $('#impFile').click();
$('#impFile').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { $('#impText').value = String(r.result).replace(/^\uFEFF/, ''); }; r.readAsText(f, 'utf-8');
  e.target.value = '';
};
function doImport(under) {
  const res = parse($('#impText').value);
  if (!res) return toast('읽을 내용이 없어요');
  const parent = get(selId).n;
  mutate(() => {
    if (under) { parent.collapsed = false; if (res.virtual) parent.children.push(...res.node.children); else parent.children.push(res.node); }
    else { root = res.node; selId = root.id; }
  });
  dImp.close(); fitView(); toast(`${count(under ? parent : root)}개 가지`);
}
$('#impReplace').onclick = () => doImport(false);
$('#impUnder').onclick = () => doImport(true);

// ---------- 시작 ----------
load(); render();
resetView();
addEventListener('resize', () => applyView());
window.__mm = { serialize, parse, get root() { return root; }, get view() { return view; } };
})();

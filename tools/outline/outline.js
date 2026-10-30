const $ = id => document.getElementById(id);
const src = $('src'), tree = $('tree');
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

// ---------- 파싱 ----------
const MARK = new Set(['ㄴ', '└', '├', '↳', '⎿', '└─', '├─']);
const GUIDE = new Set(['l', '|', '│', '┃', '¦']);
const BULLET = /^([-*•·▪‣◦+]|\d+[.)]|\d+(\.\d+)+\.?)\s+/;

function parse(text, guideAsIndent) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  // 공백 들여쓰기 단위 추정: 0이 아닌 최소 앞 공백 수 (최대 4)
  let unit = 0;
  for (const l of lines) {
    const m = l.match(/^( +)\S/);
    if (m && !/^ *(ㄴ|l |\|)/.test(l)) unit = unit ? Math.min(unit, m[1].length) : m[1].length;
  }
  unit = Math.min(unit || 2, 4);

  const root = { text: '', children: [], depth: -1 };
  const stack = [root];
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
    let body = raw.slice(i).replace(/\s+$/, '');
    body = body.replace(BULLET, '');
    depth = Math.min(depth, prev + 1);
    prev = depth;
    const node = { text: body, children: [], depth };
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

// ---------- 출력 ----------
function walk(nodes, fn, path = []) {
  nodes.forEach((n, i) => { const p = [...path, i + 1]; fn(n, p); walk(n.children, fn, p); });
}
function serialize(root, kind) {
  const out = [];
  walk(root.children, (n, p) => {
    const d = p.length - 1;
    if (kind === 'tab') out.push('\t'.repeat(d) + n.text);
    else if (kind === 'md') out.push('  '.repeat(d) + '- ' + n.text);
    else if (kind === 'ㄴ') out.push((d ? 'ㄴ'.repeat(d) : '') + n.text);
    else if (kind === 'num') out.push(p.join('.') + '. ' + n.text);
  });
  return out.join('\n');
}

// ---------- 렌더 ----------
function count(n) { return n.children.reduce((s, c) => s + 1 + count(c), 0); }
function render(nodes, ul) {
  for (const n of nodes) {
    const li = document.createElement('li');
    const row = document.createElement('div'); row.className = 'node';
    const t = document.createElement('button');
    t.className = 'tog' + (n.children.length ? '' : ' leaf'); t.textContent = '▾';
    t.onclick = () => { li.classList.toggle('closed'); t.textContent = li.classList.contains('closed') ? '▸' : '▾'; };
    const s = document.createElement('span'); s.className = 'txt'; s.textContent = n.text;
    row.append(t, s);
    if (n.children.length) {
      const c = document.createElement('span'); c.className = 'cnt'; c.textContent = count(n); row.append(c);
    }
    li.append(row);
    if (n.children.length) { const sub = document.createElement('ul'); render(n.children, sub); li.append(sub); }
    ul.append(li);
  }
}
let model = { children: [] };
function update() {
  model = parse(src.value, $('optL').checked);
  tree.innerHTML = ''; render(model.children, tree);
  let n = 0, maxD = 0; walk(model.children, (_, p) => { n++; maxD = Math.max(maxD, p.length); });
  $('stat').textContent = n ? `${n}개 항목 · ${maxD}단계` : '';
  try { localStorage.setItem('outline.src', src.value); } catch (e) {}
}
function setOpen(fn) {
  tree.querySelectorAll('li').forEach(li => {
    const closed = !fn(li);
    li.classList.toggle('closed', closed);
    const t = li.querySelector(':scope > .node > .tog'); if (t) t.textContent = closed ? '▸' : '▾';
  });
}
const depthOf = li => { let d = 1; for (let e = li.parentElement; e !== tree; e = e.parentElement) if (e.tagName === 'UL') d++; return d; };

function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1400); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const a = document.createElement('textarea'); a.value = text; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
  toast('복사됨');
}

src.addEventListener('input', update);
$('optL').addEventListener('change', update);
$('clear').onclick = () => { src.value = ''; update(); src.focus(); };
$('sample').onclick = () => { src.value = SAMPLE; update(); };
$('expand').onclick = () => setOpen(() => true);
$('collapse').onclick = () => setOpen(() => false);
document.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => setOpen(li => depthOf(li) < +b.dataset.lv));
document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(serialize(model, b.dataset.copy)));
// 텍스트 영역에서 Tab 키로 들여쓰기 입력
src.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '\t'); }
});

try { src.value = localStorage.getItem('outline.src') || ''; } catch (e) {}
if (!src.value) src.value = SAMPLE;
update();

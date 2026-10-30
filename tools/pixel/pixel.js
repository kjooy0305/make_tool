const $ = id => document.getElementById(id);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const MAX = 64;
const KEY_CUR = 'pixel.cur.v1', KEY_WORKS = 'pixel.works.v1';
const PAL = [
  '#000000', '#3b3b4f', '#6b6b7f', '#9a9aaa', '#c9c9d4', '#ffffff', '#5c3520', '#8a5a33',
  '#c68c5a', '#f2c9a0', '#f6dcc8', '#7a1f2b', '#c4484f', '#ff6b6b', '#ff9f43', '#ffd23f',
  '#fff3a8', '#2f6b2f', '#4f7f33', '#6fa84a', '#a3d977', '#1f4e79', '#2e86de', '#2ee6ff',
  '#3b1f6b', '#7b4fd1', '#c084fc', '#ff3fd0', '#0f3d3e', '#1fa89a', '#b56a1d', '#e0b040',
];

// ---------- 상태 ----------
let W = 32, H = 32, px = new Array(W * H).fill('');
let tool = 'pen', color = '#000000', sym = false, showGrid = true;
const undoS = [], redoS = [];
let drag = null, saveTimer = null;
const cv = $('cv'), ctx = cv.getContext('2d'), pv = $('pv'), pctx = pv.getContext('2d');

function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1600); }
const snap = () => ({ w: W, h: H, px: px.slice() });
function pushUndo() { undoS.push(snap()); if (undoS.length > 100) undoS.shift(); redoS.length = 0; updBtns(); }
function restore(s) { W = s.w; H = s.h; px = s.px.slice(); redraw(); }
function updBtns() { $('undo').disabled = !undoS.length; $('redo').disabled = !redoS.length; }
function undo() { const s = undoS.pop(); if (!s) return; redoS.push(snap()); restore(s); updBtns(); }
function redo() { const s = redoS.pop(); if (!s) return; undoS.push(snap()); restore(s); updBtns(); }

// ---------- 직렬화 ----------
function toJSON(w = W, h = H, p = px) {
  const palette = [...new Set(p.filter(Boolean))];
  const idx = new Map(palette.map((c, i) => [c, i]));
  return { format: 'make_tool-pixel', version: 1, width: w, height: h, palette, pixels: p.map(c => c ? idx.get(c) : -1) };
}
function fromJSON(d) {
  const w = d && d.width, h = d && d.height;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX || h > MAX || !Array.isArray(d.pixels) || d.pixels.length !== w * h) throw new Error('형식이 올바르지 않습니다');
  const ok = c => /^#[0-9a-f]{6}$/i.test(c);
  const pal = Array.isArray(d.palette) ? d.palette : [];
  const p = d.pixels.map(v => typeof v === 'number' ? (pal[v] && ok(pal[v]) ? pal[v].toLowerCase() : '') : (ok(v) ? v.toLowerCase() : ''));
  return { w, h, px: p };
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY_CUR, JSON.stringify(toJSON())); } catch (e) {} }, 300);
}

// ---------- 그리기 ----------
function redraw() {
  const cell = Math.max(4, Math.floor(640 / Math.max(W, H)));
  cv.width = W * cell; cv.height = H * cell;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#e9e9e9' : '#ffffff';
    ctx.fillRect(x * cell, y * cell, cell, cell);
    const c = px[y * W + x];
    if (c) { ctx.fillStyle = c; ctx.fillRect(x * cell, y * cell, cell, cell); }
  }
  if (showGrid && cell >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= W; x++) { ctx.moveTo(x * cell + .5, 0); ctx.lineTo(x * cell + .5, H * cell); }
    for (let y = 0; y <= H; y++) { ctx.moveTo(0, y * cell + .5); ctx.lineTo(W * cell, y * cell + .5); }
    ctx.stroke();
  }
  if (sym) { ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(W * cell / 2, 0); ctx.lineTo(W * cell / 2, H * cell); ctx.stroke(); ctx.setLineDash([]); }
  cv.style.aspectRatio = `${W} / ${H}`;
  // 미리보기 (실제 크기 1:1 픽셀을 정수 배로 확대)
  pv.width = W; pv.height = H;
  const id = pctx.createImageData(W, H);
  px.forEach((c, i) => { if (c) { id.data[i * 4] = parseInt(c.slice(1, 3), 16); id.data[i * 4 + 1] = parseInt(c.slice(3, 5), 16); id.data[i * 4 + 2] = parseInt(c.slice(5, 7), 16); id.data[i * 4 + 3] = 255; } });
  pctx.putImageData(id, 0, 0);
  const sc = Math.max(1, Math.floor(160 / Math.max(W, H)));
  pv.style.width = W * sc + 'px'; pv.style.height = H * sc + 'px';
  $('dim').textContent = `${W}×${H}`;
  document.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', W === H && +b.dataset.size === W));
  persist();
}

// ---------- 도구 ----------
function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  px[y * W + x] = c;
  if (sym) px[y * W + (W - 1 - x)] = c;
}
function lineCells(x0, y0, x1, y1, cb) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cb(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function rectCells(x0, y0, x1, y1, filled, cb) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
  for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (filled || x === a || x === b || y === c || y === d) cb(x, y);
}
function flood(x, y, c) {
  const from = px[y * W + x]; if (from === c) return;
  const st = [[x, y]];
  while (st.length) {
    const [cx, cy] = st.pop();
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || px[cy * W + cx] !== from) continue;
    px[cy * W + cx] = c; st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
function cellOf(e) {
  const r = cv.getBoundingClientRect();
  return [Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) / r.width * W))), Math.max(0, Math.min(H - 1, Math.floor((e.clientY - r.top) / r.height * H)))];
}
function setColor(c) {
  color = c.toLowerCase(); $('color').value = color; $('hex').textContent = color.toUpperCase();
  document.querySelectorAll('.sw').forEach(s => s.setAttribute('aria-pressed', s.dataset.c === color));
}
cv.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  const [x, y] = cellOf(e);
  if (tool === 'pick') {
    const c = px[y * W + x];
    if (c) { setColor(c); if (tool === 'pick') setTool('pen'); } else setTool('eraser');
    return;
  }
  pushUndo();
  drag = { x0: x, y0: y, lx: x, ly: y, base: px.slice() };
  if (tool === 'pen' || tool === 'eraser') setPx(x, y, tool === 'pen' ? color : '');
  else if (tool === 'fill') { flood(x, y, color); drag = null; }
  redraw();
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const [x, y] = cellOf(e);
  if (x === drag.lx && y === drag.ly) return;
  if (tool === 'pen' || tool === 'eraser') {
    const c = tool === 'pen' ? color : '';
    lineCells(drag.lx, drag.ly, x, y, (a, b) => setPx(a, b, c));
  } else {
    px = drag.base.slice();
    if (tool === 'line') lineCells(drag.x0, drag.y0, x, y, (a, b) => setPx(a, b, color));
    else rectCells(drag.x0, drag.y0, x, y, tool === 'rectf', (a, b) => setPx(a, b, color));
  }
  drag.lx = x; drag.ly = y; redraw();
});
const endDrag = () => { drag = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('undo').onclick = undo; $('redo').onclick = redo;
$('sym').onclick = e => { sym = !sym; e.currentTarget.setAttribute('aria-pressed', sym); redraw(); };
$('grid').onclick = e => { showGrid = !showGrid; e.currentTarget.setAttribute('aria-pressed', showGrid); redraw(); };
$('flipH').onclick = () => { pushUndo(); const o = px.slice(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = o[y * W + W - 1 - x]; redraw(); };
$('flipV').onclick = () => { pushUndo(); const o = px.slice(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = o[(H - 1 - y) * W + x]; redraw(); };
$('clear').onclick = () => { pushUndo(); px.fill(''); redraw(); };
document.querySelectorAll('[data-size]').forEach(b => b.onclick = () => {
  const n = +b.dataset.size; if (n === W && n === H) return;
  pushUndo();
  const np = new Array(n * n).fill('');
  for (let y = 0; y < Math.min(H, n); y++) for (let x = 0; x < Math.min(W, n); x++) np[y * n + x] = px[y * W + x];
  W = H = n; px = np; redraw();
  if (n < 64) toast(`${n}×${n}으로 바꿨어요 (넘치는 부분은 잘려요)`);
});
document.addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'color') return;
  if ($('tab-edit').hidden) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const m = { p: 'pen', e: 'eraser', g: 'fill', i: 'pick', l: 'line', r: 'rect' }[k];
    if (m) setTool(m);
  }
});

// ---------- 팔레트 ----------
const pal = $('pal');
function addSwatch(c) {
  const b = el('button', 'sw'); b.dataset.c = c; b.style.background = c; b.title = c; b.type = 'button';
  b.onclick = () => setColor(c); pal.append(b);
}
PAL.forEach(addSwatch);
$('color').addEventListener('input', e => setColor(e.target.value));
$('addColor').onclick = () => { if (!pal.querySelector(`[data-c="${color}"]`)) addSwatch(color); setColor(color); };

// ---------- 불러오기 / 내보내기 ----------
function loadSprite(w, h, p, msg) {
  pushUndo(); W = w; H = h; px = p.slice(); redraw(); showTab('edit'); toast(msg || '불러왔어요');
}
function sheetCanvas(w, h, p, scale) {
  const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
  const x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const col = p[j * w + i]; if (col) { x.fillStyle = col; x.fillRect(i * scale, j * scale, scale, scale); } }
  return c;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = el('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const safeName = s => (s || '').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 30);
function exportPNG(w, h, p, scale, name) {
  sheetCanvas(w, h, p, scale).toBlob(b => { download(b, `${name}_${w}x${h}${scale > 1 ? '_x' + scale : ''}.png`); toast('PNG 저장됨'); });
}
function exportJSON(w, h, p, name) {
  download(new Blob([JSON.stringify(toJSON(w, h, p))], { type: 'application/json' }), `${name}_${w}x${h}.json`); toast('JSON 저장됨');
}
function importFile(f) {
  if (!f) return;
  if (/\.json$/i.test(f.name) || f.type === 'application/json') {
    f.text().then(t => { try { const r = fromJSON(JSON.parse(t)); loadSprite(r.w, r.h, r.px, 'JSON을 가져왔어요'); } catch (e) { toast('JSON 형식이 올바르지 않아요'); } });
    return;
  }
  const url = URL.createObjectURL(f), img = new Image();
  img.onerror = () => { URL.revokeObjectURL(url); toast('이미지를 읽을 수 없어요'); };
  img.onload = () => {
    let w = img.width, h = img.height; const big = Math.max(w, h) > MAX;
    if (big) { const k = MAX / Math.max(w, h); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k)); }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, p = [];
    for (let i = 0; i < w * h; i++) p.push(d[i * 4 + 3] < 128 ? '' : '#' + [0, 1, 2].map(j => d[i * 4 + j].toString(16).padStart(2, '0')).join(''));
    URL.revokeObjectURL(url);
    loadSprite(w, h, p, big ? `${MAX}px 이하로 줄여서 가져왔어요` : '이미지를 가져왔어요');
  };
  img.src = url;
}
$('importBtn').onclick = () => $('file').click();
$('file').onchange = e => { importFile(e.target.files[0]); e.target.value = ''; };
const page = $('page');
['dragenter', 'dragover'].forEach(t => page.addEventListener(t, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); page.classList.add('drop'); } }));
['dragleave', 'drop'].forEach(t => page.addEventListener(t, () => page.classList.remove('drop')));
page.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); importFile(e.dataTransfer.files[0]); } });

// 팝업 메뉴
function closeMenus() {
  document.querySelectorAll('.menu').forEach(m => { m.hidden = true; });
  document.querySelectorAll('[aria-haspopup]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function setupMenu(btnId, menuId, items) { // items: [label, hint, fn]
  const btn = $(btnId), menu = $(menuId);
  items.forEach(([label, hint, fn]) => {
    const it = el('button'); it.type = 'button'; it.innerHTML = `<span>${label}</span><i>${hint}</i>`;
    it.onclick = () => { closeMenus(); fn(); }; menu.append(it);
  });
  btn.onclick = e => {
    e.stopPropagation(); const open = menu.hidden; closeMenus();
    if (open) { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('button').focus(); }
  };
}
document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
const curName = () => safeName($('wname').value) || 'pixel';
setupMenu('exportBtn', 'exportMenu', [
  ['PNG 원본 크기', '1×', () => exportPNG(W, H, px, 1, curName())],
  ['PNG 8배 확대', '8×', () => exportPNG(W, H, px, 8, curName())],
  ['PNG 16배 확대', '16×', () => exportPNG(W, H, px, 16, curName())],
  ['JSON (다시 편집용)', '.json', () => exportJSON(W, H, px, curName())],
]);

// ---------- 내 작품 ----------
const loadWorks = () => { try { return JSON.parse(localStorage.getItem(KEY_WORKS) || '[]'); } catch (e) { return []; } };
function saveWorks(list) { try { localStorage.setItem(KEY_WORKS, JSON.stringify(list)); return true; } catch (e) { toast('저장 공간이 부족해요'); return false; } }
$('saveWork').onclick = () => {
  if (!px.some(Boolean)) return toast('빈 캔버스는 저장할 수 없어요');
  const list = loadWorks();
  list.unshift({ id: Date.now().toString(36), name: safeName($('wname').value) || `작품 ${list.length + 1}`, data: toJSON() });
  if (saveWorks(list)) { toast('내 작품에 저장했어요'); renderWorks(); }
};
function drawThumb(c, w, h, p, css) {
  c.className = 'px'; c.width = w; c.height = h;
  const x = c.getContext('2d'), id = x.createImageData(w, h);
  p.forEach((col, i) => { if (col) { id.data[i * 4] = parseInt(col.slice(1, 3), 16); id.data[i * 4 + 1] = parseInt(col.slice(3, 5), 16); id.data[i * 4 + 2] = parseInt(col.slice(5, 7), 16); id.data[i * 4 + 3] = 255; } });
  x.putImageData(id, 0, 0);
  c.style.width = (w * css) + 'px'; c.style.height = (h * css) + 'px';
}
function renderWorks() {
  const list = loadWorks(), box = $('wgal'); box.textContent = '';
  $('worksCnt').textContent = list.length || '';
  $('wempty').hidden = list.length > 0;
  list.forEach(wk => {
    let r; try { r = fromJSON(wk.data); } catch (e) { return; }
    const card = el('div', 'gcard'), th = el('div', 'thumbs checker'), c = el('canvas');
    drawThumb(c, r.w, r.h, r.px, Math.max(1, Math.floor(128 / Math.max(r.w, r.h)))); th.append(c);
    const h3 = el('h3'); h3.textContent = wk.name;
    const num = el('div', 'num'); num.textContent = `${r.w}×${r.h}`;
    const bar = el('div', 'bar');
    const mk = (t, fn) => { const b = el('button', 'btn small'); b.textContent = t; b.onclick = fn; bar.append(b); };
    mk('편집', () => loadSprite(r.w, r.h, r.px, `"${wk.name}"을 불러왔어요`));
    mk('PNG', () => exportPNG(r.w, r.h, r.px, 1, safeName(wk.name) || 'pixel'));
    mk('삭제', () => { saveWorks(loadWorks().filter(x => x.id !== wk.id)); renderWorks(); toast('삭제했어요'); });
    card.append(th, h3, num, bar); box.append(card);
  });
}

// ---------- 예시 갤러리 ----------
const CATS = { characters: '캐릭터', weapons: '무기', monsters: '몬스터', templates: '기본 틀' };
let cat = 'characters';
const cache = {};
function sprite(item, size) { const k = item.id + size; return cache[k] || (cache[k] = PX.render(item, size)); }
function buildGallery() {
  const items = (window.PX && PX.REG[cat]) || [], box = $('gal'); box.textContent = '';
  $('gempty').hidden = true;
  if (!items.length) { box.append(Object.assign(el('div', 'empty'), { textContent: '아직 준비되지 않았어요.' })); return; }
  items.forEach((it, i) => {
    const card = el('div', 'gcard'); card.dataset.q = [it.name, it.desc, ...(it.tags || [])].join(' ').toLowerCase();
    const th = el('div', 'thumbs checker');
    [32, 16].forEach(n => { const c = el('canvas'); const r = sprite(it, n); drawThumb(c, n, n, r.px, 3); th.append(c); });
    const num = el('div', 'num'); num.textContent = String(i + 1).padStart(2, '0');
    const h3 = el('h3'); h3.textContent = it.name;
    const p = el('p'); p.textContent = it.desc;
    const tags = el('div', 'tags'); (it.tags || []).forEach(t => { const s = el('span', 'tag'); s.textContent = t; tags.append(s); });
    const bar = el('div', 'bar');
    [32, 16].forEach(n => { const b = el('button', 'btn small'); b.textContent = `${n}×${n} 편집`; b.onclick = () => { const r = sprite(it, n); loadSprite(n, n, r.px, `${it.name} ${n}×${n}을 불러왔어요`); }; bar.append(b); });
    card.append(th, num, h3, p, tags, bar); box.append(card);
  });
  filterGallery();
}
function filterGallery() {
  const q = $('gq').value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('#gal .gcard').forEach(c => { const show = !q || c.dataset.q.includes(q); c.hidden = !show; if (show) n++; });
  $('gempty').hidden = n > 0 || !document.querySelector('#gal .gcard');
}
$('gq').addEventListener('input', filterGallery);
function exportSheet(size) {
  const items = PX.REG[cat]; if (!items.length) return toast('내보낼 스프라이트가 없어요');
  const cols = 5, rows = Math.ceil(items.length / cols);
  const c = document.createElement('canvas'); c.width = cols * size; c.height = rows * size;
  const x = c.getContext('2d');
  items.forEach((it, i) => {
    const r = sprite(it, size), ox = (i % cols) * size, oy = Math.floor(i / cols) * size;
    r.px.forEach((col, j) => { if (col) { x.fillStyle = col; x.fillRect(ox + (j % size), oy + Math.floor(j / size), 1, 1); } });
  });
  c.toBlob(b => { download(b, `${cat}_sheet_${size}x${size}.png`); toast('시트 PNG 저장됨'); });
}
setupMenu('sheetBtn', 'sheetMenu', [
  ['16×16 시트', '5열 · 셀 16px', () => exportSheet(16)],
  ['32×32 시트', '5열 · 셀 32px', () => exportSheet(32)],
]);

// ---------- 탭 ----------
function showTab(t) {
  const gal = t in CATS;
  if (gal) cat = t;
  $('tab-edit').hidden = t !== 'edit'; $('tab-gallery').hidden = !gal; $('tab-works').hidden = t !== 'works';
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === t));
  if (gal) buildGallery();
  if (t === 'works') renderWorks();
  closeMenus();
}
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
Object.keys(CATS).forEach(k => { const s = document.querySelector(`[data-cnt="${k}"]`); const n = window.PX && PX.REG[k] ? PX.REG[k].length : 0; if (s && n) s.textContent = n; });

// ---------- 시작 ----------
try {
  const d = JSON.parse(localStorage.getItem(KEY_CUR) || 'null');
  if (d) { const r = fromJSON(d); W = r.w; H = r.h; px = r.px; }
} catch (e) {}
setColor(color); updBtns(); redraw(); renderWorks();

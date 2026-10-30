// 픽셀 스프라이트 엔진. 모든 그림은 32x32 "설계 좌표"로 그리고,
// 16x16 / 32x32 어느 쪽으로든 같은 코드로 찍힌다 (픽셀 중심을 샘플링).
(function (root) {
  const OUT = '#1a1620';

  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
  const lighten = (h, t = .25) => mix(h, '#ffffff', t);
  const darken = (h, t = .25) => mix(h, '#000000', t);

  class Surface {
    constructor(n) {
      this.n = n; this.f = n / 32; this.big = n >= 32;
      this.px = new Array(n * n).fill('');
      this.k = 1; this.ax = 16; this.ay = 31;
    }
    // 이후 그리는 모든 도형을 (ax,ay) 기준으로 k배 축소/확대 (아이, 드워프 등)
    xform(k = 1, ax = 16, ay = 31) { this.k = k; this.ax = ax; this.ay = ay; return this; }
    _fill(test, c) {
      const { n, f, k, ax, ay } = this;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const sx = (x + .5) / f, sy = (y + .5) / f;
        if (test(ax + (sx - ax) / k, ay + (sy - ay) / k)) this.px[y * n + x] = c;
      }
      return this;
    }
    // c 가 '' 이면 지우개
    rect(x, y, w, h, c) { return this._fill((u, v) => u >= x && u < x + w && v >= y && v < y + h, c); }
    dot(x, y, c) { return this.rect(x, y, 1, 1, c); }
    ell(cx, cy, rx, ry, c) { return this._fill((u, v) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1, c); }
    line(x0, y0, x1, y1, c, t = 1.6) {
      const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
      return this._fill((u, v) => {
        let s = ((u - x0) * dx + (v - y0) * dy) / L; s = Math.max(0, Math.min(1, s));
        const px = x0 + s * dx - u, py = y0 + s * dy - v;
        return px * px + py * py <= (t / 2) ** 2;
      }, c);
    }
    poly(pts, c) {
      return this._fill((u, v) => {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      }, c);
    }
    // 실제 출력 픽셀 하나를 직접 찍기 (설계 좌표 아님)
    set(x, y, c) { if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.px[y * this.n + x] = c; return this; }
    get(x, y) { return (x < 0 || y < 0 || x >= this.n || y >= this.n) ? '' : this.px[y * this.n + x]; }
    flipX() {
      const n = this.n, o = this.px.slice();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) this.px[y * n + x] = o[y * n + (n - 1 - x)];
      return this;
    }
    // 불투명 픽셀 바깥 4방향에 윤곽선.
    // c === 'sel' 이면 일본식 도트처럼 "안쪽 색을 어둡게 한" 색 윤곽선 (이웃 중 가장 어두운 색을 70% 어둡게)
    outline(c = OUT) {
      const n = this.n, o = this.px.slice();
      const lum = h => { const [r, g, b] = hex2rgb(h); return r * .3 + g * .59 + b * .11; };
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (o[y * n + x]) continue;
        const nb = [x > 0 && o[y * n + x - 1], x < n - 1 && o[y * n + x + 1], y > 0 && o[(y - 1) * n + x], y < n - 1 && o[(y + 1) * n + x]].filter(Boolean);
        if (!nb.length) continue;
        if (c === 'sel') { const d = nb.reduce((a, b) => lum(b) < lum(a) ? b : a); this.px[y * n + x] = mix(d, OUT, .7); }
        else this.px[y * n + x] = c;
      }
      return this;
    }
  }

  const REG = { characters: [], weapons: [], monsters: [], templates: [] };
  // add('characters', id, 이름, 설명, 태그[], (s)=>{ ...그리기... })
  // 7번째 인자 opts: { outline: 'solid' | '#rrggbb' } (기본은 색 윤곽선 'sel')
  function add(cat, id, name, desc, tags, draw, opts = {}) { REG[cat].push({ cat, id, name, desc, tags, draw, ...opts }); }
  function render(item, size) {
    const s = new Surface(size);
    item.draw(s);
    s.xform(1).outline(item.outline === 'solid' ? OUT : (item.outline || 'sel')); // item.outline = '#rrggbb' 로 고정 윤곽선, 'solid' 는 검정
    return { w: size, h: size, px: s.px };
  }
  root.PX = { Surface, REG, add, render, OUT, mix, lighten, darken };
})(typeof window !== 'undefined' ? window : globalThis);

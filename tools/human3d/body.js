/* 사람 몸 생성기: 뼈대 → 모양(SDF, 부드럽게 이어 붙이는 거리장) → 표면 뽑기(Surface Nets) → 매끄럽게 → 스킨 가중치.
   기준 비율은 ref.js(Blender 사람 메타리그에서 읽은 숫자)이고, 나머지는 이 파일에서 직접 만든 계산이다. */
(function (root) {
  'use strict';
  var REF = root.REF || (typeof require !== 'undefined' ? (function () { var w = {}; global.window = w; require('./ref.js'); return w.REF; })() : null);
  var D2R = Math.PI / 180;
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function smin(a, b, k) { var h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { return -smin(-a, -b, k); }

  /* ---------- 조절 값 ---------- */
  // [키, 이름, 최소, 최대, 기본, 간격, 묶음]
  var PARAMS = [
    ['height', '키(m)', 0.9, 2.4, 1.75, 0.01, '전체'], ['fat', '살집', -1, 1, 0, 0.01, '전체'], ['muscle', '근육', 0, 1, 0.2, 0.01, '전체'], ['gender', '남성↔여성', -1, 1, 0, 0.01, '전체'],
    ['shoulderW', '어깨 너비', 0.6, 1.5, 1, 0.01, '몸통'], ['chestW', '가슴 너비', 0.7, 1.4, 1, 0.01, '몸통'], ['chestD', '가슴 두께', 0.7, 1.5, 1, 0.01, '몸통'], ['waistW', '허리 너비', 0.6, 1.6, 1, 0.01, '몸통'],
    ['hipW', '엉덩이 너비', 0.6, 1.6, 1, 0.01, '몸통'], ['torsoLen', '상체 길이', 0.7, 1.4, 1, 0.01, '몸통'], ['bust', '가슴(볼륨)', 0, 1.5, 0.1, 0.01, '몸통'], ['belly', '배', 0, 1.6, 0.2, 0.01, '몸통'], ['butt', '엉덩이(볼륨)', 0.5, 1.8, 1, 0.01, '몸통'],
    ['neckLen', '목 길이', 0.4, 2, 1, 0.01, '목·머리'], ['neckThick', '목 굵기', 0.6, 1.6, 1, 0.01, '목·머리'], ['headSize', '머리 크기', 0.6, 1.8, 1, 0.01, '목·머리'], ['headW', '머리 너비', 0.8, 1.25, 1, 0.01, '목·머리'], ['headD', '머리 깊이', 0.8, 1.25, 1, 0.01, '목·머리'],
    ['upperArmLen', '위팔 길이', 0.6, 1.6, 1, 0.01, '팔'], ['forearmLen', '아래팔 길이', 0.6, 1.6, 1, 0.01, '팔'], ['armThick', '팔 굵기', 0.5, 1.8, 1, 0.01, '팔'], ['handSize', '손 크기', 0.6, 1.6, 1, 0.01, '팔'], ['fingerLen', '손가락 길이', 0.7, 1.4, 1, 0.01, '팔'], ['armAngle', '팔 벌림(도)', 4, 70, 18, 1, '팔'],
    ['thighLen', '허벅지 길이', 0.6, 1.5, 1, 0.01, '다리'], ['shinLen', '종아리 길이', 0.6, 1.5, 1, 0.01, '다리'], ['thighThick', '허벅지 굵기', 0.5, 1.8, 1, 0.01, '다리'], ['calfThick', '종아리 굵기', 0.5, 1.8, 1, 0.01, '다리'], ['footSize', '발 크기', 0.6, 1.5, 1, 0.01, '다리'], ['legGap', '다리 벌림(도)', 0, 30, 3, 1, '다리'],
    ['jawW', '턱 너비', 0.7, 1.4, 1, 0.01, '얼굴'], ['chin', '턱 길이', 0.5, 1.8, 1, 0.01, '얼굴'], ['cheek', '볼 살', 0.4, 1.8, 1, 0.01, '얼굴'], ['browRidge', '눈썹 뼈', 0, 2, 1, 0.01, '얼굴'], ['forehead', '이마 튀어나옴', 0.7, 1.4, 1, 0.01, '얼굴'],
    ['eyeSize', '눈 크기', 0.5, 1.8, 1, 0.01, '얼굴'], ['eyeSpace', '눈 간격', 0.7, 1.4, 1, 0.01, '얼굴'], ['eyeHeight', '눈 높이', -0.015, 0.015, 0, 0.001, '얼굴'],
    ['noseLen', '코 길이', 0.5, 1.8, 1, 0.01, '얼굴'], ['noseW', '코 너비', 0.5, 1.8, 1, 0.01, '얼굴'], ['mouthW', '입 너비', 0.6, 1.5, 1, 0.01, '얼굴'], ['lipThick', '입술 두께', 0.4, 2, 1, 0.01, '얼굴'], ['earSize', '귀 크기', 0.5, 1.8, 1, 0.01, '얼굴']
  ];
  var PBY = {}; PARAMS.forEach(function (d) { PBY[d[0]] = d; });
  function defaults() { var o = {}; PARAMS.forEach(function (d) { o[d[0]] = d[4]; }); o.skin = '#e8b996'; o.lip = '#c8736f'; return o; }
  var PRESETS = {
    '기본 남성': { gender: -0.6, muscle: 0.3, fat: 0.0, bust: 0, belly: 0.2 },
    '기본 여성': { gender: 0.8, muscle: 0.1, bust: 0.7, belly: 0.1, butt: 1.15, height: 1.65 },
    '근육질': { gender: -0.8, muscle: 1, fat: -0.1, shoulderW: 1.15, chestW: 1.15, armThick: 1.25, thighThick: 1.2, bust: 0, belly: 0, neckThick: 1.3 },
    '통통': { fat: 0.85, belly: 1.2, muscle: 0, butt: 1.3 },
    '마른': { fat: -0.85, muscle: 0, belly: 0, bust: 0.05 },
    '어린이': { height: 1.2, headSize: 1.25, headW: 1.05, handSize: 0.85, footSize: 0.85, legGap: 2, muscle: 0, belly: 0.3, bust: 0, gender: 0, neckLen: 0.8, eyeSize: 1.25, cheek: 1.3, chin: 0.7, noseLen: 0.7 },
    '치비(4등신)': { height: 1.05, headSize: 1.75, thighLen: 0.7, shinLen: 0.7, upperArmLen: 0.75, forearmLen: 0.75, torsoLen: 0.85, neckLen: 0.5, eyeSize: 1.5, cheek: 1.5, chin: 0.6, noseLen: 0.5, belly: 0.4, fat: 0.3, handSize: 0.9, footSize: 0.9 },
    '거인': { height: 2.3, shoulderW: 1.2, muscle: 0.7, armThick: 1.2, thighThick: 1.2, jawW: 1.15, browRidge: 1.4 },
    '모델 체형(여)': { height: 1.78, gender: 1, bust: 0.35, belly: 0, waistW: 0.85, hipW: 1.05, thighLen: 1.1, shinLen: 1.1, neckLen: 1.2, fat: -0.4 }
  };

  /* ---------- 뼈대 ---------- */
  var PARENT = { Spine: 'Hips', Chest: 'Spine', UpperChest: 'Chest', Neck: 'UpperChest', Neck2: 'Neck', Head: 'Neck2' };
  var FING = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
  var ORDER = ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck', 'Neck2', 'Head'];
  ['L', 'R'].forEach(function (s) {
    var P = function (n, p) { PARENT[n + s] = p.indexOf('$') >= 0 ? p.replace('$', s) : p; ORDER.push(n + s); };
    P('Shoulder', 'UpperChest'); P('UpperArm', 'Shoulder$'); P('LowerArm', 'UpperArm$'); P('Hand', 'LowerArm$');
    FING.forEach(function (f) { for (var i = 1; i <= 3; i++) P(f + i, i === 1 ? 'Hand$' : f + (i - 1) + '$'); });
    P('UpperLeg', 'Hips'); P('LowerLeg', 'UpperLeg$'); P('Foot', 'LowerLeg$'); P('Toes', 'Foot$');
  });
  var BONE_KO = { Hips: '골반', Spine: '허리', Chest: '가슴', UpperChest: '윗가슴', Neck: '목', Neck2: '목 윗부분', Head: '머리', Shoulder: '쇄골', UpperArm: '위팔', LowerArm: '아래팔', Hand: '손', UpperLeg: '허벅지', LowerLeg: '종아리', Foot: '발', Toes: '발가락' };
  var FKO = { Thumb: '엄지', Index: '검지', Middle: '중지', Ring: '약지', Little: '새끼' };
  function boneKo(n) {
    var s = /L$/.test(n) ? '왼쪽 ' : /R$/.test(n) ? '오른쪽 ' : '', b = s ? n.slice(0, -1) : n, m = b.match(/^(Thumb|Index|Middle|Ring|Little)(\d)$/);
    return s + (m ? FKO[m[1]] + ' ' + m[2] + '마디' : (BONE_KO[b] || b));
  }
  var mirror = function (n) { return /L$/.test(n) ? n.slice(0, -1) + 'R' : /R$/.test(n) ? n.slice(0, -1) + 'L' : null; };

  // 기준 위치 + 길이 계수 → 월드 위치
  function skeleton(p) {
    var T = REF, W = {}, v = function (a) { return [a[0], a[1], a[2]]; };
    function fac(n) { // 부모 → 이 관절 변위에 곱하는 [x,y,z]
      var s = n.slice(-1), b = n.slice(0, -1), one = [1, 1, 1];
      if (n === 'Spine' || n === 'Chest' || n === 'UpperChest' || n === 'Neck') { var t = p.torsoLen; return [t, t, t]; }
      if (n === 'Neck2' || n === 'Head') { var q = p.neckLen; return [q, q, q]; }
      if (b === 'Shoulder') return [p.shoulderW, 1, 1];
      if (b === 'UpperArm') return [p.shoulderW, 1, 1];
      if (b === 'LowerArm') { var a = p.upperArmLen; return [a, a, a]; }
      if (b === 'Hand') { var f = p.forearmLen; return [f, f, f]; }
      var m = b.match(/^(Thumb|Index|Middle|Ring|Little)(\d)$/);
      if (m) { var h = p.handSize * (m[2] === '1' ? 1 : p.fingerLen); return [h, h, h]; }
      if (b === 'UpperLeg') return [p.hipW, 1, 1];
      if (b === 'LowerLeg') { var th = p.thighLen; return [th, th, th]; }
      if (b === 'Foot') { var sh = p.shinLen; return [sh, sh, sh]; }
      if (b === 'Toes') { var fo = p.footSize; return [fo, fo, fo]; }
      return one;
    }
    W.Hips = v(T.Hips);
    ORDER.forEach(function (n) {
      if (n === 'Hips') return;
      var par = PARENT[n], f = fac(n), t0 = T[n], t1 = T[par];
      W[n] = [W[par][0] + (t0[0] - t1[0]) * f[0], W[par][1] + (t0[1] - t1[1]) * f[1], W[par][2] + (t0[2] - t1[2]) * f[2]];
    });
    // 끝점들(뼈는 아니지만 모양에 필요): 머리 꼭대기, 손가락 끝, 발끝, 발뒤꿈치 ...
    function endOf(n, tmpl, parentName, fct) { var t0 = T[tmpl], t1 = T[parentName], f = fct; W[n] = [W[parentName][0] + (t0[0] - t1[0]) * f, W[parentName][1] + (t0[1] - t1[1]) * f, W[parentName][2] + (t0[2] - t1[2]) * f]; }
    endOf('HeadTop', 'HeadTop', 'Head', p.neckLen * 0); // 나중에 머리 크기로 다시 계산
    ['L', 'R'].forEach(function (s) {
      FING.forEach(function (f) { endOf(f + '4' + s, f + '4' + s, f + '3' + s, p.handSize * p.fingerLen); });
      endOf('ToesEnd' + s, 'ToesEnd' + s, 'Toes' + s, p.footSize);
      endOf('HeelPt' + s, 'Heel' + s, 'Foot' + s, p.footSize);
      endOf('ShoulderTip' + s, 'ShoulderTip' + s, 'Shoulder' + s, 1); W['ShoulderTip' + s][0] = W['Shoulder' + s][0] + (T['ShoulderTip' + s][0] - T['Shoulder' + s][0]) * p.shoulderW;
      for (var i = 1; i <= 4; i++) endOf('Palm' + i + s, 'Palm' + i + s, 'Hand' + s, p.handSize);
      endOf('HandEnd' + s, 'HandEnd' + s, 'Hand' + s, p.handSize);
    });
    // 팔 벌림 각도: 팔 전체를 어깨 관절을 축으로 돌려 세로 기준 각도로 맞춘다
    ['L', 'R'].forEach(function (s) {
      var sg = s === 'L' ? 1 : -1, piv = W['UpperArm' + s].slice(), vec = [W['Hand' + s][0] - piv[0], W['Hand' + s][1] - piv[1]];
      var ang = Math.atan2(Math.abs(vec[0]), -vec[1]), th = (p.armAngle * D2R - ang) * sg, c = Math.cos(th), sn = Math.sin(th);
      var sub = function (n) { var a = n; while (a) { if (a === 'UpperArm' + s) return true; a = PARENT[a]; } return false; };
      Object.keys(W).forEach(function (n) {
        if (n.slice(-1) !== s || n === 'Shoulder' + s || n === 'ShoulderTip' + s) return;
        if (n === 'UpperArm' + s) return;
        var b = n.slice(0, -1); if (!(sub(n) || /^(HandEnd|Palm\d|(Thumb|Index|Middle|Ring|Little)4)$/.test(b))) return;
        var dx = W[n][0] - piv[0], dy = W[n][1] - piv[1]; W[n][0] = piv[0] + dx * c - dy * sn; W[n][1] = piv[1] + dx * sn + dy * c;
      });
    });
    // 다리 벌림
    ['L', 'R'].forEach(function (s) {
      var sg = s === 'L' ? 1 : -1, piv = W['UpperLeg' + s].slice(), th = -p.legGap * D2R * sg, c = Math.cos(th), sn = Math.sin(th);
      var inLeg = function (n) { var a = n; while (a) { if (a === 'UpperLeg' + s) return true; a = PARENT[a]; } return false; };
      Object.keys(W).forEach(function (n) {
        if (n.slice(-1) !== s || n === 'UpperLeg' + s) return;
        var b = n.slice(0, -1); if (!(inLeg(n) || /^(ToesEnd|HeelPt)$/.test(b))) return;
        var dx = W[n][0] - piv[0], dy = W[n][1] - piv[1]; W[n][0] = piv[0] + dx * c - dy * sn; W[n][1] = piv[1] + dx * sn + dy * c;
      });
    });
    // 머리: 머리 크기에 맞춰 꼭대기 위치
    var hsz = p.headSize; W.HeadTop = [W.Head[0], W.Head[1] + (T.HeadTop[1] - T.Head[1]) * hsz, W.Head[2] + (T.HeadTop[2] - T.Head[2]) * hsz];
    // 바닥에 맞추기, 키에 맞추기
    var ground = Math.min(W.HeelPtL[1], W.HeelPtR[1], W.ToesEndL[1] - 0.0167 * p.footSize, W.ToesL[1] - 0.0167 * p.footSize);
    Object.keys(W).forEach(function (n) { W[n][1] -= ground; });
    var s = p.height / W.HeadTop[1];
    Object.keys(W).forEach(function (n) { W[n][0] *= s; W[n][1] *= s; W[n][2] *= s; });
    return { W: W, s: s };
  }

  /* ---------- 모양(프리미티브) ---------- */
  function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function mkCap(A, B, r0, r1, bone, g, cz) {
    var d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1e-6, u = [d[0] / len, d[1] / len, d[2] / len];
    var e1 = cross(u, [0, 0, 1]); if (Math.abs(e1[0]) + Math.abs(e1[1]) + Math.abs(e1[2]) < 1e-3) e1 = cross(u, [1, 0, 0]); e1 = norm(e1); var e2 = norm(cross(u, e1));
    return { t: 0, ax: A[0], ay: A[1], az: A[2], dx: u[0], dy: u[1], dz: u[2], len: len, e1x: e1[0], e1y: e1[1], e1z: e1[2], e2x: e2[0], e2y: e2[1], e2z: e2[2], a0: r0[0], b0: r0[1], a1: r1[0], b1: r1[1], bone: bone, g: g || 0,
      mr: Math.max(r0[0], r0[1], r1[0], r1[1]) };
  }
  function mkEll(c, r, bone, g) { var mn = Math.min(r[0], r[1], r[2]); return { t: 1, cx: c[0], cy: c[1], cz: c[2], rx: r[0], ry: r[1], rz: r[2], rmin: mn, bone: bone, g: g || 0, mr: Math.max(r[0], r[1], r[2]) }; }
  function dCap(q, x, y, z) {
    var px = x - q.ax, py = y - q.ay, pz = z - q.az, t = px * q.dx + py * q.dy + pz * q.dz, tt = t / q.len, tc = tt < 0 ? 0 : tt > 1 ? 1 : tt;
    var vx = px - q.dx * tc * q.len, vy = py - q.dy * tc * q.len, vz = pz - q.dz * tc * q.len;
    var c1 = vx * q.e1x + vy * q.e1y + vz * q.e1z, c2 = vx * q.e2x + vy * q.e2y + vz * q.e2z, a = q.a0 + (q.a1 - q.a0) * tc, b = q.b0 + (q.b1 - q.b0) * tc;
    var k = Math.sqrt((c1 / a) * (c1 / a) + (c2 / b) * (c2 / b)), rm = a < b ? a : b, rr = k * rm, ax = tt < 0 ? -t : tt > 1 ? t - q.len : 0;
    return Math.sqrt(rr * rr + ax * ax) - rm;
  }
  function dEll(q, x, y, z) {
    var ux = (x - q.cx) / q.rx, uy = (y - q.cy) / q.ry, uz = (z - q.cz) / q.rz, k0 = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1e-9;
    var wx = ux / q.rx, wy = uy / q.ry, wz = uz / q.rz, k1 = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1e-9;
    return k0 * (k0 - 1) / k1;
  }
  var dPrim = function (q, x, y, z) { return q.t === 0 ? dCap(q, x, y, z) : dEll(q, x, y, z); };

  // 몸 전체의 프리미티브 목록과 몇 가지 얼굴 정보를 만든다.
  function bodyPrims(p, sk) {
    var W = sk.W, s = sk.s, R = REF, prims = [], cuts = [], face = {};
    var sc = function (a) { return [a[0] * s, a[1] * s, a[2] * s]; };
    var fat = p.fat, F = fat >= 0 ? 1 + 0.28 * fat : 1 + 0.16 * fat, Fh = fat >= 0 ? 1 + 0.45 * fat : 1 + 0.22 * fat, M = p.muscle, g = p.gender;
    var armM = (1 + 0.22 * M) * (1 - 0.05 * g) * F, legM = (1 + 0.16 * M) * F, chestM = (1 + 0.1 * M), shM = 1 + 0.2 * M;
    var cap = function (A, B, r0, r1, bone, grp) { prims.push(mkCap(A, B, [r0[0] * s, r0[1] * s], [r1[0] * s, r1[1] * s], bone, grp)); };
    var ell = function (c, r, bone, grp) { prims.push(mkEll(c, [r[0] * s, r[1] * s, r[2] * s], bone, grp)); };
    var hs = p.headSize, hipG = 1 + 0.1 * g, shG = 1 - 0.08 * g, waistG = 1 - 0.1 * g;
    /* 몸통: y 높이별 단면(반너비 a, 반깊이 b) 표 */
    var spineZ = function (yy) { // 기준 좌표계의 중심선 z (W 기준을 s로 되돌려서 보간)
      var pts = [['Hips', 0], ['Spine', 0], ['Chest', 0], ['UpperChest', 0], ['Neck', 0]], ys = [], zs = [];
      for (var i = 0; i < pts.length; i++) { ys.push(W[pts[i][0]][1]); zs.push(W[pts[i][0]][2]); }
      if (yy <= ys[0]) return zs[0]; for (i = 1; i < ys.length; i++) if (yy <= ys[i]) { var t = (yy - ys[i - 1]) / (ys[i] - ys[i - 1]); return zs[i - 1] + (zs[i] - zs[i - 1]) * t; } return zs[ys.length - 1];
    };
    // 기준 높이(1.98m 좌표) → 이 몸의 높이로 바꾸기: 관절 y 를 기준으로 비례 매핑
    var jy = ['Hips', 'Spine', 'Chest', 'UpperChest', 'Neck'].map(function (n) { return [R[n][1], W[n][1]]; });
    var mapY = function (y) { for (var i = 1; i < jy.length; i++) if (y <= jy[i][0] || i === jy.length - 1) { var t = (y - jy[i - 1][0]) / (jy[i][0] - jy[i - 1][0]); return jy[i - 1][1] + (jy[i][1] - jy[i - 1][1]) * t; } };
    var st = [ // [기준 y, a, b, 뼈]
      [0.985, 0.150 * p.hipW * hipG * Fh, 0.105 * Fh, 'Hips'], [1.05, 0.165 * p.hipW * hipG * Fh, 0.112 * Fh, 'Hips'], [1.17, 0.130 * p.waistW * waistG * F * (1 + 0.1 * (p.belly - 0.2)), 0.092 * F, 'Spine'],
      [1.29, 0.143 * p.chestW * chestM * F, 0.098 * p.chestD * F, 'Chest'], [1.40, 0.158 * p.chestW * chestM * F, 0.106 * p.chestD * F, 'UpperChest'], [1.50, 0.170 * p.chestW * chestM * shG * F, 0.112 * p.chestD * F, 'UpperChest'],
      [1.585, 0.158 * p.shoulderW * shM * shG, 0.100 * p.chestD, 'UpperChest'], [1.64, 0.085 * p.neckThick, 0.075 * p.neckThick, 'UpperChest']
    ];
    var pts = st.map(function (r) { var y = mapY(r[0]); return [0, y, spineZ(y) + (r[0] < 1.1 ? 0.0 : 0.0)]; });
    for (var i = 0; i < st.length - 1; i++) {
      var r0 = st[i], r1 = st[i + 1], A = pts[i], B = pts[i + 1];
      prims.push(mkCap(A, B, [r0[1] * s, r0[2] * s], [r1[1] * s, r1[2] * s], r0[3], 0));
    }
    // 배·엉덩이·가슴
    var hip = W.Hips, bs = Math.max(0.0, p.belly);
    ell([0, mapY(1.13), spineZ(mapY(1.13)) + 0.062 * s], [0.108 * s * (0.6 + 0.4 * bs) * Fh, 0.1 * s, (0.04 + 0.05 * bs) * s * Fh], 'Spine', 0);
    ['L', 'R'].forEach(function (S) {
      var sg = S === 'L' ? 1 : -1, bu = clamp(p.bust + Math.max(g, 0) * 0.5, 0, 2.2);
      var bc = [(R['Breast' + S][0] * 0.95) * s, mapY(R['Breast' + S][1]), (R['Breast' + S][2] * 0.4 + R['BreastTip' + S][2] * 0.6) * s];
      bc[1] = mapY(1.455);
      ell(bc, [(0.035 + 0.042 * bu) * s, (0.03 + 0.045 * bu) * s, (0.025 + 0.035 * bu) * s], 'UpperChest', 0);
      ell([sg * 0.055 * p.hipW * s, mapY(0.99), hip[2] - 0.040 * s], [0.075 * p.butt * s * Fh, 0.082 * s * Math.sqrt(p.butt) * Fh, 0.072 * p.butt * s * Fh], 'Hips', 0);
    });
    // 목 + 승모근
    cap(W.Neck, W.Head, [0.052 * p.neckThick * (1 + 0.15 * M), 0.050 * p.neckThick], [0.047 * p.neckThick, 0.047 * p.neckThick], 'Neck', 0);
    prims[prims.length - 1] = mkCap([W.Neck[0], W.Neck[1], W.Neck[2]], [W.Head[0], W.Head[1] + 0.012 * s, W.Head[2]], [0.052 * p.neckThick * (1 + 0.15 * M) * s, 0.05 * p.neckThick * s], [0.047 * p.neckThick * s, 0.047 * p.neckThick * s], 'Neck', 0);
    ['L', 'R'].forEach(function (S) {
      var tip = W['ShoulderTip' + S], ua = W['UpperArm' + S], la = W['LowerArm' + S], ha = W['Hand' + S], tcv = [W.Neck[0], W.Neck[1] - 0.02 * s, W.Neck[2] + 0.005 * s];
      prims.push(mkCap(tcv, ua, [0.05 * s * shM, 0.042 * s], [0.05 * s * shM, 0.05 * s], 'UpperChest', 0));
      ell(ua, [0.062 * s * shM * armM, 0.064 * s * shM * armM, 0.060 * s * shM * armM], 'UpperArm' + S, 0);
      cap(ua, la, [0.052 * armM * p.armThick, 0.05 * armM * p.armThick], [0.040 * armM * p.armThick, 0.038 * armM * p.armThick], 'UpperArm' + S, 0);
      cap(la, ha, [0.040 * armM * p.armThick, 0.036 * armM * p.armThick], [0.027 * p.armThick * (1 + 0.1 * M), 0.024 * p.armThick], 'LowerArm' + S, 0);
      // 손바닥
      var hs2 = p.handSize, knuck = [(W['Index1' + S][0] + W['Little1' + S][0]) / 2, (W['Index1' + S][1] + W['Little1' + S][1]) / 2, (W['Index1' + S][2] + W['Little1' + S][2]) / 2];
      prims.push(mkCap(ha, knuck, [0.016 * s * hs2, 0.040 * s * hs2], [0.015 * s * hs2, 0.043 * s * hs2], 'Hand' + S, 0));
      prims.push(mkCap(W['Index1' + S], W['Little1' + S], [0.0135 * s * hs2, 0.0135 * s * hs2], [0.0135 * s * hs2, 0.0135 * s * hs2], 'Hand' + S, 0));
      // 손가락
      FING.forEach(function (f) {
        var th = f === 'Thumb';
        for (var k = 1; k <= 3; k++) {
          var r0 = (th ? 0.0125 : 0.0105) * (1 - (k - 1) * 0.1) * hs2 * s, r1 = (th ? 0.0108 : 0.0085) * (1 - (k - 1) * 0.12) * hs2 * s;
          prims.push(mkCap(W[f + k + S], W[f + (k + 1) + S] || W[f + 3 + S], [r0, r0], [r1, r1], f + k + S, 1));
        }
      });
      // 다리
      var ul = W['UpperLeg' + S], ll = W['LowerLeg' + S], ft = W['Foot' + S], ts = W['Toes' + S], te = W['ToesEnd' + S], hl = W['HeelPt' + S], sg = S === 'L' ? 1 : -1;
      cap(ul, ll, [0.094 * legM * p.thighThick * Fh / F, 0.092 * legM * p.thighThick * Fh / F], [0.058 * legM * p.thighThick, 0.058 * legM * p.thighThick], 'UpperLeg' + S, 0);
      cap(ll, ft, [0.056 * legM * p.calfThick, 0.056 * legM * p.calfThick], [0.033 * p.calfThick, 0.034 * p.calfThick], 'LowerLeg' + S, 0);
      ell([lerp(ll[0], ft[0], 0.3), lerp(ll[1], ft[1], 0.3), lerp(ll[2], ft[2], 0.3) - 0.022 * s], [0.052 * s * legM * p.calfThick, 0.07 * s, 0.058 * s * legM * p.calfThick], 'LowerLeg' + S, 0);
      var fz = p.footSize;
      cap(ft, ts, [0.040 * fz * s, 0.034 * fz * s], [0.040 * fz * s, 0.022 * fz * s], 'Foot' + S, 0);
      ell([hl[0], hl[1] + 0.035 * s * fz, hl[2] + 0.005 * s], [0.036 * s * fz, 0.04 * s * fz, 0.042 * s * fz], 'Foot' + S, 0);
      cap(ts, te, [0.038 * fz * s, 0.015 * fz * s], [0.034 * fz * s, 0.011 * fz * s], 'Toes' + S, 0);
    });
    /* 머리와 얼굴: 머리 관절 기준으로 머리 크기만큼 늘린다 */
    var H = W.Head, hz = function (a) { return [H[0] + (a[0] - R.Head[0]) * hs * s * (a[0] === 0 ? 1 : 1) * 1, H[1] + (a[1] - R.Head[1]) * hs * s, H[2] + (a[2] - R.Head[2]) * hs * s]; };
    var hv = function (a) { return hz(a); }; // 기준 좌표 → 이 몸의 머리 좌표
    var skull = [0.088 * p.headW * hs * s, 0.108 * hs * s, 0.105 * p.headD * hs * s];
    var ellA = function (c, r, g) { prims.push(mkEll(c, r, 'Head', g)); };
    ellA(hv([0, 1.875, 0.025]), skull, 2);
    ellA(hv([0, 1.805, 0.04 + (p.headD - 1) * 0.05]), [0.071 * p.jawW * p.headW * hs * s * (1 - 0.08 * g), 0.07 * hs * s, 0.084 * p.headD * hs * s], 2);
    ellA(hv([0, 1.745, 0.104]), [0.022 * p.jawW * hs * s, 0.02 * p.chin * hs * s, 0.02 * hs * s], 2);
    ['L', 'R'].forEach(function (S) {
      var sg = S === 'L' ? 1 : -1;
      ellA(hv([sg * 0.056 * p.headW, 1.832, 0.098]), [0.027 * p.cheek * hs * s, 0.025 * hs * s, 0.022 * p.cheek * hs * s], 2);
      ellA(hv([sg * (0.092 * p.headW + 0.004), 1.868, 0.022]), [0.011 * hs * s * p.earSize, 0.034 * hs * s * p.earSize, 0.024 * hs * s * p.earSize], 2);
      prims.push(mkCap(hv([sg * 0.078 * p.headW, 1.914, 0.074 * p.forehead]), hv([sg * 0.012, 1.922, 0.121 * p.forehead]), [0.0065 * hs * s * p.browRidge * (1 - 0.35 * g), 0.0065 * hs * s * p.browRidge], [0.0072 * hs * s * p.browRidge, 0.0075 * hs * s * p.browRidge], 'Head', 2));
      ellA(hv([sg * 0.015 * p.noseW, 1.844, 0.158]), [0.009 * p.noseW * hs * s, 0.008 * hs * s, 0.008 * hs * s], 2);
      // 눈구멍과 눈알 위치
      var ep = hv([sg * 0.0516 * p.eyeSpace, 1.8941 + p.eyeHeight, 0.124]);
      cuts.push({ c: ep, r: 0.021 * p.eyeSize * hs * s });
      var eb = hv([sg * 0.0516 * p.eyeSpace, 1.8941 + p.eyeHeight, 0.1105]);
      face['eye' + S] = { c: eb, r: 0.0125 * p.eyeSize * hs * s };
    });
    var nb = hv([0, 1.886, 0.128]), nt = hv([0, 1.848 + (1 - p.noseLen) * 0.012, 0.175 + (p.noseLen - 1) * 0.02]);
    prims.push(mkCap(nb, nt, [0.009 * p.noseW * hs * s, 0.009 * hs * s], [0.0125 * p.noseW * hs * s, 0.0125 * hs * s], 'Head', 2));
    var lt = hv([0, 1.812, 0.152]), lb = hv([0, 1.7975, 0.148]), mw = 0.024 * p.mouthW * hs, lp = p.lipThick * hs * s;
    prims.push(mkCap([lt[0] - mw * s, lt[1], lt[2] - 0.018 * s * hs], [lt[0] + mw * s, lt[1], lt[2] - 0.018 * s * hs], [0.0075 * lp, 0.0075 * lp], [0.0075 * lp, 0.0075 * lp], 'Head', 2));
    prims.push(mkCap([lb[0] - mw * 0.85 * s, lb[1], lb[2] - 0.016 * s * hs], [lb[0] + mw * 0.85 * s, lb[1], lb[2] - 0.016 * s * hs], [0.0088 * lp, 0.0088 * lp], [0.0088 * lp, 0.0088 * lp], 'Head', 2));
    face.lipT = lt; face.lipB = lb; face.mouthW = mw * s; face.headC = hv([0, 1.875, 0.025]); face.headR = skull; face.hv = hv;
    face.mouthCut = { c: hv([0, 1.806, 0.172]), r: 0.0042 * hs * s };
    return { prims: prims, cuts: cuts, face: face };
  }

  /* ---------- 거리장 ---------- */
  function makeField(prims, cuts, Ks, cell, margin) {
    var minx = 1e9, miny = 1e9, minz = 1e9, maxx = -1e9, maxy = -1e9, maxz = -1e9, i, pr;
    var boxes = prims.map(function (q) {
      var e = q.mr + margin, b;
      if (q.t === 0) { var bx = [q.ax, q.ax + q.dx * q.len], by = [q.ay, q.ay + q.dy * q.len], bz = [q.az, q.az + q.dz * q.len]; b = [Math.min(bx[0], bx[1]) - e, Math.min(by[0], by[1]) - e, Math.min(bz[0], bz[1]) - e, Math.max(bx[0], bx[1]) + e, Math.max(by[0], by[1]) + e, Math.max(bz[0], bz[1]) + e]; }
      else b = [q.cx - q.mr - margin, q.cy - q.mr - margin, q.cz - q.mr - margin, q.cx + q.mr + margin, q.cy + q.mr + margin, q.cz + q.mr + margin];
      if (b[0] < minx) minx = b[0]; if (b[1] < miny) miny = b[1]; if (b[2] < minz) minz = b[2]; if (b[3] > maxx) maxx = b[3]; if (b[4] > maxy) maxy = b[4]; if (b[5] > maxz) maxz = b[5];
      return b;
    });
    var nx = Math.ceil((maxx - minx) / cell) + 1, ny = Math.ceil((maxy - miny) / cell) + 1, nz = Math.ceil((maxz - minz) / cell) + 1, lists = new Array(nx * ny * nz);
    boxes.forEach(function (b, idx) {
      var x0 = Math.floor((b[0] - minx) / cell), x1 = Math.floor((b[3] - minx) / cell), y0 = Math.floor((b[1] - miny) / cell), y1 = Math.floor((b[4] - miny) / cell), z0 = Math.floor((b[2] - minz) / cell), z1 = Math.floor((b[5] - minz) / cell);
      for (var z = z0; z <= z1; z++) for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { var c = x + nx * (y + ny * z); (lists[c] || (lists[c] = [])).push(idx); }
    });
    var K0 = Ks[0], K1 = Ks[1], K2 = Ks[2], Kc = Ks[3] || 0.012, nc = cuts.length;
    var field = function (x, y, z) {
      var cx = Math.floor((x - minx) / cell), cy = Math.floor((y - miny) / cell), cz = Math.floor((z - minz) / cell);
      if (cx < 0 || cy < 0 || cz < 0 || cx >= nx || cy >= ny || cz >= nz) return 0.3;
      var L = lists[cx + nx * (cy + ny * cz)]; if (!L) return 0.3;
      var g0 = 1e9, g1 = 1e9, g2 = 1e9;
      for (var i = 0; i < L.length; i++) {
        var q = prims[L[i]], d = q.t === 0 ? dCap(q, x, y, z) : dEll(q, x, y, z);
        if (q.g === 0) g0 = g0 > 1e8 ? d : smin(g0, d, K0); else if (q.g === 1) g1 = g1 > 1e8 ? d : smin(g1, d, K1); else g2 = g2 > 1e8 ? d : smin(g2, d, K2);
      }
      var d = g0; if (g2 < 1e8) d = d > 1e8 ? g2 : smin(d, g2, Kc * 1.6); if (g1 < 1e8) d = d > 1e8 ? g1 : smin(d, g1, Kc);
      for (var c = 0; c < nc; c++) { var u = cuts[c], dx = x - u.c[0], dy = y - u.c[1], dz = z - u.c[2], dd = Math.sqrt(dx * dx + dy * dy + dz * dz) - u.r; if (dd < 0.03) d = smax(d, -dd, 0.008 * Ks[4]); }
      return d;
    };
    field.bounds = [minx, miny, minz, maxx, maxy, maxz]; field.lists = lists; field.grid = [nx, ny, nz, minx, miny, minz, cell]; field.prims = prims;
    return field;
  }

  /* ---------- Surface Nets ---------- */
  var CE = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [3, 7], [2, 6]];
  function surfaceNets(field, bounds, h) {
    var minx = bounds[0], miny = bounds[1], minz = bounds[2], nx = Math.ceil((bounds[3] - minx) / h) + 2, ny = Math.ceil((bounds[4] - miny) / h) + 2, nz = Math.ceil((bounds[5] - minz) / h) + 2;
    var val = new Float32Array(nx * ny * nz), i, j, k, idx = 0;
    for (k = 0; k < nz; k++) for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) val[idx++] = field(minx + i * h, miny + j * h, minz + k * h);
    var cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), pos = [], sx = 1, sy = nx, sz = nx * ny, cx = nx - 1, cy = ny - 1;
    var cv = new Float32Array(8), off = [0, sx, sy, sx + sy, sz, sz + sx, sz + sy, sz + sx + sy], co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    for (k = 0; k < nz - 1; k++) for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      var base = i + nx * (j + ny * k), mask = 0, n;
      for (n = 0; n < 8; n++) { cv[n] = val[base + off[n]]; if (cv[n] < 0) mask |= 1 << n; }
      if (mask === 0 || mask === 255) continue;
      var ax = 0, ay = 0, az = 0, cnt = 0;
      for (n = 0; n < 12; n++) {
        var a = CE[n][0], b = CE[n][1], va = cv[a], vb = cv[b];
        if ((va < 0) !== (vb < 0)) { var t = va / (va - vb); ax += co[a][0] + (co[b][0] - co[a][0]) * t; ay += co[a][1] + (co[b][1] - co[a][1]) * t; az += co[a][2] + (co[b][2] - co[a][2]) * t; cnt++; }
      }
      cellIdx[i + cx * (j + cy * k)] = pos.length / 3;
      pos.push(minx + (i + ax / cnt) * h, miny + (j + ay / cnt) * h, minz + (k + az / cnt) * h);
    }
    var faces = [], ci = function (i, j, k) { return cellIdx[i + cx * (j + cy * k)]; };
    function quad(a, b, c, d, flip) { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) faces.push(a, b, c, a, c, d); else faces.push(a, d, c, a, c, b); }
    for (k = 1; k < nz - 1; k++) for (j = 1; j < ny - 1; j++) for (i = 1; i < nx - 1; i++) {
      var p0 = val[i + nx * (j + ny * k)] < 0;
      if (i < nx - 1) { var p1 = val[i + 1 + nx * (j + ny * k)] < 0; if (p0 !== p1) quad(ci(i, j - 1, k - 1), ci(i, j, k - 1), ci(i, j, k), ci(i, j - 1, k), p0); }
      if (j < ny - 1) { var p2 = val[i + nx * (j + 1 + ny * k)] < 0; if (p0 !== p2) quad(ci(i - 1, j, k - 1), ci(i, j, k - 1), ci(i, j, k), ci(i - 1, j, k), !p0); }
      if (k < nz - 1) { var p3 = val[i + nx * (j + ny * (k + 1))] < 0; if (p0 !== p3) quad(ci(i - 1, j - 1, k), ci(i, j - 1, k), ci(i, j, k), ci(i - 1, j, k), p0); }
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(faces) };
  }
  // Taubin 부드럽게 (부피 유지)
  function smooth(mesh, iters) {
    var n = mesh.pos.length / 3, idx = mesh.idx, nb = new Array(n), i;
    for (i = 0; i < n; i++) nb[i] = [];
    for (i = 0; i < idx.length; i += 3) { var a = idx[i], b = idx[i + 1], c = idx[i + 2]; nb[a].push(b, c); nb[b].push(a, c); nb[c].push(a, b); }
    var p = mesh.pos, q = new Float32Array(p.length);
    function step(lam) {
      for (var v = 0; v < n; v++) {
        var L = nb[v]; if (!L.length) { q[3 * v] = p[3 * v]; q[3 * v + 1] = p[3 * v + 1]; q[3 * v + 2] = p[3 * v + 2]; continue; }
        var sx = 0, sy = 0, sz = 0; for (var m = 0; m < L.length; m++) { sx += p[3 * L[m]]; sy += p[3 * L[m] + 1]; sz += p[3 * L[m] + 2]; }
        sx /= L.length; sy /= L.length; sz /= L.length;
        q[3 * v] = p[3 * v] + lam * (sx - p[3 * v]); q[3 * v + 1] = p[3 * v + 1] + lam * (sy - p[3 * v + 1]); q[3 * v + 2] = p[3 * v + 2] + lam * (sz - p[3 * v + 2]);
      }
      var t = p; p = q; q = t;
    }
    for (i = 0; i < iters; i++) { step(0.5); step(-0.53); }
    mesh.pos = p; return mesh;
  }
  function normals(mesh) {
    var p = mesh.pos, idx = mesh.idx, nrm = new Float32Array(p.length);
    for (var i = 0; i < idx.length; i += 3) {
      var a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3, ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz; nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz; nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
    }
    for (i = 0; i < nrm.length; i += 3) { var l = Math.sqrt(nrm[i] * nrm[i] + nrm[i + 1] * nrm[i + 1] + nrm[i + 2] * nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
    mesh.nrm = nrm; return mesh;
  }

  /* ---------- 스킨 가중치: 가까운 뼈의 모양일수록 크게 ---------- */
  function skinWeights(mesh, field, boneNames, s) {
    var n = mesh.pos.length / 3, bi = {}, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), g = field.grid, nx = g[0], ny = g[1], nz = g[2], minx = g[3], miny = g[4], minz = g[5], cell = g[6], prims = field.prims, lists = field.lists;
    boneNames.forEach(function (b, i) { bi[b] = i; });
    var sigma = 0.022 * s, acc = {}, keys;
    for (var v = 0; v < n; v++) {
      var x = mesh.pos[3 * v], y = mesh.pos[3 * v + 1], z = mesh.pos[3 * v + 2];
      var cx = clamp(Math.floor((x - minx) / cell), 0, nx - 1), cy = clamp(Math.floor((y - miny) / cell), 0, ny - 1), cz = clamp(Math.floor((z - minz) / cell), 0, nz - 1), L = lists[cx + nx * (cy + ny * cz)] || [];
      var dmin = 1e9; acc = {};
      for (var i = 0; i < L.length; i++) { var q = prims[L[i]], d = Math.max(dPrim(q, x, y, z), 0), b = q.bone; if (!(b in acc) || d < acc[b]) acc[b] = d; if (d < dmin) dmin = d; }
      keys = Object.keys(acc); var arr = [];
      for (i = 0; i < keys.length; i++) arr.push([keys[i], Math.exp(-(acc[keys[i]] - dmin) / sigma)]);
      arr.sort(function (a, b) { return b[1] - a[1]; }); var tot = 0, m = Math.min(4, arr.length);
      for (i = 0; i < m; i++) tot += arr[i][1];
      for (i = 0; i < 4; i++) { if (i < m && bi[arr[i][0]] !== undefined) { si[4 * v + i] = bi[arr[i][0]]; sw[4 * v + i] = arr[i][1] / tot; } }
    }
    mesh.si = si; mesh.sw = sw; return mesh;
  }

  /* ---------- 머리카락 ---------- */
  var HAIR = [['none', '없음'], ['short', '짧은 머리'], ['spiky', '뾰족 머리'], ['bob', '단발'], ['long', '긴 머리'], ['twin', '양갈래'], ['pony', '포니테일'], ['bun', '올림머리'], ['afro', '곱슬 볼륨'], ['mohawk', '모히칸']];
  function hairPrims(style, hv, face, p, s, vol, len) {
    var out = [], hsz = p.headSize, X = function (a) { return a * hsz * s; };
    if (style === 'none') return out;
    var cap = function (A, B, r0, r1) { out.push(mkCap(hv(A), hv(B), [X(r0), X(r0)], [X(r1), X(r1)], 'Head', 0)); };
    var ell = function (c, r) { out.push(mkEll(hv(c), [X(r[0]), X(r[1]), X(r[2])], 'Head', 0)); };
    var t = 0.016 * vol, hw = face.headR;
    // 두피 덮개 (머리 둥근 부분 + 약간 두께)
    out.push(mkEll(face.headC, [hw[0] + t * s, hw[1] + t * s, hw[2] + t * s], 'Head', 0));
    var ext = len;
    if (style === 'spiky') for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; cap([Math.cos(a) * 0.05, 1.96, 0.025 + Math.sin(a) * 0.05], [Math.cos(a) * 0.1, 2.06 + (i % 2) * 0.03, 0.025 + Math.sin(a) * 0.1], 0.03, 0.002); }
    if (style === 'bob') ell([0, 1.80, 0.0], [0.105 + t, 0.1, 0.11]);
    if (style === 'long') { cap([0, 1.84, -0.07], [0, 1.84 - 0.45 * ext, -0.085], 0.1, 0.07); [-1, 1].forEach(function (sg) { cap([sg * 0.085, 1.86, -0.02], [sg * 0.095, 1.84 - 0.4 * ext, -0.05], 0.03, 0.035); }); }
    if (style === 'twin') [-1, 1].forEach(function (sg) { cap([sg * 0.075, 1.9, -0.03], [sg * 0.13, 1.9 - 0.3 * ext, -0.06], 0.03, 0.014); });
    if (style === 'pony') { cap([0, 1.9, -0.09], [0, 1.88 - 0.28 * ext, -0.19], 0.03, 0.016); ell([0, 1.9, -0.095], [0.03, 0.03, 0.03]); }
    if (style === 'bun') ell([0, 2.0, -0.04], [0.055, 0.05, 0.055]);
    if (style === 'afro') ell([0, 1.905, 0.0], [0.15 + t, 0.15 + t, 0.15 + t]);
    if (style === 'mohawk') cap([0, 1.96, 0.1], [0, 1.98, -0.08], 0.018, 0.02), cap([0, 2.0, 0.1], [0, 2.03, -0.08], 0.012, 0.01);
    return out;
  }
  // 머리선: 얼굴 쪽은 잘라낸다
  function hairField(prims, style, face, s, hv, Ks) {
    var fld = makeField(prims, [], Ks, 0.06 * s, 0.06 * s);
    var P1 = hv([0, 1.935, 0.125]), P2 = hv([0, 1.79, -0.07]), vy = P1[1] - P2[1], vz = P1[2] - P2[2], nl = Math.sqrt(vy * vy + vz * vz), ny = vz / nl, nz = -vy / nl;
    var out = function (x, y, z) {
      var d = fld(x, y, z); if (style === 'bob' || style === 'long' || style === 'afro' || style === 'twin' || style === 'pony') { }
      var cutd = (ny * (y - P2[1]) + nz * (z - P2[2])); // + 이면 머리 위/뒤
      var cx = Math.abs(x); var sideKeep = cx > 0.075 * s ? 1 : 0;
      return smax(d, -(cutd + 0.012 * s), 0.01 * s);
    };
    out.bounds = fld.bounds; out.grid = fld.grid; out.lists = fld.lists; out.prims = fld.prims; return out;
  }

  /* ---------- 옷 ---------- */
  var CLOTH = [['none', '없음'], ['tee', '티셔츠+반바지'], ['tank', '민소매+짧은 바지'], ['long', '긴팔+긴바지'], ['sport', '운동복(반팔+레깅스)']];
  function cylSeg(A, B, R) { var dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz), ux = dx / len, uy = dy / len, uz = dz / len;
    return function (x, y, z) { var px = x - A[0], py = y - A[1], pz = z - A[2], t = px * ux + py * uy + pz * uz, qx = px - ux * t, qy = py - uy * t, qz = pz - uz * t, rad = Math.sqrt(qx * qx + qy * qy + qz * qz) - R, ax = Math.abs(t - len / 2) - len / 2;
      return Math.min(Math.max(rad, ax), 0) + Math.sqrt(Math.max(rad, 0) * Math.max(rad, 0) + Math.max(ax, 0) * Math.max(ax, 0)); }; }
  // 옷 한 벌 = (몸 부위별 거리장 ∩ 영역) 여러 개의 합. 몸통은 몸통 모양만, 소매는 팔 모양만 본뜬다.
  function clothParts(kind, W, s, part, prims) {
    var P = function (a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }, up = function (a, dy) { return [a[0], a[1] + dy * s, a[2]]; };
    var sets = { torso: ['Hips', 'Spine', 'Chest', 'UpperChest'], armL: ['UpperArmL', 'LowerArmL'], armR: ['UpperArmR', 'LowerArmR'], legL: ['UpperLegL', 'LowerLegL', 'FootL'], legR: ['UpperLegR', 'LowerLegR', 'FootR'] };
    var out = [];
    function comp(name, region, extraHips) { out.push({ prims: prims.filter(function (q) { return sets[name].indexOf(q.bone) >= 0 && (extraHips || q.bone !== 'Hips' || part === 'bot' || name !== 'torso' || true); }), region: region }); }
    if (part === 'top') {
      comp('torso', cylSeg(up(W.Hips, kind === 'sport' ? 0.03 : -0.02), up(W.Neck, -0.015), 0.5 * s));
      ['L', 'R'].forEach(function (S) {
        var ua = W['UpperArm' + S], la = W['LowerArm' + S], ha = W['Hand' + S];
        if (kind === 'long') comp('arm' + S, cylSeg(P(ua, la, -0.15), P(la, ha, 0.9), 0.2 * s));
        else if (kind !== 'tank') comp('arm' + S, cylSeg(P(ua, la, -0.15), P(ua, la, kind === 'sport' ? 0.5 : 0.55), 0.2 * s));
      });
    } else {
      comp('torso', cylSeg(up(W.Hips, 0.10), up(W.Hips, -0.05), 0.5 * s));
      ['L', 'R'].forEach(function (S) {
        var ul = W['UpperLeg' + S], ll = W['LowerLeg' + S], ft = W['Foot' + S], long = kind === 'long' || kind === 'sport';
        comp('leg' + S, cylSeg(P(ul, ll, -0.12), long ? P(ll, ft, 0.92) : P(ul, ll, kind === 'tee' ? 0.5 : 0.36), 0.2 * s));
      });
    }
    return out;
  }
  function boundsOf(prims, e0) {
    var xmin = 1e9, ymin = 1e9, zmin = 1e9, xmax = -1e9, ymax = -1e9, zmax = -1e9;
    for (var i = 0; i < prims.length; i++) { var q = prims[i], e = q.mr + e0, ax = q.t === 0 ? q.ax : q.cx, ay = q.t === 0 ? q.ay : q.cy, az = q.t === 0 ? q.az : q.cz, bx = q.t === 0 ? q.ax + q.dx * q.len : q.cx, by = q.t === 0 ? q.ay + q.dy * q.len : q.cy, bz = q.t === 0 ? q.az + q.dz * q.len : q.cz;
      xmin = Math.min(xmin, ax - e, bx - e); xmax = Math.max(xmax, ax + e, bx + e); ymin = Math.min(ymin, ay - e, by - e); ymax = Math.max(ymax, ay + e, by + e); zmin = Math.min(zmin, az - e, bz - e); zmax = Math.max(zmax, az + e, bz + e); }
    return [xmin, ymin, zmin, xmax, ymax, zmax];
  }

  /* ---------- 전체 생성 ---------- */
  function generate(params, opt) {
    opt = opt || {};
    var p = Object.assign(defaults(), params || {}), t0 = Date.now(), res = opt.res || 0.011;
    var sk = skeleton(p), s = sk.s, boneNames = ORDER.slice();
    var bp = bodyPrims(p, sk), Ks = [0.045 * s, 0.004 * s, 0.013 * s, 0.012 * s, s];
    var field = makeField(bp.prims, bp.cuts, Ks, 0.08 * s, 0.07 * s);
    var b = field.bounds, bounds = [b[0] - 0.01, b[1] - 0.01, b[2] - 0.01, b[3] + 0.01, b[4] + 0.01, b[5] + 0.01];
    var mesh = surfaceNets(field, bounds, res * s / 1.0);
    smooth(mesh, 3); normals(mesh); skinWeights(mesh, field, boneNames, s);
    // 색: 살색 + 입술, 으슥한 곳은 살짝 어둡게
    var n = mesh.pos.length / 3, col = new Float32Array(n * 3), skin = hex(p.skin), lip = hex(p.lip), lt = bp.face.lipT, lb = bp.face.lipB, mw = bp.face.mouthW, lw = 0.011 * s * p.headSize;
    for (var v = 0; v < n; v++) {
      var x = mesh.pos[3 * v], y = mesh.pos[3 * v + 1], z = mesh.pos[3 * v + 2];
      var ao = clamp(field(x + mesh.nrm[3 * v] * 0.035 * s, y + mesh.nrm[3 * v + 1] * 0.035 * s, z + mesh.nrm[3 * v + 2] * 0.035 * s) / (0.035 * s) * 0.5 + 0.5, 0.55, 1);
      var ly = (lt[1] + lb[1]) / 2, dy = Math.abs(y - ly), dx = Math.abs(x) / (mw * 1.1), mix = dy < lw * 1.5 && dx < 1 && z > lt[2] - 0.05 * s ? clamp(1 - dy / (lw * 1.5), 0, 1) * clamp(1.5 - dx * 1.3, 0, 1) : 0;
      col[3 * v] = lerp(skin[0], lip[0], mix) * ao; col[3 * v + 1] = lerp(skin[1], lip[1], mix) * ao; col[3 * v + 2] = lerp(skin[2], lip[2], mix) * ao;
    }
    mesh.col = col;
    var out = { params: p, skeleton: { names: boneNames, parent: boneNames.map(function (n) { return PARENT[n] || null; }), pos: boneNames.map(function (n) { return sk.W[n].slice(); }), W: sk.W }, body: mesh, face: bp.face, s: s, ms: 0 };
    // 머리카락
    var hv = bp.face.hv;
    if (opt.hair && opt.hair.style && opt.hair.style !== 'none') {
      var hp = hairPrims(opt.hair.style, hv, bp.face, p, s, opt.hair.volume || 1, opt.hair.length || 1), hf = hairField(hp, opt.hair.style, bp.face, s, hv, [0.02 * s, 0.02 * s, 0.02 * s, 0.02 * s, s]);
      var hb = hf.bounds, hh = surfaceNets(hf, [hb[0], hb[1], hb[2], hb[3], hb[4], hb[5]], 0.007 * s);
      smooth(hh, 2); normals(hh); skinWeights(hh, field, boneNames, s); out.hair = hh;
    }
    // 옷
    if (opt.cloth && opt.cloth.kind && opt.cloth.kind !== 'none') {
      out.cloth = {};
      ['top', 'bot'].forEach(function (part) {
        var comps = clothParts(opt.cloth.kind, sk.W, s, part, bp.prims).filter(function (c) { return c.prims.length; }), tk = 0.017 * s;
        var fields = comps.map(function (c) { var f = makeField(c.prims, [], [0.03 * s, 0.004 * s, 0.013 * s, 0.012 * s, s], 0.08 * s, 0.06 * s); return { f: f, reg: c.region }; });
        var all = bp.prims.filter(function (q) { return true; }), bb = boundsOf(all, 0.025 * s);
        var cf = function (x, y, z) {
          var d = 1e9;
          for (var i = 0; i < fields.length; i++) { var r = fields[i].reg(x, y, z), v = r > 0.04 ? r : smax(fields[i].f(x, y, z) - tk, r, 0.006 * s); if (v < d) d = v; }
          return d;
        };
        cf.prims = field.prims; cf.lists = field.lists; cf.grid = field.grid;
        var m = surfaceNets(cf, bb, 0.0095 * s); smooth(m, 2); normals(m); skinWeights(m, field, boneNames, s); out.cloth[part] = m;
      });
    }
    out.ms = Date.now() - t0;
    return out;
  }
  function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }

  root.Body = { PARAMS: PARAMS, PBY: PBY, defaults: defaults, PRESETS: PRESETS, generate: generate, ORDER: ORDER, PARENT: PARENT, boneKo: boneKo, mirror: mirror, HAIR: HAIR, CLOTH: CLOTH, FING: FING, FKO: FKO, skeleton: skeleton };
  if (typeof module !== 'undefined') module.exports = root.Body;
})(typeof window !== 'undefined' ? window : global);

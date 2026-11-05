(function () {
  'use strict';
  var B = window.Body, $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (v) { return String(v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var D2R = Math.PI / 180, clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var RES = { draft: 0.024, normal: 0.0100, high: 0.0070 };

  /* ---------- 상태 ---------- */
  var S = { chars: [], sel: 0, tab: 'shape', quality: 'normal', joints: true, sym: true, bone: 'Head', nid: 1, undo: [], redo: [], hand: 'Left', finger: 'Index',
    scene: { bg: '#f2f2f2', floor: true, grid: true, thirds: false, aspect: 'free', lightAz: 40, lightPow: 1, rim: 0.5, fov: 35 }, cam: { az: 0.35, el: 0.12, dist: 4.4, tx: 0, ty: 0.9, tz: 0 }, camSaves: [] };
  function newChar(i) {
    var c = { id: S.nid++, name: '인물 ' + (S.chars.length + 1), params: B.defaults(), hair: { style: 'short', volume: 1, length: 1, color: '#3a2a20' }, cloth: { kind: 'tee', top: '#2f4d8f', bot: '#2b2f3a' }, eye: '#6b4a2f', pose: {}, hipsDrop: 0, pos: [0, 0], rotY: 0, scale: 1, vis: true, obj: null };
    Object.assign(c.params, B.PRESETS['기본 남성']); c.pos = [i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.9 : 0, 0]; return c;
  }
  var cur = function () { return S.chars[S.sel]; };

  /* ---------- 3D ---------- */
  var cv = $('#cv'), view = $('#view'), renderer, scene, camera, root, floor, grid, lights = {}, ray = new THREE.Raycaster();
  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(S.scene.fov, 1, 0.05, 100);
    lights.hemi = new THREE.HemisphereLight(0xffffff, 0x9a9aa0, 0.75); scene.add(lights.hemi);
    lights.key = new THREE.DirectionalLight(0xffffff, 0.9); lights.key.castShadow = true; lights.key.shadow.mapSize.set(1024, 1024);
    var sc = lights.key.shadow.camera; sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -1; sc.near = 0.5; sc.far = 14; lights.key.shadow.bias = -0.0008; scene.add(lights.key);
    lights.rim = new THREE.DirectionalLight(0xdfe8ff, 0.5); scene.add(lights.rim);
    floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    grid = new THREE.GridHelper(20, 40, 0x000000, 0x888888); grid.material.transparent = true; grid.material.opacity = 0.25; grid.position.y = 0.001; scene.add(grid);
    root = new THREE.Group(); scene.add(root);
    applyScene(); resize(); loop();
  }
  function applyScene() {
    var sc = S.scene; view.style.background = sc.bg; grid.visible = sc.grid; floor.visible = sc.floor; camera.fov = sc.fov; camera.updateProjectionMatrix();
    var a = sc.lightAz * D2R; lights.key.position.set(Math.sin(a) * 4, 5, Math.cos(a) * 4); lights.key.intensity = 0.9 * sc.lightPow;
    lights.rim.position.set(-Math.sin(a) * 4, 3, -Math.cos(a) * 4); lights.rim.intensity = sc.rim; lights.hemi.intensity = 0.75;
    $('#thirds').hidden = !sc.thirds; layoutGuide();
  }
  function resize() { var w = view.clientWidth, h = view.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); layoutGuide(); }
  function layoutGuide() {
    var g = $('#guide'), a = S.scene.aspect; if (a === 'free') { g.hidden = true; return; }
    var r = { '1:1': 1, '4:5': 0.8, '3:4': 0.75, '16:9': 16 / 9, '9:16': 9 / 16, '3:2': 1.5 }[a], w = view.clientWidth, h = view.clientHeight, gw = Math.min(w * 0.94, h * 0.94 * r), gh = gw / r;
    g.hidden = false; g.style.width = gw + 'px'; g.style.height = gh + 'px'; g.style.left = (w - gw) / 2 + 'px'; g.style.top = (h - gh) / 2 + 'px';
  }
  var raf = 0, until = 0, lastKey = '';
  var kick = function (ms) { until = Math.max(until, performance.now() + (ms || 700)); };
  ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'input', 'click', 'change', 'keydown', 'resize'].forEach(function (ev) { window.addEventListener(ev, function () { kick(); }, true); });
  function loop() {
    raf = requestAnimationFrame(loop);
    var c = S.cam, key = [c.az, c.el, c.dist, c.tx, c.ty, c.tz].join(); if (key !== lastKey) { lastKey = key; kick(300); }
    if (performance.now() > until) return;
    var tgt = new THREE.Vector3(c.tx, c.ty, c.tz), cp = new THREE.Vector3(Math.sin(c.az) * Math.cos(c.el), Math.sin(c.el), Math.cos(c.az) * Math.cos(c.el)).multiplyScalar(c.dist).add(tgt);
    camera.position.copy(cp); camera.lookAt(tgt); renderer.render(scene, camera);
  }

  /* ---------- 몸 만들기 ---------- */
  var TT = new THREE.Matrix4();
  function skinnedFrom(m, bones, boneArr, inv, material, vcol) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
    if (vcol && m.col) g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(m.si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(m.sw, 4)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    var sm = new THREE.SkinnedMesh(g, material); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false;
    return sm;
  }
  function makeObj(c, gen) {
    var g = new THREE.Group(), names = gen.skeleton.names, bones = {};
    names.forEach(function (n, i) {
      var b = new THREE.Bone(); b.name = n; bones[n] = b; var par = gen.skeleton.parent[i], w = gen.skeleton.pos[i];
      if (par) { var pw = gen.skeleton.W[par]; b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]); bones[par].add(b); } else { b.position.set(w[0], w[1], w[2]); g.add(b); }
    });
    var arr = names.map(function (n) { return bones[n]; }), inv = names.map(function (n, i) { var w = gen.skeleton.pos[i]; return new THREE.Matrix4().makeTranslation(-w[0], -w[1], -w[2]); });
    g.updateMatrixWorld(true);
    var skel = new THREE.Skeleton(arr, inv), meshes = [];
    function add(m, mat, vcol) { var sm = skinnedFrom(m, bones, arr, inv, mat, vcol); g.add(sm); sm.bind(skel, new THREE.Matrix4()); meshes.push(sm); return sm; }
    add(gen.body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, skinning: true }), true).userData.kind = 'body';
    if (gen.hair) add(gen.hair, new THREE.MeshStandardMaterial({ color: c.hair.color, roughness: 0.55, metalness: 0.05, skinning: true }), false).userData.kind = 'hair';
    if (gen.cloth) { add(gen.cloth.top, new THREE.MeshStandardMaterial({ color: c.cloth.top, roughness: 0.85, skinning: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false).userData.kind = 'top'; add(gen.cloth.bot, new THREE.MeshStandardMaterial({ color: c.cloth.bot, roughness: 0.85, skinning: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false).userData.kind = 'bot'; }
    // 눈
    ['L', 'R'].forEach(function (S2) {
      var e = gen.face['eye' + S2], hw = gen.skeleton.W.Head, eg = new THREE.Group();
      var sc = new THREE.Mesh(new THREE.SphereGeometry(e.r, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.3 }));
      var ir = new THREE.Mesh(new THREE.SphereGeometry(e.r * 1.004, 20, 10, 0, Math.PI * 2, 0, 0.62), new THREE.MeshStandardMaterial({ color: c.eye, roughness: 0.35 }));
      var pu = new THREE.Mesh(new THREE.SphereGeometry(e.r * 1.008, 16, 8, 0, Math.PI * 2, 0, 0.27), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 }));
      [ir, pu].forEach(function (m) { m.rotation.x = Math.PI / 2; eg.add(m); }); eg.add(sc); eg.position.set(e.c[0] - hw[0], e.c[1] - hw[1], e.c[2] - hw[2]); bones.Head.add(eg);
    });
    // 관절 점
    var ds = gen.s, dots = [];
    names.forEach(function (n) {
      if (/^(Thumb|Index|Middle|Ring|Little)\d/.test(n) || n === 'Neck2' ) return;
      var d = new THREE.Mesh(new THREE.SphereGeometry((n === 'Hips' || n === 'Head' ? 0.022 : 0.014) * Math.max(0.6, ds), 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.85 }));
      d.renderOrder = 10; d.userData = { bone: n, char: c.id }; bones[n].add(d); dots.push(d);
    });
    g.userData = { bones: bones, meshes: meshes, dots: dots, gen: gen, skel: skel, baseHips: gen.skeleton.pos[0].slice() };
    return g;
  }
  function placeObj(c) { var o = c.obj; if (!o) return; o.position.set(c.pos[0], 0, c.pos[1]); o.rotation.y = c.rotY * D2R; o.scale.setScalar(c.scale); o.visible = c.vis; }
  function applyPose(c) {
    var o = c.obj; if (!o) return; var u = o.userData, th = u.gen.skeleton.W;
    Object.keys(u.bones).forEach(function (n) { var a = c.pose[n] || [0, 0, 0]; u.bones[n].rotation.set(a[0] * D2R, a[1] * D2R, a[2] * D2R, 'XYZ'); });
    var drop = c.hipsDrop * (th.UpperLegL[1] - th.LowerLegL[1]); u.bones.Hips.position.set(u.baseHips[0], u.baseHips[1] + drop, u.baseHips[2]);
    u.dots.forEach(function (d) { d.visible = S.joints && c === cur(); });
    u.dots.forEach(function (d) { var on = d.userData.bone === S.bone || (S.sym && B.mirror(S.bone) === d.userData.bone); d.material.color.set(on ? (d.userData.bone === S.bone ? 0xff5a1f : 0xffa070) : 0x000000); d.scale.setScalar(d.userData.bone === S.bone ? 1.5 : 1); });
  }
  function disposeObj(o) { if (!o) return; o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose && n.material.dispose(); }); root.remove(o); }
  var busyN = 0;
  function run(c, res) {
    busyN++; $('#busy').hidden = false;
    setTimeout(function () {
      var gen = B.generate(c.params, { res: res, hair: { style: c.hair.style, volume: c.hair.volume, length: c.hair.length }, cloth: { kind: c.cloth.kind } });
      disposeObj(c.obj); c.obj = makeObj(c, gen); root.add(c.obj); placeObj(c); applyPose(c); c.lastMs = gen.ms; c.lastRes = res;
      busyN--; if (!busyN) $('#busy').hidden = true; hud(); kick(1200);
    }, 16);
  }
  function request(c, final) {
    c._want = final ? 'final' : (c._want || 'draft');
    if (c._tm) clearTimeout(c._tm);
    c._tm = setTimeout(function () { c._tm = null; var f = c._want; c._want = null; run(c, f === 'final' ? RES[S.quality] : RES.draft); }, final ? 80 : 40);
  }
  function hud() { var c = cur(); $('#hud').innerHTML = c ? '<span>' + esc(c.name) + '</span><span>' + c.params.height.toFixed(2) + 'm</span><span>' + (c.lastMs || 0) + 'ms</span>' + (c.obj ? '<span>정점 ' + c.obj.userData.gen.body.pos.length / 3 + '</span>' : '') : ''; }

  /* ---------- 카메라 입력 ---------- */
  (function () {
    var drag = null;
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey, moved: 0 }; cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      var c = S.cam;
      if (drag.b === 2 || drag.shift || drag.b === 1) { var k = 0.0016 * c.dist, right = [Math.cos(c.az), 0, -Math.sin(c.az)]; c.tx -= right[0] * dx * k; c.tz -= right[2] * dx * k; c.ty += dy * k; }
      else { c.az -= dx * 0.008; c.el = clamp(c.el + dy * 0.006, -1.4, 1.4); }
    });
    cv.addEventListener('pointerup', function (e) { if (drag && drag.moved < 5 && drag.b === 0) pick(e); drag = null; cv.style.cursor = 'grab'; });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); S.cam.dist = clamp(S.cam.dist * (1 + e.deltaY * 0.0012), 0.4, 20); }, { passive: false });
    // 터치 핀치
    var pts = {}, last = 0;
    cv.addEventListener('pointerdown', function (e) { pts[e.pointerId] = e; });
    cv.addEventListener('pointermove', function (e) { if (!pts[e.pointerId]) return; pts[e.pointerId] = e; var ids = Object.keys(pts); if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (last) S.cam.dist = clamp(S.cam.dist * last / d, 0.4, 20); last = d; } });
    cv.addEventListener('pointerup', function (e) { delete pts[e.pointerId]; last = 0; }); cv.addEventListener('pointercancel', function (e) { delete pts[e.pointerId]; last = 0; });
  })();
  function pick(e) {
    var r = cv.getBoundingClientRect(); ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
    var c = cur(), hit;
    if (S.joints && c && c.obj) { hit = ray.intersectObjects(c.obj.userData.dots, false)[0]; if (hit) { S.bone = hit.object.userData.bone; if (S.tab !== 'pose') setTab('pose'); else renderPanel(); applyPose(c); return; } }
    var all = []; S.chars.forEach(function (ch) { if (ch.obj && ch.vis) ch.obj.userData.meshes.forEach(function (m) { all.push(m); }); });
    hit = ray.intersectObjects(all, false)[0];
    if (hit) { var i = S.chars.findIndex(function (ch) { return ch.obj && ch.obj.userData.meshes.indexOf(hit.object) >= 0; }); if (i >= 0 && i !== S.sel) { S.sel = i; S.chars.forEach(applyPose); renderPanel(); hud(); } }
  }

  /* ---------- 포즈 ---------- */
  var ARM = function (c, phi, s) { return (phi - c.params.armAngle) * s; }; // 세로에서 phi도 벌린 팔 → 회전 값
  function P(o) { return o; }
  var POSES = {
    '기본 서기': function () { return {}; },
    'T 자세': function (c) { return { UpperArmL: [0, 0, ARM(c, 90, 1)], UpperArmR: [0, 0, ARM(c, 90, -1)] }; },
    '만세': function (c) { return { UpperArmL: [0, 0, ARM(c, 170, 1)], UpperArmR: [0, 0, ARM(c, 170, -1)], Head: [-8, 0, 0], Spine: [-6, 0, 0] }; },
    '손 흔들기': function (c) { return { UpperArmL: [0, 0, ARM(c, 130, 1)], LowerArmL: [0, 0, 25], Head: [0, 0, -6] }; },
    '생각하기': function () { return { UpperArmR: [-105, 0, -8], LowerArmR: [-125, 0, 0], Head: [12, 0, 0], Spine: [4, 0, 0] }; },
    '앞 가리키기': function () { return { UpperArmR: [-90, 0, -4], LowerArmR: [-4, 0, 0], Spine: [0, -12, 0], Head: [0, -12, 0], _f: { Right: '가리키기' } }; },
    '팔짱': function () { return { UpperArmL: [-30, 0, 30], UpperArmR: [-30, 0, -30], LowerArmL: [-125, -30, 0], LowerArmR: [-125, 30, 0], Head: [4, 0, 0] }; },
    '허리에 손': function (c) { return { UpperArmL: [0, 0, ARM(c, 40, 1)], UpperArmR: [0, 0, ARM(c, 40, -1)], LowerArmL: [0, 0, -75], LowerArmR: [0, 0, 75], UpperLegL: [0, 0, 6], UpperLegR: [0, 0, -6] }; },
    '의자에 앉기': function () { return { UpperLegL: [-90, 0, 4], UpperLegR: [-90, 0, -4], LowerLegL: [90, 0, 0], LowerLegR: [90, 0, 0], UpperArmL: [-35, 0, 8], UpperArmR: [-35, 0, -8], LowerArmL: [-60, 0, 0], LowerArmR: [-60, 0, 0], Spine: [-4, 0, 0], _h: -1.05 }; },
    '바닥에 앉기': function () { return { UpperLegL: [-80, 0, 30], UpperLegR: [-80, 0, -30], LowerLegL: [100, 0, 0], LowerLegR: [100, 0, 0], UpperArmL: [20, 0, 8], UpperArmR: [20, 0, -8], Spine: [8, 0, 0], _h: -1.45 }; },
    '무릎 꿇기': function () { return { UpperLegL: [-90, 0, 2], UpperLegR: [8, 0, -2], LowerLegL: [90, 0, 0], LowerLegR: [100, 0, 0], Spine: [-4, 0, 0], _h: -1.05 }; },
    '쪼그려 앉기': function () { return { UpperLegL: [-120, 0, 15], UpperLegR: [-120, 0, -15], LowerLegL: [130, 0, 0], LowerLegR: [130, 0, 0], Spine: [20, 0, 0], UpperArmL: [-60, 0, 8], UpperArmR: [-60, 0, -8], LowerArmL: [-70, 0, 0], LowerArmR: [-70, 0, 0], _h: -0.95 }; },
    '걷기': function () { return { UpperLegL: [-28, 0, 3], LowerLegL: [10, 0, 0], UpperLegR: [20, 0, -3], LowerLegR: [28, 0, 0], UpperArmL: [24, 0, 0], LowerArmL: [-18, 0, 0], UpperArmR: [-26, 0, 0], LowerArmR: [-24, 0, 0], Spine: [0, 8, 0], Chest: [0, -8, 0] }; },
    '달리기': function () { return { UpperLegL: [-62, 0, 3], LowerLegL: [75, 0, 0], UpperLegR: [30, 0, -3], LowerLegR: [22, 0, 0], UpperArmL: [38, 0, 0], LowerArmL: [-70, 0, 0], UpperArmR: [-52, 0, 0], LowerArmR: [-85, 0, 0], Spine: [10, 14, 0], Chest: [0, -14, 0], _h: -0.1 }; },
    '점프': function (c) { return { UpperLegL: [-45, 0, 8], UpperLegR: [-30, 0, -8], LowerLegL: [70, 0, 0], LowerLegR: [55, 0, 0], UpperArmL: [-70, 0, ARM(c, 50, 1)], UpperArmR: [-70, 0, ARM(c, 50, -1)], Spine: [4, 0, 0], _h: 0.35 }; },
    '펀치': function () { return { UpperArmR: [-92, 0, -8], LowerArmR: [-4, 0, 0], UpperArmL: [-60, 0, 14], LowerArmL: [-110, 0, 0], Spine: [4, 22, 0], Chest: [0, 18, 0], UpperLegL: [-14, 0, 8], UpperLegR: [18, 0, -10], LowerLegL: [14, 0, 0], LowerLegR: [20, 0, 0], _h: -0.1, _f: { Right: '주먹', Left: '주먹' } }; },
    '킥': function () { return { UpperLegR: [-95, 0, -6], LowerLegR: [10, 0, 0], UpperLegL: [8, 0, 6], UpperArmL: [-20, 0, 40], UpperArmR: [-30, 0, -50], Spine: [-12, 0, 0], Chest: [-8, 0, 0], _h: -0.05 }; },
    '인사하기': function () { return { Spine: [20, 0, 0], Chest: [18, 0, 0], Head: [10, 0, 0], UpperArmL: [8, 0, 0], UpperArmR: [8, 0, 0] }; },
    '기지개': function () { return { UpperArmL: [-175, 0, 10], UpperArmR: [-175, 0, -10], Spine: [-8, 0, 0], Chest: [-8, 0, 0], Head: [-14, 0, 0] }; },
    '조준하기': function () { return { UpperArmR: [-92, 0, -6], LowerArmR: [-4, 0, 0], UpperArmL: [-80, 0, 18], LowerArmL: [-58, 0, 0], Head: [0, -14, 0], UpperLegL: [0, 0, 12], UpperLegR: [0, 0, -12], _f: { Right: '쥐기', Left: '쥐기' } }; },
    '엎드려 쓰러짐': function () { return { Spine: [43, 0, 0], Chest: [43, 0, 0], UpperLegL: [0, 0, 6], UpperArmL: [90, 0, 70], UpperArmR: [90, 0, -70], Head: [-20, 0, 0], _h: -0.62 }; }
  };
  var HANDP = { '펼치기': {}, '쥐기': { all: [38, 52, 40] }, '주먹': { all: [75, 90, 65], Thumb: [30, 40, 30] }, '가리키기': { Index: [0, 0, 0], Middle: [75, 90, 60], Ring: [75, 90, 60], Little: [75, 90, 60], Thumb: [25, 35, 25] }, 'V': { Index: [0, 0, 0], Middle: [0, 0, 0], Ring: [75, 90, 60], Little: [75, 90, 60], Thumb: [30, 40, 30] }, '엄지 척': { all: [78, 95, 70], Thumb: [0, 0, 0] } };
  function setHand(c, side, name) {
    var pp = HANDP[name] || {}, sg = side === 'Left' ? -1 : 1, s = side === 'Left' ? 'L' : 'R';
    B.FING.forEach(function (f) {
      var v = pp[f] || pp.all || [0, 0, 0];
      for (var i = 1; i <= 3; i++) c.pose[f + i + s] = [0, 0, sg * v[i - 1]];
    });
  }
  function setPose(c, name) {
    var p = POSES[name](c); c.pose = {}; c.hipsDrop = p._h || 0; var fg = p._f; delete p._h; delete p._f;
    Object.keys(p).forEach(function (k) { c.pose[k] = p[k].slice(); });
    if (fg) Object.keys(fg).forEach(function (sd) { setHand(c, sd, fg[sd]); });
    applyPose(c);
  }
  function setRot(c, bone, axis, val, fromSym) {
    c.pose[bone] = c.pose[bone] || [0, 0, 0]; c.pose[bone][axis] = val;
    if (S.sym && !fromSym) { var m = B.mirror(bone); if (m) setRot(c, m, axis, axis === 0 ? val : -val, true); }
    if (!fromSym) applyPose(c);
  }

  /* ---------- 되돌리기 ---------- */
  function snapshot() { return JSON.stringify({ chars: S.chars.map(function (c) { return { id: c.id, name: c.name, params: c.params, hair: c.hair, cloth: c.cloth, eye: c.eye, pose: c.pose, hipsDrop: c.hipsDrop, pos: c.pos, rotY: c.rotY, scale: c.scale, vis: c.vis }; }), sel: S.sel, scene: S.scene, cam: S.cam, nid: S.nid }); }
  function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
  function restore(str) {
    var o = JSON.parse(str); S.chars.forEach(function (c) { disposeObj(c.obj); });
    S.chars = o.chars.map(function (d) { d.obj = null; return d; }); S.sel = o.sel; S.scene = o.scene; S.cam = o.cam; S.nid = o.nid;
    S.chars.forEach(function (c) { request(c, true); }); applyScene(); renderAll();
  }
  $('#undo').onclick = function () { if (!S.undo.length) return toast('되돌릴 것이 없어요'); S.redo.push(snapshot()); restore(S.undo.pop()); };
  $('#redo').onclick = function () { if (!S.redo.length) return toast('다시 할 것이 없어요'); S.undo.push(snapshot()); restore(S.redo.pop()); };

  /* ---------- 화면(패널) ---------- */
  var TABS = [['shape', '체형'], ['face', '얼굴'], ['look', '머리·옷'], ['pose', '포즈'], ['scene', '장면'], ['file', '파일']];
  var tabsEl = $('#tabs'), panelsEl = $('#panels');
  panelsEl.style.cssText = 'display:contents';
  var panel = document.createElement('div'); panel.className = 'panel'; panelsEl.appendChild(panel); panelsEl.style.display = 'block'; panelsEl.style.flex = '1'; panelsEl.style.minHeight = '0'; panelsEl.style.display = 'flex'; panelsEl.style.flexDirection = 'column';
  function setTab(t) { S.tab = t; renderTabs(); renderPanel(); }
  function renderTabs() { tabsEl.innerHTML = TABS.map(function (t) { return '<button class="chip" data-t="' + t[0] + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + '</button>'; }).join(''); }
  tabsEl.addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); });
  function sliderHTML(d, v) { return '<div class="sl"><label>' + d[1] + '</label><input type="range" min="' + d[2] + '" max="' + d[3] + '" step="' + d[5] + '" value="' + v + '" data-p="' + d[0] + '"><output>' + (+v).toFixed(d[5] < 0.1 ? 2 : 0) + '</output></div>'; }
  function groupHTML(groups, c, open) { return groups.map(function (g, i) { return '<details class="g"' + (open === undefined ? (i === 0 ? ' open' : '') : (open ? ' open' : '')) + '><summary>' + g + '</summary><div>' + B.PARAMS.filter(function (d) { return d[6] === g; }).map(function (d) { return sliderHTML(d, c.params[d[0]]); }).join('') + '</div></details>'; }).join(''); }
  var colorRow = function (label, id, val) { return '<div class="row"><label style="font-weight:700;font-size:13px;min-width:84px">' + label + '</label><input type="color" class="cl" data-c="' + id + '" value="' + val + '"></div>'; };
  function renderPanel() {
    var c = cur(), h = '', keep = panel.scrollTop;
    if (!c) { panel.innerHTML = '<p class="note">인물이 없어요.</p>'; return; }
    if (S.tab === 'shape') {
      h += '<div class="h">기본 틀</div><div class="row">' + Object.keys(B.PRESETS).map(function (k) { return '<button class="chip sm" data-preset="' + esc(k) + '">' + k + '</button>'; }).join('') + '</div>';
      h += '<p class="note">틀을 고른 뒤 아래 값을 마음대로 바꾸세요. 값은 어떤 조합이든 가능해요.</p>' + groupHTML(['전체', '몸통', '팔', '다리'], c);
      h += colorRow('피부색', 'skin', c.params.skin) + '<div class="row"><button class="btn sm" data-rand="shape">몸 무작위</button><button class="btn sm" data-reset="shape">몸 값 초기화</button></div>';
    }
    if (S.tab === 'face') {
      h += groupHTML(['목·머리', '얼굴'], c, true) + colorRow('입술색', 'lip', c.params.lip) + colorRow('눈동자색', 'eye', c.eye);
      h += '<div class="row"><button class="btn sm" data-rand="face">얼굴 무작위</button><button class="btn sm" data-reset="face">얼굴 값 초기화</button></div>';
    }
    if (S.tab === 'look') {
      h += '<div class="h">머리카락</div><div class="row">' + B.HAIR.map(function (x) { return '<button class="chip sm" data-hair="' + x[0] + '" aria-pressed="' + (c.hair.style === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
      h += sliderHTML(['hv', '볼륨', 0.5, 2, 1, 0.01], c.hair.volume).replace('data-p="hv"', 'data-hv="volume"') + sliderHTML(['hl', '길이', 0.4, 1.8, 1, 0.01], c.hair.length).replace('data-p="hl"', 'data-hv="length"') + colorRow('머리색', 'hairC', c.hair.color);
      h += '<div class="h">옷</div><div class="row">' + B.CLOTH.map(function (x) { return '<button class="chip sm" data-cloth="' + x[0] + '" aria-pressed="' + (c.cloth.kind === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' + colorRow('상의 색', 'topC', c.cloth.top) + colorRow('하의 색', 'botC', c.cloth.bot);
      h += '<p class="note">옷과 머리는 몸 모양에 맞춰 새로 만들어져요. 몸이 바뀌면 같이 바뀝니다.</p>';
    }
    if (S.tab === 'pose') {
      var b = S.bone, a = c.pose[b] || [0, 0, 0], tw = null;
      h += '<div class="h">완성 포즈</div><div class="row">' + Object.keys(POSES).map(function (k) { return '<button class="chip sm" data-pose="' + k + '">' + k + '</button>'; }).join('') + '</div>';
      h += '<div class="h">관절 고르기 <span style="font-weight:400">(화면의 점을 눌러도 돼요)</span></div><div class="bones">' + B.ORDER.filter(function (n) { return !/^(Thumb|Index|Middle|Ring|Little)\d/.test(n) && n !== 'Neck2' && !/R$/.test(n); }).map(function (n) { return '<button class="chip" data-bone="' + n + '" aria-pressed="' + (b === n || b === B.mirror(n)) + '">' + B.boneKo(n).replace('왼쪽 ', '') + '</button>'; }).join('') + '</div>';
      h += '<div class="row"><button class="btn sm" data-side="1" aria-pressed="' + (/R$/.test(b)) + '">' + (B.mirror(b) ? (/R$/.test(b) ? '오른쪽 선택됨' : '왼쪽 선택됨') : '가운데') + '</button><button class="btn sm" data-sym="1" aria-pressed="' + S.sym + '">좌우 대칭 ' + (S.sym ? '켜짐' : '꺼짐') + '</button><button class="btn sm" data-joints="1" aria-pressed="' + S.joints + '">관절 점 ' + (S.joints ? '보임' : '숨김') + '</button></div>';
      h += '<div class="h">' + esc(B.boneKo(b)) + '</div>' + ['X 회전', 'Y 회전', 'Z 회전'].map(function (l, i) { return '<div class="sl r"><label>' + l + '</label><input type="range" min="-180" max="180" step="1" value="' + a[i] + '" data-rot="' + i + '"><output>' + a[i] + '°</output></div>'; }).join('');
      h += '<div class="row"><button class="btn sm" data-bonereset="1">이 관절 초기화</button><button class="btn sm" data-poseclear="1">전체 포즈 초기화</button></div>';
      h += '<div class="sl r"><label>몸 높이</label><input type="range" min="-150" max="60" value="' + Math.round(c.hipsDrop * 100) + '" data-hips="1"><output>' + Math.round(c.hipsDrop * 100) + '</output></div>';
      h += '<div class="h">손</div><div class="row"><button class="btn sm" data-hand="Left" aria-pressed="' + (S.hand === 'Left') + '">왼손</button><button class="btn sm" data-hand="Right" aria-pressed="' + (S.hand === 'Right') + '">오른손</button></div><div class="row">' + Object.keys(HANDP).map(function (k) { return '<button class="chip sm" data-hp="' + k + '">' + k + '</button>'; }).join('') + '</div>';
      h += '<div class="row">' + B.FING.map(function (f) { return '<button class="chip sm" data-finger="' + f + '" aria-pressed="' + (S.finger === f) + '">' + B.FKO[f] + '</button>'; }).join('') + '</div>';
      var sd = S.hand === 'Left' ? 'L' : 'R', sg = S.hand === 'Left' ? -1 : 1;
      [1, 2, 3].forEach(function (i) { var v = Math.round(((c.pose[S.finger + i + sd] || [0, 0, 0])[2]) * sg); h += '<div class="sl r"><label>마디 ' + i + '</label><input type="range" min="-30" max="110" value="' + v + '" data-fing="' + i + '"><output>' + v + '°</output></div>'; });
    }
    if (S.tab === 'scene') {
      var sc = S.scene;
      h += '<div class="h">인물</div><div class="cch">' + S.chars.map(function (ch, i) { return '<div class="cc" aria-current="' + (i === S.sel) + '"><b data-sel="' + i + '" style="cursor:pointer">' + esc(ch.name) + '</b><button class="btn sm" data-vis="' + i + '">' + (ch.vis ? '숨기기' : '보이기') + '</button></div>'; }).join('') + '</div>';
      h += '<div class="row"><button class="btn sm" data-add="1">인물 추가</button><button class="btn sm" data-dup="1">복제</button><button class="btn sm" data-del="1">삭제</button></div>';
      h += [['px', '좌우 위치', -4, 4, c.pos[0], 0.01], ['pz', '앞뒤 위치', -4, 4, c.pos[1], 0.01], ['ry', '회전(도)', -180, 180, c.rotY, 1], ['sc', '크기', 0.3, 2.5, c.scale, 0.01]].map(function (r) { return '<div class="sl r"><label>' + r[1] + '</label><input type="range" min="' + r[2] + '" max="' + r[3] + '" step="' + r[5] + '" value="' + r[4] + '" data-xf="' + r[0] + '"><output>' + (+r[4]).toFixed(r[5] < 1 ? 2 : 0) + '</output></div>'; }).join('');
      h += '<div class="h">카메라</div><div class="row">' + [['정면', 0.0, 0.1], ['오른쪽', -1.5708, 0.1], ['왼쪽', 1.5708, 0.1], ['뒤', 3.1416, 0.1], ['위에서', 0.0, 1.25], ['아래에서', 0.0, -0.45], ['3/4', 0.6, 0.18]].map(function (v) { return '<button class="chip sm" data-cam="' + v[1] + ',' + v[2] + '">' + v[0] + '</button>'; }).join('') + '</div>';
      h += '<div class="sl r"><label>화각</label><input type="range" min="15" max="90" value="' + sc.fov + '" data-sc="fov"><output>' + sc.fov + '</output></div><div class="row"><button class="btn sm" data-frame="1">인물에 맞추기</button><button class="btn sm" data-camsave="1">구도 저장</button></div>';
      h += '<div class="row">' + S.camSaves.map(function (cs, i) { return '<button class="chip sm" data-camload="' + i + '">구도 ' + (i + 1) + '</button>'; }).join('') + '</div>';
      h += '<div class="h">화면 비율(구도 틀)</div><div class="row">' + ['free', '1:1', '4:5', '3:4', '3:2', '16:9', '9:16'].map(function (a) { return '<button class="chip sm" data-asp="' + a + '" aria-pressed="' + (sc.aspect === a) + '">' + (a === 'free' ? '없음' : a) + '</button>'; }).join('') + '</div><div class="row"><button class="btn sm" data-sc2="thirds" aria-pressed="' + sc.thirds + '">3분할선</button><button class="btn sm" data-sc2="grid" aria-pressed="' + sc.grid + '">바닥 격자</button><button class="btn sm" data-sc2="floor" aria-pressed="' + sc.floor + '">바닥 그림자</button></div>';
      h += '<div class="h">조명·배경</div><div class="sl r"><label>조명 방향</label><input type="range" min="0" max="360" value="' + sc.lightAz + '" data-sc="lightAz"><output>' + sc.lightAz + '</output></div><div class="sl r"><label>조명 세기</label><input type="range" min="0" max="2" step="0.05" value="' + sc.lightPow + '" data-sc="lightPow"><output>' + sc.lightPow + '</output></div><div class="sl r"><label>역광</label><input type="range" min="0" max="1.5" step="0.05" value="' + sc.rim + '" data-sc="rim"><output>' + sc.rim + '</output></div>' + colorRow('배경색', 'bg', sc.bg);
    }
    if (S.tab === 'file') {
      h += '<div class="h">저장 품질</div><div class="row">' + [['draft', '빠름'], ['normal', '보통'], ['high', '높음(느림)']].map(function (q) { return '<button class="chip sm" data-q="' + q[0] + '" aria-pressed="' + (S.quality === q[0]) + '">' + q[1] + '</button>'; }).join('') + '</div><p class="note">높음은 손가락과 얼굴이 더 또렷하지만 만드는 데 몇 초 걸려요. 슬라이더를 끌 때는 자동으로 빠름으로 보여 주고, 손을 떼면 고른 품질로 다시 만들어요.</p>';
      h += '<div class="h">내보내기</div><div class="row"><button class="btn sm" data-ex="glb">GLB (뼈대 포함)</button><button class="btn sm" data-ex="obj">OBJ (현재 자세)</button><button class="btn sm" data-ex="png">PNG</button><button class="btn sm" data-ex="pngt">PNG(투명 배경)</button></div>';
      h += '<div class="h">프로젝트</div><div class="row"><button class="btn sm" data-ex="save">파일로 저장(JSON)</button><label class="btn sm" style="display:inline-flex;align-items:center;cursor:pointer">불러오기<input type="file" id="load" accept=".json,application/json" hidden></label></div><p class="note">모든 인물의 체형·얼굴·머리·옷·포즈·구도를 담아요. 이 브라우저에는 자동으로도 저장돼요.</p>';
      h += '<div class="h">참고</div><p class="note">몸의 기준 비율은 Blender 5.2 사람 메타리그(Rigify)에서 읽은 숫자(관절 위치와 얼굴 위치)를 바탕으로 해요. 모양은 이 도구가 직접 계산해서 만들어요.</p>';
    }
    panel.innerHTML = h; panel.scrollTop = keep;
  }
  function renderAll() { renderTabs(); renderPanel(); hud(); }

  /* ---------- 입력 ---------- */
  panel.addEventListener('input', function (e) {
    var el = e.target, c = cur(), o = el.nextElementSibling;
    if (el.dataset.p) { var d = B.PBY[el.dataset.p]; c.params[el.dataset.p] = parseFloat(el.value); if (o) o.textContent = (+el.value).toFixed(d[5] < 0.1 ? 2 : 0); request(c, false); }
    else if (el.dataset.hv) { c.hair[el.dataset.hv] = parseFloat(el.value); if (o) o.textContent = (+el.value).toFixed(2); request(c, false); }
    else if (el.dataset.rot !== undefined) { setRot(c, S.bone, parseInt(el.dataset.rot, 10), parseInt(el.value, 10)); if (o) o.textContent = el.value + '°'; }
    else if (el.dataset.hips) { c.hipsDrop = parseInt(el.value, 10) / 100; if (o) o.textContent = el.value; applyPose(c); }
    else if (el.dataset.fing) { var sd = S.hand === 'Left' ? 'L' : 'R', sg = S.hand === 'Left' ? -1 : 1, v = parseInt(el.value, 10), i = el.dataset.fing; c.pose[S.finger + i + sd] = [0, 0, v * sg]; if (o) o.textContent = v + '°'; applyPose(c); }
    else if (el.dataset.xf) { var k = el.dataset.xf, v2 = parseFloat(el.value); if (k === 'px') c.pos[0] = v2; if (k === 'pz') c.pos[1] = v2; if (k === 'ry') c.rotY = v2; if (k === 'sc') c.scale = v2; if (o) o.textContent = v2.toFixed(k === 'ry' ? 0 : 2); placeObj(c); }
    else if (el.dataset.sc) { S.scene[el.dataset.sc] = parseFloat(el.value); if (o) o.textContent = el.value; applyScene(); }
    else if (el.dataset.c) {
      var id = el.dataset.c, val = el.value; if (id === 'skin' || id === 'lip') { c.params[id] = val; request(c, false); } else if (id === 'eye') { c.eye = val; request(c, false); }
      else if (id === 'hairC') { c.hair.color = val; recolor(c); } else if (id === 'topC') { c.cloth.top = val; recolor(c); } else if (id === 'botC') { c.cloth.bot = val; recolor(c); } else if (id === 'bg') { S.scene.bg = val; applyScene(); }
    }
  });
  panel.addEventListener('change', function (e) {
    var el = e.target, c = cur();
    if (el.dataset.p || el.dataset.hv || (el.dataset.c && /^(skin|lip|eye)$/.test(el.dataset.c))) { pushUndo(); request(c, true); }
    else if (el.dataset.rot !== undefined || el.dataset.hips || el.dataset.fing || el.dataset.xf) pushUndo();
    else if (el.id === 'load') { var f = el.files[0]; if (f) f.text().then(function (t) { try { restore(t); toast('불러왔어요'); } catch (err) { toast('파일을 읽을 수 없어요'); } }); }
  });
  function recolor(c) { if (!c.obj) return; c.obj.userData.meshes.forEach(function (m) { if (m.userData.kind === 'hair') m.material.color.set(c.hair.color); if (m.userData.kind === 'top') m.material.color.set(c.cloth.top); if (m.userData.kind === 'bot') m.material.color.set(c.cloth.bot); }); }
  panel.addEventListener('click', function (e) {
    var el = e.target.closest('button,b[data-sel]'); if (!el) return; var d = el.dataset, c = cur();
    if (d.preset) { pushUndo(); var pre = B.PRESETS[d.preset]; B.PARAMS.forEach(function (q) { if (q[6] !== '얼굴' && q[6] !== '목·머리') c.params[q[0]] = q[4]; }); Object.assign(c.params, pre); if (/모델 체형/.test(d.preset) || /여/.test(d.preset)) { } renderPanel(); request(c, true); }
    else if (d.rand) { pushUndo(); var g = d.rand === 'face' ? ['얼굴', '목·머리'] : ['전체', '몸통', '팔', '다리']; B.PARAMS.forEach(function (q) { if (g.indexOf(q[6]) >= 0 && q[0] !== 'height') c.params[q[0]] = +(q[2] + (q[3] - q[2]) * (0.5 + (Math.random() - 0.5) * 0.55 * ((q[4] - q[2]) / (q[3] - q[2]) > 0.2 ? 1 : 0.5))).toFixed(2); }); renderPanel(); request(c, true); }
    else if (d.reset) { pushUndo(); var g2 = d.reset === 'face' ? ['얼굴', '목·머리'] : ['전체', '몸통', '팔', '다리']; B.PARAMS.forEach(function (q) { if (g2.indexOf(q[6]) >= 0) c.params[q[0]] = q[4]; }); renderPanel(); request(c, true); }
    else if (d.hair) { pushUndo(); c.hair.style = d.hair; renderPanel(); request(c, true); }
    else if (d.cloth) { pushUndo(); c.cloth.kind = d.cloth; renderPanel(); request(c, true); }
    else if (d.pose) { pushUndo(); setPose(c, d.pose); renderPanel(); }
    else if (d.bone) { S.bone = d.bone; renderPanel(); applyPose(c); }
    else if (d.side) { var m = B.mirror(S.bone); if (m) { S.bone = m; renderPanel(); applyPose(c); } }
    else if (d.sym) { S.sym = !S.sym; renderPanel(); applyPose(c); }
    else if (d.joints) { S.joints = !S.joints; renderPanel(); applyPose(c); }
    else if (d.bonereset) { pushUndo(); delete c.pose[S.bone]; if (S.sym && B.mirror(S.bone)) delete c.pose[B.mirror(S.bone)]; renderPanel(); applyPose(c); }
    else if (d.poseclear) { pushUndo(); c.pose = {}; c.hipsDrop = 0; renderPanel(); applyPose(c); }
    else if (d.hand) { S.hand = d.hand; renderPanel(); }
    else if (d.hp) { pushUndo(); setHand(c, S.hand, d.hp); if (S.sym) setHand(c, S.hand === 'Left' ? 'Right' : 'Left', d.hp); renderPanel(); applyPose(c); }
    else if (d.finger) { S.finger = d.finger; renderPanel(); }
    else if (d.sel !== undefined) { S.sel = parseInt(d.sel, 10); S.chars.forEach(applyPose); renderPanel(); hud(); }
    else if (d.vis !== undefined) { var ch = S.chars[parseInt(d.vis, 10)]; ch.vis = !ch.vis; placeObj(ch); renderPanel(); }
    else if (d.add) { pushUndo(); var nc = newChar(S.chars.length); S.chars.push(nc); S.sel = S.chars.length - 1; request(nc, true); renderAll(); }
    else if (d.dup) { pushUndo(); var j = JSON.parse(JSON.stringify({ params: c.params, hair: c.hair, cloth: c.cloth, eye: c.eye, pose: c.pose, hipsDrop: c.hipsDrop, pos: c.pos, rotY: c.rotY, scale: c.scale })); var cp = Object.assign(newChar(0), j); cp.name = c.name + ' 복사'; cp.pos = [c.pos[0] + 0.8, c.pos[1]]; cp.id = S.nid++; S.chars.push(cp); S.sel = S.chars.length - 1; request(cp, true); renderAll(); }
    else if (d.del) { if (S.chars.length < 2) return toast('마지막 인물은 지울 수 없어요'); pushUndo(); disposeObj(c.obj); S.chars.splice(S.sel, 1); S.sel = 0; S.chars.forEach(applyPose); renderAll(); }
    else if (d.cam) { var p = d.cam.split(','); S.cam.az = parseFloat(p[0]); S.cam.el = parseFloat(p[1]); }
    else if (d.frame) frameChars();
    else if (d.camsave) { S.camSaves.push(JSON.parse(JSON.stringify(S.cam))); renderPanel(); toast('구도를 저장했어요'); }
    else if (d.camload !== undefined) { S.cam = JSON.parse(JSON.stringify(S.camSaves[parseInt(d.camload, 10)])); }
    else if (d.asp) { S.scene.aspect = d.asp; applyScene(); renderPanel(); }
    else if (d.sc2) { S.scene[d.sc2] = !S.scene[d.sc2]; applyScene(); renderPanel(); }
    else if (d.q) { S.quality = d.q; renderPanel(); S.chars.forEach(function (ch) { request(ch, true); }); }
    else if (d.ex) exportAs(d.ex);
  });
  function frameChars() { var c = cur(); if (!c) return; var h = c.params.height * c.scale; S.cam.tx = c.pos[0]; S.cam.tz = c.pos[1]; S.cam.ty = h * 0.52; S.cam.dist = Math.max(2, h * 2.5); }
  function toast(m) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1800); }

  /* ---------- 내보내기 ---------- */
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000); }
  function shot(transparent) {
    var prevBg = scene.background, el = $('#guide'), w = cv.width, h = cv.height;
    var g = el.hidden ? null : el.getBoundingClientRect(), vr = cv.getBoundingClientRect();
    if (!transparent) renderer.setClearColor(new THREE.Color(S.scene.bg), 1); else renderer.setClearColor(0x000000, 0);
    var hide = grid.visible, dotsOn = []; if (transparent) grid.visible = false;
    S.chars.forEach(function (ch) { if (ch.obj) ch.obj.userData.dots.forEach(function (d) { dotsOn.push([d, d.visible]); d.visible = false; }); });
    renderer.render(scene, camera);
    dotsOn.forEach(function (e) { e[0].visible = e[1]; });
    var src = cv, sx = 0, sy = 0, sw = cv.width, sh = cv.height;
    if (g) { var k = cv.width / vr.width; sx = (g.left - vr.left) * k; sy = (g.top - vr.top) * k; sw = g.width * k; sh = g.height * k; }
    var o = document.createElement('canvas'); o.width = Math.round(sw); o.height = Math.round(sh); var x = o.getContext('2d'); x.drawImage(src, sx, sy, sw, sh, 0, 0, o.width, o.height);
    grid.visible = hide; renderer.setClearColor(0x000000, 0);
    o.toBlob(function (b) { download('human3d' + (transparent ? '_transparent' : '') + '.png', b); });
  }
  $('#shot').onclick = function () { shot(false); }; $('#glb').onclick = function () { exportAs('glb'); };
  function exportAs(kind) {
    var c = cur();
    if (kind === 'png') return shot(false); if (kind === 'pngt') return shot(true);
    if (kind === 'save') return download('human3d-project.json', new Blob([snapshot()], { type: 'application/json' }));
    if (!c || !c.obj) return;
    if (kind === 'obj') {
      var o = c.obj, out = ['# human3d'], base = 0; o.updateMatrixWorld(true);
      o.userData.meshes.forEach(function (m, mi) {
        var p = m.geometry.attributes.position, v = new THREE.Vector3(); out.push('o ' + m.userData.kind);
        for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); m.boneTransform(i, v); out.push('v ' + v.x.toFixed(5) + ' ' + v.y.toFixed(5) + ' ' + v.z.toFixed(5)); }
        var ix = m.geometry.index.array; for (var j = 0; j < ix.length; j += 3) out.push('f ' + (ix[j] + 1 + base) + ' ' + (ix[j + 1] + 1 + base) + ' ' + (ix[j + 2] + 1 + base)); base += p.count;
      });
      return download('human3d.obj', new Blob([out.join('\n')], { type: 'text/plain' }));
    }
    if (kind === 'glb') download('human3d.glb', new Blob([buildGLB(c)], { type: 'model/gltf-binary' }));
  }
  function buildGLB(c) {
    var gen = c.obj.userData.gen, names = gen.skeleton.names, nodes = [], bufs = [], views = [], acc = [], mats = [], meshes = [];
    function addBuf(ta, target) { var raw = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength), pad = (4 - raw.length % 4) % 4, u = new Uint8Array(raw.length + pad); u.set(raw); var off = bufs.reduce(function (a, b) { return a + b.length; }, 0); bufs.push(u); views.push({ buffer: 0, byteOffset: off, byteLength: raw.length, target: target }); return views.length - 1; }
    function addAcc(ta, comp, type, count, target, mm) { var a = { bufferView: addBuf(ta, target), componentType: comp, count: count, type: type }; if (mm) { a.min = mm[0]; a.max = mm[1]; } acc.push(a); return acc.length - 1; }
    // 뼈 노드
    names.forEach(function (n, i) { var par = gen.skeleton.parent[i], w = gen.skeleton.pos[i], pw = par ? gen.skeleton.W[par] : [0, 0, 0]; nodes.push({ name: n, translation: [w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]], children: [] }); });
    names.forEach(function (n, i) { var par = gen.skeleton.parent[i]; if (par) nodes[names.indexOf(par)].children.push(i); });
    var ibm = new Float32Array(names.length * 16); names.forEach(function (n, i) { var w = gen.skeleton.pos[i]; ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], i * 16); });
    var ibmAcc = addAcc(ibm, 5126, 'MAT4', names.length);
    var sceneNodes = [0], skinIdx = 0;
    function addMesh(m, name, color, vcol) {
      var min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9]; for (var i = 0; i < m.pos.length; i += 3) for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.pos[i + k]); max[k] = Math.max(max[k], m.pos[i + k]); }
      var attrs = { POSITION: addAcc(m.pos, 5126, 'VEC3', m.pos.length / 3, 34962, [min, max]), NORMAL: addAcc(m.nrm, 5126, 'VEC3', m.pos.length / 3, 34962), JOINTS_0: addAcc(m.si, 5123, 'VEC4', m.pos.length / 3, 34962), WEIGHTS_0: addAcc(m.sw, 5126, 'VEC4', m.pos.length / 3, 34962) };
      if (vcol && m.col) attrs.COLOR_0 = addAcc(m.col, 5126, 'VEC3', m.pos.length / 3, 34962);
      var ia = addAcc(m.idx, 5125, 'SCALAR', m.idx.length, 34963); mats.push({ name: name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 0.7 }, doubleSided: true });
      meshes.push({ name: name, primitives: [{ attributes: attrs, indices: ia, material: mats.length - 1 }] }); nodes.push({ name: name, mesh: meshes.length - 1, skin: 0 }); sceneNodes.push(nodes.length - 1);
    }
    var hx = function (h) { return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1]; };
    addMesh(gen.body, 'body', [1, 1, 1, 1], true); if (gen.hair) addMesh(gen.hair, 'hair', hx(c.hair.color)); if (gen.cloth) { addMesh(gen.cloth.top, 'top', hx(c.cloth.top)); addMesh(gen.cloth.bot, 'bottom', hx(c.cloth.bot)); }
    var json = { asset: { version: '2.0', generator: 'make_tool human3d' }, scene: 0, scenes: [{ nodes: sceneNodes }], nodes: nodes, meshes: meshes, materials: mats, skins: [{ inverseBindMatrices: ibmAcc, joints: names.map(function (n, i) { return i; }), skeleton: 0 }], accessors: acc, bufferViews: views, buffers: [{ byteLength: bufs.reduce(function (a, b) { return a + b.length; }, 0) }] };
    var js = new TextEncoder().encode(JSON.stringify(json)), jpad = (4 - js.length % 4) % 4, jb = new Uint8Array(js.length + jpad).fill(0x20); jb.set(js);
    var bl = json.buffers[0].byteLength, total = 12 + 8 + jb.length + 8 + bl, out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(jb, 20);
    var o2 = 20 + jb.length; dv.setUint32(o2, bl, true); dv.setUint32(o2 + 4, 0x004E4942, true); var p = o2 + 8; bufs.forEach(function (b) { out.set(b, p); p += b.length; });
    return out.buffer;
  }

  /* ---------- 시작 ---------- */
  function boot() {
    var saved = null; try { saved = localStorage.getItem('human3d-auto'); } catch (e) { }
    initThree(); renderTabs();
    if (saved) { try { var o = JSON.parse(saved); if (o.chars && o.chars.length) { S.chars = o.chars.map(function (d) { d.obj = null; return d; }); S.sel = o.sel || 0; S.scene = o.scene || S.scene; S.cam = o.cam || S.cam; S.nid = o.nid || 10; applyScene(); } } catch (e) { saved = null; } }
    if (!S.chars.length) { S.chars.push(newChar(0)); frameChars(); }
    S.chars.forEach(function (c) { request(c, true); }); renderAll();
    window.addEventListener('resize', resize); setInterval(function () { try { localStorage.setItem('human3d-auto', snapshot()); } catch (e) { } }, 4000);
    window.__h3d = { S: S, B: B, run: run, request: request };
  }
  boot();
})();

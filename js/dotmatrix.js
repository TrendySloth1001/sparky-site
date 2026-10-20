/*
 * Dot-matrix hero backdrop: a port of the sparky app's DotMatrixBackdrop (page variant).
 * A grid of ink dots, with a red "energy" layer driven by springs. It heats from deep red
 * to orange (and a white-hot core on dark). The opening wave rises from the bottom edge,
 * and pointer movement sends ripples out. When the field is quiet the ticker stops and a
 * still frame stays. Constants follow frontend/lib/core/constants/dot_matrix.dart.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("dots");
  if (!canvas || !canvas.getContext) return;
  var hero = canvas.parentElement;
  var ctx = canvas.getContext("2d");
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  var TAU = Math.PI * 2;
  var K = {
    baseR: 1.3, minR: 1.35, fullR: 2.55, maxR: 3.1,
    levels: 18, floor: 0.07, emax: 1.45,
    minAlphaDark: 0.24, minAlphaLight: 0.4,
    inkLevels: 12, inkFadeStart: 0.18, inkBottomLight: 0.2, inkBottomDark: 0.26,
    bloomSprite: 64, bloomFloor: 0.42, bloomMin: 7, bloomMax: 15, bloomAlphaDark: 0.26, bloomAlphaLight: 0.16,
    auroraRows: 4, auroraRadius: 90, auroraRise: 30, auroraAlphaDark: 0.16, auroraAlphaLight: 0.07,
    glowHeight: 150, glowSwell: 0.6,
    breathK1: 0.011, breathK2: 0.027, breathK3: 0.0045, breathW1: 0.9, breathW2: 1.55, breathW3: 0.5, breathPhase: 1.7,
    breathA1: 0.24, breathA2: 0.16, breathA3: 0.1, breathFloor: 0.2,
    openReach: 0.62, openTau: 0.21, openDone: 0.9, openKick: 9, openKickTop: 0.22, openGate: 160,
    idleStrength: 1.0, restStrength: 0.4, stillStrength: 0.75, stillTime: 2.6, freeze: 2.4, quiet: 3.5,
    period: 0.46, damping: 0.24, waveSpeed: 7,
    ripplePeriod: 1.8, rippleDamping: 0.2, rippleSpeed: 20,
    dt: 1 / 120, maxSub: 12, limit: 2.0,
    touchKickE: 14, touchKickR: 7, touchSigma: 1.2, dragKickE: 6, dragKickR: 3.4, dragFull: 18, dragSigma: 1.1,
    calmKinetic: 0.5, restKinetic: 0.02, restDisp: 0.03, resumeGap: 0.25
  };
  var wE = TAU / K.period, zE = K.damping;
  var wR = TAU / K.ripplePeriod, zR = K.rippleDamping;
  var cE2 = K.waveSpeed * K.waveSpeed, cR2 = K.rippleSpeed * K.rippleSpeed;

  // Grid + fields
  var W = 0, H = 0, dpr = 1, S = 12, cols = 0, rows = 0, N = 0, ox = 0, oy = 0;
  var E, V, R, RV, T, level, order, counts, offsets;
  var dark = false;
  var sprite = null, spriteKey = "";
  var ramp = [];

  // Clock + state
  var running = false, raf = 0, last = 0;
  var time = 0;         // seconds since the opening wave started
  var frontPrev = 0;    // previous front radius (normalised)
  var lastKick = 0;     // ms timestamp of the last pointer kick
  var kinetic = 0, disp = 0;
  var visible = true, pageVisible = true;
  var offscreenSince = 0;
  var staticTargets = false;
  var pointer = { x: 0, y: 0, has: false };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  function themeIsDark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : darkQuery.matches;
  }

  // Colour ramp: deep red -> orange-red -> (dark only) white-hot core.
  function buildRamp() {
    dark = themeIsDark();
    var red = [215, 25, 33];
    var hot = hsl(357.3 + 16, 1, dark ? 0.6 : 0.5);
    var minA = dark ? K.minAlphaDark : K.minAlphaLight;
    ramp = [];
    for (var l = 0; l < K.levels; l++) {
      var e = K.emax * (l + 1) / K.levels, share = e / K.emax, c;
      if (share < 0.5) c = red;
      else if (share < 0.78) { var t = (share - 0.5) / 0.28; c = [lerp(red[0], hot[0], t), lerp(red[1], hot[1], t), lerp(red[2], hot[2], t)]; }
      else {
        var m = dark ? 0.4 * clamp((share - 0.78) / 0.22, 0, 1) : 0;
        c = [lerp(hot[0], 255, m), lerp(hot[1], 255, m), lerp(hot[2], 255, m)];
      }
      var alpha = lerp(minA, 1, Math.min(1, e));
      var r = e <= 1 ? lerp(K.minR, K.fullR, e) : lerp(K.fullR, K.maxR, (e - 1) / (K.emax - 1));
      ramp.push({ css: "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + alpha.toFixed(3) + ")", r: r, rgb: c });
    }
    // Halo sprite in the hot colour.
    var key = dark ? "d" : "l";
    if (key !== spriteKey) {
      spriteKey = key;
      sprite = document.createElement("canvas");
      sprite.width = sprite.height = K.bloomSprite;
      var sc = sprite.getContext("2d"), h = hsl(357.3 + 10, 1, dark ? 0.55 : 0.5);
      var g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
      var stops = [0, 0.22, 0.55, 1], prof = [1, 0.55, 0.16, 0];
      for (var i = 0; i < 4; i++) g.addColorStop(stops[i], "rgba(" + Math.round(h[0]) + "," + Math.round(h[1]) + "," + Math.round(h[2]) + "," + prof[i] + ")");
      sc.fillStyle = g; sc.fillRect(0, 0, 64, 64);
    }
  }

  function resize() {
    var r = hero.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === W && h === H && canvas.width === Math.round(w * dpr)) return;
    W = w; H = h;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    S = W > 1500 ? 14 : 12;
    cols = Math.max(2, Math.floor(W / S));
    rows = Math.max(2, Math.floor(H / S));
    N = cols * rows;
    ox = (W - (cols - 1) * S) / 2;
    oy = H - S / 2 - (rows - 1) * S;
    E = new Float32Array(N); V = new Float32Array(N);
    R = new Float32Array(N); RV = new Float32Array(N);
    T = new Float32Array(N);
    level = new Int8Array(N); order = new Int32Array(N);
    counts = new Int32Array(K.levels); offsets = new Int32Array(K.levels + 1);
    settle();
    if (!running) draw();
  }

  // --- targets: the glow along the bottom edge (sum of sines), opening gate, strength over time
  function strengthAt(t) { return lerp(K.idleStrength, K.restStrength, smooth(t / K.freeze)); }

  function computeTargets(tt, strength, gateOpen) {
    var tb = Math.min(tt, K.stillTime);
    var gh = clamp(H * 0.2, K.glowHeight, 200);
    var reachPx = K.openReach * H;
    var s = 1 - Math.exp(-tt / K.openTau);
    var rho = gateOpen ? 9 : s * 1.2;
    var cx = W / 2;
    var colBreath = new Float32Array(cols);
    for (var c = 0; c < cols; c++) {
      var x = ox + c * S;
      var b = 0.5 + K.breathA1 * Math.sin(K.breathK1 * x - K.breathW1 * tb)
                  + K.breathA2 * Math.sin(K.breathK2 * x + K.breathW2 * tb + K.breathPhase)
                  + K.breathA3 * Math.sin(K.breathK3 * x - K.breathW3 * tb * 1.3);
      colBreath[c] = K.breathFloor + (1 - K.breathFloor) * clamp(b, 0, 1);
    }
    for (var r = 0; r < rows; r++) {
      var y = oy + r * S, dist = H - y; // px above the bottom edge
      for (var c2 = 0; c2 < cols; c2++) {
        var i = r * cols + c2, br = colBreath[c2];
        var g = gh * (1 + K.glowSwell * (br - 0.5));
        var w = 1 - dist / g;
        if (w <= 0) { T[i] = 0; continue; }
        w = Math.pow(w, 1.6);
        var gate = 1;
        if (!gateOpen) {
          var dx = (ox + c2 * S - cx) / (W / 2), dy = dist / reachPx;
          var d = Math.sqrt(dx * dx + dy * dy);
          gate = smooth((rho - d) * reachPx / K.openGate);
        }
        T[i] = strength * br * w * gate;
      }
    }
  }

  // Wave front: kick dots the front passes.
  function openFront(tt) {
    var reachPx = K.openReach * H, cx = W / 2;
    var rho = (1 - Math.exp(-tt / K.openTau)) * 1.2;
    if (rho <= frontPrev) return;
    for (var r = 0; r < rows; r++) {
      var dist = H - (oy + r * S);
      var dy = dist / reachPx;
      if (dy > rho + 0.01) continue;
      var up = clamp(dist / reachPx, 0, 1);
      var kick = K.openKick * lerp(1, K.openKickTop, up);
      for (var c = 0; c < cols; c++) {
        var dx = (ox + c * S - cx) / (W / 2);
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > frontPrev && d <= rho) V[r * cols + c] += kick;
      }
    }
    frontPrev = rho;
  }

  function settle() {
    // Land at rest on the final (quiet) targets.
    computeTargets(K.freeze + 1, K.restStrength, true);
    for (var i = 0; i < N; i++) { E[i] = T[i]; V[i] = 0; R[i] = 0; RV[i] = 0; }
    frontPrev = 9; time = K.freeze + 1; staticTargets = true;
    kinetic = 0; disp = 0;
  }

  function still() {
    // Reduced motion: one settled frame at a lively phase of the breathing.
    computeTargets(K.stillTime, K.stillStrength, true);
    for (var i = 0; i < N; i++) { E[i] = T[i]; V[i] = 0; R[i] = 0; RV[i] = 0; }
  }

  // --- physics
  function step(dt) {
    var wE2 = wE * wE, dE = 2 * zE * wE, wR2 = wR * wR, dR = 2 * zR * wR;
    var lim = K.limit, kin = 0, dsp = 0, cc = cols, rr = rows;
    for (var r = 0; r < rr; r++) {
      var row = r * cc;
      for (var c = 0; c < cc; c++) {
        var i = row + c, e = E[i], h = R[i];
        var eL = c > 0 ? E[i - 1] : e, eR = c < cc - 1 ? E[i + 1] : e;
        var eU = r > 0 ? E[i - cc] : e, eD = r < rr - 1 ? E[i + cc] : e;
        var hL = c > 0 ? R[i - 1] : h, hR = c < cc - 1 ? R[i + 1] : h;
        var hU = r > 0 ? R[i - cc] : h, hD = r < rr - 1 ? R[i + cc] : h;
        V[i] += (-wE2 * (e - T[i]) - dE * V[i] + cE2 * (eL + eR + eU + eD - 4 * e)) * dt;
        RV[i] += (-wR2 * h - dR * RV[i] + cR2 * (hL + hR + hU + hD - 4 * h)) * dt;
      }
    }
    for (var j = 0; j < N; j++) {
      var ne = E[j] + V[j] * dt, nh = R[j] + RV[j] * dt;
      E[j] = ne < -lim ? -lim : ne > lim ? lim : ne;
      R[j] = nh < -lim ? -lim : nh > lim ? lim : nh;
      kin += V[j] * V[j] + RV[j] * RV[j];
      dsp += Math.abs(E[j] - T[j]) + Math.abs(R[j]);
    }
    kinetic = kin / N; disp = dsp / N;
  }

  // --- drawing
  function draw() {
    if (!N) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    var ink = dark ? "255,255,255" : "10,10,10";
    var inkMax = dark ? K.inkBottomDark : K.inkBottomLight;
    var emax = K.emax, i, r, c, l;

    // 1. energy levels per dot
    for (l = 0; l < K.levels; l++) counts[l] = 0;
    for (i = 0; i < N; i++) {
      var en = E[i] > 0 ? E[i] : 0, rp = R[i] < 0 ? -R[i] : R[i];
      en += rp;
      if (en > emax) en = emax;
      if (en < K.floor) { level[i] = -1; continue; }
      l = Math.min(K.levels - 1, Math.floor(en / emax * K.levels));
      level[i] = l; counts[l]++;
    }
    offsets[0] = 0;
    for (l = 0; l < K.levels; l++) offsets[l + 1] = offsets[l] + counts[l];
    for (l = 0; l < K.levels; l++) counts[l] = offsets[l];
    for (i = 0; i < N; i++) if (level[i] >= 0) order[counts[level[i]]++] = i;

    // 2. ink dots, row alpha quantised to inkLevels, one path each
    var rowLvl = new Int8Array(rows);
    for (r = 0; r < rows; r++) {
      var f = clamp(((oy + r * S) / H - K.inkFadeStart) / (1 - K.inkFadeStart), 0, 1);
      rowLvl[r] = Math.round(f * K.inkLevels);
    }
    for (var il = 1; il <= K.inkLevels; il++) {
      ctx.beginPath();
      var any = false;
      for (r = 0; r < rows; r++) {
        if (rowLvl[r] !== il) continue;
        var y = oy + r * S;
        for (c = 0; c < cols; c++) {
          if (level[r * cols + c] >= 0) continue;
          var x = ox + c * S;
          ctx.moveTo(x + K.baseR, y); ctx.arc(x, y, K.baseR, 0, TAU); any = true;
        }
      }
      if (any) { ctx.fillStyle = "rgba(" + ink + "," + (inkMax * il / K.inkLevels).toFixed(3) + ")"; ctx.fill(); }
    }

    // 3. halos under hot dots (added light on dark, multiplied ink on light)
    ctx.globalCompositeOperation = dark ? "lighter" : "multiply";
    var bAlpha = dark ? K.bloomAlphaDark : K.bloomAlphaLight;
    for (l = 0; l < K.levels; l++) {
      var eL = emax * (l + 1) / K.levels;
      if (eL < K.bloomFloor || offsets[l + 1] === offsets[l]) continue;
      var rad = lerp(K.bloomMin, K.bloomMax, clamp((eL - K.bloomFloor) / (emax - K.bloomFloor), 0, 1));
      ctx.globalAlpha = bAlpha * Math.min(1, eL);
      for (var k = offsets[l]; k < offsets[l + 1]; k++) {
        i = order[k]; r = (i / cols) | 0; c = i - r * cols;
        ctx.drawImage(sprite, ox + c * S - rad, oy + r * S - rad, rad * 2, rad * 2);
      }
    }
    // aurora: one big halo per few columns along the bottom
    var aA = dark ? K.auroraAlphaDark : K.auroraAlphaLight;
    for (c = 0; c < cols; c += 3) {
      var sum = 0, n = 0;
      for (r = rows - K.auroraRows; r < rows; r++) { if (r < 0) continue; i = r * cols + c; sum += Math.min(emax, Math.max(0, E[i]) + Math.abs(R[i])); n++; }
      var ea = n ? sum / n : 0;
      if (ea < 0.1) continue;
      ctx.globalAlpha = aA * Math.min(1, ea) * 1.6;
      var ar = K.auroraRadius;
      ctx.drawImage(sprite, ox + c * S - ar, H - K.auroraRise - ar, ar * 2, ar * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // 4. energy dots, one path per level
    for (l = 0; l < K.levels; l++) {
      if (offsets[l + 1] === offsets[l]) continue;
      var rd = ramp[l].r;
      ctx.beginPath();
      for (var m = offsets[l]; m < offsets[l + 1]; m++) {
        i = order[m]; r = (i / cols) | 0; c = i - r * cols;
        var px = ox + c * S, py = oy + r * S;
        ctx.moveTo(px + rd, py); ctx.arc(px, py, rd, 0, TAU);
      }
      ctx.fillStyle = ramp[l].css; ctx.fill();
    }
  }

  // --- ticker
  function canRun() { return visible && pageVisible && !reduceQuery.matches; }
  function start() {
    if (running || !canRun()) return;
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function frame(now) {
    raf = 0;
    if (!running) return;
    if (!last) last = now - 16;
    var elapsed = (now - last) / 1000;
    var calm = kinetic < K.calmKinetic;
    var minGap = (calm ? 1 / 30 : 1 / 60) - 0.003;
    if (elapsed < minGap) { raf = requestAnimationFrame(frame); return; }
    last = now;
    if (elapsed > K.resumeGap) { settle(); draw(); stop(); return; } // was hidden or stalled
    var dt = Math.min(elapsed, 0.1);
    time += dt;
    if (time < K.freeze + 0.3) { computeTargets(time, strengthAt(time), time > K.openDone + 0.5); staticTargets = false; }
    else if (!staticTargets) { computeTargets(K.freeze + 1, K.restStrength, true); staticTargets = true; }
    if (time < K.openDone) openFront(time);
    var steps = Math.min(K.maxSub, Math.max(1, Math.round(dt / K.dt)));
    for (var s = 0; s < steps; s++) step(dt / steps);
    draw();
    var quiet = (now - lastKick) / 1000 > K.quiet && time > K.freeze;
    if (quiet && kinetic < K.restKinetic && disp < K.restDisp) { settle(); draw(); stop(); return; }
    raf = requestAnimationFrame(frame);
  }

  function openWave() {
    if (reduceQuery.matches) { still(); draw(); return; }
    for (var i = 0; i < N; i++) { E[i] = 0; V[i] = 0; R[i] = 0; RV[i] = 0; }
    time = 0; frontPrev = 0; staticTargets = false; lastKick = performance.now();
    computeTargets(0, strengthAt(0), false);
    stop(); start();
  }

  // --- pointer
  function kickAt(px, py, amtE, amtR, sigma) {
    var cx = (px - ox) / S, cy = (py - oy) / S;
    var reach = Math.ceil(sigma * 3);
    var c0 = Math.max(0, Math.floor(cx) - reach), c1 = Math.min(cols - 1, Math.ceil(cx) + reach);
    var r0 = Math.max(0, Math.floor(cy) - reach), r1 = Math.min(rows - 1, Math.ceil(cy) + reach);
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
      var d2 = (c - cx) * (c - cx) + (r - cy) * (r - cy);
      var g = Math.exp(-d2 / (2 * sigma * sigma));
      if (g < 0.02) continue;
      var i = r * cols + c;
      V[i] += amtE * g; RV[i] += amtR * g;
    }
    lastKick = performance.now();
    if (!running) { if (time > K.freeze) { /* keep targets static */ } start(); }
  }

  function local(ev) { var b = hero.getBoundingClientRect(); return { x: ev.clientX - b.left, y: ev.clientY - b.top }; }

  function onDown(ev) {
    if (reduceQuery.matches || !N) return;
    var p = local(ev); pointer.x = p.x; pointer.y = p.y; pointer.has = true;
    kickAt(p.x, p.y, K.touchKickE, K.touchKickR, K.touchSigma);
  }
  function onMove(ev) {
    if (reduceQuery.matches || !N) return;
    var p = local(ev);
    if (!pointer.has) { pointer.x = p.x; pointer.y = p.y; pointer.has = true; return; }
    var d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
    pointer.x = p.x; pointer.y = p.y;
    if (d < 1) return;
    var k = Math.min(1, d / K.dragFull);
    kickAt(p.x, p.y, K.dragKickE * k, K.dragKickR * k, K.dragSigma);
  }
  function onLeave() { pointer.has = false; }

  // --- wiring
  function refreshTheme() { buildRamp(); if (!running) draw(); }

  function init() {
    buildRamp();
    resize();
    if (reduceQuery.matches) { still(); draw(); } else { openWave(); }

    hero.addEventListener("pointerdown", onDown, { passive: true });
    hero.addEventListener("pointermove", onMove, { passive: true });
    hero.addEventListener("pointerleave", onLeave, { passive: true });

    if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); }).observe(hero);
    else window.addEventListener("resize", resize);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        var vis = es[0].isIntersecting;
        if (vis === visible) return;
        visible = vis;
        if (!vis) { offscreenSince = performance.now(); stop(); }
        else if (!reduceQuery.matches) {
          if (performance.now() - offscreenSince > 2500 && time > K.freeze) openWave(); // replay the opening
          else if (kinetic > 0 || disp > K.restDisp) start();
        }
      }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () {
      pageVisible = !document.hidden;
      if (!pageVisible) stop();
      else if (time <= K.freeze + 0.3 || kinetic >= K.restKinetic) start();
    });

    new MutationObserver(refreshTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    var onScheme = function () { refreshTheme(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onScheme); else if (darkQuery.addListener) darkQuery.addListener(onScheme);
    var onMotion = function () {
      if (reduceQuery.matches) { stop(); resize(); still(); draw(); } else { openWave(); }
    };
    if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onMotion); else if (reduceQuery.addListener) reduceQuery.addListener(onMotion);

    window.__sparkyDots = { get running() { return running; }, get time() { return time; }, get kinetic() { return kinetic; } }; // read-only, for debugging
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

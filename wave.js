/* Minerva — adaptive wave, mobile-optimised */
(function () {
  'use strict';

  /* ── zone visibility — ?waves=top | bottom | both (default) ─────── */
  const _wParam = new URLSearchParams(location.search).get('waves') || 'both';
  const SHOW_TOP = _wParam !== 'bottom';
  const SHOW_BOT = _wParam !== 'top';

  /* ── forced quality tier — ?tier=lo | md | hi (default: auto) ───── */
  const _tierParam = new URLSearchParams(location.search).get('tier');

  /* ── canvas ──────────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;z-index:0;pointer-events:none;';
  document.body.prepend(canvas);

  Array.from(document.body.children).forEach(function (el) {
    if (el !== canvas) { el.style.position = 'relative'; el.style.zIndex = '1'; }
  });

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  /* ── quality tiers ───────────────────────────────────────────────── */
  let tier = 'hi';
  let N_ROWS, N_COLS, N_SEGS, C_ROWS, FPS_TARGET;

  /* ── zone geometry constants (declared early — used in precompute) ── */
  const CLEAR = 0.26, OVER = 0.04, MIN_W = 0.55, MAX_W = 1.22;
  const POWER = 1.80, AMP = 1.00;

  /* ── gradient cache state ────────────────────────────────────────── */
  const GRAD_REFRESH = 3;
  let _grads      = null;
  let _gradFrame  = -9999;
  let _frameCount = 0;

  /* ── per-row pre-computed tables (rebuilt on resize / tier change) ── */
  /*
     All values in these tables depend only on row index, N_ROWS, W, and
     POWER — none of which change mid-animation.  Computing them once on
     resize and reading them in the hot loop eliminates:
       · Math.pow per segment for ampScale  (~1.5M calls/sec saved)
       · Math.pow per row for d             (~240k calls/sec saved)
       · horizY/nearY function calls        (hoisted to per-zone consts)
       · separate disp(0,d,t) for core col  (captured mid-loop instead)
       · string alloc for bloom/halo grey   (precomputed string literals)
  */
  let rowD      = null;   /* Float32: d = pow(r/(N_ROWS-1), POWER)      */
  let rowHW     = null;   /* Float32: hw(d) — half-width per row         */
  let rowAmpS   = null;   /* Float32: ampScale(d) per row                */
  let rowBaseL  = null;   /* Int32:   (6 + d*76)|0 for grey() base lum   */
  let rowBloom  = null;   /* string[]: grey(d,0,0.028) literal per row   */
  let rowHalo   = null;   /* string[]: grey(d,0,0.072) literal per row   */
  let colD      = null;   /* Float32: d for colour-layer rows             */
  let colHW     = null;   /* Float32: hw(d)*0.995 for colour-layer rows  */
  let colAmpS   = null;   /* Float32: ampScale(d) for colour-layer rows  */

  function applyTier(w) {
    const forced = _tierParam === 'lo' || _tierParam === 'md' || _tierParam === 'hi'
      ? _tierParam : null;
    const t = forced || (w < 768 ? 'lo' : w < 1024 ? 'md' : 'hi');
    tier = t;
    if (t === 'lo') {
      N_ROWS = 22; N_COLS = 10; N_SEGS = 38; C_ROWS = 6;  FPS_TARGET = 30;
    } else if (t === 'md') {
      N_ROWS = 52; N_COLS = 20; N_SEGS = 80; C_ROWS = 20; FPS_TARGET = 60;
    } else {
      N_ROWS = 68; N_COLS = 26; N_SEGS = 110; C_ROWS = 32; FPS_TARGET = 60;
    }
    _gradFrame = -9999;
  }

  /* ── resize (debounced) ──────────────────────────────────────────── */
  function precompute() {
    /* Horizontal row tables */
    rowD     = new Float32Array(N_ROWS);
    rowHW    = new Float32Array(N_ROWS);
    rowAmpS  = new Float32Array(N_ROWS);
    rowBaseL = new Int32Array(N_ROWS);
    rowBloom = [];
    rowHalo  = [];
    for (let r = 0; r < N_ROWS; r++) {
      const d  = Math.pow(r / (N_ROWS - 1 || 1), POWER);
      const as = 0.42 + 0.58 * Math.pow(d, 0.55);
      const hw = (W * 0.5) * (MIN_W + d * (MAX_W - MIN_W));
      const bl = Math.min(97, (6 + d * 76) | 0);
      rowD[r]     = d;
      rowHW[r]    = hw;
      rowAmpS[r]  = as;
      rowBaseL[r] = bl;
      rowBloom[r] = 'hsla(0,0%,' + bl + '%,0.028)';
      rowHalo[r]  = 'hsla(0,0%,' + bl + '%,0.072)';
    }
    /* Colour-layer row tables */
    colD    = new Float32Array(C_ROWS);
    colHW   = new Float32Array(C_ROWS);
    colAmpS = new Float32Array(C_ROWS);
    for (let r = 0; r < C_ROWS; r++) {
      const d = Math.pow((r + 0.5) / C_ROWS, POWER);
      colD[r]    = d;
      colHW[r]   = (W * 0.5) * (MIN_W + d * (MAX_W - MIN_W)) * 0.995;
      colAmpS[r] = 0.42 + 0.58 * Math.pow(d, 0.55);
    }
    _gradFrame = -9999;
  }

  function resize() {
    W   = window.innerWidth;
    H   = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, tier === 'lo' ? 1.5 : 2);
    canvas.width        = Math.round(W * DPR);
    canvas.height       = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    precompute();
  }

  let resizeTimer = null;
  function scheduleResize(delay) {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { applyTier(window.innerWidth); resize(); }, delay);
  }

  window.addEventListener('resize',            function () { scheduleResize(150); });
  window.addEventListener('orientationchange', function () { scheduleResize(400); });

  applyTier(window.innerWidth);
  resize();

  /* ── prefers-reduced-motion ──────────────────────────────────────── */
  const motionMQL  = window.matchMedia('(prefers-reduced-motion: reduce)');
  let   slowMotion = motionMQL.matches;
  motionMQL.addEventListener('change', function (e) { slowMotion = e.matches; });

  /* ── zone geometry ───────────────────────────────────────────────── */
  function horizY(top) { return top ?  H * (0.5 - CLEAR) : H * (0.5 + CLEAR); }
  function nearY (top) { return top ? -H * OVER           : H * (1 + OVER);    }

  /* ── wave displacement ───────────────────────────────────────────── */
  function disp(wx, d, t) {
    const x = wx * 4.6, z = d * 23.0;
    let v =
      Math.sin(x * 1.94 + t * 0.94 + z * 0.058) * 0.34 +
      Math.sin(x * 0.67 - t * 0.71 + z * 0.145) * 0.26 +
      Math.sin(x * 4.98 + z * 0.19 + t * 1.67)  * 0.22 +
      Math.sin(x * 1.35 + z * 0.07 - t * 0.53)  * 0.18;
    if (tier !== 'lo') {
      v += Math.sin(x * 8.07 + z * 0.03 - t * 2.14) * 0.07 +
           Math.sin(x * 0.34 + z * 0.31 + t * 0.27)  * 0.05 +
           Math.cos(x * 3.02 - z * 0.12 - t * 1.08)  * 0.02;
    }
    return v;
  }

  /* ── colours ─────────────────────────────────────────────────────── */
  function prismHue(pos, dv, d, t) {
    return ((pos * 140 + t * 22 + dv * 55 + d * 80) % 360 + 360) % 360;
  }

  /* ── shared buffers ──────────────────────────────────────────────── */
  const rowXs = new Float32Array(111);
  const rowYs = new Float32Array(111);

  function buildPath() {
    ctx.beginPath();
    ctx.moveTo(rowXs[0], rowYs[0]);
    for (let s = 1; s <= N_SEGS; s++) ctx.lineTo(rowXs[s], rowYs[s]);
  }

  function strokeOnly(lw, col) {
    ctx.lineWidth   = lw;
    ctx.strokeStyle = col;
    ctx.stroke();
  }

  /* ── monochrome zone ─────────────────────────────────────────────── */
  function drawZone(t, top) {
    /* Hoist per-zone constants — avoids repeated function calls in loops */
    const hY   = horizY(top);
    const nY   = nearY(top);
    const span = nY - hY;
    const absS = Math.abs(span);
    const W2   = W * 0.5;
    const mid  = N_SEGS >> 1;   /* index where wx ≈ 0 */

    ctx.globalCompositeOperation = 'screen';

    /* cross lines — skip on lo for speed */
    if (tier !== 'lo') {
      for (let c = 0; c <= N_COLS; c++) {
        const wx = (c / N_COLS) * 2 - 1;
        ctx.beginPath();
        for (let r = 0; r < N_ROWS; r++) {
          const d  = rowD[r];
          const x  = W2 + wx * rowHW[r];
          const y  = hY + span * d + disp(wx, d, t) * absS * AMP * rowAmpS[r];
          r === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineWidth   = 0.40;
        ctx.strokeStyle = 'hsla(0,0%,40%,0.180)';
        ctx.stroke();
      }
    }

    /* horizontal rows — build path once, stroke up to 3× */
    for (let r = 0; r < N_ROWS; r++) {
      const d     = rowD[r];
      const hw    = rowHW[r];
      const asAmp = rowAmpS[r];
      const by    = hY + span * d;
      const scale = absS * AMP * asAmp;
      let centerDisp = 0;

      for (let s = 0; s <= N_SEGS; s++) {
        const wx = (s / N_SEGS) * 2 - 1;
        const dv = disp(wx, d, t);
        rowXs[s] = W2 + wx * hw;
        rowYs[s] = by + dv * scale;
        if (s === mid) centerDisp = dv;
      }

      if (tier === 'lo') {
        buildPath();
        strokeOnly(0.9 * d + 0.15,
          'hsla(0,0%,' + Math.min(97, rowBaseL[r] + (Math.abs(centerDisp) * 12) | 0) + '%,0.850)');
        continue;
      }

      buildPath();
      if (d > 0.14) strokeOnly(10  * d + 0.5, rowBloom[r]);    /* outer bloom */
      if (tier === 'hi' && d > 0.08) strokeOnly(3.8 * d + 0.3, rowHalo[r]); /* mid halo */
      strokeOnly(0.9 * d + 0.15,
        'hsla(0,0%,' + Math.min(97, rowBaseL[r] + (Math.abs(centerDisp) * 12) | 0) + '%,0.780)');
    }
  }

  /* ── colour diffraction layer ────────────────────────────────────── */
  const C_PHASE = 0.72, C_SPEED = 1.18;

  function rebuildGrads(t) {
    const N_STOPS = tier === 'hi' ? 14 : 7;
    const tc = t * C_SPEED + C_PHASE;
    if (!_grads || _grads.length !== C_ROWS) _grads = new Array(C_ROWS);
    for (let r = 0; r < C_ROWS; r++) {
      const d    = colD[r];
      const x0   = W * 0.5 - colHW[r];
      const x1   = W * 0.5 + colHW[r];
      const core = ctx.createLinearGradient(x0, 0, x1, 0);
      const glow = ctx.createLinearGradient(x0, 0, x1, 0);
      for (let g = 0; g <= N_STOPS; g++) {
        const pos = g / N_STOPS;
        const wx  = pos * 2 - 1;
        const dv  = disp(wx, d, tc);
        const h   = prismHue(pos, dv, d, t);
        const lum = 52 + Math.abs(dv) * 12;
        const cA  = (0.38 + d * 0.42) * (0.55 + Math.abs(dv) * 0.45);
        const gA  = (0.14 + d * 0.22) * (0.45 + Math.abs(dv) * 0.35);
        core.addColorStop(pos,
          'hsla(' + (h|0) + ',95%,' + (lum|0) + '%,' + cA.toFixed(3) + ')');
        glow.addColorStop(pos,
          'hsla(' + (h|0) + ',95%,' + ((lum+15)|0) + '%,' + gA.toFixed(3) + ')');
      }
      _grads[r] = { core: core, glow: glow };
    }
    _gradFrame = _frameCount;
  }

  function drawColourLayer(t, top) {
    if (C_ROWS === 0) return;
    if (_frameCount - _gradFrame >= GRAD_REFRESH) rebuildGrads(t);

    const hY   = horizY(top);
    const span = nearY(top) - hY;
    const absS = Math.abs(span);
    const tc   = t * C_SPEED + C_PHASE;
    const W2   = W * 0.5;

    ctx.globalCompositeOperation = 'screen';

    for (let r = 0; r < C_ROWS; r++) {
      const d     = colD[r];
      const hw    = colHW[r];
      const by    = hY + span * d;
      const scale = absS * AMP * colAmpS[r];

      for (let s = 0; s <= N_SEGS; s++) {
        const wx = (s / N_SEGS) * 2 - 1;
        rowXs[s] = W2 + wx * hw;
        rowYs[s] = by + disp(wx, d, tc) * scale;
      }

      const g = _grads[r];
      buildPath();
      strokeOnly(9   * d + 1.2, g.glow);
      strokeOnly(1.6 * d + 0.3, g.core);
    }
  }

  /* ── render loop ─────────────────────────────────────────────────── */
  const BASE_SPEED = 0.00025;
  const SLOW_SPEED = 0.00004;
  let lastMs = 0;

  function frame(ms) {
    requestAnimationFrame(frame);

    const targetInterval = 1000 / FPS_TARGET;
    if (ms - lastMs < targetInterval - 1) return;
    lastMs = ms;
    _frameCount++;

    const t = ms * (slowMotion ? SLOW_SPEED : BASE_SPEED);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(15,15,15,0.20)';
    ctx.fillRect(0, 0, W, H);

    if (SHOW_TOP) { drawZone(t, true);  drawColourLayer(t, true);  }
    if (SHOW_BOT) { drawZone(t, false); drawColourLayer(t, false); }
  }

  requestAnimationFrame(frame);
}());

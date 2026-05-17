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
  /*
     lo  (< 768 px)   iPhone / small Android
         - 30 fps cap, DPR ≤ 1.5, core stroke only, no colour layer
     md  (768–1199 px) tablet / small laptop
         - 60 fps, DPR ≤ 2, bloom+core, reduced colour layer
     hi  (≥ 1200 px)  desktop
         - 60 fps, DPR ≤ 2, full 3-pass, full colour layer
  */
  let tier = 'hi';
  let N_ROWS, N_COLS, N_SEGS, C_ROWS, FPS_TARGET;

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
  }

  /* ── resize (debounced) ──────────────────────────────────────────── */
  function resize() {
    W   = window.innerWidth;
    H   = window.innerHeight;
    /* Cap DPR more aggressively on mobile — 1.5 saves ~44% canvas pixels */
    DPR = Math.min(window.devicePixelRatio || 1, tier === 'lo' ? 1.5 : 2);
    canvas.width        = Math.round(W * DPR);
    canvas.height       = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
  const CLEAR = 0.26, OVER = 0.04, MIN_W = 0.55, MAX_W = 1.22;
  const POWER = 1.80, AMP = 1.00;

  function horizY(top) { return top ?  H * (0.5 - CLEAR) : H * (0.5 + CLEAR); }
  function nearY (top) { return top ? -H * OVER           : H * (1 + OVER);    }
  function baseY (d, top) { return horizY(top) + (nearY(top) - horizY(top)) * d; }
  function hw    (d)      { return (W * 0.5) * (MIN_W + d * (MAX_W - MIN_W)); }
  function ampScale(d)    { return 0.42 + 0.58 * Math.pow(d, 0.55); }

  /* ── wave displacement ───────────────────────────────────────────── */
  /* lo tier uses 4 frequencies; md/hi use all 7.                      */
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
  function grey(d, extra, a) {
    const l = Math.min(97, 6 + d * 76 + extra * 12);
    return 'hsla(0,0%,' + (l | 0) + '%,' + a.toFixed(3) + ')';
  }

  function prismHue(pos, dv, d, t) {
    return ((pos * 140 + t * 22 + dv * 55 + d * 80) % 360 + 360) % 360;
  }

  /* ── shared buffers (sized to max N_SEGS = 110) ──────────────────── */
  const rowXs = new Float32Array(111);
  const rowYs = new Float32Array(111);

  function strokeBuf(lw, col) {
    ctx.beginPath();
    for (let s = 0; s <= N_SEGS; s++) {
      s === 0 ? ctx.moveTo(rowXs[s], rowYs[s]) : ctx.lineTo(rowXs[s], rowYs[s]);
    }
    ctx.lineWidth   = lw;
    ctx.strokeStyle = col;
    ctx.stroke();
  }

  /* ── monochrome zone ─────────────────────────────────────────────── */
  function drawZone(t, top) {
    const span = nearY(top) - horizY(top);
    const absS = Math.abs(span);

    ctx.globalCompositeOperation = 'screen';

    /* cross lines — skip on lo for speed */
    if (tier !== 'lo') {
      for (let c = 0; c <= N_COLS; c++) {
        const wx = (c / N_COLS) * 2 - 1;
        ctx.beginPath();
        for (let r = 0; r < N_ROWS; r++) {
          const d = Math.pow(r / (N_ROWS - 1), POWER);
          const x = W * 0.5 + wx * hw(d);
          const y = baseY(d, top) + disp(wx, d, t) * absS * AMP * ampScale(d);
          r === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineWidth   = 0.40;
        ctx.strokeStyle = grey(0.40, 0, 0.18);
        ctx.stroke();
      }
    }

    /* horizontal rows — far first; skip expensive bloom for dim far rows */
    for (let r = 0; r < N_ROWS; r++) {
      const d      = Math.pow(r / (N_ROWS - 1), POWER);
      const lineHW = hw(d);
      const by     = baseY(d, top);

      for (let s = 0; s <= N_SEGS; s++) {
        const wx = (s / N_SEGS) * 2 - 1;
        rowXs[s] = W * 0.5 + wx * lineHW;
        rowYs[s] = by + disp(wx, d, t) * absS * AMP * ampScale(d);
      }

      /* lo: one pass only */
      if (tier === 'lo') {
        strokeBuf(0.9 * d + 0.15, grey(d, Math.abs(disp(0, d, t)), 0.85));
        continue;
      }

      /* md/hi: bloom only for rows that are bright enough to warrant it */
      if (d > 0.14) {
        strokeBuf(10 * d + 0.5, grey(d, 0, 0.028));
      }
      /* hi: mid halo */
      if (tier === 'hi' && d > 0.08) {
        strokeBuf(3.8 * d + 0.3, grey(d, 0, 0.072));
      }
      /* core — always */
      strokeBuf(0.9 * d + 0.15, grey(d, Math.abs(disp(0, d, t)), 0.78));
    }
  }

  /* ── colour diffraction layer — md/hi only ───────────────────────── */
  const C_PHASE = 0.72, C_SPEED = 1.18;

  function drawColourLayer(t, top) {
    if (C_ROWS === 0) return;

    const tc   = t * C_SPEED + C_PHASE;
    const span = nearY(top) - horizY(top);
    const absS = Math.abs(span);
    /* md uses fewer gradient stops to cut createLinearGradient cost    */
    const N_STOPS = tier === 'hi' ? 14 : 7;

    ctx.globalCompositeOperation = 'screen';

    for (let r = 0; r < C_ROWS; r++) {
      const d      = Math.pow((r + 0.5) / C_ROWS, POWER);
      const lineHW = hw(d) * 0.995;
      const by     = baseY(d, top);
      const as_amp = absS * AMP * ampScale(d);

      for (let s = 0; s <= N_SEGS; s++) {
        const wx = (s / N_SEGS) * 2 - 1;
        rowXs[s] = W * 0.5 + wx * lineHW;
        rowYs[s] = by + disp(wx, d, tc) * as_amp;
      }

      const x0 = rowXs[0], x1 = rowXs[N_SEGS];
      const coreGrad = ctx.createLinearGradient(x0, 0, x1, 0);
      const glowGrad = ctx.createLinearGradient(x0, 0, x1, 0);

      for (let g = 0; g <= N_STOPS; g++) {
        const pos  = g / N_STOPS;
        const wx   = pos * 2 - 1;
        const dv   = disp(wx, d, tc);
        const h    = prismHue(pos, dv, d, t);
        const lum  = 52 + Math.abs(dv) * 12;
        const cA   = (0.38 + d * 0.42) * (0.55 + Math.abs(dv) * 0.45);
        const gA   = (0.14 + d * 0.22) * (0.45 + Math.abs(dv) * 0.35);
        coreGrad.addColorStop(pos,
          'hsla(' + (h|0) + ',95%,' + (lum|0) + '%,' + cA.toFixed(3) + ')');
        glowGrad.addColorStop(pos,
          'hsla(' + (h|0) + ',95%,' + ((lum+15)|0) + '%,' + gA.toFixed(3) + ')');
      }

      strokeBuf(9   * d + 1.2, glowGrad);
      strokeBuf(1.6 * d + 0.3, coreGrad);
    }
  }

  /* ── render loop with fps cap ────────────────────────────────────── */
  const BASE_SPEED = 0.00025;
  const SLOW_SPEED = 0.00004;
  let lastMs = 0;

  function frame(ms) {
    requestAnimationFrame(frame);

    /* Throttle to FPS_TARGET on mobile */
    const targetInterval = 1000 / FPS_TARGET;
    if (ms - lastMs < targetInterval - 1) return;
    lastMs = ms;

    const t = ms * (slowMotion ? SLOW_SPEED : BASE_SPEED);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(15,15,15,0.20)';
    ctx.fillRect(0, 0, W, H);

    if (SHOW_TOP) { drawZone(t, true);  drawColourLayer(t, true);  }
    if (SHOW_BOT) { drawZone(t, false); drawColourLayer(t, false); }
  }

  requestAnimationFrame(frame);
}());

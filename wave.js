/* Minerva — adaptive retina wave + crystal-diffraction layer */
(function () {
  'use strict';

  /* ── canvas ──────────────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;z-index:0;pointer-events:none;';
  document.body.prepend(canvas);

  Array.from(document.body.children).forEach(function (el) {
    if (el !== canvas) { el.style.position = 'relative'; el.style.zIndex = '1'; }
  });

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  /* ── quality tiers ───────────────────────────────────────────────────── */
  /* Fewer rows / segments on small / high-DPR screens to stay at 60 fps. */
  let N_ROWS, N_COLS, N_SEGS, C_ROWS;
  const MAX_SEGS = 110;   /* buffer ceiling — never reallocated            */

  function applyQuality(w) {
    if (w < 480) {
      N_ROWS = 28; N_COLS = 14; N_SEGS = 50;  C_ROWS = 12;
    } else if (w < 768) {
      N_ROWS = 38; N_COLS = 18; N_SEGS = 65;  C_ROWS = 18;
    } else if (w < 1200) {
      N_ROWS = 52; N_COLS = 22; N_SEGS = 85;  C_ROWS = 24;
    } else {
      N_ROWS = 68; N_COLS = 26; N_SEGS = 110; C_ROWS = 32;
    }
  }

  /* ── resize (debounced, DPR-aware) ───────────────────────────────────── */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width        = Math.round(W * DPR);
    canvas.height       = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    applyQuality(W);
  }

  let resizeTimer = null;
  function scheduleResize(delay) {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, delay || 150);
  }

  window.addEventListener('resize',            function () { scheduleResize(150); });
  window.addEventListener('orientationchange', function () { scheduleResize(400); });

  resize(); /* initial */

  /* ── prefers-reduced-motion ──────────────────────────────────────────── */
  const motionMQL  = window.matchMedia('(prefers-reduced-motion: reduce)');
  let   slowMotion = motionMQL.matches;
  motionMQL.addEventListener('change', function (e) { slowMotion = e.matches; });

  /* ── zone geometry ───────────────────────────────────────────────────── */
  const CLEAR = 0.26;
  const OVER  = 0.04;
  const MIN_W = 0.55;
  const MAX_W = 1.22;

  function horizY(top) { return top ?  H * (0.5 - CLEAR) : H * (0.5 + CLEAR); }
  function nearY (top) { return top ? -H * OVER           : H * (1 + OVER);    }
  function baseY (d, top) { return horizY(top) + (nearY(top) - horizY(top)) * d; }
  function hw    (d)      { return (W * 0.5) * (MIN_W + d * (MAX_W - MIN_W)); }

  /* ── wave displacement ───────────────────────────────────────────────── */
  function disp(wx, d, t) {
    const x = wx * 4.6, z = d * 23.0;
    return (
      Math.sin(x * 1.94 + t * 0.94 + z * 0.058) * 0.30 +
      Math.sin(x * 0.67 - t * 0.71 + z * 0.145) * 0.23 +
      Math.sin(x * 4.98 + z * 0.19 + t * 1.67)  * 0.19 +
      Math.sin(x * 1.35 + z * 0.07 - t * 0.53)  * 0.14 +
      Math.sin(x * 8.07 + z * 0.03 - t * 2.14)  * 0.07 +
      Math.sin(x * 0.34 + z * 0.31 + t * 0.27)  * 0.05 +
      Math.cos(x * 3.02 - z * 0.12 - t * 1.08)  * 0.02
    );
  }

  /* ── shared config ───────────────────────────────────────────────────── */
  const POWER    = 1.80;
  const AMP      = 1.00;
  const C_PHASE  = 0.72;
  const C_SPEED  = 1.18;

  function ampScale(d) { return 0.42 + 0.58 * Math.pow(d, 0.55); }

  function grey(d, extra, a) {
    const l = Math.min(97, 6 + d * 76 + extra * 12);
    return 'hsla(0,0%,' + (l | 0) + '%,' + a.toFixed(3) + ')';
  }

  /* Fixed-size point buffers — sized to MAX_SEGS, loops use current N_SEGS */
  const rowXs = new Float32Array(MAX_SEGS + 1);
  const rowYs = new Float32Array(MAX_SEGS + 1);

  function strokeBuf(lw, col) {
    ctx.beginPath();
    for (let s = 0; s <= N_SEGS; s++) {
      s === 0 ? ctx.moveTo(rowXs[s], rowYs[s]) : ctx.lineTo(rowXs[s], rowYs[s]);
    }
    ctx.lineWidth   = lw;
    ctx.strokeStyle = col;
    ctx.stroke();
  }

  /* ── monochrome wave layer ───────────────────────────────────────────── */
  function drawZone(t, top) {
    const span = nearY(top) - horizY(top);
    const absS = Math.abs(span);

    ctx.globalCompositeOperation = 'screen';

    /* cross / depth lines */
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

    /* horizontal rows — far first */
    for (let r = 0; r < N_ROWS; r++) {
      const d      = Math.pow(r / (N_ROWS - 1), POWER);
      const lineHW = hw(d);
      const by     = baseY(d, top);
      for (let s = 0; s <= N_SEGS; s++) {
        const wx = (s / N_SEGS) * 2 - 1;
        rowXs[s] = W * 0.5 + wx * lineHW;
        rowYs[s] = by + disp(wx, d, t) * absS * AMP * ampScale(d);
      }
      strokeBuf(10  * d + 0.5,  grey(d, 0,                       0.028));
      strokeBuf(3.8 * d + 0.3,  grey(d, 0,                       0.072));
      strokeBuf(0.9 * d + 0.15, grey(d, Math.abs(disp(0, d, t)), 0.78));
    }
  }

  /* ── crystal-diffraction colour layer ───────────────────────────────── */
  function prismHue(pos, dv, d, t) {
    return ((pos * 140 + t * 22 + dv * 55 + d * 80) % 360 + 360) % 360;
  }

  function drawColourLayer(t, top) {
    const tc   = t * C_SPEED + C_PHASE;
    const span = nearY(top) - horizY(top);
    const absS = Math.abs(span);

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
      const N_STOPS  = 14;

      for (let g = 0; g <= N_STOPS; g++) {
        const pos  = g / N_STOPS;
        const wx   = pos * 2 - 1;
        const dv   = disp(wx, d, tc);
        const h    = prismHue(pos, dv, d, t);
        const lum  = 52 + Math.abs(dv) * 12;
        const coreA = (0.38 + d * 0.42) * (0.55 + Math.abs(dv) * 0.45);
        const glowA = (0.14 + d * 0.22) * (0.45 + Math.abs(dv) * 0.35);
        coreGrad.addColorStop(pos,
          'hsla(' + (h | 0) + ',95%,' + (lum | 0) + '%,' + coreA.toFixed(3) + ')');
        glowGrad.addColorStop(pos,
          'hsla(' + (h | 0) + ',95%,' + ((lum + 15) | 0) + '%,' + glowA.toFixed(3) + ')');
      }

      strokeBuf(9   * d + 1.2, glowGrad);
      strokeBuf(1.6 * d + 0.3, coreGrad);
    }
  }

  /* ── render loop ─────────────────────────────────────────────────────── */
  const BASE_SPEED = 0.00025;
  const SLOW_SPEED = 0.00004;   /* prefers-reduced-motion: near-static      */

  function frame(ms) {
    const t = ms * (slowMotion ? SLOW_SPEED : BASE_SPEED);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(15,15,15,0.20)';
    ctx.fillRect(0, 0, W, H);

    drawZone(t, true);
    drawZone(t, false);
    drawColourLayer(t, true);
    drawColourLayer(t, false);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}());

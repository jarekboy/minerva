/* Minerva — monochrome 3-D wave + crystal-diffraction colour layer */
(function () {
  'use strict';

  /* ── canvas ─────────────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;z-index:0;pointer-events:none;';
  document.body.prepend(canvas);

  Array.from(document.body.children).forEach(function (el) {
    if (el !== canvas) { el.style.position = 'relative'; el.style.zIndex = '1'; }
  });

  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width        = W * DPR;
    canvas.height       = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ── zone geometry ──────────────────────────────────────────────────── */
  const CLEAR = 0.26;
  const OVER  = 0.04;
  const MIN_W = 0.55;
  const MAX_W = 1.22;

  function horizY(top) { return top ?  H * (0.5 - CLEAR) : H * (0.5 + CLEAR); }
  function nearY (top) { return top ? -H * OVER           : H * (1 + OVER);    }
  function baseY (d, top) { return horizY(top) + (nearY(top) - horizY(top)) * d; }
  function hw    (d)      { return (W * 0.5) * (MIN_W + d * (MAX_W - MIN_W)); }

  /* ── wave displacement ──────────────────────────────────────────────── */
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

  /* ── config ─────────────────────────────────────────────────────────── */
  const N_ROWS = 68;
  const N_COLS = 26;
  const N_SEGS = 110;
  const POWER  = 1.80;
  const AMP    = 1.00;

  function ampScale(d) { return 0.42 + 0.58 * Math.pow(d, 0.55); }

  /* Monochrome colour */
  function grey(d, extra, a) {
    const l = Math.min(97, 6 + d * 76 + extra * 12);
    return 'hsla(0,0%,' + (l | 0) + '%,' + a.toFixed(3) + ')';
  }

  /* Shared point buffers */
  const rowXs = new Float32Array(N_SEGS + 1);
  const rowYs = new Float32Array(N_SEGS + 1);

  function strokeBuf(lw, col) {
    ctx.beginPath();
    for (let s = 0; s <= N_SEGS; s++) {
      s === 0 ? ctx.moveTo(rowXs[s], rowYs[s]) : ctx.lineTo(rowXs[s], rowYs[s]);
    }
    ctx.lineWidth   = lw;
    ctx.strokeStyle = col;
    ctx.stroke();
  }

  /* ── monochrome wave layer ──────────────────────────────────────────── */
  function drawZone(t, top) {
    const hY   = horizY(top);
    const span = nearY(top) - hY;
    const absS = Math.abs(span);

    ctx.globalCompositeOperation = 'screen';

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

  /* ── crystal-diffraction colour layer ──────────────────────────────────
     A second wave surface phase-shifted from the white layer.  Each row
     gets a per-point horizontal gradient cycling through the acid palette
     (green 120° → yellow 60° → orange 30° → red 0°) plus the full warm
     spectrum as time rotates the prism.  Screen blend makes colours glow
     through the white lines like light through a diamond facet.           */

  const C_ROWS  = 32;    /* fewer rows — we want vivid highlights, not a mesh */
  const C_PHASE = 0.72;  /* wave phase offset (seconds-equivalent) vs white   */
  const C_SPEED = 1.18;  /* colour layer moves slightly faster                */

  /* Acid-spectrum hue: anchored to warm range, drifts with time+position   */
  function prismHue(pos, dv, d, t) {
    /* base sweeps 0–150° (red→green) driven by x-position + slow time rot  */
    const base = pos * 140 + t * 22;
    /* displacement shifts hue so peaks ≠ troughs in colour                 */
    const disp_shift = dv * 55;
    /* depth offsets so each depth band shows a different colour family      */
    const depth_shift = d * 80;
    return ((base + disp_shift + depth_shift) % 360 + 360) % 360;
  }

  function drawColourLayer(t, top) {
    const tc   = t * C_SPEED + C_PHASE;
    const hY   = horizY(top);
    const span = nearY(top) - hY;
    const absS = Math.abs(span);

    ctx.globalCompositeOperation = 'screen';

    for (let r = 0; r < C_ROWS; r++) {
      /* Interleave rows between the white layer for maximum coverage        */
      const d      = Math.pow((r + 0.5) / C_ROWS, POWER);
      const lineHW = hw(d) * 0.995;   /* fraction different → visible depth  */
      const by     = baseY(d, top);
      const as_amp = absS * AMP * ampScale(d);

      /* Build screen points using the colour-layer's own time              */
      for (let s = 0; s <= N_SEGS; s++) {
        const wx = (s / N_SEGS) * 2 - 1;
        rowXs[s] = W * 0.5 + wx * lineHW;
        rowYs[s] = by + disp(wx, d, tc) * as_amp;
      }

      /* Per-row horizontal gradient: sample hue at N colour stops          */
      const x0 = rowXs[0], x1 = rowXs[N_SEGS];
      const coreGrad = ctx.createLinearGradient(x0, 0, x1, 0);
      const glowGrad = ctx.createLinearGradient(x0, 0, x1, 0);
      const N_STOPS  = 14;

      for (let g = 0; g <= N_STOPS; g++) {
        const pos  = g / N_STOPS;
        const si   = Math.round(pos * N_SEGS);
        const wx   = pos * 2 - 1;
        const dv   = disp(wx, d, tc);
        const h    = prismHue(pos, dv, d, t);
        const sat  = 95;
        const lum  = 52 + Math.abs(dv) * 12;
        /* Core — vivid, semi-transparent; brightest near camera            */
        const coreA = (0.38 + d * 0.42) * (0.55 + Math.abs(dv) * 0.45);
        /* Glow — wider, softer bloom around the colour line                */
        const glowA = (0.14 + d * 0.22) * (0.45 + Math.abs(dv) * 0.35);
        coreGrad.addColorStop(pos,
          'hsla(' + (h | 0) + ',' + sat + '%,' + (lum | 0) + '%,' + coreA.toFixed(3) + ')');
        glowGrad.addColorStop(pos,
          'hsla(' + (h | 0) + ',' + sat + '%,' + (lum + 15 | 0) + '%,' + glowA.toFixed(3) + ')');
      }

      /* Soft colour bloom */
      strokeBuf(9  * d + 1.2, glowGrad);
      /* Vivid colour core */
      strokeBuf(1.6 * d + 0.3, coreGrad);
    }
  }

  /* ── render loop ────────────────────────────────────────────────────── */
  function frame(ms) {
    const t = ms * 0.00025;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(15,15,15,0.20)';
    ctx.fillRect(0, 0, W, H);

    /* White base layer */
    drawZone(t, true);
    drawZone(t, false);

    /* Colour diffraction layer on top */
    drawColourLayer(t, true);
    drawColourLayer(t, false);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}());

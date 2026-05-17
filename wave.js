/* Minerva — monochrome 3-D flat-surface double wave, retina-ready */
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

  /* ── zone geometry ──────────────────────────────────────────────────────
     The vanishing horizon lives near the logo-clear zone.
     The camera / near end is at (or just beyond) the screen edge.

     d = 0  →  horizon  (just above / below logo,  narrow-ish, small amp)
     d = 1  →  camera   (at screen edge,  wide, large amp)

     Lines do NOT converge to a point: they span MIN_W→MAX_W × half-screen
     at each depth.  This keeps the surface looking flat and expansive
     instead of funnelling into a black hole.                               */

  const CLEAR  = 0.26;   /* logo clearance: half-height fraction of H      */
  const OVER   = 0.04;   /* how far "near" overshoots the screen edge       */
  const MIN_W  = 0.55;   /* horizon line half-width as fraction of W/2      */
  const MAX_W  = 1.22;   /* near-camera half-width (clips at screen edges)  */

  function horizY(top) { return top ?  H * (0.5 - CLEAR)  : H * (0.5 + CLEAR);  }
  function nearY (top) { return top ? -H * OVER            : H * (1 + OVER);     }

  /* Screen Y for row at depth d */
  function baseY(d, top) { return horizY(top) + (nearY(top) - horizY(top)) * d; }

  /* Half-width of a row in screen pixels at depth d */
  function hw(d) { return (W * 0.5) * (MIN_W + d * (MAX_W - MIN_W)); }

  /* ── wave displacement ──────────────────────────────────────────────────
     Seven incommensurable frequencies prevent repeating patterns and give
     the complex, organic variance visible in the reference.               */
  function disp(wx, d, t) {
    const x = wx * 4.6;
    const z = d  * 23.0;
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
  const N_ROWS = 68;    /* horizontal wave lines per zone                   */
  const N_COLS = 26;    /* converging cross-lines per zone                  */
  const N_SEGS = 110;   /* segments per horizontal line                     */
  const POWER  = 1.80;  /* depth distribution: packs lines near horizon     */
  const AMP    = 0.72;  /* wave amplitude as fraction of zone span          */

  /* Monochrome colour: dim at horizon, bright near camera */
  function grey(d, extra, a) {
    const l = Math.min(97, 6 + d * 76 + extra * 12);
    return 'hsla(0,0%,' + (l | 0) + '%,' + a.toFixed(3) + ')';
  }

  /* Pre-allocated point buffers (no per-frame GC pressure) */
  const rowXs = new Float32Array(N_SEGS + 1);
  const rowYs = new Float32Array(N_SEGS + 1);

  /* Stroke the contents of rowXs / rowYs */
  function strokeBuf(lw, col) {
    ctx.beginPath();
    for (let s = 0; s <= N_SEGS; s++) {
      s === 0 ? ctx.moveTo(rowXs[s], rowYs[s]) : ctx.lineTo(rowXs[s], rowYs[s]);
    }
    ctx.lineWidth   = lw;
    ctx.strokeStyle = col;
    ctx.stroke();
  }

  /* ── draw one zone ──────────────────────────────────────────────────── */
  function drawZone(t, top) {
    const hY   = horizY(top);
    const span = nearY(top) - hY;    /* signed: negative for top zone     */
    const absS = Math.abs(span);

    ctx.globalCompositeOperation = 'screen';

    /* 1 — Cross / depth lines (drawn first; horizontal rows paint over) */
    for (let c = 0; c <= N_COLS; c++) {
      const wx = (c / N_COLS) * 2 - 1;
      ctx.beginPath();
      for (let r = 0; r < N_ROWS; r++) {
        const d  = Math.pow(r / (N_ROWS - 1), POWER);
        const x  = W * 0.5 + wx * hw(d);
        const y  = baseY(d, top) + disp(wx, d, t) * absS * AMP * d;
        r === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineWidth   = 0.42;
      ctx.strokeStyle = grey(0.40, 0, 0.24);
      ctx.stroke();
    }

    /* 2 — Horizontal wave rows: far (d≈0) first so near rows sit on top */
    for (let r = 0; r < N_ROWS; r++) {
      const d     = Math.pow(r / (N_ROWS - 1), POWER);
      const lineHW = hw(d);
      const by    = baseY(d, top);

      for (let s = 0; s <= N_SEGS; s++) {
        const wx  = (s / N_SEGS) * 2 - 1;
        rowXs[s]  = W * 0.5 + wx * lineHW;
        rowYs[s]  = by + disp(wx, d, t) * absS * AMP * d;
      }

      /* Outer bloom */
      strokeBuf(10 * d + 0.5,  grey(d, 0,                          0.038));
      /* Mid halo */
      strokeBuf(3.8 * d + 0.3, grey(d, 0,                          0.095));
      /* Sharp bright core */
      strokeBuf(0.9 * d + 0.15, grey(d, Math.abs(disp(0, d, t)),   0.93));
    }
  }

  /* ── render loop ────────────────────────────────────────────────────── */
  function frame(ms) {
    const t = ms * 0.00025;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(15,15,15,0.30)';
    ctx.fillRect(0, 0, W, H);

    drawZone(t, true);    /* top zone  — above logo */
    drawZone(t, false);   /* bottom zone — below logo */

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}());

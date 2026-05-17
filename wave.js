/* Minerva — monochrome 3-D double digital wave, retina-ready */
(function () {
  'use strict';

  /* ── canvas ───────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;z-index:0;pointer-events:none;';
  document.body.prepend(canvas);

  Array.from(document.body.children).forEach(function (el) {
    if (el !== canvas) {
      el.style.position = 'relative';
      el.style.zIndex   = '1';
    }
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

  /* ── zone geometry ────────────────────────────────────────────── */
  /* Logo sits at y = H/2.  Each wave zone has:
       horizon  — vanishing point pushed just outside the screen edge
       near     — inner boundary, kept well clear of the logo
     Lines converge to horizon (d=0) and spread full-width at near (d=1). */

  const CLEAR = 0.28;   /* half-size of logo-free gap (fraction of H)   */
  const PUSH  = 0.05;   /* horizon overshoot past screen edge            */

  function horizY(top) { return top ? -H * PUSH      : H * (1 + PUSH); }
  function nearY(top)  { return top ?  H * (0.5 - CLEAR) : H * (0.5 + CLEAR); }
  /* span = nearY - horizY:  positive for top zone, negative for bottom
     screen y at depth d:  horizY + span * d  (d=0 → horizon, d=1 → near) */

  /* ── wave displacement ────────────────────────────────────────── */
  /* Returns ≈ [-1, 1].  Seven incommensurable frequencies prevent
     obvious tiling and create organic variance across the surface.  */
  function disp(wx, d, t) {
    const x = wx * 4.6;
    const z = d  * 24.0;          /* remap inverse-depth to a z-like scale */
    return (
      Math.sin(x * 1.93  + t * 0.94 + z * 0.057) * 0.30 +
      Math.sin(x * 0.67  - t * 0.72 + z * 0.143) * 0.23 +
      Math.sin(x * 4.97  + z * 0.19 + t * 1.66)  * 0.19 +
      Math.sin(x * 1.35  + z * 0.07 - t * 0.53)  * 0.14 +
      Math.sin(x * 8.05  + z * 0.03 - t * 2.13)  * 0.07 +
      Math.sin(x * 0.34  + z * 0.31 + t * 0.27)  * 0.05 +
      Math.cos(x * 3.02  - z * 0.12 - t * 1.08)  * 0.02
    );
  }

  /* ── config ───────────────────────────────────────────────────── */
  const N_ROWS = 68;     /* horizontal lines per zone                  */
  const N_COLS = 26;     /* converging depth lines per zone            */
  const N_SEGS = 100;    /* segments per horizontal line               */
  /* Power > 1 packs more lines near the horizon (perspective realism) */
  const POWER  = 1.80;

  /* Monochrome colour — brightness rises from horizon (dim) to near (bright) */
  function grey(d, boost, a) {
    const l = Math.min(97, 6 + d * 78 + boost * 11);
    return 'hsla(0,0%,' + (l | 0) + '%,' + a.toFixed(3) + ')';
  }

  /* Reusable point buffers (avoid per-frame allocation) */
  const rowXs = new Float32Array(N_SEGS + 1);
  const rowYs = new Float32Array(N_SEGS + 1);

  /* ── draw one zone ────────────────────────────────────────────── */
  function drawZone(t, top) {
    const hY   = horizY(top);
    const span = nearY(top) - hY;   /* signed span to near edge        */
    const absS = Math.abs(span);

    ctx.globalCompositeOperation = 'screen';

    /* 1 — Depth / cross lines (painter: drawn before horizontal rows) */
    for (let c = 0; c <= N_COLS; c++) {
      const wx = (c / N_COLS) * 2 - 1;
      ctx.beginPath();
      for (let r = 0; r < N_ROWS; r++) {
        const d  = Math.pow(r / (N_ROWS - 1), POWER);
        const dv = disp(wx, d, t);
        const x  = W * 0.5 + wx * W * 0.5 * d;
        const y  = hY + span * d + dv * absS * 0.38 * d;
        r === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineWidth   = 0.4;
      ctx.strokeStyle = grey(0.40, 0, 0.26);
      ctx.stroke();
    }

    /* 2 — Horizontal wave rows — far first so near rows sit on top   */
    for (let r = 0; r < N_ROWS; r++) {
      const d     = Math.pow(r / (N_ROWS - 1), POWER);
      const baseY = hY + span * d;

      /* Build screen-space points for this row */
      for (let s = 0; s <= N_SEGS; s++) {
        const wx  = (s / N_SEGS) * 2 - 1;
        rowXs[s]  = W * 0.5 + wx * W * 0.5 * d;
        rowYs[s]  = baseY + disp(wx, d, t) * absS * 0.42 * d;
      }

      /* Helper: stroke the pre-built path */
      function strokeRow(lw, col) {
        ctx.beginPath();
        for (let s = 0; s <= N_SEGS; s++) {
          s === 0 ? ctx.moveTo(rowXs[s], rowYs[s])
                  : ctx.lineTo(rowXs[s], rowYs[s]);
        }
        ctx.lineWidth   = lw;
        ctx.strokeStyle = col;
        ctx.stroke();
      }

      /* Outer glow */
      strokeRow(10 * d + 0.5, grey(d, 0,   0.038));
      /* Mid halo  */
      strokeRow(3.8 * d + 0.3, grey(d, 0,   0.095));
      /* Sharp core */
      strokeRow(0.9 * d + 0.15, grey(d, Math.abs(disp(0, d, t)), 0.93));
    }
  }

  /* ── render loop ──────────────────────────────────────────────── */
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

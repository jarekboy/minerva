/* Minerva — 3-D perspective double digital wave */
(function () {
  'use strict';

  /* ── canvas ─────────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  document.body.prepend(canvas);

  Array.from(document.body.children).forEach(function (el) {
    if (el !== canvas) { el.style.position = 'relative'; el.style.zIndex = '1'; }
  });

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  /* ── perspective constants ──────────────────────────────────────── */
  /* World: wx ∈ [-1,1], wz ∈ [Z_NEAR,Z_FAR] (depth from camera).
     Vanishing point = (W/2, H/2) = centre of screen (logo position).
     At wz=Z_NEAR the nearest row is placed at ±ZONE_H from centre.   */
  const Z_NEAR   = 1;
  const Z_FAR    = 34;
  const N_ROWS   = 52;    /* horizontal lines per zone (top / bottom)  */
  const N_COLS   = 22;    /* convergent depth lines per zone           */
  const N_SEGS   = 96;    /* segments per horizontal line              */
  const ZONE_H   = 0.44;  /* fraction of H/2: how far the near row is  */

  /* ── wave displacement ──────────────────────────────────────────── */
  /* Returns a value ≈ [-1, 1].  Layered incommensurable sinusoids
     avoid a repeating tiling and produce organic-looking variance.    */
  function disp(wx, wz, t) {
    const x = wx * 3.9, z = wz * 0.12;
    return (
      Math.sin(x * 1.97  + t * 0.94 + z * 1.15) * 0.34 +
      Math.sin(x * 0.71  - t * 0.73 + z * 1.83) * 0.24 +
      Math.sin(x * 5.13  + z * 2.37 + t * 1.68) * 0.17 +
      Math.sin(x * 1.41  + z * 0.59 - t * 0.52) * 0.13 +
      Math.sin(x * 8.27  + z * 0.28 - t * 2.17) * 0.06 +
      Math.sin(x * 0.37  + z * 4.05 + t * 0.27) * 0.04 +
      Math.cos(x * 3.07  - z * 1.31 - t * 1.09) * 0.02
    );
  }

  /* ── projection helpers ─────────────────────────────────────────── */
  function projX(wx, wz) {
    return W * 0.5 + wx * W * 0.5 * (Z_NEAR / wz);
  }

  function projBaseY(wz, top) {
    const offset = H * ZONE_H * (Z_NEAR / wz);
    return top ? H * 0.5 - offset : H * 0.5 + offset;
  }

  /* Perspective-correct wave amplitude: large up close, vanishes at horizon */
  function dispY(wx, wz, t) {
    return disp(wx, wz, t) * H * ZONE_H * 0.28 * (Z_NEAR / wz);
  }

  /* ── colour ─────────────────────────────────────────────────────── */
  /* Iridescent hue depends on world position, displacement, and time.
     Brightness scales with depth so far rows fade into the horizon.   */
  function wavecol(wx, wz, t, top, alpha) {
    const depth = Z_NEAR / wz;
    const d     = disp(wx, wz, t);
    const base  = top ? 188 : 212;
    const h     = ((base + wx * 24 + d * 52 + t * 4.5) % 360 + 360) % 360;
    const s     = 54 + depth * 22 + Math.abs(d) * 8;
    const l     = 14 + depth * 44 + d * 9;
    return 'hsla(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%,' +
           (alpha * (0.10 + depth * 0.90)).toFixed(2) + ')';
  }

  /* ── precompute z schedule (far → near = painter's order) ───────── */
  const Z_STEPS = new Float32Array(N_ROWS);
  for (let r = 0; r < N_ROWS; r++) {
    Z_STEPS[r] = Z_FAR - r * (Z_FAR - Z_NEAR) / (N_ROWS - 1);
  }

  const CROSS_WX = new Float32Array(N_COLS + 1);
  for (let c = 0; c <= N_COLS; c++) {
    CROSS_WX[c] = (c / N_COLS) * 2 - 1;
  }

  /* Temp buffers to avoid GC pressure */
  const xs = new Float32Array(N_SEGS + 1);
  const ys = new Float32Array(N_SEGS + 1);

  /* ── draw one zone ──────────────────────────────────────────────── */
  function drawZone(t, top) {
    ctx.globalCompositeOperation = 'screen';

    /* 1. Cross lines — drawn first so horizontal rows paint over them  */
    for (let c = 0; c <= N_COLS; c++) {
      const wx = CROSS_WX[c];
      ctx.beginPath();
      for (let r = 0; r < N_ROWS; r++) {
        const wz = Z_STEPS[r];
        const x  = projX(wx, wz);
        const y  = projBaseY(wz, top) + dispY(wx, wz, t);
        r === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineWidth   = 0.45;
      ctx.strokeStyle = wavecol(wx, (Z_NEAR + Z_FAR) * 0.45, t, top, 0.32);
      ctx.stroke();
    }

    /* 2. Horizontal wave lines — far to near, 3-pass glow + core      */
    const baseHue = top ? 188 : 212;

    for (let r = 0; r < N_ROWS; r++) {
      const wz    = Z_STEPS[r];
      const depth = Z_NEAR / wz;   /* 1 = at camera, ~0 = at horizon  */

      /* Build screen points */
      for (let s = 0; s <= N_SEGS; s++) {
        const wx = (s / N_SEGS) * 2 - 1;
        xs[s] = projX(wx, wz);
        ys[s] = projBaseY(wz, top) + dispY(wx, wz, t);
      }

      /* — outer glow — */
      ctx.beginPath();
      for (let s = 0; s <= N_SEGS; s++) {
        s === 0 ? ctx.moveTo(xs[s], ys[s]) : ctx.lineTo(xs[s], ys[s]);
      }
      const gh = ((baseHue + t * 4.5) % 360 + 360) % 360;
      ctx.lineWidth   = 8 * depth + 0.6;
      ctx.strokeStyle = 'hsla(' + (gh | 0) + ',58%,' + ((12 + depth * 18) | 0) + '%,0.055)';
      ctx.stroke();

      /* — mid halo — */
      ctx.beginPath();
      for (let s = 0; s <= N_SEGS; s++) {
        s === 0 ? ctx.moveTo(xs[s], ys[s]) : ctx.lineTo(xs[s], ys[s]);
      }
      ctx.lineWidth   = 3.2 * depth + 0.35;
      ctx.strokeStyle = 'hsla(' + (gh | 0) + ',65%,' + ((22 + depth * 26) | 0) + '%,0.13)';
      ctx.stroke();

      /* — bright core (horizontal gradient for iridescence) — */
      const grad = ctx.createLinearGradient(xs[0], 0, xs[N_SEGS], 0);
      const STOPS = 11;
      for (let g = 0; g <= STOPS; g++) {
        const wx = (g / STOPS) * 2 - 1;
        grad.addColorStop(g / STOPS, wavecol(wx, wz, t, top, 0.90));
      }
      ctx.beginPath();
      for (let s = 0; s <= N_SEGS; s++) {
        s === 0 ? ctx.moveTo(xs[s], ys[s]) : ctx.lineTo(xs[s], ys[s]);
      }
      ctx.lineWidth   = 0.85 * depth + 0.18;
      ctx.strokeStyle = grad;
      ctx.stroke();
    }
  }

  /* ── render loop ────────────────────────────────────────────────── */
  function frame(ms) {
    const t = ms * 0.00027;

    /* Fade toward background — gives a short light trail */
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(15,15,15,0.30)';
    ctx.fillRect(0, 0, W, H);

    drawZone(t, true);    /* above logo  */
    drawZone(t, false);   /* below logo  */

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}());

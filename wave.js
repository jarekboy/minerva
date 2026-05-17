/* Minerva — iridescent double-wave background */
(function () {
  'use strict';

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  document.body.prepend(canvas);

  /* Lift all body siblings above the canvas */
  Array.from(document.body.children).forEach(function (el) {
    if (el !== canvas) {
      el.style.position = 'relative';
      el.style.zIndex = '1';
    }
  });

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  /* ─── Wave displacement ───────────────────────────────────────────────
     Layered sines at incommensurable frequencies give organic movement.
     (x, y) are normalised 0-1 driving coords; t is time; s is per-layer
     seed that breaks symmetry between the two wave surfaces.             */
  function disp(x, y, t, s) {
    return (
      Math.sin(x * 4.7  + t * 0.88 + s)               * 0.38 +
      Math.sin(x * 2.0  - t * 1.15 + s * 1.31)        * 0.26 +
      Math.sin(x * 8.3  + y * 2.2  + t * 1.70 + s * 0.83) * 0.17 +
      Math.sin(x * 1.1  + y * 3.9  - t * 0.55 + s * 2.05) * 0.11 +
      Math.sin(x * 12.8            - t * 2.10 + s * 0.44) * 0.05 +
      Math.cos(x * 0.65 + y * 1.3  + t * 0.28 + s * 1.70) * 0.03
    );
  }

  /* ─── Iridescent colour ───────────────────────────────────────────────
     Hue = base (per layer) + displacement shift + slow global rotation.
     This mimics thin-film interference: height → wavelength.             */
  function waveColor(d, xp, t, baseHue, alpha) {
    const h = ((baseHue + d * 62 + xp * 42 + t * 7) % 360 + 360) % 360;
    const s = 58 + d * 18;
    const l = 36 + d * 26;
    return 'hsla(' + h.toFixed(0) + ',' + s.toFixed(0) + '%,' +
           l.toFixed(0) + '%,' + alpha.toFixed(2) + ')';
  }

  /* ─── Draw one wave surface ───────────────────────────────────────────
     Each horizontal row is a smooth bezier-approximated path; colour is
     a per-row linear gradient sampled at STOPS points.                   */
  const ROWS  = 60;
  const SEGS  = 110;
  const STOPS = 14;

  function drawSurface(t, seed, baseHue, alpha, lw) {
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = lw;

    for (let r = 0; r < ROWS; r++) {
      const rp  = r / (ROWS - 1);
      const baseY = rp * H;

      /* Amplitude envelope — largest at 1/4 and 3/4 height, not dead-centre */
      const amp = H * 0.10 * (0.45 + Math.sin(rp * Math.PI) * 0.55);

      /* Build horizontal gradient (colour samples along the row) */
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= STOPS; i++) {
        const xp = i / STOPS;
        const d  = disp(xp * 6.5, rp * 4.0, t, seed);
        grad.addColorStop(xp, waveColor(d, xp, t, baseHue, alpha));
      }

      /* Build wave path */
      ctx.beginPath();
      for (let s = 0; s <= SEGS; s++) {
        const xp = s / SEGS;
        const d  = disp(xp * 6.5, rp * 4.0, t, seed);
        const x  = xp * W;
        const y  = baseY + d * amp;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }

      ctx.strokeStyle = grad;
      ctx.stroke();
    }
  }

  /* ─── Render loop ─────────────────────────────────────────────────── */
  function frame(ms) {
    const t = ms * 0.00034;

    /* Fade-to-background — 0.20 opacity per frame gives a ~5-frame trail */
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(15,15,15,0.20)';
    ctx.fillRect(0, 0, W, H);

    /* Back surface — blue-violet, slower, dimmer */
    drawSurface(t * 0.72, 0.00, 228, 0.30, 0.65);

    /* Front surface — cyan-teal, full speed, brighter */
    drawSurface(t,        3.14, 182, 0.58, 0.90);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}());

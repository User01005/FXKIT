/* CRTWave — analog CRT, VHS and digital glitch corruption. */
FXKit.register({
  id: 'crt',
  name: 'CRTWave',
  tagline: 'Analog CRT scanlines, VHS color bleed and digital block corruption in real time.',
  animated: (p) => p.glitch > 0 || p.noise > 0 || p.flicker,
  params: [
    { key: 'scan',    label: 'Scanlines', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35 },
    { key: 'spacing', label: 'Line spacing', type: 'range', min: 2, max: 10, step: 1, def: 3 },
    { key: 'shift',   label: 'RGB shift', type: 'range', min: 0, max: 30, step: 1, def: 6 },
    { key: 'glitch',  label: 'Glitch', type: 'range', min: 0, max: 1, step: 0.01, def: 0.25 },
    { key: 'noise',   label: 'Noise', type: 'range', min: 0, max: 1, step: 0.01, def: 0.15 },
    { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 },
    { key: 'flicker', label: 'Flicker', type: 'check', def: true },
  ],

  apply(src, ctx, p, t) {
    const w = src.width, h = src.height;
    ctx.clearRect(0, 0, w, h);

    // RGB channel split: isolate a channel by multiplying with a primary,
    // then add it back offset for the chromatic fringe.
    ctx.drawImage(src, 0, 0);
    if (p.shift > 0) {
      const iso = FXKit.scratch(w, h);
      const ictx = iso.getContext('2d');
      for (const [color, dx] of [['#ff0000', -p.shift], ['#0000ff', p.shift]]) {
        ictx.globalCompositeOperation = 'source-over';
        ictx.drawImage(src, 0, 0);
        ictx.globalCompositeOperation = 'multiply';
        ictx.fillStyle = color;
        ictx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(iso, dx, 0);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Glitch: horizontal strips torn sideways, occasionally heavy.
    if (p.glitch > 0) {
      const burst = Math.sin(t * 7.3) > 1 - p.glitch * 0.9 ? 3 : 1;
      const n = Math.round(p.glitch * 8) * burst;
      for (let i = 0; i < n; i++) {
        const sy = Math.random() * h;
        const sh = 4 + Math.random() * h * 0.06;
        const dx = (Math.random() - 0.5) * w * 0.15 * p.glitch * burst;
        ctx.drawImage(src, 0, sy, w, sh, dx, sy, w, sh);
      }
    }

    // Static noise overlay.
    if (p.noise > 0) {
      ctx.globalAlpha = p.noise * 0.35;
      ctx.globalCompositeOperation = 'overlay';
      const tile = FXKit.noiseTile(128);
      for (let y = 0; y < h; y += 128)
        for (let x = 0; x < w; x += 128) ctx.drawImage(tile, x, y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Scanlines.
    if (p.scan > 0) {
      ctx.fillStyle = `rgba(0,0,0,${p.scan})`;
      for (let y = 0; y < h; y += p.spacing) ctx.fillRect(0, y, w, 1);
    }

    // Rolling flicker band.
    if (p.flicker) {
      const bandY = ((t * 90) % (h * 1.4)) - h * 0.2;
      const grad = ctx.createLinearGradient(0, bandY, 0, bandY + h * 0.18);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, bandY, w, h * 0.18);
    }

    // Vignette.
    if (p.vignette > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${p.vignette * 0.8})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
});

/* FilmLab — vintage film grain, fade and light leaks. */
FXKit.register({
  id: 'film',
  name: 'FilmLab',
  tagline: 'Vintage film looks: living grain, faded blacks, sepia tone, scratches and light leaks.',
  animated: (p) => p.grain > 0 || p.scratches,
  params: [
    { key: 'grain',    label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35 },
    { key: 'sepia',    label: 'Sepia', type: 'range', min: 0, max: 1, step: 0.01, def: 0.4 },
    { key: 'fade',     label: 'Faded blacks', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3 },
    { key: 'contrast', label: 'Contrast', type: 'range', min: 0.5, max: 1.5, step: 0.01, def: 1.05 },
    { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01, def: 0.55 },
    { key: 'leak',     label: 'Light leak', type: 'range', min: 0, max: 1, step: 0.01, def: 0.25 },
    { key: 'scratches', label: 'Scratches', type: 'check', def: true },
  ],

  apply(src, ctx, p, t) {
    const w = src.width, h = src.height;

    ctx.filter = `sepia(${p.sepia}) contrast(${p.contrast}) saturate(${1 - p.sepia * 0.3})`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';

    // Faded blacks: lift the shadows with a flat gray via 'lighten'.
    if (p.fade > 0) {
      ctx.globalCompositeOperation = 'lighten';
      const v = Math.round(p.fade * 60);
      ctx.fillStyle = `rgb(${v},${v},${v + 4})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Warm light leak sweeping slowly from a corner.
    if (p.leak > 0) {
      const lx = w * (0.8 + Math.sin(t * 0.3) * 0.15);
      const g = ctx.createRadialGradient(lx, h * 0.15, 0, lx, h * 0.15, w * 0.7);
      g.addColorStop(0, `rgba(255,120,40,${p.leak * 0.5})`);
      g.addColorStop(0.5, `rgba(255,60,80,${p.leak * 0.2})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Living grain — new noise every frame.
    if (p.grain > 0) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = p.grain * 0.5;
      const tile = FXKit.noiseTile(160);
      for (let y = 0; y < h; y += 160)
        for (let x = 0; x < w; x += 160) ctx.drawImage(tile, x, y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Vertical scratches that flicker in and out.
    if (p.scratches) {
      ctx.strokeStyle = 'rgba(255,255,250,0.12)';
      ctx.lineWidth = 1;
      const count = 2 + Math.floor(Math.abs(Math.sin(t * 1.7)) * 3);
      for (let i = 0; i < count; i++) {
        const x = ((Math.sin(i * 37.7 + Math.floor(t * 4)) + 1) / 2) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + Math.sin(t * 9 + i) * 3, h);
        ctx.stroke();
      }
    }

    if (p.vignette > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(20,10,5,${p.vignette * 0.85})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
});

/* BlurSuite — directional, zoom and spin motion blur. */
FXKit.register({
  id: 'blur',
  name: 'BlurSuite',
  tagline: 'Directional streaks, zoom bursts and spin blur — stacked sampling, no plugins.',
  params: [
    { key: 'mode',     label: 'Mode', type: 'select', options: ['linear', 'zoom', 'spin'], def: 'zoom' },
    { key: 'strength', label: 'Strength', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35 },
    { key: 'samples',  label: 'Samples', type: 'range', min: 4, max: 48, step: 1, def: 24 },
    { key: 'angle',    label: 'Angle (linear)', type: 'range', min: 0, max: 360, step: 1, def: 0 },
    { key: 'cx',       label: 'Center X', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 },
    { key: 'cy',       label: 'Center Y', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 },
  ],

  apply(src, ctx, p) {
    const w = src.width, h = src.height;
    const n = p.samples;
    const cx = p.cx * w, cy = p.cy * h;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(src, 0, 0);

    for (let i = 1; i < n; i++) {
      const f = i / (n - 1);
      ctx.globalAlpha = (1 - f) * 0.5 * (0.2 + p.strength);
      ctx.save();
      if (p.mode === 'linear') {
        const dist = f * p.strength * Math.min(w, h) * 0.35;
        const a = (p.angle * Math.PI) / 180;
        ctx.translate(Math.cos(a) * dist, Math.sin(a) * dist);
      } else if (p.mode === 'zoom') {
        const s = 1 + f * p.strength * 0.6;
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
      } else {
        const a = f * p.strength * 0.5;
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.translate(-cx, -cy);
      }
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
});

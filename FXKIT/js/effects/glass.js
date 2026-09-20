/* GlassSlice — sliced glass, offset strips and mosaic pixel panes. */
FXKit.register({
  id: 'glass',
  name: 'GlassSlice',
  tagline: 'Shatter images into offset glass strips and mosaic panes with blur and animated jitter.',
  animated: (p) => p.jitter,
  params: [
    { key: 'mode',   label: 'Mode', type: 'select', options: ['columns', 'rows', 'grid'], def: 'columns' },
    { key: 'slices', label: 'Slices', type: 'range', min: 3, max: 60, step: 1, def: 14 },
    { key: 'offset', label: 'Offset', type: 'range', min: 0, max: 1, step: 0.01, def: 0.35 },
    { key: 'wave',   label: 'Waviness', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 },
    { key: 'gap',    label: 'Gap', type: 'range', min: 0, max: 12, step: 1, def: 2 },
    { key: 'blur',   label: 'Blur', type: 'range', min: 0, max: 12, step: 0.5, def: 0 },
    { key: 'seed',   label: 'Shuffle seed', type: 'range', min: 1, max: 100, step: 1, def: 7 },
    { key: 'jitter', label: 'Animate jitter', type: 'check', def: false },
    { key: 'bg',     label: 'Background', type: 'color', def: '#0a0a0e' },
  ],

  apply(src, ctx, p, t) {
    const w = src.width, h = src.height;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    if (p.blur > 0) ctx.filter = `blur(${p.blur}px)`;

    const rand = FXKit.seeded(p.seed);
    const anim = p.jitter ? Math.sin(t * 2.2) : 1;
    const n = p.slices;

    const drawSlice = (sx, sy, sw, sh, i) => {
      const r = rand();
      const wobble = Math.sin(i * 0.9 + (p.jitter ? t * 3 : 0)) * p.wave;
      const amt = (r - 0.5 + wobble * 0.5) * 2 * p.offset * anim;
      if (p.mode === 'rows') {
        ctx.drawImage(src, sx, sy, sw, sh, sx + amt * w * 0.25, sy, sw - p.gap, sh - p.gap);
      } else {
        ctx.drawImage(src, sx, sy, sw, sh, sx, sy + amt * h * 0.25, sw - p.gap, sh - p.gap);
      }
    };

    if (p.mode === 'grid') {
      const cw = w / n, ch = h / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const r1 = rand(), r2 = rand();
          const dx = (r1 - 0.5) * 2 * p.offset * cw * 0.8 * anim;
          const dy = (r2 - 0.5) * 2 * p.offset * ch * 0.8 * anim;
          ctx.drawImage(src, x * cw, y * ch, cw, ch, x * cw + dx, y * ch + dy, cw - p.gap, ch - p.gap);
        }
      }
    } else if (p.mode === 'rows') {
      const sh = h / n;
      for (let i = 0; i < n; i++) drawSlice(0, i * sh, w, sh, i);
    } else {
      const sw = w / n;
      for (let i = 0; i < n; i++) drawSlice(i * sw, 0, sw, h, i);
    }
    ctx.filter = 'none';
  },
});

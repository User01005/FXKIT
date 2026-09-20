/* LoopFlow — Droste recursion and seamless infinite zoom. */
FXKit.register({
  id: 'loop',
  name: 'LoopFlow',
  tagline: 'Droste recursion and seamless infinite-zoom loops from a single image.',
  animated: (p) => p.speed > 0,
  params: [
    { key: 'depth',    label: 'Depth', type: 'range', min: 2, max: 14, step: 1, def: 7 },
    { key: 'scale',    label: 'Scale step', type: 'range', min: 0.4, max: 0.92, step: 0.01, def: 0.72 },
    { key: 'rotate',   label: 'Twist (deg)', type: 'range', min: -45, max: 45, step: 1, def: 12 },
    { key: 'speed',    label: 'Zoom speed', type: 'range', min: 0, max: 2, step: 0.05, def: 0.5 },
    { key: 'cx',       label: 'Center X', type: 'range', min: 0.1, max: 0.9, step: 0.01, def: 0.5 },
    { key: 'cy',       label: 'Center Y', type: 'range', min: 0.1, max: 0.9, step: 0.01, def: 0.5 },
    { key: 'darken',   label: 'Depth shade', type: 'range', min: 0, max: 1, step: 0.01, def: 0.25 },
  ],

  apply(src, ctx, p, t) {
    const w = src.width, h = src.height;
    const cx = p.cx * w, cy = p.cy * h;

    // Phase in [0,1): zooming by one full scale-step per cycle makes the loop seamless.
    const phase = p.speed > 0 ? (t * p.speed * 0.4) % 1 : 0;
    const zoom = Math.pow(1 / p.scale, phase);
    const twist = (p.rotate * Math.PI) / 180;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Draw outermost (largest) first so deeper copies stack on top.
    for (let i = -1; i < p.depth; i++) {
      const s = Math.pow(p.scale, i + 1) * zoom;
      if (s > 4) continue; // way off-canvas, skip
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(twist * (i + 1 + phase));
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      const shade = FXKit.clamp(1 - (i + 1) * p.darken * 0.12, 0.3, 1);
      ctx.filter = shade < 1 ? `brightness(${shade})` : 'none';
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    }
    ctx.filter = 'none';
  },
});

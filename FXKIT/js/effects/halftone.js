/* Halftone Lab — classic print-style dot screens. */
FXKit.register({
  id: 'halftone',
  name: 'Halftone Lab',
  tagline: 'Turn photos into classic print-style dot screens with tunable grids, angles and shapes.',
  params: [
    { key: 'grid',   label: 'Grid size',  type: 'range', min: 4, max: 40, step: 1, def: 10 },
    { key: 'scale',  label: 'Dot scale',  type: 'range', min: 0.3, max: 2, step: 0.05, def: 1.2 },
    { key: 'angle',  label: 'Angle',      type: 'range', min: 0, max: 90, step: 1, def: 25 },
    { key: 'shape',  label: 'Shape',      type: 'select', options: ['circle', 'square', 'diamond', 'line'], def: 'circle' },
    { key: 'colors', label: 'Color mode', type: 'select', options: ['mono', 'original'], def: 'mono' },
    { key: 'fg',     label: 'Ink',        type: 'color', def: '#111111' },
    { key: 'bg',     label: 'Paper',      type: 'color', def: '#f4efe3' },
    { key: 'invert', label: 'Invert',     type: 'check', def: false },
  ],

  apply(src, ctx, p) {
    const w = src.width, h = src.height;
    const data = src.getContext('2d').getImageData(0, 0, w, h).data;

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((p.angle * Math.PI) / 180);

    const grid = p.grid;
    const half = Math.ceil(Math.hypot(w, h) / 2 / grid) * grid;
    ctx.fillStyle = p.fg;
    ctx.strokeStyle = p.fg;

    // A grid point (gx, gy) lands on the canvas at R(+angle)·(gx, gy) + center,
    // so sample the source at that same spot.
    const cos = Math.cos((p.angle * Math.PI) / 180);
    const sin = Math.sin((p.angle * Math.PI) / 180);

    for (let gy = -half; gy <= half; gy += grid) {
      for (let gx = -half; gx <= half; gx += grid) {
        // Map rotated grid point back to source pixel space.
        const sx = Math.round(gx * cos - gy * sin + w / 2);
        const sy = Math.round(gx * sin + gy * cos + h / 2);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;

        const i = (sy * w + sx) * 4;
        let l = FXKit.luma(data[i], data[i + 1], data[i + 2]) / 255;
        if (p.invert) l = 1 - l;
        const r = (grid / 2) * p.scale * (1 - l);
        if (r < 0.25) continue;

        if (p.colors === 'original') {
          ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
          ctx.strokeStyle = ctx.fillStyle;
        }

        switch (p.shape) {
          case 'square':
            ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
            break;
          case 'diamond':
            ctx.beginPath();
            ctx.moveTo(gx, gy - r * 1.3);
            ctx.lineTo(gx + r * 1.3, gy);
            ctx.lineTo(gx, gy + r * 1.3);
            ctx.lineTo(gx - r * 1.3, gy);
            ctx.fill();
            break;
          case 'line':
            ctx.lineWidth = r;
            ctx.beginPath();
            ctx.moveTo(gx - grid / 2, gy);
            ctx.lineTo(gx + grid / 2, gy);
            ctx.stroke();
            break;
          default:
            ctx.beginPath();
            ctx.arc(gx, gy, r, 0, Math.PI * 2);
            ctx.fill();
        }
      }
    }
    ctx.restore();
  },
});

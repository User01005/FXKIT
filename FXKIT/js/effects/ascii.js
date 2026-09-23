/* TypeArt — rebuild images out of ASCII characters, with edge and dither modes. */
FXKit.register({
  id: 'ascii',
  name: 'TypeArt',
  tagline: 'Rebuild any image or video out of ASCII characters — density, edges, dithering and custom charsets.',
  animated: (p) => !!p.dither, // dithered noise pattern shifts every frame; still frame otherwise

  params: [
    { key: 'charset',  label: 'Charset',        type: 'select', options: ['classic', 'blocks', 'binary', 'dots', 'kanji', 'custom'], def: 'classic' },
    { key: 'custom',   label: 'Custom charset (dark→light)', type: 'text', maxlength: 24, def: ' .:-=+*#%@', placeholder: 'space first, then dark to light' },
    { key: 'size',     label: 'Cell size',      type: 'range', min: 5, max: 28, step: 1, def: 10 },
    { key: 'aspect',   label: 'Cell aspect',    type: 'range', min: 0.35, max: 1.1, step: 0.01, def: 0.62 },
    { key: 'bright',   label: 'Brightness',     type: 'range', min: -100, max: 100, step: 1, def: 0 },
    { key: 'contrast', label: 'Contrast',       type: 'range', min: -100, max: 100, step: 1, def: 10 },
    { key: 'edges',    label: 'Edge mode',      type: 'check', def: false },
    { key: 'dither',   label: 'Dither shading', type: 'check', def: false },
    { key: 'bold',     label: 'Bold',           type: 'check', def: false },
    { key: 'colors',   label: 'Color mode',     type: 'select', options: ['ink', 'original', 'terminal'], def: 'terminal' },
    { key: 'fg',       label: 'Ink',            type: 'color', def: '#e8e8e8' },
    { key: 'bg',       label: 'Background',     type: 'color', def: '#0a0a0a' },
    { key: 'invert',   label: 'Invert',         type: 'check', def: false },
  ],

  charsets: {
    classic: ' .:-=+*#%@',
    blocks: ' ░▒▓█',
    binary: ' 01',
    dots: ' ·••⣿',
    kanji: ' 一十木林森',
  },

  // 4x4 Bayer threshold matrix, reused from RetroDither's approach — spreads
  // quantization error across neighboring cells instead of banding.
  bayer4: [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ],

  apply(src, ctx, p, t) {
    const w = src.width, h = src.height;
    const chars = p.charset === 'custom'
      ? (p.custom && p.custom.length ? p.custom : ' .:-=+*#%@')
      : this.charsets[p.charset];
    const levels = chars.length;

    const cellW = Math.max(3, Math.round(p.size * FXKit.clamp(p.aspect, 0.1, 2)));
    const cellH = p.size;
    const cols = Math.max(1, Math.ceil(w / cellW));
    const rows = Math.max(1, Math.ceil(h / cellH));

    const small = FXKit.scratch(cols, rows);
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(src, 0, 0, cols, rows);
    const d = sctx.getImageData(0, 0, cols, rows).data;

    // Grayscale + brightness/contrast, one value per character cell.
    const cFactor = (259 * (p.contrast + 255)) / (255 * (259 - p.contrast));
    const gray = new Float32Array(cols * rows);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      let l = FXKit.luma(d[i], d[i + 1], d[i + 2]);
      l = cFactor * (l - 128) + 128 + p.bright;
      gray[j] = FXKit.clamp(l, 0, 255) / 255;
    }

    // Edge mode: 3x3 Sobel over the cell grid — cell brightness becomes edge
    // strength, so only outlines and contours get drawn.
    let field = gray;
    if (p.edges) {
      const at = (x, y) => gray[FXKit.clamp(y, 0, rows - 1) * cols + FXKit.clamp(x, 0, cols - 1)];
      const edge = new Float32Array(cols * rows);
      let max = 0.0001;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
                     (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
          const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
                     (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
          const m = Math.hypot(gx, gy);
          edge[y * cols + x] = m;
          if (m > max) max = m;
        }
      }
      for (let i = 0; i < edge.length; i++) edge[i] /= max;
      field = edge;
    }

    ctx.fillStyle = p.colors === 'terminal' ? '#020a02' : p.bg;
    ctx.fillRect(0, 0, w, h);
    const weight = p.bold ? '700' : '400';
    ctx.font = `${weight} ${p.size}px "SF Mono", Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    if (p.colors === 'ink') ctx.fillStyle = p.fg;
    if (p.colors === 'terminal') ctx.fillStyle = '#33ff66';

    // Dithering shifts the Bayer phase by frame so grainy shading animates
    // instead of sitting as a static crosshatch.
    const phase = p.dither ? Math.floor(t * 6) : 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let v = field[i];
        if (p.invert) v = 1 - v;

        let idx;
        if (p.dither) {
          const bx = (x + phase) % 4, by = y % 4;
          const th = (this.bayer4[by][bx] + 0.5) / 16;
          idx = Math.round(FXKit.clamp(v * (levels - 1) + (th - 0.5), 0, levels - 1));
        } else {
          idx = Math.min(levels - 1, Math.floor(v * levels));
        }

        const ch = chars[idx];
        if (ch === ' ') continue;
        if (p.colors === 'original') {
          const di = i * 4;
          ctx.fillStyle = `rgb(${d[di]},${d[di + 1]},${d[di + 2]})`;
        }
        ctx.fillText(ch, x * cellW, y * cellH);
      }
    }
  },
});

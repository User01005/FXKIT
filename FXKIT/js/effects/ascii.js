/* TypeArt — rebuild images out of ASCII characters. */
FXKit.register({
  id: 'ascii',
  name: 'TypeArt',
  tagline: 'Rebuild any image out of ASCII characters — terminal green, colored, or custom ink.',
  params: [
    { key: 'charset', label: 'Charset', type: 'select', options: ['classic', 'blocks', 'binary', 'dots', 'kanji'], def: 'classic' },
    { key: 'size',    label: 'Font size', type: 'range', min: 6, max: 28, step: 1, def: 10 },
    { key: 'colors',  label: 'Color mode', type: 'select', options: ['ink', 'original', 'terminal'], def: 'terminal' },
    { key: 'fg',      label: 'Ink',   type: 'color', def: '#e8e8e8' },
    { key: 'bg',      label: 'Background', type: 'color', def: '#0a0a0a' },
    { key: 'invert',  label: 'Invert', type: 'check', def: false },
  ],

  charsets: {
    classic: ' .:-=+*#%@',
    blocks: ' ░▒▓█',
    binary: ' 01',
    dots: ' ·••⣿',
    kanji: ' 一十木林森',
  },

  apply(src, ctx, p) {
    const w = src.width, h = src.height;
    const chars = this.charsets[p.charset];
    const cellW = Math.max(4, Math.round(p.size * 0.62));
    const cellH = p.size;
    const cols = Math.ceil(w / cellW);
    const rows = Math.ceil(h / cellH);

    const small = FXKit.scratch(cols, rows);
    const sctx = small.getContext('2d');
    sctx.drawImage(src, 0, 0, cols, rows);
    const d = sctx.getImageData(0, 0, cols, rows).data;

    ctx.fillStyle = p.colors === 'terminal' ? '#020a02' : p.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${p.size}px "SF Mono", Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    if (p.colors === 'ink') ctx.fillStyle = p.fg;
    if (p.colors === 'terminal') ctx.fillStyle = '#33ff66';

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        let l = FXKit.luma(d[i], d[i + 1], d[i + 2]) / 255;
        if (p.invert) l = 1 - l;
        const ch = chars[Math.min(chars.length - 1, Math.floor(l * chars.length))];
        if (ch === ' ') continue;
        if (p.colors === 'original') ctx.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
        ctx.fillText(ch, x * cellW, y * cellH);
      }
    }
  },
});

/* RetroDither — error-diffusion & ordered dithering with retro palettes. */
FXKit.register({
  id: 'dither',
  name: 'RetroDither',
  tagline: 'Floyd–Steinberg, Atkinson and Bayer dithering with Game Boy, amber and mono palettes.',
  params: [
    { key: 'algo',    label: 'Algorithm', type: 'select', options: ['floyd-steinberg', 'atkinson', 'bayer-4', 'bayer-8', 'threshold'], def: 'floyd-steinberg' },
    { key: 'palette', label: 'Palette',   type: 'select', options: ['mono', 'gameboy', 'amber', 'cyber', 'gray-4'], def: 'mono' },
    { key: 'pixel',   label: 'Pixel size', type: 'range', min: 1, max: 12, step: 1, def: 3 },
    { key: 'bright',  label: 'Brightness', type: 'range', min: -100, max: 100, step: 1, def: 0 },
    { key: 'contrast', label: 'Contrast',  type: 'range', min: -100, max: 100, step: 1, def: 10 },
    { key: 'invert',  label: 'Invert',     type: 'check', def: false },
  ],

  palettes: {
    mono:    ['#0a0a0a', '#f2f2f2'],
    gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    amber:   ['#160b00', '#7a4a00', '#ffb000', '#ffe4a0'],
    cyber:   ['#0d0221', '#7209b7', '#f72585', '#4cc9f0'],
    'gray-4': ['#101010', '#555555', '#aaaaaa', '#f0f0f0'],
  },

  bayer4: [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ],

  apply(src, ctx, p) {
    const w = src.width, h = src.height;
    const sw = Math.max(2, Math.floor(w / p.pixel));
    const sh = Math.max(2, Math.floor(h / p.pixel));

    const small = FXKit.scratch(sw, sh);
    const sctx = small.getContext('2d');
    sctx.drawImage(src, 0, 0, sw, sh);
    const img = sctx.getImageData(0, 0, sw, sh);
    const d = img.data;

    const ramp = this.palettes[p.palette].map(FXKit.hexToRgb);
    const levels = ramp.length;
    const cFactor = (259 * (p.contrast + 255)) / (255 * (259 - p.contrast));

    // Grayscale + brightness/contrast into a float buffer.
    const gray = new Float32Array(sw * sh);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let v = FXKit.luma(d[i], d[i + 1], d[i + 2]);
      v = cFactor * (v - 128) + 128 + p.bright;
      if (p.invert) v = 255 - v;
      gray[j] = FXKit.clamp(v, 0, 255);
    }

    const q = (v) => Math.round((v / 255) * (levels - 1)); // ramp index

    if (p.algo === 'floyd-steinberg' || p.algo === 'atkinson') {
      const atk = p.algo === 'atkinson';
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = y * sw + x;
          const old = gray[i];
          const idx = q(old);
          const nv = (idx / (levels - 1)) * 255;
          gray[i] = idx; // store ramp index for the write pass
          const err = (old - nv) * (atk ? 1 / 8 : 1);
          const push = (dx, dy, k) => {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && xx < sw && yy < sh) gray[yy * sw + xx] += err * k;
          };
          if (atk) {
            push(1, 0, 1); push(2, 0, 1);
            push(-1, 1, 1); push(0, 1, 1); push(1, 1, 1);
            push(0, 2, 1);
          } else {
            push(1, 0, 7 / 16); push(-1, 1, 3 / 16); push(0, 1, 5 / 16); push(1, 1, 1 / 16);
          }
        }
      }
    } else {
      const m4 = this.bayer4;
      const size = p.algo === 'bayer-8' ? 8 : 4;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = y * sw + x;
          let t = 0.5;
          if (p.algo !== 'threshold') {
            const bx = x % size, by = y % size;
            // Bayer 8x8 built recursively from the 4x4 matrix and the 2x2 base.
            const b2 = [[0, 2], [3, 1]];
            t = size === 4
              ? (m4[by][bx] + 0.5) / 16
              : (m4[by % 4][bx % 4] * 4 + b2[by >> 2][bx >> 2] + 0.5) / 64;
          }
          const v = gray[i] / 255;
          const scaled = v * (levels - 1) + (t - 0.5);
          gray[i] = FXKit.clamp(Math.round(scaled), 0, levels - 1);
        }
      }
    }

    for (let j = 0, i = 0; j < gray.length; j++, i += 4) {
      const c = ramp[FXKit.clamp(gray[j] | 0, 0, levels - 1)];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(small, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
  },
});

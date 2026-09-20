/* BlobTrack — surveillance-style detection boxes over bright or dark regions. */
FXKit.register({
  id: 'blob',
  name: 'BlobTrack',
  tagline: 'Motion-graphics detection boxes: track bright or dark regions with HUD-style overlays.',
  params: [
    { key: 'threshold', label: 'Threshold', type: 'range', min: 0.1, max: 0.9, step: 0.01, def: 0.6 },
    { key: 'target',  label: 'Track', type: 'select', options: ['bright', 'dark'], def: 'bright' },
    { key: 'minSize', label: 'Min blob size', type: 'range', min: 2, max: 40, step: 1, def: 8 },
    { key: 'style',   label: 'Style', type: 'select', options: ['corners', 'boxes', 'crosshair'], def: 'corners' },
    { key: 'color',   label: 'HUD color', type: 'color', def: '#12b5cb' },
    { key: 'labels',  label: 'Labels', type: 'check', def: true },
    { key: 'dim',     label: 'Dim background', type: 'range', min: 0, max: 1, step: 0.01, def: 0.25 },
  ],

  apply(src, ctx, p) {
    const w = src.width, h = src.height;
    const dw = 180;
    const dh = Math.max(2, Math.round((h / w) * dw));

    const small = FXKit.scratch(dw, dh);
    const sctx = small.getContext('2d');
    sctx.drawImage(src, 0, 0, dw, dh);
    const d = sctx.getImageData(0, 0, dw, dh).data;

    // Threshold mask.
    const mask = new Uint8Array(dw * dh);
    for (let i = 0, j = 0; j < mask.length; i += 4, j++) {
      const l = FXKit.luma(d[i], d[i + 1], d[i + 2]) / 255;
      mask[j] = (p.target === 'bright' ? l > p.threshold : l < 1 - p.threshold) ? 1 : 0;
    }

    // Connected components via iterative flood fill → bounding boxes.
    const blobs = [];
    const stack = [];
    for (let j = 0; j < mask.length; j++) {
      if (mask[j] !== 1) continue;
      let minX = dw, minY = dh, maxX = 0, maxY = 0, count = 0;
      stack.length = 0;
      stack.push(j);
      mask[j] = 2;
      while (stack.length) {
        const k = stack.pop();
        const x = k % dw, y = (k / dw) | 0;
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x > 0 && mask[k - 1] === 1) { mask[k - 1] = 2; stack.push(k - 1); }
        if (x < dw - 1 && mask[k + 1] === 1) { mask[k + 1] = 2; stack.push(k + 1); }
        if (y > 0 && mask[k - dw] === 1) { mask[k - dw] = 2; stack.push(k - dw); }
        if (y < dh - 1 && mask[k + dw] === 1) { mask[k + dw] = 2; stack.push(k + dw); }
      }
      if (count >= p.minSize) blobs.push({ minX, minY, maxX, maxY, count });
    }
    blobs.sort((a, b) => b.count - a.count);
    blobs.length = Math.min(blobs.length, 12);

    // Draw source, optionally dimmed.
    ctx.drawImage(src, 0, 0);
    if (p.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${p.dim})`;
      ctx.fillRect(0, 0, w, h);
    }

    const kx = w / dw, ky = h / dh;
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    ctx.lineWidth = Math.max(1.5, w / 640);
    ctx.font = `${Math.max(11, w / 70)}px "SF Mono", Menlo, monospace`;

    blobs.forEach((b, idx) => {
      const x = b.minX * kx, y = b.minY * ky;
      const bw = (b.maxX - b.minX + 1) * kx, bh = (b.maxY - b.minY + 1) * ky;
      const cx = x + bw / 2, cy = y + bh / 2;

      if (p.style === 'boxes') {
        ctx.strokeRect(x, y, bw, bh);
      } else if (p.style === 'crosshair') {
        const r = Math.max(bw, bh) / 2 + 6;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r - 8, cy); ctx.lineTo(cx - r + 6, cy);
        ctx.moveTo(cx + r - 6, cy); ctx.lineTo(cx + r + 8, cy);
        ctx.moveTo(cx, cy - r - 8); ctx.lineTo(cx, cy - r + 6);
        ctx.moveTo(cx, cy + r - 6); ctx.lineTo(cx, cy + r + 8);
        ctx.stroke();
      } else {
        // Corner ticks.
        const k = Math.min(bw, bh) * 0.28;
        ctx.beginPath();
        ctx.moveTo(x, y + k); ctx.lineTo(x, y); ctx.lineTo(x + k, y);
        ctx.moveTo(x + bw - k, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + k);
        ctx.moveTo(x + bw, y + bh - k); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw - k, y + bh);
        ctx.moveTo(x + k, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x, y + bh - k);
        ctx.stroke();
      }

      if (p.labels) {
        const tag = `OBJ_${String(idx + 1).padStart(2, '0')} [${Math.round(cx)},${Math.round(cy)}]`;
        ctx.fillText(tag, x, Math.max(12, y - 6));
      }
    });
  },
});

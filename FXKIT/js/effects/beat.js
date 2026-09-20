/* BeatSync — audio-reactive pulse, split and glitch. Upload a track and it reacts. */
FXKit.register({
  id: 'beat',
  name: 'BeatSync',
  tagline: 'Upload a track — visuals pulse, split and glitch in sync with the music.',
  animated: true,
  needsAudio: true,
  params: [
    { key: 'pulse',       label: 'Pulse zoom', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 },
    { key: 'split',       label: 'RGB split', type: 'range', min: 0, max: 1, step: 0.01, def: 0.4 },
    { key: 'glitch',      label: 'Glitch strips', type: 'range', min: 0, max: 1, step: 0.01, def: 0.3 },
    { key: 'flash',       label: 'Beat flash', type: 'range', min: 0, max: 1, step: 0.01, def: 0.2 },
    { key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.5, max: 3, step: 0.05, def: 1.4 },
  ],

  apply(src, ctx, p, t, fx) {
    const w = src.width, h = src.height;
    const audio = fx.audio || { level: 0, bass: 0, ready: false };
    // Idle preview animation when no audio is loaded yet.
    const bass = audio.ready
      ? FXKit.clamp(audio.bass * p.sensitivity, 0, 1)
      : (Math.sin(t * 4) * 0.5 + 0.5) * 0.5;
    const level = audio.ready ? FXKit.clamp(audio.level * p.sensitivity, 0, 1) : bass;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Bass-driven zoom pulse.
    const s = 1 + bass * p.pulse * 0.18;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(src, 0, 0);
    ctx.restore();

    // RGB split scales with overall level.
    const shift = level * p.split * w * 0.02;
    if (shift > 0.5) {
      const iso = FXKit.scratch(w, h);
      const ictx = iso.getContext('2d');
      for (const [color, dx] of [['#ff0000', -shift], ['#00ffff', shift]]) {
        ictx.globalCompositeOperation = 'source-over';
        ictx.drawImage(src, 0, 0);
        ictx.globalCompositeOperation = 'multiply';
        ictx.fillStyle = color;
        ictx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.drawImage(iso, dx, 0);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Glitch strips on strong hits.
    if (bass > 0.55 && p.glitch > 0) {
      const n = Math.round(bass * p.glitch * 10);
      for (let i = 0; i < n; i++) {
        const sy = Math.random() * h;
        const sh = 3 + Math.random() * h * 0.05;
        const dx = (Math.random() - 0.5) * w * 0.2 * bass;
        ctx.drawImage(src, 0, sy, w, sh, dx, sy, w, sh);
      }
    }

    // White flash on peaks.
    if (p.flash > 0 && bass > 0.75) {
      ctx.fillStyle = `rgba(255,255,255,${(bass - 0.75) * p.flash})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Tiny level meter so you can see the reaction.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(12, h - 18, 80, 5);
    ctx.fillStyle = '#b6ff2e';
    ctx.fillRect(12, h - 18, 80 * level, 5);
    if (!audio.ready) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `${Math.max(11, w / 80)}px monospace`;
      ctx.fillText('↑ upload an audio track to sync', 12, h - 28);
    }
  },
});

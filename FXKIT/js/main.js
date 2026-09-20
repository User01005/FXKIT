/* FXKIT app — routing, media handling, param UI, render loop, export. */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const viewHome = $('#view-home');
  const viewEditor = $('#view-editor');
  const stage = $('#stage');
  const stageCtx = stage.getContext('2d');
  const controlsEl = $('#controls');

  const MAX_IMAGE = 1400;
  const MAX_VIDEO = 1280;

  const src = document.createElement('canvas');
  // Effects read pixels back from the source every frame; tell the browser so it
  // keeps the canvas on the CPU instead of round-tripping through the GPU.
  const srcCtx = src.getContext('2d', { willReadFrequently: true });

  const state = {
    effect: null,
    params: {},
    media: null, // { type: 'image'|'video', el, w, h }
    dirty: true,
    raf: null,
    recorder: null,
    previewMuted: true,   // quiet by default; the export keeps the audio regardless
    audioBlocked: false,  // autoplay forced a hard mute, so there is no audio to grab
  };

  const audio = {
    level: 0, bass: 0, ready: false,
    analyser: null, data: null, el: null, ctx: null, dest: null,
    videoNode: null, videoGain: null,
  };

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- sample artwork (also the source for the proof-sheet plates) ---------- */
  function makeSample(w = 1200, h = 800) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const S = w / 1200; // scale factor so the plate thumbnails match the full render

    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#101322');
    grad.addColorStop(0.45, '#8a13c6');
    grad.addColorStop(1, '#ffb03a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    g.fillStyle = 'rgba(255,252,245,0.94)';
    g.beginPath(); g.arc(w * 0.68, h * 0.36, 170 * S, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(12,8,26,0.88)';
    g.beginPath(); g.arc(w * 0.31, h * 0.64, 118 * S, 0, Math.PI * 2); g.fill();

    g.strokeStyle = 'rgba(255,255,255,0.66)';
    g.lineWidth = 9 * S;
    g.beginPath(); g.arc(w * 0.45, h * 0.46, 235 * S, 0, Math.PI * 2); g.stroke();

    g.fillStyle = '#fff';
    g.font = `800 ${128 * S}px ui-sans-serif, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('FXKIT', w / 2, h * 0.84);

    return c;
  }

  const sampleFull = makeSample(1200, 800);
  const sampleThumb = makeSample(400, 250);

  /* ---------- home: proof sheet of live renders ---------- */
  function buildHome() {
    const grid = $('#tool-grid');
    grid.innerHTML = '';

    FXKit.effects.forEach((fx, i) => {
      const card = document.createElement('a');
      card.className = 'tool-card';
      card.href = `#/t/${fx.id}`;
      card.style.setProperty('--i', i); // drives the staggered reveal
      card.innerHTML = `
        <div class="plate">
          <span class="plate-no">${String(i + 1).padStart(2, '0')} · ${fx.id.toUpperCase()}</span>
          <canvas width="400" height="250"></canvas>
        </div>
        <div class="body">
          <h3>${fx.name}</h3>
          <p>${fx.tagline}</p>
          <span class="open">Open tool →</span>
        </div>`;
      grid.appendChild(card);

      const canvas = card.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const params = {};
      for (const p of fx.params) params[p.key] = p.def;

      const paint = (t) => {
        try {
          fx.apply(sampleThumb, ctx, params, t, { ...FXKit, audio });
        } catch (err) {
          console.error(`[fxkit] plate "${fx.id}" failed:`, err);
        }
      };
      paint(0);

      // Hovering a plate runs the effect for real — the clearest possible preview.
      if (!reducedMotion) {
        let raf = null;
        const t0 = performance.now();
        const loop = () => {
          paint((performance.now() - t0) / 1000);
          raf = requestAnimationFrame(loop);
        };
        const start = () => { if (!raf) loop(); };
        const stop = () => { if (raf) cancelAnimationFrame(raf); raf = null; paint(0); };
        card.addEventListener('pointerenter', start);
        card.addEventListener('pointerleave', stop);
        card.addEventListener('focus', start);
        card.addEventListener('blur', stop);
      }
    });
  }

  /* ---------- routing ---------- */
  function route() {
    const m = location.hash.match(/^#\/t\/([\w-]+)/);
    const fx = m && FXKit.effects.find((e) => e.id === m[1]);
    if (fx) openEditor(fx);
    else {
      closeEditor();
      viewHome.hidden = false;
      viewEditor.hidden = true;
    }
  }

  function openEditor(fx) {
    state.effect = fx;
    state.params = {};
    for (const p of fx.params) state.params[p.key] = p.def;

    $('#editor-id').textContent = fx.id.toUpperCase();
    $('#editor-name').textContent = fx.name;
    $('#editor-tagline').textContent = fx.tagline;
    $('#audio-btn').hidden = !fx.needsAudio;

    buildControls();
    if (!state.media) setMedia({ type: 'image', el: sampleFull, w: 1200, h: 800 });
    syncStageSize();

    viewHome.hidden = true;
    viewEditor.hidden = false;
    state.dirty = true;
    updateExportControls();
    startLoop();
  }

  function closeEditor() {
    stopLoop();
    stopRecording();
    state.effect = null;
  }

  /* ---------- param controls ---------- */
  function buildControls() {
    controlsEl.innerHTML = '';
    for (const p of state.effect.params) {
      const wrap = document.createElement('div');
      wrap.className = 'control' + (p.type === 'check' ? ' check' : '');

      if (p.type === 'range') {
        wrap.innerHTML = `<label>${p.label}<output>${state.params[p.key]}</output></label>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${state.params[p.key]}">`;
        const input = wrap.querySelector('input');
        const out = wrap.querySelector('output');
        input.addEventListener('input', () => {
          state.params[p.key] = parseFloat(input.value);
          out.textContent = input.value;
          state.dirty = true;
        });
      } else if (p.type === 'select') {
        wrap.innerHTML = `<label>${p.label}</label><select>${p.options
          .map((o) => `<option ${o === state.params[p.key] ? 'selected' : ''}>${o}</option>`)
          .join('')}</select>`;
        wrap.querySelector('select').addEventListener('change', (e) => {
          state.params[p.key] = e.target.value;
          state.dirty = true;
        });
      } else if (p.type === 'color') {
        wrap.innerHTML = `<label>${p.label}</label><input type="color" value="${state.params[p.key]}">`;
        wrap.querySelector('input').addEventListener('input', (e) => {
          state.params[p.key] = e.target.value;
          state.dirty = true;
        });
      } else if (p.type === 'check') {
        wrap.innerHTML = `<input type="checkbox" id="chk-${p.key}" ${state.params[p.key] ? 'checked' : ''}>
          <label for="chk-${p.key}">${p.label}</label>`;
        wrap.querySelector('input').addEventListener('change', (e) => {
          state.params[p.key] = e.target.checked;
          state.dirty = true;
        });
      }
      controlsEl.appendChild(wrap);
    }
  }

  function randomize() {
    for (const p of state.effect.params) {
      if (p.type === 'range') {
        const steps = Math.round((p.max - p.min) / p.step);
        state.params[p.key] = +(p.min + Math.floor(Math.random() * (steps + 1)) * p.step).toFixed(3);
      } else if (p.type === 'select') {
        state.params[p.key] = p.options[Math.floor(Math.random() * p.options.length)];
      } else if (p.type === 'check') {
        state.params[p.key] = Math.random() > 0.5;
      }
      // colors are left alone on purpose — random colors are rarely pretty
    }
    buildControls();
    state.dirty = true;
  }

  function reset() {
    for (const p of state.effect.params) state.params[p.key] = p.def;
    buildControls();
    state.dirty = true;
  }

  /* ---------- media ---------- */
  function setMedia(media) {
    if (state.media?.type === 'video' && state.media.el !== media.el) {
      state.media.el.pause();
      URL.revokeObjectURL(state.media.el.src);
    }
    state.media = media;
    syncStageSize();
    state.dirty = true;
    updateExportControls();
  }

  function syncStageSize() {
    if (!state.media) return;
    src.width = stage.width = state.media.w;
    src.height = stage.height = state.media.h;
  }

  function fitDims(w, h, max) {
    const k = Math.min(1, max / Math.max(w, h));
    return [Math.round(w * k), Math.round(h * k)];
  }

  /* ---------- input limits ----------
     The accept="" attribute is only a hint to the file picker, and drag-and-drop
     ignores it entirely, so every file is checked here before we touch it. */
  const MB = 1024 * 1024;
  const LIMITS = { image: 50 * MB, video: 200 * MB, audio: 50 * MB };
  const MAX_SOURCE_PIXELS = 50_000_000; // ~8K x 6K; beyond this, decoding alone can kill a tab

  function showLoadError(msg) {
    const el = $('#load-error');
    el.textContent = msg; // textContent, never innerHTML: file names are user input
    el.hidden = !msg;
  }

  function kindOf(file) {
    const t = (file.type || '').split('/')[0];
    return t === 'image' || t === 'video' || t === 'audio' ? t : null;
  }

  function checkFile(file, allowed) {
    const kind = kindOf(file);
    if (!kind || !allowed.includes(kind)) {
      const what = allowed.length > 1 ? 'an image, video or audio file' : 'an audio file';
      return `That file type isn’t supported. Try ${what}.`;
    }
    if (file.size > LIMITS[kind]) {
      return `That ${kind} is ${(file.size / MB).toFixed(0)} MB. The limit is ${LIMITS[kind] / MB} MB.`;
    }
    if (file.size === 0) return 'That file is empty.';
    return null;
  }

  function loadFile(file) {
    const err = checkFile(file, ['image', 'video', 'audio']);
    showLoadError(err);
    if (err) return;
    const kind = kindOf(file);

    if (kind === 'image') {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth * img.naturalHeight > MAX_SOURCE_PIXELS) {
          URL.revokeObjectURL(url);
          showLoadError('That image is too large to process. Keep it under about 8000 × 6000 px.');
          return;
        }
        const [w, h] = fitDims(img.naturalWidth, img.naturalHeight, MAX_IMAGE);
        setMedia({ type: 'image', el: img, w, h });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        showLoadError('Couldn’t read that image. It may be corrupt or in a format this browser can’t open (HEIC often isn’t supported).');
      };
      img.src = url;
    } else if (kind === 'video') {
      state.audioBlocked = false;
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      // Left unmuted so the clip's own audio reaches the graph and lands in the
      // export. `muted` would silence it there too, so the preview is quietened
      // with a gain node instead — see attachVideoAudio.
      vid.muted = false;
      vid.loop = true;
      vid.playsInline = true;
      vid.onloadeddata = () => {
        const [w, h] = fitDims(vid.videoWidth, vid.videoHeight, MAX_VIDEO);
        setMedia({ type: 'video', el: vid, w, h });
        attachVideoAudio(vid);
        vid.play().catch(() => {
          // No user activation to spend — fall back to a muted, silent preview.
          vid.muted = true;
          state.audioBlocked = true;
          vid.play().catch(() => {});
        });
      };
      vid.onerror = () => {
        URL.revokeObjectURL(url);
        showLoadError('Couldn’t play that video. This browser may not support its codec. MP4 (H.264) and WebM are the safest bets.');
      };
      vid.src = url;
    } else {
      loadAudio(file);
    }
  }

  /* Everything audible is wired the same way: a source feeds both the speakers
     (through a gain we can duck) and a MediaStreamDestination the recorder taps,
     so muting the preview never costs you the audio in the export. */
  function ensureAudioGraph() {
    if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.ctx.resume();
    if (!audio.dest) audio.dest = audio.ctx.createMediaStreamDestination();
    return audio.ctx;
  }

  function attachVideoAudio(vid) {
    detachVideoAudio();
    let ctx;
    try {
      ctx = ensureAudioGraph();
      const node = ctx.createMediaElementSource(vid);
      const gain = ctx.createGain();
      gain.gain.value = state.previewMuted ? 0 : 1;
      node.connect(gain);
      gain.connect(ctx.destination);
      node.connect(audio.dest); // recorder tap, always at full level
      audio.videoNode = node;
      audio.videoGain = gain;
    } catch (err) {
      // Silent clip, or a browser that refused the graph — preview still plays.
      console.warn('[fxkit] no audio graph for this video:', err);
    }
  }

  function detachVideoAudio() {
    if (audio.videoNode) audio.videoNode.disconnect();
    if (audio.videoGain) audio.videoGain.disconnect();
    audio.videoNode = audio.videoGain = null;
  }

  function setPreviewMuted(muted) {
    state.previewMuted = muted;
    if (audio.videoGain) audio.videoGain.gain.value = muted ? 0 : 1;
  }

  function loadAudio(file) {
    const err = checkFile(file, ['audio']);
    showLoadError(err);
    if (err) return;
    if (audio.el) {
      audio.el.pause();
      URL.revokeObjectURL(audio.el.src);
    }
    const ctx = ensureAudioGraph();

    const el = new Audio(URL.createObjectURL(file));
    el.loop = true;
    const node = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    node.connect(analyser);
    analyser.connect(ctx.destination);
    analyser.connect(audio.dest); // so the track lands in the export too

    audio.el = el;
    audio.analyser = analyser;
    audio.data = new Uint8Array(analyser.frequencyBinCount);
    audio.ready = true;
    el.onerror = () => {
      audio.ready = false;
      showLoadError('Couldn’t play that audio file. MP3, M4A, WAV and OGG are the safest bets.');
    };
    el.play().catch(() => {});
  }

  function updateAudio() {
    if (!audio.ready) return;
    audio.analyser.getByteFrequencyData(audio.data);
    let sum = 0, bassSum = 0;
    const bassBins = 8;
    for (let i = 0; i < audio.data.length; i++) {
      sum += audio.data[i];
      if (i < bassBins) bassSum += audio.data[i];
    }
    audio.level = sum / audio.data.length / 255;
    audio.bass = bassSum / bassBins / 255;
  }

  /* ---------- render loop ---------- */
  const t0 = performance.now();

  function isAnimated() {
    const a = state.effect?.animated;
    if (typeof a === 'function') return a(state.params);
    return !!a;
  }

  function render() {
    if (!state.effect || !state.media) return;
    const t = (performance.now() - t0) / 1000;
    srcCtx.drawImage(state.media.el, 0, 0, src.width, src.height);
    updateAudio();
    try {
      state.effect.apply(src, stageCtx, state.params, t, { ...FXKit, audio });
    } catch (err) {
      console.error(`[fxkit] effect "${state.effect.id}" failed:`, err);
    }
  }

  function tick() {
    if (!state.effect) return;
    const live = state.media?.type === 'video' || isAnimated() || state.recorder;
    if (live || state.dirty) {
      render();
      state.dirty = false;
    }
    state.raf = requestAnimationFrame(tick);
  }

  function startLoop() { if (!state.raf) state.raf = requestAnimationFrame(tick); }
  function stopLoop() { if (state.raf) cancelAnimationFrame(state.raf); state.raf = null; }

  /* ---------- export ----------
     Two things make this fiddly. Programmatic downloads are blocked inside
     sandboxed frames, so we never rely on the click alone — the finished file is
     always presented in a panel the user can save from by hand. And MP4 is only
     available where the browser's own encoder offers it; there is no library to
     fall back on, so we offer exactly the formats MediaRecorder reports. */

  // Best-first; whichever the browser actually supports gets offered.
  const CLIP_FORMATS = [
    { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4', label: 'MP4' },
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4', label: 'MP4' },
    { mime: 'video/mp4', ext: 'mp4', label: 'MP4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm', label: 'WEBM' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm', label: 'WEBM' },
    { mime: 'video/webm', ext: 'webm', label: 'WEBM' },
  ];

  function supportedClipFormats() {
    if (!('MediaRecorder' in window)) return [];
    const seen = new Set();
    return CLIP_FORMATS.filter((f) => {
      if (seen.has(f.label) || !MediaRecorder.isTypeSupported(f.mime)) return false;
      seen.add(f.label);
      return true;
    });
  }

  const clipFormats = supportedClipFormats();

  function buildClipFormatSelect() {
    const sel = $('#vid-format');
    sel.innerHTML = clipFormats
      .map((f, i) => `<option value="${i}">${f.label}</option>`)
      .join('');
    // No MP4 encoder in this browser? Say so rather than silently offering WebM.
    if (clipFormats.length && !clipFormats.some((f) => f.ext === 'mp4')) {
      sel.title = 'This browser has no built-in MP4 encoder — clips record as WebM.';
    }
  }

  let lastURL = null;
  let lastBlob = null;
  let lastName = '';

  // Running inside someone else's frame is where <a download> gets vetoed.
  const EMBEDDED = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  // The canonical address, so an embedded copy can point people at the real site.
  const FULL_URL = document.querySelector('link[rel="canonical"]')?.href || location.origin + '/';

  function anchorDownload() {
    const a = document.createElement('a');
    a.href = lastURL;
    a.download = lastName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* One click, one file. Outside a frame `<a download>` saves straight to the
     downloads folder with no dialog, so that's the path. Inside a frame the
     embedder can veto downloads, and there showSaveFilePicker is worth trying
     first — it writes through a save dialog rather than the download pipeline,
     so the veto doesn't apply. */
  async function saveFile() {
    if (!lastBlob) return;

    if (!EMBEDDED) {
      anchorDownload();
      return;
    }

    if (window.showSaveFilePicker) {
      const ext = lastName.split('.').pop();
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: lastName,
          types: [{ description: ext.toUpperCase(), accept: { [lastBlob.type]: ['.' + ext] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(lastBlob);
        await writable.close();
        flashSaved();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user closed the dialog
        // Blocked or unsupported in this frame — fall through and try anyway.
      }
    }

    anchorDownload();
  }

  function flashSaved() {
    const a = $('#result-download');
    const was = a.textContent;
    a.textContent = 'Saved';
    setTimeout(() => (a.textContent = was), 2000);
  }

  function showResult(blob, filename, kind) {
    if (lastURL) URL.revokeObjectURL(lastURL);
    lastURL = URL.createObjectURL(blob);

    const preview = $('#result-preview');
    preview.innerHTML = '';
    if (kind === 'image') {
      const img = new Image();
      img.src = lastURL;
      img.alt = 'Your exported image';
      preview.appendChild(img);
    } else {
      const v = document.createElement('video');
      v.src = lastURL;
      v.controls = true;
      v.loop = true;
      v.playsInline = true;
      v.play().catch(() => {});
      preview.appendChild(v);
    }

    lastBlob = blob;
    lastName = filename;

    const a = $('#result-download');
    a.href = lastURL;
    a.download = filename;

    const noun = kind === 'image' ? 'image' : 'video';
    a.textContent = `Download ${noun}`;

    const size = (blob.size / 1048576).toFixed(1);
    $('#result-hint').innerHTML = `<b>${filename}</b> · ${size} MB`;

    // Only surface an escape hatch where the button can actually be blocked.
    const fb = $('#result-fallback');
    fb.hidden = !EMBEDDED;
    if (EMBEDDED) {
      fb.innerHTML =
        `Embedded previews can block saving. If the button doesn’t work, ` +
        `<a href="${FULL_URL}" target="_blank" rel="noopener noreferrer"><b>open the full site</b></a> ` +
        `— downloads work normally there.`;
    }

    const canCopy = kind === 'image' && !!navigator.clipboard?.write;
    $('#result-copy').hidden = !canCopy;
    $('#result-copy').textContent = 'Copy image';
    $('#result-actions').classList.toggle('solo', !canCopy);
    $('#result').hidden = false;
  }

  function closeResult() {
    $('#result').hidden = true;
    const v = $('#result-preview').querySelector('video');
    if (v) v.pause();
  }

  function exportImage() {
    render();
    const mime = $('#img-format').value;
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
    stage.toBlob(
      (blob) => {
        if (!blob) return;
        showResult(blob, `fxkit-${state.effect.id}-${Date.now()}.${ext}`, 'image');
      },
      mime,
      0.95
    );
  }

  // A video source exports its whole length; a still with an animated effect
  // exports a loop of whatever length you pick.
  function isVideoSource() { return state.media?.type === 'video'; }

  function updateExportControls() {
    const canExport =
      !!state.effect && (isVideoSource() || isAnimated()) &&
      clipFormats.length > 0 && !!stage.captureStream;

    $('#record-row').hidden = !canExport;
    $('#loop-row').hidden = !canExport || isVideoSource();
    $('#sound-row').hidden = !isVideoSource();

    const note = $('#sound-note');
    note.hidden = !isVideoSource();
    if (isVideoSource()) {
      note.innerHTML = state.audioBlocked
        ? 'This browser blocked sound on autoplay, so the clip is playing silent ' +
          'and <b>its audio can’t be exported</b>. Re-pick the file to retry.'
        : 'Your clip’s audio is included in the export either way.';
    }

    if (canExport && !state.recorder) {
      $('#btn-record').textContent = isVideoSource() ? 'Export video' : 'Export loop';
    }
  }

  function setProgress(frac, text) {
    const el = $('#export-progress');
    el.hidden = false;
    el.querySelector('i').style.width = `${Math.round(FXKit.clamp(frac, 0, 1) * 100)}%`;
    el.querySelector('.progress-text').textContent = text;
  }

  function startVideoExport() {
    const btn = $('#btn-record');
    const fmt = clipFormats[$('#vid-format').value | 0] || clipFormats[0];
    const vid = isVideoSource() ? state.media.el : null;

    // Browsers only expose a real-time encoder, so an export takes as long as
    // the clip does. Run it from the top so the whole thing lands in the file.
    const seconds = vid
      ? (isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 8)
      : parseFloat($('#loop-dur').value);

    const stream = stage.captureStream(30);
    // Fold in the music so a BeatSync export carries its track.
    if (audio.dest) {
      for (const track of audio.dest.stream.getAudioTracks()) stream.addTrack(track);
    }

    const rec = new MediaRecorder(stream, {
      mimeType: fmt.mime,
      videoBitsPerSecond: 8_000_000,
    });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const started = performance.now();
    let ticker = null;

    const finish = () => {
      clearInterval(ticker);
      if (vid) { vid.loop = true; vid.onended = null; }
      $('#export-progress').hidden = true;
      btn.classList.remove('recording');
      state.recorder = null;
      updateExportControls();
    };

    rec.onstop = () => {
      finish();
      const blob = new Blob(chunks, { type: fmt.mime.split(';')[0] });
      showResult(blob, `fxkit-${state.effect.id}-${Date.now()}.${fmt.ext}`, 'video');
    };

    if (vid) {
      vid.loop = false;
      vid.currentTime = 0;
      vid.play();
      vid.onended = () => { if (state.recorder === rec) rec.stop(); };
    }

    rec.start();
    state.recorder = rec;
    btn.textContent = 'Stop early';
    btn.classList.add('recording');

    ticker = setInterval(() => {
      const done = vid && isFinite(vid.duration) && vid.duration > 0
        ? vid.currentTime / vid.duration
        : (performance.now() - started) / (seconds * 1000);
      const left = Math.max(0, seconds - (performance.now() - started) / 1000);
      setProgress(done, `Rendering ${fmt.label} · ${left.toFixed(0)}s left`);
    }, 200);
    setProgress(0, `Rendering ${fmt.label} · ${seconds.toFixed(0)}s left`);

    // Safety net for sources that never fire 'ended' (and the loop case).
    setTimeout(() => {
      if (state.recorder === rec) rec.stop();
    }, seconds * 1000 + (vid ? 1500 : 0));
  }

  function stopRecording() { if (state.recorder) state.recorder.stop(); }

  /* ---------- wiring ---------- */
  $('#file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#audio-input').addEventListener('change', (e) => {
    if (e.target.files[0]) loadAudio(e.target.files[0]);
    e.target.value = '';
  });

  const stageWrap = $('#stage-wrap');
  ['dragover', 'dragleave', 'drop'].forEach((ev) =>
    stageWrap.addEventListener(ev, (e) => {
      e.preventDefault();
      stageWrap.classList.toggle('dragover', ev === 'dragover');
      if (ev === 'drop' && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    })
  );

  $('#btn-random').addEventListener('click', randomize);
  $('#btn-reset').addEventListener('click', reset);
  $('#btn-export').addEventListener('click', exportImage);
  $('#btn-record').addEventListener('click', () => {
    state.recorder ? stopRecording() : startVideoExport();
  });

  $('#loop-dur').addEventListener('input', (e) => {
    $('#loop-dur-out').textContent = `${e.target.value}s`;
  });

  $('#preview-sound').addEventListener('change', (e) => setPreviewMuted(!e.target.checked));

  $('#result-download').addEventListener('click', (e) => {
    // href stays set so right-click → Save is still there as a manual route.
    e.preventDefault();
    saveFile();
  });

  $('#result-close').addEventListener('click', closeResult);
  $('#result').addEventListener('click', (e) => {
    if (e.target.id === 'result') closeResult();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#result').hidden) closeResult();
  });

  $('#result-copy').addEventListener('click', async () => {
    const btn = $('#result-copy');
    try {
      const blob = await (await fetch(lastURL)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = "Couldn't copy — save instead";
    }
    setTimeout(() => (btn.textContent = 'Copy image'), 2200);
  });

  window.addEventListener('hashchange', route);

  buildClipFormatSelect();
  buildHome();
  route();

  // Params can flip an effect in and out of being animated; keep the button honest.
  setInterval(updateExportControls, 500);
})();

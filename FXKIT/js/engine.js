/* FXKIT engine — effect registry + shared helpers.
 *
 * An effect is an object:
 * {
 *   id: 'my-effect',            // unique, used in the URL hash + plate number
 *   name: 'My Effect',
 *   tagline: 'Short card text',
 *   animated: true|false|fn(p), // re-render every frame even for still images
 *   needsAudio: true,           // show the audio upload button (beat-reactive tools)
 *   params: [ {key, label, type: 'range'|'select'|'color'|'check', ...} ],
 *   apply(src, ctx, p, t, fx) {}  // src: source canvas, ctx: destination 2d context,
 *                                 // p: current param values, t: seconds, fx: helpers
 * }
 * Register with FXKit.register(effect) and add a <script> tag in index.html.
 */
window.FXKit = (() => {
  const effects = [];

  function register(effect) {
    effects.push(effect);
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // Deterministic PRNG so per-slice randomness is stable across frames.
  function seeded(seed) {
    let s = (seed * 2654435761) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }

  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Shared scratch canvas for effects that need an intermediate buffer.
  function scratch(w, h) {
    let c = scratch._c;
    if (!c) {
      c = scratch._c = document.createElement('canvas');
      c.getContext('2d', { willReadFrequently: true }); // first call fixes the context type
    }
    c.width = w;
    c.height = h;
    return c;
  }

  // Reusable noise tile, regenerated on demand for animated grain.
  function noiseTile(size, mono = true) {
    const c = noiseTile._c || (noiseTile._c = document.createElement('canvas'));
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v;
      d[i + 1] = mono ? v : (Math.random() * 255) | 0;
      d[i + 2] = mono ? v : (Math.random() * 255) | 0;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  return { effects, register, clamp, lerp, seeded, luma, hexToRgb, scratch, noiseTile };
})();

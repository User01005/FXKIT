# FXKIT

Creative effects studio for images and video that runs entirely in the browser. Halftone, dithering, ASCII, CRT glitch, glass slices, motion blur, film grain, Droste loops, blob tracking and beat-synced motion. Drop a file in, turn the dials, export a still or a clip. Nothing is uploaded.

## Stack

Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies.

```
index.html          app shell
css/style.css       all styles (light + dark themes)
js/engine.js        effect registry + shared helpers
js/effects/*.js     one file per effect
js/main.js          routing, media loading, controls, render loop, export
privacy.html        privacy page (served at /privacy)
404.html            not-found page
vercel.json         security headers + caching
```

## Run locally

Any static server works:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploy on Vercel

1. Import this repo in Vercel (Add New → Project).
2. Framework preset: **Other**. Build command: empty. Output directory: `./`.
3. Deploy. Every push to `main` redeploys.

## Adding an effect

Create `js/effects/my-effect.js`:

```js
FXKit.register({
  id: 'my-effect',
  name: 'My Effect',
  tagline: 'One line for the card.',
  params: [{ key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, def: 0.5 }],
  apply(src, ctx, p, t, fx) {
    ctx.drawImage(src, 0, 0);
  },
});
```

Then add `<script src="/js/effects/my-effect.js" defer></script>` in `index.html` before `main.js`.

## Security

- Strict Content-Security-Policy: only first-party scripts and styles, no inline code, no third-party requests.
- Clickjacking blocked (`frame-ancestors 'none'`), HSTS, nosniff, locked-down Permissions-Policy.
- Every file is checked for type and size before it's opened (images 50 MB, video 200 MB, audio 50 MB), and oversized images are downscaled before processing.
- User input never reaches `innerHTML`.

Keep the CSP intact: new code must live in `.js` / `.css` files, never in inline `<script>`, `<style>` or `style=""` attributes.

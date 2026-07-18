// make-single.mjs — bundle the modular gallery into ONE self-contained HTML file
// that opens directly in Chrome (file://) with zero network dependencies.
//
//   cd build && npm install    # esbuild + three@0.170.0 (see build/package.json)
//   node make-single.mjs       # writes ../ahmad-gallery.html
//
// What it does:
//   1. esbuild bundles js/main.js (+ three + all addons + every module) into one
//      classic-script IIFE — dynamic import() calls are inlined, no ESM at runtime.
//   2. Every asset is embedded as a data: URI — the 5 site screenshots (webp),
//      the Archivo/Marcellus fonts (woff2), and the 3D-text typeface (json).
//   3. The result is a single index-shaped HTML with one <style> and one <script>.
//
// The modular js/ tree stays the source of truth; this file is a build artifact.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const NODE_MODULES = resolve(HERE, 'node_modules');
const OUT = resolve(REPO, 'ahmad-gallery.html');

const b64 = (path, mime) => `data:${mime};base64,${readFileSync(path).toString('base64')}`;

// ---- 1. bundle -------------------------------------------------------------
const result = await build({
  entryPoints: [resolve(REPO, 'js/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'chrome109',
  charset: 'utf8',
  legalComments: 'none',
  write: false,
  nodePaths: [NODE_MODULES],          // resolves `three` and `three/addons/*`
  logLevel: 'warning',
});
let js = result.outputFiles[0].text;
if (/\bimport\s*\(/.test(js)) {
  throw new Error('bundle still contains a native dynamic import() — would break as a classic script');
}

// ---- 2. inline the art screenshots (referenced as assets/art/<id>.webp) -----
const ART = ['ecom-heroes', 'saadibuilds', 'seen-by-many', 'callura', 'orca-management'];
for (const id of ART) {
  const uri = b64(resolve(REPO, `assets/art/${id}.webp`), 'image/webp');
  const before = js.length;
  js = js.split(`assets/art/${id}.webp`).join(uri);
  if (js.length === before) throw new Error(`art reference not found in bundle: ${id}`);
}

// ---- 3. inline the 3D-text typeface (window.__AG_FONT, consumed by interior) -
const typefacePath = resolve(HERE, 'helvetiker_bold.typeface.json');
const fontPrelude = existsSync(typefacePath)
  ? `window.__AG_FONT=${readFileSync(typefacePath, 'utf8')};\n`
  : '';   // absent → interior.js falls back to the CDN (dev only)

// ---- 4. fonts for the CSS --------------------------------------------------
const FONTS = {
  'Archivo-400': ['Archivo', 400], 'Archivo-600': ['Archivo', 600],
  'Archivo-700': ['Archivo', 700], 'Marcellus-400': ['Marcellus', 400],
};
const faces = Object.entries(FONTS).map(([file, [fam, wght]]) =>
  `@font-face{font-family:'${fam}';font-weight:${wght};font-display:swap;` +
  `src:url(${b64(resolve(REPO, `assets/fonts/${file}.woff2`), 'font/woff2')}) format('woff2');}`
).join('\n');

// ---- 5. assemble the HTML (mirrors index.html, everything inlined) ----------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Ahmad — The Gallery</title>
<meta name="description" content="A first-person 3D gallery of real client websites designed, built, and sold by Ahmad — Toronto designer, artist & marketer.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%230d0e10'/%3E%3Ctext x='32' y='44' font-family='Georgia,serif' font-size='36' fill='%23c8a24a' text-anchor='middle'%3EA.%3C/text%3E%3C/svg%3E">
<style>
${faces}
:root{--bg:#0d0e10;--cream:#ece4d3;--gold:#c8a24a;--gold-dim:#8a6f33;--ink:#101114;--muted:#9a948a;}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{height:100%;overflow:hidden;background:#0d0e10;}
body{font-family:'Archivo','Helvetica Neue',sans-serif;color:#ece4d3;-webkit-font-smoothing:antialiased;}
#scene{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;}
#ui{position:fixed;inset:0;pointer-events:none;z-index:10;}
#ui>*{pointer-events:auto;}
noscript{position:fixed;inset:0;display:grid;place-items:center;color:#ece4d3;}
</style>
</head>
<body>
<canvas id="scene"></canvas>
<div id="ui"></div>
<noscript>Ahmad — The Gallery needs JavaScript (and WebGL2) to open.</noscript>
<script>${fontPrelude}${js}</script>
</body>
</html>
`;

writeFileSync(OUT, html);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`✓ wrote ${OUT}`);
console.log(`  bundle ${kb(js.length)} · total ${kb(html.length)}`);

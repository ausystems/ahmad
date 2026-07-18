# Ahmad — The Gallery

A first-person 3D portfolio built to AAA arch-viz standards: a luxury villa great-room at
golden hour, opening onto a terrace, garden, and dock over a mountain lake. Every piece
hanging inside is a real client website Ahmad designed, built, and sold.

**Controls:** WASD or arrow keys — move · mouse — look (pointer lock; click-and-drag where
lock is unavailable) · Shift — run · **E** / click — view a work · M / speaker icon — mute ·
`[` `]` — mouse sensitivity · Esc — close panels / release the mouse.

## Two ways to run it

**1. `ahmad-gallery.html` — the standalone build. Just double-click it.**
A single self-contained HTML file (~1.9 MB): three.js, all sixteen modules, and every asset
(the five screenshots, the fonts, the 3D-text typeface) are inlined as one `<style>` + one
`<script>`. **Zero external dependencies, no server, no internet.** Opens directly in Google
Chrome from `file://` — this is the file to send someone who just wants to play.

**2. `index.html` — the modular source, for development and deploys.**
The same world as separate ES modules under `js/`, with three.js loaded from a pinned CDN. Needs
a static server (ES modules don't load over `file://`) and internet for the CDN. This is what
Vercel serves.

## What's in this repo

| Path | Purpose |
|---|---|
| `ahmad-gallery.html` | **The standalone single-file build — double-click to play.** Regenerate with `cd build && npm install && node make-single.mjs`. |
| `index.html` | Modular entry point — shell, fonts, import map (three.js pinned from jsdelivr). |
| `js/` | The world, one ES module per system: `engine` (renderer + HDR post pipeline + planar reflections), `config` (world constants), `data` (the five works + texts), `materials` (procedural PBR texture factory), `sky`, `landscape`, `water`, `exterior`, `interior`, `decor-seating`, `decor-study`, `gallery`, `tv`, `audio` (fully synthesized spatial audio), `player` (first-person controller), `ui`, `main` (orchestration). |
| `build/make-single.mjs` | Bundles `js/` + three + all assets into `ahmad-gallery.html`. |
| `assets/art/` | The five sold-site screenshots (webp). |
| `assets/fonts/` | Archivo + Marcellus woff2 subsets. |
| `vercel.json` | Minimal Vercel config for a static deploy of the modular version. |

## Rebuilding the standalone file

```bash
cd build
npm install          # esbuild + three@0.170.0 (one-time)
node make-single.mjs # writes ../ahmad-gallery.html
```

The modular `js/` tree is the source of truth; `ahmad-gallery.html` is a generated artifact —
edit the modules, then rebuild.

## Run locally

For the standalone build, just open `ahmad-gallery.html` in Chrome — nothing else needed.

For the modular `index.html`, serve it (ES modules need http(s)):

```bash
python3 -m http.server 5179
# → http://localhost:5179
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new). Framework preset **Other**,
   build command and output directory **empty**.
3. Deploy.

`vercel.json` serves the **standalone `ahmad-gallery.html` at the root URL**, so the hosted site
has zero external dependencies — nothing can break it, even if a CDN is down or blocked. (The
modular version stays reachable at `/index.html` for reference.) After editing any `js/` module,
rebuild the standalone (`cd build && node make-single.mjs`) before deploying.

Or from the terminal: `npx vercel --prod` (run inside this folder).

## Push to GitHub

```bash
# create a new empty repo on github.com first (no README), then:
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

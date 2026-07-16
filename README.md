# Ahmad — The Gallery

A walkable 3D gallery (React + Three.js, bundled into a single HTML file) showing real client
websites Ahmad has designed, built, and sold. Walk with **WASD**, drag to look, click any piece
to step up to it, then choose **More information** for the story, the sold price, and a link to
the live site.

## What's in this repo

| File | Purpose |
|---|---|
| `index.html` | The entire website — everything (code, images, fonts) is embedded. This is what gets served. |
| `ahmad-gallery.html` | Identical copy kept under its original name. Edit one, then copy it over the other to keep them in sync. |
| `vercel.json` | Minimal Vercel config for a static deploy. |
| `.gitignore` | Keeps OS junk and local editor state out of git. |
| `.gitattributes` | Forces LF line endings on the HTML files (so a Windows clone can't corrupt the embedded bundle) and marks them as generated so GitHub collapses their diffs instead of trying to render a multi-megabyte line-by-line diff. |
| `.nojekyll` | Tells GitHub Pages to skip its Jekyll build step, which isn't needed here and isn't meant for a pre-bundled file like this one. |

No build step, no dependencies, no environment variables, no `package.json`. Any static host can serve it as-is — Vercel and GitHub Pages will both auto-detect it correctly with zero configuration beyond what's already in this repo.

## Deploy to Vercel (recommended)

1. Push this folder to GitHub (see below).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: **Other**. Leave build command and output directory **empty**.
4. Click **Deploy**. Vercel serves `index.html` at the root URL.

Or from the terminal: `npx vercel --prod` (run inside this folder).

## Push to GitHub

The repo is already initialized with an initial commit. To publish it:

```bash
# create a new empty repo on github.com first (no README), then:
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

## GitHub Pages (alternative to Vercel)

Repo → Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.
The site appears at `https://<your-username>.github.io/<repo-name>/`.

## Run locally

Just open `index.html` in a browser — it works from disk (everything is embedded).
For a proper local server: `npx serve .` and open the printed URL.

## The pieces on the walls

| Piece | Sold for | Live site |
|---|---|---|
| Ecom Heroes | $4,500 USD | https://www.ecomheroes.io |
| SaadiBuilds | $6,000 USD | https://saadibuilds.com/ |
| Seen By Many | $4,500 USD | https://seenbymany.com/ |
| Callura | $4,500 USD | https://www.calluravoice.ai/ |
| Orca Management | $2,000 USD | https://orcamanagement.agency/ |

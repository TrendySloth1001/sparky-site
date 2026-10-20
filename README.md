# sparky site

Landing page for [sparky](https://sparky.cloudnsofts.com), an AI assistant for Android. Plain HTML, CSS and vanilla JS. No build step, no dependencies, no analytics, no cookies.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Sanity check (HTML structure, local paths, anchors, CSS font URLs): `python3 scripts/check.py`

## Layout

- `index.html`, `404.html` — the page and a small not-found page
- `css/style.css` — design tokens mirror the app palette (light and dark)
- `js/dotmatrix.js` — canvas port of the app's animated dot-matrix backdrop (spring field, opening wave, pointer ripples, red to orange heat; honours `prefers-reduced-motion`, pauses when hidden or offscreen, stops its ticker when idle, DPR capped at 2)
- `js/main.js` — theme toggle (remembered in `localStorage`), header state
- `assets/` — screenshots (WebP), illustrations (SVG), subsetted fonts (WOFF), favicon, Open Graph image

## Deploy (GitHub Pages)

Push to a repo and enable Pages from the `main` branch root. Add a `CNAME` file for a custom domain. `404.html` uses root-absolute paths (`/css/...`), so serve the site from a domain root rather than a `/repo-name/` subpath, or change those paths.

Before publishing:

1. In `index.html`, replace the TODO block: set the canonical URL and make `og:image` / `twitter:image` absolute (`https://YOUR-DOMAIN/assets/og.png`).
2. The Download buttons point to `https://sparky.cloudnsofts.com/download/android`.

## Updating "What's new"

The three release cards in `index.html` are static copies of the newest entries in the app's `changelog.dart`. Edit them by hand with each release.

## Licences and credits

- Code (HTML, CSS, JS, scripts): MIT, see `LICENSE`.
- Fonts: Space Grotesk and Space Mono, SIL Open Font License 1.1 (https://openfontlicense.org/). Subsetted to Latin and converted to WOFF.
- Illustrations (`assets/img/ill-*.svg`): Open Peeps / Open Doodles by Pablo Stanley, CC0 1.0, with props drawn for sparky (CC0). Attribution is not required, but given.
- Screenshots, app icon, favicon, wordmark and Open Graph image: sparky's own app artwork, rendered from the app's UI tests. They show the product; the MIT licence does not grant rights to reuse the sparky name or branding.
- Third-party product names mentioned in text (Groq, OpenRouter, NVIDIA, Ollama, Google Drive, Notion, GitHub) are trademarks of their owners and only identify them.

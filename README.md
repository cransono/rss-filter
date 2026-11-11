# RSS Filter — Hacker News + RSS, filtered your way

A tiny installable PWA (no build step, no server, no account) that reads
Hacker News plus any RSS/Atom feeds you add, hides what you blacklist,
and boosts what you're interested in to the top.

Dark mode with red text is the default; use the header toggle for light mode.

## What it does

- **Hacker News built in** — via the free Algolia front-page API
  (points + comment counts), with the raw HN RSS feed as fallback.
- **Add more feeds** — paste any RSS / Atom URL in Filters & Feeds.
- **Interested list** — stories matching those words go first and get a ★ badge.
- **Blacklist** — hide stories by keyword, domain, or author. Hidden stories
  stay in a Hidden tab so you can un-hide them — nothing is deleted.
- **Per-story actions** — Hide this story, or Block a whole domain.
- **Search, All / Interested / Hidden tabs, Refresh.**
- **Export / Import settings** as JSON, so lists survive a new phone.
- Lists are stored only in the browser (`localStorage`). No tracking.

## Install on Android

1. Open the deployed site in Chrome.
2. Chrome menu → **Add to Home screen** (or tap the install prompt).
3. It opens full-screen like an app, and the app shell works offline;
   stories always refresh from the network.

## Deploy on GitHub Pages (free)

1. Create a repo, e.g. `news-filter`, and push this folder to its `main` branch.
2. In the repo: **Settings → Pages → Build and deployment →**
   Source: **Deploy from a branch**, Branch: `main`, Folder: `/ (root)`.
3. Open `https://<username>.github.io/news-filter/`

No build step — the files are served as-is. The service worker only
caches the app shell; feed data is always fetched live.

## Files

- `index.html` — page + settings UI
- `app.js` — feed fetching, filtering, sorting, persistence
- `styles.css` — styling
- `manifest.webmanifest` — PWA manifest (name, icons, theme)
- `sw.js` — service worker (offline app shell)
- `icons/icon-192.png`, `icons/icon-512.png` — app icons

## Alternatives considered

- **FeedFlow** (open source, Android) — best ready-made option: native app
  with blocked-words filtering. No web/PWA version, chronological only.
- **Hacker News Cleanser** (MIT) — HN-only blacklist service, no reader UI.
- **Hacker News Times** (open source PWA) — nice HN reader PWA, no filtering.
- **FreshRSS / NewsBlur** — full self-hosted readers with filters, need a server.

This PWA was built because none of those is a static, GitHub Pages-hostable
PWA with an editable blacklist *and* an interested-boost sort *and*
multi-feed support.

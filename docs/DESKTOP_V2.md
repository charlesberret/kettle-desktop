# Desktop v2 (parked)

In July 2026 the macOS shell briefly loaded a local `app/` sitting instead of
core `static/index.html`. The goal was a plugin-shaped window (queue · editor ·
desk) without the historical web chrome.

That split is **closed**. Shipping desktop is a thin Electron host over the
core sitting again. The scaffold lives in [`legacy/v2-scaffold/`](../legacy/v2-scaffold/)
for history only.

## Why it was reversed

Family doctrine never changed: kettle-desktop owns lifecycle, sidecar, and
packaging — not a second frontend. Core `PLATFORMS.md` still says a desktop UX
gap is a core web gap. While `app/` existed, sitting polish (themes, type
ladder, light mode, founding chrome) landed only in `static/index.html`, which
is the surface people actually sit in. Stage 2 of this charter (theme tokens)
was never started.

Keeping two sittings meant visual work had to be done twice and then wasn’t.

## Current rule

1. The window loads `http://127.0.0.1:<sidecar>/` (core `static/index.html`).
2. On load, the shell adds `body.desktop-shell` and fires `pywebviewready`.
3. Do not add a desktop-only sitting, theme, or founding flow.
4. Appearance, type, copy, and ritual live in kettle-core. Rebuild the sidecar
   to pick up a packaged copy; `npm start` against a live core sees it immediately.

Family contract: [kettle/docs/explanation/viewports.md](https://github.com/charlesberret/kettle/blob/main/docs/explanation/viewports.md)
(sibling checkout: `../kettle/docs/explanation/viewports.md`).

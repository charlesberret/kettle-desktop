# Kettle Desktop v2 — plugin-shaped sitting

## Why a reset

Desktop v0 (`desktop-v0-web-sitting`) loaded **core `static/index.html`** as the
entire product surface. That made the shell a “direct expression” of the
historical **browser sitting**, including chrome we no longer treat as primary
in the IDE workflow (e.g. the dense right-hand / meta context stack, admin-first
layout, multi-purpose bars).

The **VS Code / Cursor extension** is the better product expression of the
current sitting:

| IDE surface | Role |
|-------------|------|
| Explorer **queue** tree | Navigate entries, urgency, approve-from-list |
| Host **editor** | Edit the open file |
| **Desk** secondary sidebar | Project, brief, ritual (Approve · Comment · Sweep), chat/stream |
| Commands / palette | Founding, register project, refresh briefs, compact |

Desktop v2 is a **presentation viewport** like the plugin: it talks only to the
localhost core API. It does **not** reimplement desk files, founding state, or
sweep semantics. It does **not** load core’s full web shell.

## Backups of v0

| Kind | Location |
|------|----------|
| Git tag | `desktop-v0-web-sitting` |
| Git branch | `legacy/web-sitting-shell` |
| Local tarball | `~/cloud/backups/kettle-desktop-v0-web-sitting-*.tar.gz` |

## Product shape (v2)

```text
┌─────────────┬──────────────────────────┬────────────────────┐
│  Queue      │  Editor                  │  Desk              │
│  (left)     │  (center — file body)    │  (right)           │
│  projects   │  path · dirty · view     │  brief             │
│  entries    │                          │  Approve Comment   │
│             │                          │  Sweep             │
│             │                          │  chat / stream     │
└─────────────┴──────────────────────────┴────────────────────┘
```

**In (plugin parity)**  
Queue, open entry, edit + save, brief, approve, comment, sweep, chat,
founding interview/propose/found, project select/register, curator model,
diff badge vs snapshot.

**Out (v0 relics, for now)**  
Core web admin megapanel as home, meta “context” bar as a co-equal third
workflow, multi-theme appearance lab in the primary chrome, find/replace
chrome cloned from the browser sitting, lineage/egress panels as default.

Settings and deeper tools can return as a **modal or window**, not as permanent
right-rail context.

## Architecture

```text
kettle-desktop (Electron)
  main.js          window, menu, sidecar lifecycle
  preload.js       window.kettle.* (folder pick, core base URL)
  app/*            v2 sitting UI (this charter)
  lib/*            contract + startup (unchanged role)

kettle-core
  localhost API    sole authority for desk, queue, chat, sweep
  static/*         browser reference sitting (still valid for --web)
```

Dependency rule: desktop → core **HTTP API** only. No import of core Python.
No second desk format.

## Visual guidelines (programmatic later)

1. One canvas (`--bg`); chrome is border + type hierarchy, not extra gray slabs.
2. Primary ink: queue file names + editor body only.
3. Ritual cluster is the only dense control group (plugin order: Approve · Comment · Sweep).
4. Brief is desk content, not a separate “context inspector” product.
5. Marquee theme: Kettle pack from core (fetch `/api/themes` when ready).
6. Density closer to a focused document app than a debugger.

## Implementation stages (approve between stages)

0. **Scaffold** — shell + three panes + API client + queue/open/save/chat smoke.  
1. **Ritual parity** (in progress) — Approve · Comment · Sweep chrome; Found Desk →
   `/api/approve` then `/api/found` when core returns `founding: true`; interview chat
   routes to `/api/interview`; shared `lib/ritual-parity.js` mirrors kettle-vscode.  
2. **Polish** — theme tokens (`/api/themes`), empty states, fuller founding UX.  
3. **Package** — sidecar stamp + install:app on supported Node.

## Contract guards (desktop)

| Guard | Where |
|-------|--------|
| Load `app/index.html`, never core `static/index.html` | `main.js` + `test/sitting-ui.test.js` |
| `POST /api/projects/add` uses **`root`** (not `path`) | `app/api.js` + `test/sitting-api.test.js` |
| Ritual enablement / Found Desk label | `lib/ritual-parity.js` + `test/ritual-parity.test.js` |
| Ping / API / desk schema versions | `lib/core-contract.js` |

Dependency remains HTTP-only — see kettle-core [`API.md`](https://github.com/charlesberret/kettle-core/blob/main/API.md) tiers 0–3.

## Non-goals

- Embedding VS Code / Code OSS / Monaco full IDE.  
- Replacing kettle-core’s browser UI.  
- Pixel-copying Cursor’s Agent sidebar.

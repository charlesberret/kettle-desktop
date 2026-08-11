# Changelog

## Unreleased

### Fixed

- **Boot against hardened core:** clearer error when `file://` → localhost `/api/` fails
  (opaque `Origin: null` / missing CORS OPTIONS). Needs a kettle-core that allows
  `Origin: null` and answers `OPTIONS /api/` while still requiring `X-Kettle-Token`.
- **Project register:** `POST /api/projects/add` now sends `root` (core contract);
  the scaffold incorrectly posted `path`, so Add Project could never register.

### Changed

- **Desktop v2 sitting:** product UI is `app/` (queue · editor · desk), modeled on
  the VS Code/Cursor plugin sitting, not core `static/index.html`.
- **Ritual parity:** shared `lib/ritual-parity.js` (Found Desk label, interview vs
  chat routing); approve streams `/api/found` when core reports `founding: true`.
- Contract tests for sitting chrome, API payloads, and ritual enablement.
- v0 web-sitting shell preserved as tag `desktop-v0-web-sitting` and branch
  `legacy/web-sitting-shell`.
- Renamed the macOS shell, bundle identity, sidecar, and release inputs from
  Setsweep to Kettle.
- Pointed development and release builds at `kettle-core`.
- Added clean-core provenance and web-index verification to packaged builds.
- Added explicit contract checks for external and bundled core identities.

### Compatibility

- The shell may attach non-destructively to a compatible legacy Setsweep core.
- Existing Setsweep Application Support data is used only when no Kettle
  registry exists.
- Legacy environment variables remain read-side fallbacks during migration.

### Distribution

The current package is a local development artifact. It is not signed,
notarized, or published as a public download.

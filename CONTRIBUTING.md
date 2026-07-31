# Contributing to Kettle Desktop

Kettle Desktop is intentionally a thin host shell. Before changing behavior,
confirm whether the change belongs in
[kettle-core](https://github.com/charlesberret/kettle-core), where every
viewport can inherit it.

## Setup

```sh
npm ci
npm test
```

Use `npm start` for the Electron development window. It expects a compatible
`kettle` core on PATH or starts one through the configured command.

## Pull requests

- Keep desktop-only changes limited to lifecycle, native integration, security,
  packaging, distribution, and the local v2 sitting UI in `app/`.
- Do not load or fork core `static/index.html` as the product shell.
- Keep founding / desk semantics on the core HTTP API; mirror plugin ritual
  rules in `lib/ritual-parity.js` rather than inventing a second formula.
- Add unit tests for startup ownership, compatibility, and sitting contract
  guards (`test/sitting-*.test.js`, `test/ritual-parity.test.js`).
- Run `npm test`; if packaging changed, also run the sidecar smoke and a local
  package.
- Never weaken the clean-core release gate or stamp unknown provenance.
- Never bind or probe the live desk on port 4242 from agent tooling.

By contributing, you agree that your contribution is licensed under the MIT
License. Participation is governed by the
[Kettle code of conduct](https://github.com/charlesberret/kettle/blob/main/CODE_OF_CONDUCT.md).

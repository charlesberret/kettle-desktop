# Changelog

## Unreleased

### Changed

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

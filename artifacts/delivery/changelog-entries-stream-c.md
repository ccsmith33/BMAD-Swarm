# CHANGELOG entries — Stream C (Phase 3 ship-prep)

> **Integrator note:** These entries are **already landed inline** in `CHANGELOG.md` under the `## [3.0.0]` skeleton (Stream C owns `CHANGELOG.md` and lands the version header + its own entries, per `parallel-execution-2026-08-13.md` §6.3). This file is the protocol copy only — **do NOT re-concatenate it.** Concatenate only the Stream A and Stream B entry files, at the placeholder comments in the `3.0.0` section.

---

### Removed (facade kill list — ADR-020, audit CB-7)

- **Plugin system deleted** — `utils/plugins.js`, `cli/plugin.js`, the `bmad-swarm plugin` command, `test/plugins.test.js`. Also retires latent injection vector SEC-F-021 (ADR-020 point 4).
- **Workspace / monorepo commands deleted** — `utils/workspace.js`, `cli/workspace.js`, the `bmad-swarm workspace` command, `test/workspace.test.js`.
- **`run-reporter` deleted** — `utils/run-reporter.js`, `test/run-reporter.test.js`. ADR-020 point 3 "wire or die" resolves to delete (SE-2's task ledger is the ADR-018 snapshot substrate).
- **`integrations/github.js` deleted** — zero importers; `integrations/` directory gone.
- **methodology-eject remnant removed** — dead `overridesMethodologyDir` path in `utils/paths.js` (placebo already retired in V-5; agent eject untouched).
- **~275 lines of dead-code tests removed** (the three deleted test files + workspace/plugin regions of `test/cli.test.js`).

### Fixed

- **F-023** — `generators/github-actions-generator.js` no longer pins the unpublished local version (`npm install -g bmad-swarm@<version>` → 404/red build). Now runs `npx --yes bmad-swarm@latest validate`. Honest once published; human may pin a specific version at publish sign-off. Test added in `test/cli.test.js`.

### Changed (packaging & release)

- **`package.json`** — version → `3.0.0` (recommended, human-confirmed at publish gate); added `repository`/`homepage`/`bugs`; `files` drops `integrations/`, adds `scripts/`.
- **`.npmignore` removed** — redundant against the `files` whitelist (single source of truth).

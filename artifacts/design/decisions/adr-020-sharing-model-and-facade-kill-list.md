# ADR-020: Artifact sharing model (git-track the system of record) + the facade kill list

**D-ID:** implements D-039 (deleted table), D-041 (Phase 3, before WS-8); secondary calls flagged for one-sentence human confirmation in vision §6
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Supersedes:** the documented gitignore default (artifacts/swarm.yaml/CLAUDE.md hidden from git) — this reverses shipped, documented behavior
**Vision mapping:** ADR-F of `artifacts/planning/reinvention-vision-2026-08-11.md` §8

## Context

Two coupled problems from WS-8. (1) The generated gitignore hides `swarm.yaml`, `CLAUDE.md`, and all `artifacts/` from git — contradicting team collaboration, the shipped `--github` CI feature (which triggers only on paths the same init gitignores, so it can never fire — CLI-F-018), and in this repo silently un-tracking the system of record (F-D7). (2) A ring of shipped, help-text-documented features is functionally inert: plugins (discovered, never generated), workspaces (merge logic called only by tests), methodology eject (writes a dir nothing reads), `integrations/github.js` (zero importers), run-reporter (no production caller) — with ~275 lines of tests maintaining the dead code (V-1..V-8).

## Decision

1. **Sharing model flips to track-by-default:** git-track `swarm.yaml`, `CLAUDE.md`, and `artifacts/`; ignore only `.session-active`, `settings.local.json`, `*.bak`. The decision-memory moat (D-036 ledger, decision log, brain) is only a durable asset if it is in version control; the brain's diff history is the project's mind changing (vision §2.4).
2. **Facade kill list — delete all five:** `integrations/github.js`, methodology eject, workspace commands, plugin commands, and the `--github` workflow *in its current broken composition* (WS-10 may rebuild a CI workflow honestly on the flipped sharing model later). Their ~275 lines of dead-code tests go with them.
3. **run-reporter gets no limbo:** it is wired as ADR-018's session-end snapshot (it has a real consumer there) or deleted in the same commit. The WS-2 build decides which; "keep dormant" is not an outcome.
4. **Security note:** killing plugin loading also retires the latent injection vector SEC-F-021 without the hardening work the "wire" branch would have required.

## Alternatives considered

- **Artifacts-private-by-default (status quo), delete `--github` only.** Rejected as recommendation (human may override with a sentence): it leaves the product's core output — the decision/lesson ledger — invisible to collaborators and to the tool's own cross-project memory harvest, and it contradicts the field's actual usage (users hand-committing artifacts).
- **Wire the facades instead of killing them.** Rejected: each is a fresh feature build wearing a maintenance costume; nothing in the field record shows demand, and SEC-F-021 makes the plugin branch a security project.
- **Keep the tests as documentation.** Rejected: tests that pin dead code are negative documentation — they assert behavior no user can reach.

## Consequences

- Reverses documented behavior — existing field projects keep their current gitignore until `bmad-swarm update` (WS-11), whose migration notes must call the flip out loudly.
- Users with secrets-adjacent artifacts need the release note's guidance (artifacts are project documentation, never credential storage; `settings.local.json` stays ignored).
- Help text, README, and CHANGELOG shrink to the truth (rides D-035).
- The maintenance surface drops by five features and ~275 test lines; `--github`'s honest successor becomes buildable on the tracked-artifacts model.

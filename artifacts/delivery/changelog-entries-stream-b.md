# CHANGELOG entries — Stream B (SE-3 resilience)

Per the parallel-execution protocol (§6.3), Stream B writes its CHANGELOG entries
here; the integrator assembles them into `CHANGELOG.md` at merge step 3. Do NOT
edit `CHANGELOG.md` from this stream.

Suggested section: **3.0.0 (unreleased)** — the project.yaml removal is a
breaking, documented behavior change (semver-major), consistent with Stream C's
version recommendation.

---

### Added
- **Reconcile-on-start (ADR-018 / RES-2/RES-3/RES-4/RES-5).** New `record.cjs reconcile --tasklist <-|file> [--json]` subcommand. It diffs the `TaskList` tool output against `artifacts/context/task-ledger.md` and the project-brain `gates:` frontmatter, and prints a machine-generated coordination action list: **re-wake** unwoken `pending` tasks (a `pending` task with no durable `in_progress` wake-ack was never woken), respawn **orphans** (in the ledger but gone from `TaskList` — a dead owner / lost task), ping-then-respawn **stuck** `in_progress` tasks with no recent ledger activity, and surface **awaiting-human** gates first. The `session-start-warmboot` hook now instructs the orchestrator to run `TaskList` and pipe it to this subcommand on every warm boot. Pure logic lives in `bin/record.cjs` (self-contained, ships to `.claude/bmad/bin/`) and is re-exported by `utils/reconcile.js`.
- **Wake-ack protocol (RES-3).** Every generated teammate is now instructed that its first tool call on wake is `TaskUpdate → in_progress`; a PostToolUse hook writes that transition to the durable task ledger, making "`pending` with no `in_progress` row = never woken" authoritative for reconciliation.
- **Liveness carve-out (RES-1).** The orchestrator identity documents event-driven reconciliation (one liveness ping, then respawn against the same task pointer for an unresponsive owner) as the sole exception to the no-status-check rule — without reverting the single-wake channel (D-028).
- **`gates:` frontmatter contract (D-037 / ADR-018 point 5).** The project-brain frontmatter now REQUIRES a `gates:` map (the awaiting-human home). `validate` and `doctor` enforce its shape; each gate's `status` must be one of `pending | awaiting-human | approved | passed | failed | skipped` (`skipped` marks a gate a project deliberately does not apply).

### Changed
- **RES-9 rejection flow.** On a blocking review rejection the orchestrator now creates a fix task (assigned to the original developer) AND a re-review task (assigned to the reviewer, blocked on the fix task) — replacing the dead "block the fix on the already-completed review task" edge.
- **Machine-state home relocated to the project-brain frontmatter (D-037).** `phase` (and a `phase_history`) now live in `artifacts/context/project-brain.md` frontmatter. `utils/phase-machine.js`, `cli/phase.js`, `cli/status.js`, and `cli/doctor.js` read/write the brain frontmatter instead of `project.yaml`.

### Removed / Migrated (BREAKING)
- **`project.yaml` is retired (D-037 / WS-11).** It was a prompted chore-file with no guaranteed reader (lied in 8/9 field projects). `bmad-swarm init` no longer creates it. `bmad-swarm update` gains **step 4.2**: an idempotent migration that folds a legacy `project.yaml`'s `phase` into the brain frontmatter (creating a minimal brain if none exists), then deletes `project.yaml`. This migration runs even when a live session is active (migrating a user-owned file is not a hook swap — it sits outside the live-swap guard).

### Notes for the integrator
- The `cli/update.js` step-4.2 migration block is disjoint from Stream A's live-swap guard (which wraps regen steps 3 + 5): it is placed between steps 4.1 and 4.5 and is guarded only by `--dry-run`, never by `.session-active`. Keep it OUTSIDE any session-active skip when resolving the `cli/update.js` merge.
- The gate's `project.yaml` removal from the writable set is **Stream A's** line (executed on B's behalf); this stream does NOT touch `generators/hooks/orchestrator-write-gate.cjs.src` or its `test/hooks.test.js` / `test/generators.test.js` gate assertions.
- `utils/run-reporter.js` still references `project.yaml`; it is **Stream C's** deletion target and was deliberately skipped by this stream's sweep.
- `utils/fs-helpers.js` retains the string `'project.yaml'` in `GITIGNORE_KNOWN_MANAGED` ONLY as a historical recognizer so legacy `.gitignore` blocks migrate cleanly (no spurious "dropped custom ignore" warning). It is not a live code path.

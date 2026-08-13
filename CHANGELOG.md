# Changelog

All notable changes to bmad-swarm.

## [3.0.0] — 2026-08-13

> **⚠ Human sign-off required — version and publish.** The `3.0.0` bump and the npm publish are human sign-offs, not automated: ADR-020 is **PROPOSED, awaiting human approval** (D-033), and the phase-3 ship-prep design (`artifacts/design/parallel-execution-2026-08-13.md` §5) recommends `3.0.0` but defers the confirm to the publish gate. `npm publish --dry-run` has been run and attached as release evidence — **no package was published.** This is a **semver-major** release: it deletes documented features (the facade ring, ADR-020) and removes `project.yaml` (Stream B / D-037), both breaking, documented behavior.

#### Stream A — project-aware orchestrator allow-list (ADR-017 Amendment 1)

##### Added
- **Project-aware orchestrator allow-list** (`permissions.orchestrator_allow` in `swarm.yaml`). Each project can declare the read-only + coordination commands its orchestrator needs prompt-free, e.g. `Bash(cargo check:*)`. Entries are merged onto a widened safe default by the settings generator. (ADR-017 Amendment 1)
- **Widened safe default:** scaffolded projects now get coordination git (`git commit`/`push`/`fetch`/`merge --ff-only`/`checkout`/`switch`/`branch`/`tag`) and the read-only `bmad-swarm` CLI (`validate`/`doctor`/`status`/`scan`) in the orchestrator allow-list — no more prompts for routine coordination. The write-gate still denies the write/destructive vectors inside those shapes.
- **`bmad-swarm update --swap-live-hooks`** flag to explicitly regenerate `.claude/hooks/` + `settings.json` while a session is live (off by default).

##### Changed
- **Orchestrator write-gate git inspection** now distinguishes coordination git from tree/history rewrites. Denies write-vector git (`apply`, `restore`, `am`, `stash`, `mv`, `rm`, `checkout`/`switch` with a pathspec) and destructive git (`reset --hard/--merge/--keep`, `clean`, `push --force`-family, non-`--ff-only` `merge`, `pull` without `--ff-only`, `rebase`, `filter-branch`, `update-ref`, `-c alias.*`, `--exec-path`). Allows the coordination set.
- **`bmad-swarm update` no longer hot-swaps live enforcement.** While `.claude/hooks/.session-active` exists, it skips regenerating `.claude/hooks/` and `settings.json` (this wedged the 2026-08-13 merge). `--force` does not override the skip — use `--swap-live-hooks`.
- **Invalid `permissions.orchestrator_allow` entries fail config load loudly** — every `loadSwarmConfig` caller (`init`, `update`, `validate`, `doctor`, `start`) surfaces the error rather than silently dropping the entry.

##### Fixed
- **Git subcommand parsing in the write-gate** misread `git -C /path <subcommand>`: the argument to `-C` was taken as the subcommand, so `git -C . apply evil.patch` slipped past the deny-set. Option-with-argument globals (`-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`) are now consumed before subcommand resolution; `-c alias.*`/`-c …!` and `--exec-path` are denied outright.

##### Removed
- **`project.yaml` removed from the orchestrator writable set** (D-037 retires the file; the Stream B cutover relies on this). Phase writes flow through the CLI.

Security posture (ADR-017) is preserved by construction: the validator's deny sets and the gate's deny sets are pinned to each other by a source-parsing consistency test, and a validator escape still cannot grant writes (the runtime write-gate is an independent layer).

#### Stream B — SE-3 resilience (reconcile / liveness / project.yaml retirement)

##### Added
- **Reconcile-on-start (ADR-018 / RES-2/RES-3/RES-4/RES-5).** New `record.cjs reconcile --tasklist <-|file> [--json]` subcommand. It diffs the `TaskList` tool output against `artifacts/context/task-ledger.md` and the project-brain `gates:` frontmatter, and prints a machine-generated coordination action list: **re-wake** unwoken `pending` tasks (a `pending` task with no durable `in_progress` wake-ack was never woken), respawn **orphans** (in the ledger but gone from `TaskList` — a dead owner / lost task), ping-then-respawn **stuck** `in_progress` tasks with no recent ledger activity, and surface **awaiting-human** gates first. The `session-start-warmboot` hook now instructs the orchestrator to run `TaskList` and pipe it to this subcommand on every warm boot. Pure logic lives in `bin/record.cjs` (self-contained, ships to `.claude/bmad/bin/`) and is re-exported by `utils/reconcile.js`.
- **Wake-ack protocol (RES-3).** Every generated teammate is now instructed that its first tool call on wake is `TaskUpdate → in_progress`; a PostToolUse hook writes that transition to the durable task ledger, making "`pending` with no `in_progress` row = never woken" authoritative for reconciliation.
- **Liveness carve-out (RES-1).** The orchestrator identity documents event-driven reconciliation (one liveness ping, then respawn against the same task pointer for an unresponsive owner) as the sole exception to the no-status-check rule — without reverting the single-wake channel (D-028).
- **`gates:` frontmatter contract (D-037 / ADR-018 point 5).** The project-brain frontmatter now REQUIRES a `gates:` map (the awaiting-human home). `validate` and `doctor` enforce its shape; each gate's `status` must be one of `pending | awaiting-human | approved | passed | failed | skipped` (`skipped` marks a gate a project deliberately does not apply).

##### Changed
- **RES-9 rejection flow.** On a blocking review rejection the orchestrator now creates a fix task (assigned to the original developer) AND a re-review task (assigned to the reviewer, blocked on the fix task) — replacing the dead "block the fix on the already-completed review task" edge.
- **Machine-state home relocated to the project-brain frontmatter (D-037).** `phase` (and a `phase_history`) now live in `artifacts/context/project-brain.md` frontmatter. `utils/phase-machine.js`, `cli/phase.js`, `cli/status.js`, and `cli/doctor.js` read/write the brain frontmatter instead of `project.yaml`.

##### Removed / Migrated (BREAKING)
- **`project.yaml` is retired (D-037 / WS-11).** It was a prompted chore-file with no guaranteed reader (lied in 8/9 field projects). `bmad-swarm init` no longer creates it. `bmad-swarm update` gains **step 4.2**: an idempotent migration that folds a legacy `project.yaml`'s `phase` into the brain frontmatter (creating a minimal brain if none exists), then deletes `project.yaml`. This migration runs even when a live session is active (migrating a user-owned file is not a hook swap — it sits outside the live-swap guard).

#### Stream C — Phase 3 ship-prep (facade kill list, F-023, packaging)

### Removed (facade kill list — ADR-020, audit CB-7)

The audit found a ring of shipped, help-text-documented features that were functionally inert — discovered-but-never-generated, called-only-by-tests, or with zero importers — plus ~275 lines of tests pinning the dead code. Per ADR-020 all are deleted rather than wired (nothing in the field record showed demand; wiring the plugin branch would have been a security project — see SEC note).

- **Plugin system deleted.** Removed `utils/plugins.js`, `cli/plugin.js`, the `bmad-swarm plugin` command (registration dropped from `bin/bmad-swarm.js`), and `test/plugins.test.js`. Plugin agents were discovered (`plugin list`) but never fed to `getAgentNames()`/generation, so a discovered plugin agent was never spawnable. **Security:** deleting plugin loading also retires the latent prompt-injection vector SEC-F-021 (untrusted `plugins/agents/*.md` read verbatim as agent instructions) without the hardening the "wire" branch would have required — ADR-020 point 4.
- **Workspace / monorepo commands deleted.** Removed `utils/workspace.js`, `cli/workspace.js`, the `bmad-swarm workspace` command, and `test/workspace.test.js`. `mergeWorkspaceConfig` (the actual feature) was only ever called by its own tests; `init`/`update`/`start` never consulted workspace context.
- **`run-reporter` deleted.** Removed `utils/run-reporter.js` and `test/run-reporter.test.js`. Its only importer was its own test — no CLI command or generator produced a run report. ADR-020 point 3 gave it a "wire as ADR-018's session-end snapshot, or delete in the same commit — no limbo" fork; the fork resolves to **delete**, because SE-2 built the task ledger as the session-end snapshot substrate without run-reporter (traceability for the ADR consequence).
- **`integrations/github.js` deleted.** Zero importers. The `integrations/` directory is gone; the `files` whitelist no longer references it.
- **methodology-eject remnant removed.** The `eject methodology` placebo was already retired (V-5 — the shipped methodology copy *is* the override); this drops its last dead remnant, the never-read `overridesMethodologyDir` path in `utils/paths.js`. Agent ejection (`bmad-swarm eject agent <name>`, the live Layer-3 override) is untouched.
- **~275 lines of dead-code tests removed** along with the modules above (`test/plugins.test.js`, `test/workspace.test.js`, `test/run-reporter.test.js`, plus the workspace/plugin regions of `test/cli.test.js`). Tests that pin unreachable code are negative documentation — ADR-020.

### Fixed

- **F-023: generated CI no longer pins an unpublished version.** `generators/github-actions-generator.js` produced a workflow whose install step ran `npm install -g bmad-swarm@<local package.json version>`. Because that exact version is not on npm, the step 404'd (`ETARGET`) on the first run of *every* generated project's workflow — a guaranteed red build. The validate step now runs `npx --yes bmad-swarm@latest validate`, which resolves whatever is actually published (read-only token, push-and-PR triggers, and D-042 tracked-path filters unchanged). **Caveat:** the workflow is only honest once `bmad-swarm` is published to npm; a human may swap `@latest` for a specific about-to-publish version at the publish sign-off (design §5, default `@latest`). Test added in `test/cli.test.js` (asserts no unpublished pin + the resolvable `npx …@latest validate` spec).

### Changed (packaging & release)

- **`package.json`.** Version → `3.0.0` (**recommended**; the facade removals + `project.yaml` removal are breaking, documented behavior — human confirms at the publish gate). Added `repository`, `homepage`, and `bugs` fields (GitHub `ccsmith33/BMAD-Swarm`). Pruned the `files` whitelist: dropped the deleted `integrations/`, added the runtime `scripts/` directory.
- **`.npmignore` removed.** Redundant against the `files` whitelist — with `files` present npm packs only the listed paths, so the blacklist could never add exclusions. The whitelist is now the single source of truth for the packed tarball (`npm pack --dry-run` confirmed no `test/`, `artifacts/`, or `.claude/` leakage).

---

v3 coordination layer (D-028, ADR-013, ADR-014). Three changes to how teams are assembled and spawned: orchestrator-assigned task ownership becomes the single wake channel; generated agents become valid native Claude Code custom agent definitions spawned via `subagent_type` (the `FIRST: Invoke /identity-{role}` teammate ceremony is retired); and the `teamcreate-gate` drops transcript scanning entirely in favor of the `artifacts/context/team-assembly-log.md` file handshake as the sole Pass-1 channel.

**Migration note:** run `bmad-swarm update` in existing projects to regenerate `.claude/agents/`, `.claude/commands/`, `.claude/rules/`, and `.claude/hooks/`. Old-format generated files (marker above the frontmatter) are recognized and updated in place. Agent-type registration for native `subagent_type` spawning is picked up mid-session (verified 2026-06-10 by a post-regeneration `subagent_type: "developer"` spawn without restart); a session restart is a fallback if a spawn reports the type as not found (the regenerated frontmatter is verified js-yaml-parseable with `name`/`description`/`model`).

### Changed (v3 coordination)

- **Single wake-channel task protocol (D-028 item 0).** Every generated teammate carries a "Team task protocol" section overriding the platform's self-claim guidance: never self-claim tasks from TaskList, work only orchestrator-assigned tasks, go idle after the completion message; peer-to-peer technical messages stay encouraged. The orchestrator (which assigns, never claims) is excluded. `agents/orchestrator.md` "Coordination discipline" gains the matching owner-assignment rules: assign `owner` at TaskCreate, ONE start message when a blocked task unblocks, check TaskList before nudging, never message about `in_progress`/`completed` tasks. Kills the "task already done" double-trigger observed in this repo and the Quinn deployment. Touches: `generators/agent-generator.js`, `agents/orchestrator.md`.
- **Native agent identity (ADR-014).** Generated `.claude/agents/*.md` are now valid custom agent definitions: frontmatter is the first bytes of the file, leading with `name: <role>` and a defensive `description` ("… Not for ad-hoc delegation."); the `bmad-generated` marker moves to just below the closing fence. Marker detection (`utils/fs-helpers.js`) accepts both placements within the first 10 lines — fully backward compatible with pre-v3 projects. Teammates are spawned natively via `subagent_type: "<role>"` with a task-pointer-plus-brief prompt; `/identity-orchestrator` remains (the main session cannot be a custom agent type), and the teammate `identity-{role}` commands are kept as labeled inspection/debugging aids. Touches: `generators/agent-generator.js`, `generators/commands-generator.js`, `utils/fs-helpers.js`, `agents/orchestrator.md`.
- **Gate: file handshake is the sole channel (ADR-013, fixes F-009).** `teamcreate-gate.cjs` no longer reads the transcript (`transcript_path` ignored; the typed content-block walk, the GATE-1 raw scan, and the HARN-2 Pass-3 fallback are deleted). Pass 1 reads `artifacts/context/team-assembly-log.md`, anchors on the LAST fenced `bmad-assembly` block in the whole file (no 4 KB window — F-009 resolved), and requires all 5 keys plus mtime < 15 minutes. Missing/stale/incomplete handshake now denies with an actionable message naming the file and fix; fail-open is reserved for environmental errors (unparseable stdin, unreadable swarm.yaml, missing js-yaml — D-012 posture unchanged). Pass 2 fixed-mode routing is unchanged and runs on the handshake-accepted block. `agents/orchestrator.md` Invariant 1 now makes the log append the REQUIRED action; the visible-message block stays as SHOULD. Touches: `generators/hooks-generator.js`, `agents/orchestrator.md`, `test/hooks.test.js`.

Wide-team retrofit tooling. Two opt-in tools remove the manual edits required to adopt wide-team specialization (D-004) in an existing project. Neither runs automatically — both are deliberate user actions, preserving the no-silent-migration principle from `architecture.md` §8.4.

Fable 5 model tier support (D-023). `fable` (Claude Fable 5, the tier above opus — 1M context, $10/$50 per MTok, 2× opus) is now a valid model everywhere a model can be configured. The framework default stays `opus`; fable adoption is opt-in per agent.

### New

- **`fable` model tier.** Added to `VALID_MODELS` in `utils/validator.js` and accepted in `defaults.model`, `agents.{name}.model`, `team.specializations[].model`, and `team.fallback.model`. The duplicated default-model literal is centralized as an exported `DEFAULT_MODEL` constant in `utils/validator.js`, imported by `utils/config.js`, `cli/init.js`, `utils/cost-estimator.js`, and `generators/commands-generator.js`. The cost estimator prices fable agents at $10/$50 per MTok. The orchestrator identity gains fable promotion heuristics (complexity ≥ 12, architect/strategist/security on full-lifecycle work, adversarial review of security-critical changes), and README documents the model tiers including the 2× cost caveat. Implements **D-023**.
- **Workflow command generators parameterized on `defaults.model`.** The `bmad-assembly` blocks in the generated `/bug`, `/feature`, `/research`, `/audit`, `/explore-idea`, `/migrate`, `/review`, and `/retrofit-team` commands previously hardcoded `model: opus`; they now emit `swarm.yaml:defaults.model` at generation time (fallback `opus`). Touches: `generators/commands-generator.js`.
- **Fable-class prompt tuning of agent identities.** Per Anthropic's Opus 4.8/Fable 5 migration guidance: `agents/developer.md` gains an "Autonomy calibration" note (pick-and-note for minor implementation choices; escalation unchanged for architectural decisions, story ambiguity, and blockers), and `agents/reviewer.md` gains a report-every-finding rule (severity + confidence on each finding; blocking-vs-advisory categorization downstream, no self-filtering for importance).

### Fixed

- **HARN-2: `teamcreate-gate` Fable 5 compatibility.** Under Fable 5, thinking blocks persist to the transcript with empty content (`display: omitted`) and long assistant text blocks are not flushed before `PreToolUse` fires — both transcript passes failed closed and `TeamCreate` was permanently blocked. Added a third accept path: before denying, the hook reads `artifacts/context/team-assembly-log.md` (cwd-relative); if the last ~4KB contains a fenced `bmad-assembly` block with all 5 required keys and the file mtime is fresh (< 15 minutes), the block is accepted and still routed through Pass 2. The orchestrator identity (Invariant 1) now instructs appending each assembly block to that log immediately before `TeamCreate`. Existing passes and fail-open posture unchanged. 8 new tests in `test/hooks.test.js`. Touches: `generators/hooks-generator.js`, `agents/orchestrator.md`.

- **New CLI command: `bmad-swarm scaffold-team`.** Reads the `## Domain Map` section from `artifacts/design/architecture.md` and emits the corresponding `swarm.yaml:team` block. Default behavior is read-only (prints YAML to stdout). Pass `--write` to inject the block into `swarm.yaml`; `--write` rolls a `swarm.yaml.bak`, writes atomically, and round-trips the result through `loadSwarmConfig` for validation before declaring success. Refuses with a unified diff if a `team:` block already exists. Implements parent decision **D-014** (adopt retrofit tooling) and tactical decisions D-016 (write-safety strategy) and D-017 (Domain Map parser contract). Touches: `cli/scaffold-team.js` (new), `bin/bmad-swarm.js` (registration), `utils/domain-map.js` (new shared parser). See `artifacts/design/architecture-retrofit.md` §4 and ADR-011 / ADR-012.
- **New slash command: `/retrofit-team`.** Orchestrator-overlay command that proposes a Domain Map for an existing project's architecture, iterates with the user, pauses for explicit human approval (architecture is approval-gated per CLAUDE.md), and on approval spawns one architect teammate to perform a single Edit call inserting the approved Domain Map into `architecture.md`. The architect spawn is a write-delegate, not a designer — its brief explicitly forbids authoring or writing an ADR. Hybrid pattern (overlay + spawn) chosen over pure-overlay or pure-spawn per **D-015**; see ADR-010 for the six alternatives considered. Implements parent decision **D-014**. Touches: `generators/commands-generator.js` (new `buildRetrofitTeamBody`). See `artifacts/design/architecture-retrofit.md` §3.

### Docs

- README §"Wide-team specialization" gains a new subsection "Retrofit tooling for existing projects" with paragraphs for both tools, a worked-example chain transcript, and the no-silent-migration callout.
- `agents/architect.md` "Domain Map (when using fixed-mode wide team)" section gains a "Retrofit entry path" note describing the spawn brief the architect receives when invoked by `/retrofit-team`.

### References

- Architecture: `artifacts/design/architecture-retrofit.md`
- ADR-010: `artifacts/design/decisions/adr-010-retrofit-team-overlay-vs-spawn.md`
- ADR-011: `artifacts/design/decisions/adr-011-scaffold-team-write-safety.md`
- ADR-012: `artifacts/design/decisions/adr-012-domain-map-parser-contract.md`
- D-IDs: D-014 through D-021 in `artifacts/context/decision-log.md`


## [2.0.2] — 2026-04-18

HARN-1 fix + brainstorm workflow redesign + follow-ups.

### Fixed

- **GATE-1: `teamcreate-gate` fence-only-message false-positive closed.** The gate previously denied `TeamCreate` when the preceding assistant message contained only a fenced `bmad-assembly` block (no leading prose) — the structured content-block walk failed to surface the fence in that shape. Added a raw-transcript-scan fallback: pass 1 keeps the typed-block walk, pass 2 regex-scans the raw JSONL lines scoped to the same recent N=5 message ids (un-escapes `\n`, capped at 50KB tail). Allows if either pass finds all 5 required keys. 2 new tests in `test/hooks.test.js`.
- **HARN-1: `orchestrator-write-gate` env-inheritance bug resolved.** The gate previously keyed off `process.env.AGENT_ROLE` alone, which on this Windows/Claude Code harness combination is inherited by subagent teammates and caused the gate to fire on every delegated Edit/Write. Replaced with a two-layer identity check: primary signal is the hook event payload's `agent_id` / `agent_type` (Claude Code's documented subagent-vs-main-thread discriminator), secondary is the `AGENT_ROLE` env as defense-in-depth and in-session override path. 7 new tests in `test/hooks.test.js` including a regression guard that would have caught the original bug. See ADR-003 / D-003.

### New

- **`.claude/settings.local.json` added to orchestrator-write-gate allow-list.** Local harness-config overrides are a legitimate orchestrator write (surfaced during HARN-1 remediation).
- **Brainstorm workflow redesigned as orchestrator-overlay pattern.** `/brainstorm` no longer spawns an ideator teammate (teammates have no direct human channel, so interactive brainstorming through a subagent is architecturally broken). Instead the orchestrator loads `agents/ideator.md` into its own session and converses directly, producing a lightweight summary at `artifacts/planning/brainstorm-<topic>-<date>.md` when the user signals readiness. Framed as a named orchestrator process step, parallel to the epic retrospective. See D-BRN-1 through D-BRN-4 in decision log and `artifacts/planning/brainstorm-workflow-eval-2026-04-16.md`. Touches: `generators/commands-generator.js` (`buildBrainstormBody`), `agents/orchestrator.md` (new section), `agents/ideator.md` (two edits), `methodology/orchestration-modes.md` (doc correction — removed claim about a mechanism the codebase does not implement).
- **`/explore-idea` command (Mode B)** — ideator overlay in the orchestrator session + researcher spawned in parallel via TeamCreate. Tractable now that `/brainstorm` overlay pattern exists.
- **Generator install-time probe** for `agent_id`/`agent_type` payload field presence. Guards against Anthropic API field-name drift under the experimental agent-teams flag — a silent regression to pre-HARN-1 state. Probe runs on `bmad-swarm update` and emits a warning if the fields appear unset in a synthetic payload.

### Docs

- CLAUDE.md §Permission model updated with a one-sentence note on the two-layer identity check.
- `methodology/orchestration-modes.md` corrected — prior text described "human-in-the-loop teammate conversation" as a mechanism, but teammates have no direct human channel. Rewritten to describe the overlay pattern used for brainstorming.

### References

- ADR-003: `artifacts/design/decisions/adr-003-orchestrator-write-gate-design.md`
- Gate eval: `artifacts/planning/orchestrator-write-gate-eval-2026-04-16.md`
- Brainstorm eval: `artifacts/planning/brainstorm-workflow-eval-2026-04-16.md`
- Unified roadmap: `artifacts/planning/gate-and-brainstorm-plan-2026-04-16.md`


## [2.0.1] — 2026-04-16

Follow-up fix release addressing the three blocking findings from audit 2026-04-16 plus supporting infrastructure.

### Fixed

- **B-2: CRLF drift in `utils/fs-helpers.js:isFileManuallyModified`.** `contentHash()` now normalizes CRLF to LF before hashing, so Windows (git `core.autocrlf=true`) and *nix produce identical hashes for the same semantic content. Previously the read-side hash regexes silently failed to match on CRLF files and `isFileManuallyModified` returned false for both unmodified AND tampered files — a broken detection path. Closes 2.0.0 §Known issues V-3. Added 4 regression tests covering markdown, JS, shebang, and genuine-modification-after-CRLF paths.
- **B-6: `teamcreate-gate.cjs` widened from single-message scope to last-N=5.** The gate now walks the last 5 distinct assistant `message.id` values and accepts valid assembly blocks in any of them. Also widened content-block filter from `text` only to `text` + `thinking`. Previous behavior denied on common message-split patterns (retry after transient failure, `plan → tool_use` across messages, extended-thinking orchestrators). See architect's design note and ADR-002 context.

### Removed

- **B-1: `TaskCompleted` hook.** Registered against a Claude Code event that does not exist (`TaskCompleted` is not in the runtime's hook taxonomy). The advisory `npm test` run on task completion never fired. Deletion closes security L-2 (advisory `execSync('npm test', ...)` code-execution chain coupled with M-1 `Bash(npm:*)` allow) permanently and eliminates reviewer A-1 (dead `taskId` variable) as a side effect. See `artifacts/design/decisions/adr-002-taskcompleted-hook-disposition.md` (D-002).
- 2.0.0 §Known issues entry for V-3 — superseded by the B-2 fix above.

### New

- **Findings register** at `artifacts/context/findings-register.md`. Durable ledger of open/deferred findings across audits, so deferral decisions (e.g., "defer SEC-1 until after 2.0.0 ships") are recorded and not re-derived in every audit. Plain Markdown — no schema, no validator, no aggregator. Reviewer and security agent prompts updated to read the register before writing findings and to re-use existing IDs for carried-forward issues. Audit workflow command (`buildAuditBody` in `commands-generator.js`) emits a synthesis-time instruction to update the register. See `artifacts/planning/state-topology-eval-2026-04-16.md` for the architect's evaluation that led to this minimal-scope fix.
- **B-3: `test/hooks.test.js`** — 32 new process-spawn tests covering the stdin→decision contract for all four hooks. Each test spawns the hook as a child process, pipes a synthetic event, and asserts the `permissionDecision` / `additionalContext` JSON. Covers: `teamcreate-gate` (10 cases including the new thinking-block + last-N=5 behaviors), `orchestrator-write-gate` (10 cases including Windows mixed-separator paths), `user-prompt-submit` (4 cases including marker suppression), `post-compact-reinject` (3 cases including marker cleanup).
- **ADR-002** (`artifacts/design/decisions/adr-002-taskcompleted-hook-disposition.md`) and **D-002** in decision log.
- **HARN-1** in findings register. Surfaced during implementation — the orchestrator-write-gate's assumption that teammates don't inherit `AGENT_ROLE` is broken on the Windows/Claude Code harness combination; the env IS inherited by subagents. Follow-up fix needed; out of scope for this release.

### References

- Audit: `artifacts/reviews/audit-2026-04-16-code.md`, `artifacts/reviews/audit-2026-04-16-security.md`, `artifacts/reviews/audit-2026-04-16-evidence.md`
- State topology evaluation: `artifacts/planning/state-topology-eval-2026-04-16.md`
- ADR-002: `artifacts/design/decisions/adr-002-taskcompleted-hook-disposition.md`


## [2.0.0] — 2026-04-16

Option C restructure. Major version because this is a breaking change: agent roster, hook pipeline, permission model, and orchestrator identity mechanism all changed. Projects on 1.x must run `bmad-swarm update --force` after upgrading the CLI.

### Breaking changes

- **Agent roster collapsed 13 → 9.** Removed: `qa`, `story-engineer`, `retrospective`, `tech-writer`. Their responsibilities were absorbed: `qa` and `tech-writer` into `reviewer` (via new `test-coverage` and `docs` lenses), `story-engineer` into `strategist` (now owns story decomposition), `retrospective` into the orchestrator as a process step after each epic closes.
- **System-prompt mechanism removed.** `.claude/system-prompt.txt`, `templates/system-prompt.txt.template`, and `generators/system-prompt-generator.js` are deleted. `bmad-swarm start` no longer passes `--append-system-prompt` to Claude Code. Orchestrator identity now loads via the `/identity-orchestrator` slash command (user-turn content — higher model weight than system-ambient instructions).
- **Slash commands added.** Every session now has 17 slash commands under `.claude/commands/`: 9 `identity-<role>` commands (one per enabled agent, body = full agent role file) and 8 workflow commands (`/bug`, `/feature`, `/research`, `/audit`, `/brainstorm`, `/migrate`, `/review`, `/plan`) that emit pre-wired `bmad-assembly` blocks and trigger `TeamCreate`.
- **Hook pipeline replaced.** `.claude/hooks/` now contains 5 files: `TaskCompleted.cjs` (unchanged), `user-prompt-submit.cjs` (rewrite: ~40-token reminder on first turn, no orchestrator.md read), `post-compact-reinject.cjs` (new: one-shot ~200-token pointer to `/identity-orchestrator` after compaction), `teamcreate-gate.cjs` (new: PreToolUse deny when no `bmad-assembly` block present in recent transcript — structural enforcement), `orchestrator-write-gate.cjs` (new: PreToolUse deny on Edit/Write/MultiEdit outside allowed paths when `AGENT_ROLE=orchestrator`). Removed: `TeammateIdle.cjs`, `identity-reinject.cjs`, `task-tool-warning.cjs`.
- **Permission model tightened + defaults flipped.** `.claude/settings.json` now scopes `Bash(*)` to specific subcommands (`Bash(npm:*)`, `Bash(node:*)`, `Bash(git:*)`, etc.), removes `Task` and `TodoRead`/`TodoWrite` from `allow`, adds `TeamCreate`/`Task{Create,Get,List,Update}`/`SendMessage`, and sets `defaultMode: acceptEdits` with an explicit `deny` list for destructive patterns (`rm -rf /`, `sudo`, `git push --force`, `git reset --hard`, `curl|sh`, `chmod 777`, and 8 others). See `artifacts/design/decisions/adr-001-permission-default-mode.md`. `env.AGENT_ROLE=orchestrator` is set so the `orchestrator-write-gate` hook knows when to enforce.
- **Opus by default.** Every agent's generated frontmatter now has `model: opus`. `swarm.yaml` supports `defaults.model: opus` (top-level); `utils/config.js` sets this as fallback when the user omits it. Cost-estimator switched to Opus pricing ($15/$75 per 1M input/output) — expect estimates ~5× higher than 1.x.
- **CLI `bmad-swarm start` simplified.** Removed flags: `--dangerous`, `--allow-tools`. Permission scoping is now handled by `.claude/settings.json` (see above). Existing scripts referencing these flags must be updated.
- **Reviewer lens system.** The reviewer agent now accepts a `lenses` list in its spawn prompt (`code-quality`, `test-coverage`, `performance`, `ux`, `api-design`, `a11y`, `data`, `docs`). Each lens is a review mode that runs alongside the standard adversarial review. The orchestrator selects lenses using a deterministic signal → lens table based on keywords in the story or task description.
- **`bmad-assembly` block required before `TeamCreate`.** A PreToolUse hook (`teamcreate-gate.cjs`) blocks `TeamCreate` when the most recent assistant message in the transcript does not contain a fenced `bmad-assembly` block with required keys (`entry_point`, `complexity`, `autonomy`, `team`, `rationale`). This is structural enforcement of the complexity/team assembly step that was previously prose-only.
- **Rules scope narrowed.** `templates/rules/coding-standards.md` frontmatter path scope now targets `{code_dir}/**/*`, `artifacts/implementation/**/*`, and `artifacts/design/**/*` — dropping the rule from orchestrator/ideator/researcher/strategist turns where it was dead weight.
- **`Task` tool removed from allow-list.** Orchestrator-level enforcement: project delegation must go through `TeamCreate`. Attempts to use `Task` will prompt for permission on each invocation. Only use `Task` for small internal lookups (reading a file, quick grep).

### New

- `artifacts/design/decisions/` ADR directory with ADR-001 (permission default mode).
- `artifacts/context/decision-log.md` with D-001.
- `generators/commands-generator.js` emits the new slash commands from agent templates + hardcoded workflow bodies.
- Regression tests covering the new hook semantics, permission model, and orchestrator-write-gate path allow/deny logic (265/265 total, up from 261/261 on 1.4.0).

### Migration from 1.x

1. Install 2.0.0: `npm install -g bmad-swarm@2.0.0`
2. In each existing bmad-swarm project: `bmad-swarm update --force`. This regenerates `.claude/` and `CLAUDE.md` from the new templates. The `update` command's stale-sweep removes the 4 deleted agent files, 3 deleted hook files, and `.claude/system-prompt.txt`.
3. If your `swarm.yaml` has per-agent overrides for `qa`, `story-engineer`, `tech-writer`, or `retrospective`, move those into `reviewer.extra_context`, `strategist.extra_context`, `reviewer.extra_rules`, or delete them (retrospective is now a process step, not an agent).
4. If your scripts use `bmad-swarm start --dangerous` or `--allow-tools`, remove those flags; scope permissions via `.claude/settings.json` instead.
5. If you have cost expectations based on Sonnet pricing, re-run `node bin/bmad-swarm.js validate` (or check `estimateCost()` output). Opus is ~5× the per-token cost; this is intentional per user request but worth flagging to stakeholders.
6. Confirm the new slash commands appear in your Claude Code menu: start a fresh session with `bmad-swarm start`, type `/` and verify `/identity-orchestrator` and the 8 workflow commands are listed.

### References

- Plan: `artifacts/design/restructure-plan.md`
- Regression diagnosis: `artifacts/reviews/regression-diagnosis.md`
- Orchestrator prompt review: `artifacts/reviews/orchestrator-prompt-review.md`
- ADR-001: `artifacts/design/decisions/adr-001-permission-default-mode.md`

### Known issues

*(V-3 CRLF drift-detection bug resolved in 2.0.1 — see §Fixed above.)*


## [1.4.0] — 2026-04

Prior release. See `git log v1.3.0..v1.4.0` for details.

# Changelog

All notable changes to bmad-swarm.

## [Unreleased]

Wide-team retrofit tooling. Two opt-in tools remove the manual edits required to adopt wide-team specialization (D-004) in an existing project. Neither runs automatically — both are deliberate user actions, preserving the no-silent-migration principle from `architecture.md` §8.4.

### New

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

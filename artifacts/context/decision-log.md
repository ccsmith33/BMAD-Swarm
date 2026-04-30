# Decision Log

Sequential D-IDs for all decisions that affect product direction, architecture, or cross-cutting behavior. Tactical decisions get one-line entries; strategic decisions get full records. See `methodology/decision-classification.md` for classification.

## D-001 — Default permission mode is `acceptEdits`; dangerous patterns explicitly denied

- **Date:** 2026-04-16
- **Classification:** Strategic (affects permission model, visible to end user, cross-cutting)
- **Context:** User reported too many permission prompts during autonomous execution. Option C scoped the `allow` list but left default mode unset.
- **Decision:** Set `permissions.defaultMode: "acceptEdits"` in generated settings.json + template. Add explicit `permissions.deny` for destructive patterns (rm -rf, sudo, git push --force, git reset --hard, curl|sh, chmod 777).
- **Rationale:** User explicitly asked for fewer prompts. The `allow` list is narrow (Bash(npm:*), Bash(node:*), etc.) so blast radius is bounded. The orchestrator-write-gate hook still fires under acceptEdits (hook `permissionDecision: deny` overrides permission mode — empirically verified).
- **Consequences:** Fewer prompts for in-scope work; explicit denies for high-impact destructive patterns; delegate-everything rule preserved via hook.
- **Alternatives considered:** `bypassPermissions` (rejected — skips deny list); expand allow list (rejected — endless enumeration).
- **ADR:** `artifacts/design/decisions/adr-001-permission-default-mode.md`
- **Referenced by:** `templates/settings.json.template`, `.claude/settings.json`, `templates/CLAUDE.md.template`

## D-002 — Delete the `TaskCompleted` hook; do not rewire to `Stop`/`SubagentStop`

- **Date:** 2026-04-16
- **Classification:** Strategic (touches hook surface, enforcement story, and security posture)
- **Context:** Audit 2026-04-16 B-1: the `TaskCompleted` hook is registered against a Claude Code event that does not exist. The hook's 40 LOC (generator + settings entry + hook file) never execute. Reviewer offered delete vs rewire-to-Stop/SubagentStop.
- **Decision:** Delete `generateTaskCompletedHook`, drop it from `getHooksConfig()` and the `generateHooks()` loop, regenerate `.claude/`, and note the removal in CHANGELOG.
- **Rationale:** (a) The hook is advisory-only (`enforce: false` default), so its absence changes no observable behavior — the developer's TDD workflow + reviewer adversarial pass already gate merge. (b) `Stop`/`SubagentStop` payloads do not carry `TASK_SUBJECT`/`TASK_OWNER`; a correct rewire requires inventing a trigger (read task list on stop, correlate with session, filter by role), which is expensive for an advisory signal. (c) Deletion closes security L-2 (the advisory `npm test` code-execution chain, coupled with M-1 `Bash(npm:*)` allow) permanently. (d) The feature can be re-added later as a real orchestrator-side design if value is proven.
- **Consequences:** 40 LOC removed; L-2 closed; A-1 (dead `taskId`) eliminated as a side effect. One less hook to test (reduces B-3 coverage gap). CHANGELOG 2.0.0 claim about auto-test-run becomes accurate under a 2.0.1 correction.
- **Alternatives considered:** Rewire to `Stop`/`SubagentStop` (rejected — inventing a trigger is high cost for zero enforcement value); leave dormant (rejected — the `_bmadGenerated` hash covers the dead section and the presence misleads readers of `settings.json`).
- **ADR:** `artifacts/design/decisions/adr-002-taskcompleted-hook-disposition.md`
- **Referenced by:** `generators/hooks-generator.js`, `.claude/settings.json` (post-regeneration), `CHANGELOG.md`

## D-003 — Orchestrator-write-gate: keep with two-layer identity check (agent_id/agent_type + AGENT_ROLE env)

- **Date:** 2026-04-18
- **Classification:** Strategic (affects the structural enforcement of a core CLAUDE.md invariant; cross-cutting across teammate workflow, permission model, and hook design).
- **Context:** HARN-1 (2026-04-16) — `orchestrator-write-gate.cjs` fires on teammates because in-process TeamCreate subagents inherit `AGENT_ROLE=orchestrator` from the parent env, falsifying the hook's design-time assumption that "fresh teammate sessions don't inherit this env." The only in-session recovery was a `settings.local.json` override that disabled the gate for the orchestrator too. Task #1 of team `gate-and-brainstorm-eval` asked (a) whether the gate should exist at all, (b) if kept, how to fix the identity check permanently.
- **Decision:** Keep the gate. Redesign the identity check as a two-layer test: (1) `event.agent_id || event.agent_type` from the Claude Code hook payload — documented as the main-thread vs. subagent discriminator — exits pass-through when either is present; (2) `process.env.AGENT_ROLE === 'orchestrator'` retained as defense-in-depth so the existing `settings.local.json` recovery path still works. Allow-list extended with `.claude/settings.local.json` to close a legitimate-orchestrator-write false positive surfaced during HARN-1 triage.
- **Rationale:** The invariant "orchestrator does not edit code" is load-bearing (adversarial review, decision traceability, test coverage are keyed off it) and prose-only enforcement has failed before. The payload fields are Anthropic's documented signal for the question we are asking; they are independent of env-inheritance behavior, which is the actual bug. Two-layer design fails safe (degrades to pre-gate state) rather than failing open (the HARN-1 false-positive mode that blocked teammate work).
- **Consequences:** HARN-1 closed permanently. L-1 (single-layer identity check) downgraded — gate now has two independent signals. The `AGENT_ROLE: ""` local override can be removed from `settings.local.json`. Adds dependency on an experimental Claude Code payload field (mitigated by process-spawn hook tests that break loudly on field-name drift). Six new test cases in `test/hooks.test.js`, including a regression guard for the main-thread-plus-orchestrator-env case that would have caught HARN-1 itself.
- **Alternatives considered:** Blocklist redesign (rejected — adversarial-complete, re-enumerates the project tree); advisory-only demotion (rejected — regresses to prose-only failure mode); remove entirely (rejected — resurrects the failure that motivated the gate); per-edit LLM classifier (rejected — deterministic allow-list already encodes the classification at zero runtime cost); transcript_path / session_id / PPID discrimination (rejected — in-process teammates share all three with the parent); positive teammate env marker (rejected — no such marker is set by Claude Code for in-process subagents).
- **ADR:** `artifacts/design/decisions/adr-003-orchestrator-write-gate-design.md`
- **Referenced by:** `generators/hooks-generator.js` (patch site for `generateOrchestratorWriteGateHook`), `.claude/hooks/orchestrator-write-gate.cjs` (regenerated post-fix), `test/hooks.test.js` (new cases), `artifacts/context/findings-register.md` HARN-1 (pending resolution), `CLAUDE.md` §Permission model.

## D-BRN-1 — `/brainstorm` is an orchestrator-overlay process step, not a teammate spawn

- **Date:** 2026-04-18
- **Classification:** Strategic (changes slash-command behavior, reframes "orchestrator never does work" invariant)
- **Context:** `/brainstorm` previously spawned an ideator teammate. Teammates have no direct human channel — the only way they "converse" with the user is SendMessage-relay through the orchestrator, which kills conversational turn-taking.
- **Decision:** `/brainstorm` tells the orchestrator to load `agents/ideator.md` in full and run the conversation directly in its own session (no teammate spawn). Produces a lightweight summary at `artifacts/planning/brainstorm-<topic-slug>-<YYYY-MM-DD>.md` on exit.
- **Rationale:** Overlay pattern restores the conversational substrate. Framed as an orchestrator process step (parallel to the retrospective step), so the "never do work" invariant stays intact — brainstorming is coordination/reasoning, not implementation work.
- **Alternatives considered:** Keep team spawn and tune ideator prompt (rejected — doesn't fix relay latency); build sync human↔teammate IPC (rejected — substrate change, out of scope); delete `/brainstorm` (rejected — loses the 17-technique toolkit).
- **Referenced by:** `generators/commands-generator.js` (`buildBrainstormBody`), `agents/orchestrator.md` (§Brainstorming as process step), `agents/ideator.md`, `methodology/orchestration-modes.md`

## D-BRN-2 — Brainstorm output is a lightweight summary, not a full product brief

- **Date:** 2026-04-18
- **Classification:** Tactical (output artifact shape)
- **Decision:** Summary template: topic, key decisions with D-IDs, open questions, recommended next step. Path: `artifacts/planning/brainstorm-<topic-slug>-<YYYY-MM-DD>.md`. Full product brief (requirements, personas, success metrics) remains the strategist phase's deliverable.
- **Rationale:** Keeps the orchestrator out of downstream-artifact production; preserves strategist ownership of the PRD-grade product brief.
- **Referenced by:** `agents/ideator.md`, `agents/orchestrator.md`

## D-BRN-3 — Reframe `ideator.md` as a role identity, not a Mode-A teammate

- **Date:** 2026-04-18
- **Classification:** Tactical (role-file framing)
- **Decision:** `agents/ideator.md` reframed as a role identity usable in two contexts: overlay mode (default — loaded by the orchestrator) or teammate spawn mode (rare — bulk ideation with no live human conversation). Keep the full toolkit (Four Lenses, 17 techniques, elicitation methods, adaptive interaction rules).
- **Rationale:** The file's content is correct; only the wrapper framing was wrong. Minimal edits: top paragraph + overlay-specific Behavioral Rules at the top of the rules section.
- **Referenced by:** `agents/ideator.md`

## D-BRN-4 — `/explore-idea` (Mode B) ships alongside `/brainstorm`

- **Date:** 2026-04-18
- **Classification:** Tactical (sequencing, command inventory)
- **Decision:** `/explore-idea` — ideator overlay in the orchestrator session PLUS researcher spawned in parallel for evidence gathering. Strategist's eval deferred it, but the overlay pattern lands in the same release, so `/explore-idea` is tractable immediately.
- **Rationale:** Mode B lacks Mode A's substrate problem (researcher gathers evidence autonomously, no live human conversation needed). Natural extension; low marginal cost once overlay exists.
- **Referenced by:** `generators/commands-generator.js` (new `buildExploreIdeaBody`), `agents/orchestrator.md`

## D-004 — Adopt wide-team specialization architecture for bmad-swarm

- **Date:** 2026-04-28
- **Classification:** Strategic (changes the team-shape model, cross-cutting across orchestrator, agent docs, hooks, swarm.yaml schema, story schema, generators, CLI)
- **Context:** User reports usage-limit pain from long-context teammates. A long-running developer/reviewer accumulates intra-session detail across many stories that is no longer load-bearing (e.g., dev that built the login endpoint carries the full transcript when later working on upload). Existing patterns evaluated: sub-agent delegation per story (rejected — loses the long-running benefit user explicitly values); rotation (deferred — keeps as backup); `/clear`/`/compact` (rejected — non-deterministic about what survives).
- **Decision:** Adopt **wide-team specialization** as the primary mechanism. Pre-spawn multiple domain-specialized devs (e.g., `backend-login`, `backend-upload`) grounded in the architecture document. Each specialist is alive the whole session but only handles stories in its domain. Two team modes coexist: `dynamic` (current) and `fixed` (wide team), opt-in via `swarm.yaml`. Continuous reviewer is the consistency anchor across specialists. Mid-epic specialist injection is allowed and follows a decision tree governed by autonomy mode.
- **Rationale:** Bounded context per dev = bounded context per session, without sacrificing the long-running multi-story workflow. Architecture-grounded decomposition prevents orchestrator guesswork. Backwards compatibility is preserved via opt-in. Relocates (does not eliminate) the long-context problem to one role (reviewer) where mitigations can be focused.
- **Consequences:** Architect's deliverable expands by a domain map. Orchestrator gains a team-mode rule and a routing decision tree. `swarm.yaml` and story schemas gain optional fields. `teamcreate-gate` extends to validate domain-routing in fixed mode. Reviewer's own context discipline becomes a follow-up concern (separate feature). Generators may need updates depending on architecture's confirm/override on per-specialist identity docs.
- **Alternatives considered:** Sub-agent delegation per story (rejected — fragments long-running session); rotation at epic boundaries (deferred — keeps as escape hatch for over-bloated specialists); `/clear`/`/compact` (rejected — non-deterministic).
- **Referenced by:** `artifacts/planning/brainstorm-wide-team-2026-04-28.md` (full direction), `artifacts/design/architecture.md` (wide-team spec), `artifacts/design/decisions/adr-004` through `adr-009`.

## D-005 — `swarm.yaml` `team` block schema

- **Date:** 2026-04-28
- **Classification:** Strategic (config schema change, cross-cutting across validator, defaults, orchestrator behavior)
- **Source:** agent (architect)
- **Decision:** Add optional top-level `team` block with `mode` (dynamic|fixed), `specializations[]` (role/domain/description/model), and `fallback` (enabled/role/model). Whole block optional — absent = current behavior.
- **ADR:** `artifacts/design/decisions/adr-004-swarm-yaml-team-block-schema.md`
- **Status:** verified (2026-04-28, reviewer — Story WT-1 implementation reviewed and approved; all 10 ACs met; 332/332 tests pass)

## D-006 — Two-mode team shape: `dynamic` vs `fixed`

- **Date:** 2026-04-28
- **Classification:** Strategic (defines the orchestration boundary between current and wide-team behavior)
- **Source:** agent (architect)
- **Decision:** Two coexisting modes governed by `swarm.yaml:team.mode`. Dynamic preserves current sizing. Fixed uses static roster from `team.specializations` for sizing only; complexity scoring + entry-point tables continue to govern autonomy and phase-skipping.
- **ADR:** `artifacts/design/decisions/adr-005-two-mode-team-shape.md`
- **Status:** verified (2026-04-29, reviewer — Story WT-4 orchestrator doc updates reviewed and approved; all 7 ACs met; two-mode behavior, routing tree, mid-epic injection tree, and fixed-mode override rule all documented faithfully)

## D-007 — Story `domain:` field for routing

- **Date:** 2026-04-28
- **Classification:** Strategic (story schema change, affects story-engineer, orchestrator router, reviewer)
- **Source:** agent (architect)
- **Decision:** Add optional `## Domain: <slug>` heading to story schema. Default empty → fallback in fixed mode, ignored in dynamic. Slug regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$`. Reviewer audit advisory only.
- **ADR:** `artifacts/design/decisions/adr-006-story-domain-field.md`
- **Status:** verified (2026-04-28, reviewer — Story WT-2 schema-doc transcription reviewed and approved; all 5 ACs met; faithful to ADR-006)

## D-008 — Generic-dev fallback enabled by default in fixed mode

- **Date:** 2026-04-28
- **Classification:** Tactical (default-value choice with documented rationale; reversible by config)
- **Source:** agent (architect)
- **Decision:** `team.fallback.enabled: true` is the default when `team.mode: fixed`. Disabling is supported but emits a startup warning.
- **ADR:** `artifacts/design/decisions/adr-007-generic-dev-fallback-default-on.md`

## D-009 — `teamcreate-gate` Pass 2 enforcement (fail-open)

- **Date:** 2026-04-28
- **Classification:** Strategic (hook-level enforcement of routing invariant; precedent set by ADR-003)
- **Source:** agent (architect)
- **Decision:** Extend `.claude/hooks/teamcreate-gate.cjs` with a fixed-mode-only Pass 2 that validates each `team[].domain` against `swarm.yaml:team.specializations`. Fail-open on YAML read errors (matches existing hook posture).
- **ADR:** `artifacts/design/decisions/adr-008-teamcreate-gate-fixed-mode-enforcement.md`
- **Status:** verified (2026-04-29, reviewer — Story WT-5 implementation reviewed and approved; all 10 ACs met; 342/342 tests pass; AC9 idempotence verified live; AC10 no Pass 1 regressions confirmed)

## D-010 — One role doc per role; specialization in spawn brief

- **Date:** 2026-04-28
- **Classification:** Tactical (generator-strategy choice, reversible — just don't add the per-specialist generator)
- **Source:** agent (architect)
- **Decision:** Confirm brainstorm's proposed default — one `developer.md` (and one `reviewer.md`) serves all specialists. Domain context flows through the spawn brief, not via per-specialist `.md` files. No new generator code.
- **ADR:** `artifacts/design/decisions/adr-009-one-role-doc-per-role-not-per-specialist.md`
- **Status:** verified (2026-04-29, reviewer — Story WT-3 architect doc reinforces ADR-009 explicitly; no per-specialist `.md` files emitted; generator unchanged)

## D-019 — `utils/domain-map.js` imports `DOMAIN_SLUG_RE` from `utils/validator.js` (no duplication)

- **Date:** 2026-04-29
- **Classification:** Tactical (single-source-of-truth choice; reversible by inlining)
- **Source:** agent (developer, Story RT-1)
- **Decision:** RT-1's parser does `import { DOMAIN_SLUG_RE } from './validator.js'`. The validator's previously file-private constant was promoted to a named export (single-line additive change, no behavior delta for existing callers). The parser does NOT duplicate the regex.
- **Rationale:** Story Subtask 1.3 explicitly prefers import over duplication. Also resolves the drift-risk class flagged by F-003 (hook side) on the parser side: routing key validity has exactly one source of truth across the validator + parser. Cost is one cross-module dep within `utils/`; benefit is no possible disagreement about slug shape.
- **Referenced by:** `utils/domain-map.js` (imports), `utils/validator.js:9` (export site)

## D-012 — `teamcreate-gate.cjs` Pass 2 uses `require('js-yaml')` (try/catch wrapped)

- **Date:** 2026-04-28
- **Classification:** Tactical (implementation-strategy choice; reversible by replacing with an inline parser)
- **Source:** agent (developer, Story WT-5)
- **Decision:** Pass 2 of the generated `.claude/hooks/teamcreate-gate.cjs` does `require('js-yaml')` inside a try/catch. On any require error (package missing, resolution failure), Pass 2 fails open per ADR-008. Same try/catch wraps the parse call.
- **Rationale:** Option 1 of the story's Subtask 1.2. `js-yaml` is already a project dep (used by `utils/config.js`); the hook executes in the project's Node context so resolution works without bundling. Inline parser was rejected per ADR-008 ("Brittle and not recommended").
- **Referenced by:** `generators/hooks-generator.js:generateTeamCreateGateHook`, `.claude/hooks/teamcreate-gate.cjs` (post-regeneration), Story WT-5
- **Status:** verified (2026-04-29, reviewer — implementation matches decision verbatim at hook lines 143 + 150; fail-open confirmed by AC7 tests for both missing-yaml and parse-error paths)

## D-011 — Architecture for D-004 approved by human; greenlit for implementation

- **Date:** 2026-04-28
- **Classification:** Tactical (approval gate, no new technical decisions)
- **Source:** human
- **Decision:** Human approved `artifacts/design/architecture.md` as-is, accepting all four orchestrator-recommended resolutions on the open questions in §15: (1) keep schema permissive for specialist reviewers in v1, document as allowed-but-optional; (2) keep strict mode (fallback disabled) as advanced/discouraged with startup warning; (3) accept collaborative-mode mid-epic-injection pause as a known trade-off, no architectural change; (4) defer domain rename/supersession audit to a future `bmad-swarm doctor` follow-up. Implementation phase greenlit per architecture.md §13 roadmap.
- **Referenced by:** `artifacts/design/architecture.md`, ADR-004 through ADR-009 (status flips from "Accepted (pending human approval)" to "Accepted").

## D-013 — CLAUDE.md template renders `Team mode:` line only when `team.mode === "fixed"`

- **Date:** 2026-04-29
- **Classification:** Tactical (template-rendering choice; reversible by editing one ternary in `generators/claude-md-generator.js`)
- **Source:** agent (developer, Story WT-7)
- **Decision:** In `claude-md-generator.js:buildTemplateData`, expose `team.mode` to the template only when it equals `"fixed"` (otherwise pass `undefined`). The `{{#if team.mode}}` block in `templates/CLAUDE.md.template` then renders the `Team mode: ...` line only for projects that have explicitly opted into wide-team specialization.
- **Rationale:** `applyDefaults()` (D-005, ADR-004) sets `team.mode = "dynamic"` for every project, so a raw passthrough would render `Team mode: dynamic` for every default project — explicitly forbidden by Story WT-7's anti-pattern: "Do NOT make the CLAUDE.md template render `Team mode: dynamic` for default projects." Filtering at the data-builder layer keeps the template syntax simple (one `{{#if}}` instead of comparing against a literal) and centralizes the opt-in semantics next to where defaults are applied.
- **Referenced by:** `generators/claude-md-generator.js:buildTemplateData`, `templates/CLAUDE.md.template`, Story WT-7
- **Status:** verified (2026-04-29, reviewer — filter at `claude-md-generator.js:94` matches decision verbatim; verified live across three rendering paths during WT-7 review: default project → no line, explicit `team.mode: dynamic` → no line, `team.mode: fixed` → `Team mode: fixed (specialized)` line renders)

## D-014 — Adopt retrofit tooling for wide-team adoption

- **Date:** 2026-04-29
- **Classification:** Strategic (introduces two new user-facing surfaces — slash command and CLI — that mutate user-owned files and gate on architecture human-approval; cross-cutting across `commands-generator.js`, `bin/bmad-swarm.js`, the orchestrator overlay-pattern, and `agents/architect.md` workflow)
- **Source:** human (team-lead task brief: "Design retrofit tooling for wide-team adoption (D-014 candidate)")
- **Context:** Wide-team (D-004, D-005–D-013) shipped strictly opt-in. For existing projects whose architecture predates wide-team, two friction points remain: (1) `architecture.md` has no Domain Map section — adopters must hand-author one; (2) the `swarm.yaml:team` block must be hand-written matching the Domain Map. ADR-006 §8.4 / D-007 established the no-silent-migration principle; the retrofit must preserve it.
- **Decision:** Adopt two coupled-but-decoupled tools: (1) `/retrofit-team` slash command — orchestrator-overlay pattern (per ADR-010) that proposes a Domain Map and, on human approval, spawns one architect to insert it into `architecture.md`; (2) `bmad-swarm scaffold-team` CLI command — reads the Domain Map from `architecture.md`, emits the matching `swarm.yaml:team` block (default: stdout; with `--write`: backs up `swarm.yaml` to `swarm.yaml.bak`, injects the block, round-trip validates, restores on failure per ADR-011). A shared parser (`utils/domain-map.js`, contract per ADR-012) reads the Domain Map for both tools.
- **Rationale:** Removes both retrofit-edit frictions without weakening the no-silent-migration principle (both tools are user-invoked; neither runs on `init` or `update`). Pattern reuse: the slash command follows `/brainstorm` (D-BRN-1) overlay precedent; the CLI follows `bmad-swarm doctor` shape; the parser locks the same format `agents/architect.md` already documents. Backwards compatibility is automatic (projects that never invoke the tools see zero behavior change). Strict refuse-conditions (existing `team:` block, missing Domain Map, malformed inputs) keep the tools deterministic and predictable.
- **Consequences:** New CLI surface (`bmad-swarm scaffold-team`) and new slash command (`/retrofit-team`). New shared utility (`utils/domain-map.js`) consumed by both. Three new ADRs (010 overlay-vs-spawn, 011 write safety, 012 parser contract). Architect role doc gains a one-paragraph retrofit-entry-path addendum. README gains a "Retrofit tooling" subsection. The orchestrator-write-gate is unchanged (the architect spawn handles the file edit, not the orchestrator overlay). The hybrid overlay+spawn pattern is reusable for future `/retrofit-*` commands (e.g., a hypothetical `/retrofit-stories` for backfilling story `## Domain:` fields — explicitly out of scope for D-014).
- **Alternatives considered:** A `bmad-swarm migrate-to-fixed` umbrella command (rejected — explicitly out of scope per `architecture.md` §10.6); auto-running on `update` (rejected — violates no-silent-migration); auto-detecting domains from source code (rejected — heuristics already documented in `agents/architect.md` are sufficient and require judgment over architecture content, not code).
- **Referenced by:** `artifacts/design/architecture-retrofit.md` (the design); `artifacts/design/decisions/adr-010` through `adr-012`; `artifacts/implementation/stories/story-RT-1` through `story-RT-4`.
- **Status:** verified (2026-04-29, reviewer — final child story RT-4 (retrofit docs) reviewer-approved; all four child stories shipped: RT-1 parser (`utils/domain-map.js`), RT-2 CLI (`cli/scaffold-team.js`), RT-3 slash (`generators/commands-generator.js:buildRetrofitTeamBody`), RT-4 docs (README + architect.md + CHANGELOG); ADR-010/011/012 all Accepted; D-015/D-016/D-017 all verified; full traceability chain D-004 → D-014 → ADRs → child D-IDs → stories → implementation → verification holds end-to-end)

## D-015 — `/retrofit-team` is an orchestrator overlay (with architect spawn for the file edit)

- **Date:** 2026-04-29
- **Classification:** Tactical (slash-command shape choice; reversible by switching to a pure architect-spawn pattern in `commands-generator.js`)
- **Source:** agent (architect)
- **Decision:** `/retrofit-team` runs as an orchestrator overlay (loads `agents/architect.md`'s Domain Map heuristics into its own session, proposes iteratively, pauses for human approval). After approval, the orchestrator emits a single-task `bmad-assembly` block spawning ONE architect teammate whose sole job is to insert the approved Domain Map verbatim into `architecture.md`. The architect spawn does no design work — the design happened in the overlay; the spawn is a write delegate.
- **Rationale:** Conversational iteration is native (overlay owns the human channel — no relay). Human-approval handshake is one direct exchange. Orchestrator-write-gate (ADR-003) stays pristine (no carve-out for `architecture.md`). Pattern is consistent with D-BRN-1 (`/brainstorm`) and D-BRN-4 (`/explore-idea`). The architect-spawn-for-write is short-lived and trivial.
- **ADR:** `artifacts/design/decisions/adr-010-retrofit-team-overlay-vs-spawn.md`
- **Status:** verified (2026-04-29, reviewer — Story RT-3 implementation reviewed and approved; all 12 ACs met; 391/391 tests pass; body covers all 10 §3.2 steps verbatim with load-bearing literal phrases reproduced exactly; ADR-003 non-loosening cross-ref present in body footer)

## D-016 — `swarm.yaml` write safety strategy: rolled `.bak` + refuse-on-conflict + round-trip validation

- **Date:** 2026-04-29
- **Classification:** Tactical (CLI-write safety strategy; reversible by changing `cli/scaffold-team.js`)
- **Source:** agent (architect)
- **Decision:** `bmad-swarm scaffold-team --write` operates under five rules: (1) single rolled `swarm.yaml.bak` written before mutation; (2) refuse on conflict if `swarm.yaml` already has a `team:` key, printing a unified diff between existing and proposed blocks; (3) round-trip validation via `loadSwarmConfig` after write — restore from `.bak` on failure; (4) atomic-replace write via `swarm.yaml.tmp` + rename; (5) no prompt on `--write` (the flag IS the confirmation).
- **Rationale:** The `.bak` is the one-step undo for the immediate session, complementing git for longer-term recovery. Refuse-on-conflict prevents silent overwrites; the diff is informative. Round-trip validation catches emitter or schema bugs before they manifest. Atomic-replace prevents partial-write corruption. Single rolled `.bak` matches every other CLI tool (vim, sed -i.bak, gpg) — the user's mental model is established.
- **ADR:** `artifacts/design/decisions/adr-011-scaffold-team-write-safety.md`
- **Status:** verified (2026-04-29, reviewer — Story RT-2 implementation reviewed and approved; all 14 ACs met; 391/391 tests pass; all 5 safety rules implemented faithfully with 1:1 test mapping; AC12 restore-from-bak verified live via `_emitOverride` test seam; AC13 two-test approach (post-success no-`.tmp` + stale-`.tmp` recovery) stronger than AC's proxy)

## D-017 — Domain Map parser contract: heading-anchored markdown table, strict shape

- **Date:** 2026-04-29
- **Classification:** Tactical (parser contract; reversible by changing `utils/domain-map.js`)
- **Source:** agent (architect)
- **Decision:** `utils/domain-map.js` exports `findDomainMap` and `parseDomainMap`. The parser anchors on the first `## Domain Map` (or `### Domain Map`) heading, requires a markdown table immediately after (header row + separator row), validates the `Domain` cell against the same regex as `utils/validator.js:DOMAIN_SLUG_RE`, copies `Description` cells verbatim, preserves unknown columns under their original names in an `extras` map, and reports loud line-numbered errors on every violation (missing table, invalid slug, duplicate slug, multiple `## Domain Map` sections).
- **Rationale:** The Domain slug is a routing key — multiple plausible interpretations of what counts as a domain mean multiple plausible routing decisions. Strict parsing matches the validator's strictness (single source of truth for slug shape) and matches the format `agents/architect.md` already documents. Permissive parsing rewards malformed input with results the user can't predict; loud failure makes shape drift visible at the moment of the mistake.
- **ADR:** `artifacts/design/decisions/adr-012-domain-map-parser-contract.md`
- **Status:** verified (2026-04-29, reviewer — Story RT-1 implementation reviewed and approved; all 12 ACs met; 367/367 tests pass; ADR-012's 8 contract rules each map 1:1 to implementation+test; F-003-shaped drift risk closed by construction via ESM import of `DOMAIN_SLUG_RE` from `utils/validator.js`)

## D-018 — Architecture for D-014 (retrofit tooling) approved by human; greenlit for implementation

- **Date:** 2026-04-29
- **Classification:** Tactical (approval gate, no new technical decisions)
- **Source:** human
- **Decision:** Human approved `artifacts/design/architecture-retrofit.md` as-is, accepting all five architect-recommended resolutions on the open questions in §12: (1) `/retrofit-team` is overlay+spawn-for-write; orchestrator-write-gate stays pristine, no carve-out for `architecture.md`; (2) single rolled `swarm.yaml.bak` is the write-safety mechanism — git history is the deeper safety net; (3) reviewer specialization NOT auto-emitted by `scaffold-team`; default is developer-only specializations matching D-011's "specialist reviewers allowed but optional" stance; (4) `--write` does NOT auto-chain `validate` or `update` — composability over convenience, success message suggests next steps; (5) `/retrofit-team` does NOT auto-invoke `scaffold-team` — boundary clarity (architecture work in slash, config work in CLI) outweighs one context switch. Implementation phase greenlit per `architecture-retrofit.md` §11 roadmap. **D-014 through D-017 statuses promote from `proposed` to `accepted`; ADRs 010, 011, 012 implicitly flip from "Proposed (pending human approval)" to Accepted.**
- **Referenced by:** `artifacts/design/architecture-retrofit.md`, ADR-010 through ADR-012, D-014 through D-017.
- **Status:** verified (2026-04-29, reviewer — all five resolutions shipped as approved: RT-3 verified the overlay+spawn pattern with no orchestrator-write-gate carve-out; RT-2 verified the rolled `.bak` + atomic + round-trip flow; RT-2 verified developer-only default specializations; the success message "Next: review the diff (git diff swarm.yaml), then run `bmad-swarm validate` and `bmad-swarm update`" suggests rather than chains; RT-3's `buildRetrofitTeamBody` step 10 explicitly tells the user to run `scaffold-team` themselves — the two tools remain decoupled. Approval gate satisfied end-to-end across all four child stories RT-1 through RT-4)

## D-020 — `cli/scaffold-team.js` ships an inline ~50 LOC line-based diff (no new dep)

- **Date:** 2026-04-29
- **Classification:** Tactical (implementation-strategy choice; reversible by adding the `diff` package)
- **Source:** agent (developer, Story RT-2)
- **Decision:** RT-2's AC7 unified-diff between existing and would-be-generated `team:` blocks is implemented with a small inline line-based diff (LCS-style minimum common subsequence). No new runtime dep.
- **Rationale:** Story Subtask 5.1 lists three options: `diff` package (~30KB, ubiquitous), inline minimal-LCS (~50 LOC), `git diff --no-index` subprocess. (a) Keeps the dep tree at 2 packages (commander + js-yaml) — adding a dep for one CLI command's human-readable output is poor cost/benefit. (b) The diff output is informational only — the user reads it to decide how to merge manually. Pixel-perfect LCS quality is unnecessary; a clear add/remove line listing is enough. (c) Consistent with the project's evident preference for minimal deps (D-012 chose `require('js-yaml')` over bundling, leveraging the existing dep). (d) If future use cases need richer diff (e.g., a `--show-diff` flag on `update`), promoting the inline impl to a util or swapping in `diff` is mechanical.
- **Referenced by:** `cli/scaffold-team.js` (post-RT-2)
- **Status:** verified (2026-04-29, reviewer — `unifiedDiff` at `cli/scaffold-team.js:244-284` is the LCS implementation; package.json deps unchanged at 2 packages; `unifiedDiff` sanity-check test passes)

## D-021 — `--write` re-emits the whole `swarm.yaml` document; no positional control over the `team:` key

- **Date:** 2026-04-29
- **Classification:** Tactical (write-strategy detail; reversible)
- **Source:** agent (developer, Story RT-2)
- **Decision:** When `--write` mutates `swarm.yaml`, the implementation parses the existing YAML, sets `parsed.team = <new block>`, and re-emits the whole document via `js-yaml.dump`. `js-yaml` places the new key wherever its emitter chooses (in practice: at the end). The CLI does NOT attempt to position the `team:` block at a specific location relative to other top-level keys.
- **Rationale:** ADR-011 §"Negative" already accepts that `js-yaml.dump` does not preserve comments or original key ordering — the `.bak` retains the original. Trying to position the `team:` block "after defaults" would require a YAML round-trip parser (eemeli/yaml or similar) — out of scope per ADR-011 §"Forward-compatibility". Whole-document re-emit matches what `cli/init.js:101` already does for the same file.
- **Referenced by:** `cli/scaffold-team.js` (post-RT-2)
- **Status:** verified (2026-04-29, reviewer — implementation at `cli/scaffold-team.js:170-176` matches decision: `const newDoc = { ...rawExisting, team }` then `yaml.dump(newDoc, ...)`; AC6 test confirms existing keys preserved on round-trip)

## D-022 — RT-4 documentation shape: sibling subsection, two-bullet CHANGELOG, "two opt-in tools" framing

- **Date:** 2026-04-29
- **Classification:** Tactical (doc-shape choices; reversible by editing prose)
- **Source:** agent (developer, Story RT-4)
- **Decision:** Three coupled RT-4 documentation choices: (1) the new "Retrofit tooling for existing projects" content sits as a sibling `###` subsection of the existing "Wide-team specialization" `##` (next to "Retrofit procedure (existing projects)" and "Worked example: `team` block in `swarm.yaml`"), not nested inside any of them; (2) the CHANGELOG `[Unreleased]` block lists the two new surfaces as separate `### New` bullets (one for `bmad-swarm scaffold-team`, one for `/retrofit-team`) plus a `### Docs` subsection for the README/architect addendum, rather than a single combined bullet — matches the two-tool framing of `architecture-retrofit.md` §1.1 and lets each bullet carry its own ADR/D-ID anchors; (3) the retrofit subsection is introduced with "Two opt-in tools remove the manual edits when adopting wide-team in a project that already has an architecture" — frames the feature for readers who haven't yet adopted wide-team, then immediately names both tools so the reader can decide whether to keep reading.
- **Rationale:** (1) Sibling placement keeps WT-7's manual-procedure prose intact and lets the reader compare manual-vs-tooling paths at the same heading level; nesting under "Retrofit procedure" would imply tooling supersedes the manual path, which is false (manual editing still works and is sometimes preferred). (2) Two-bullet CHANGELOG matches the two-story implementation split (RT-2 + RT-3) — granular enough that a future reader scanning for `scaffold-team` finds it; the Docs subsection is conventional CHANGELOG style and matches 2.0.2's structure. (3) "Two opt-in tools" wording reuses the architecture doc's own framing — the architecture is the source of truth for how the feature is named and described; copying that framing keeps doc surfaces consistent. Per Story RT-4 "Decision-log discipline" anticipating tactical D-IDs starting from D-022 for this exact kind of judgment call.
- **Referenced by:** `README.md` §"Retrofit tooling for existing projects", `CHANGELOG.md` `[Unreleased]`, `agents/architect.md` §"Retrofit entry path"
- **Status:** verified (2026-04-29, reviewer — Story RT-4 reviewer-approved; all three bundled doc-shape choices landed faithfully: (1) sibling `###` subsection at `README.md:291` parallel to WT-7's "Retrofit procedure" and "Worked example" — confirmed by structural read; (2) two `### New` bullets per tool plus `### Docs` subsection at `CHANGELOG.md:9-17`; (3) "Two opt-in tools remove the manual edits…" wording at `README.md:293`. Bundle approved over split per the shared upstream `architecture-retrofit.md` §1.1 "two-tool" framing — splitting would have produced three D-IDs with identical rationale, fragmentation rather than granularity. L-1 advisory noted on entry-clarity ordering — non-blocking, see review report)

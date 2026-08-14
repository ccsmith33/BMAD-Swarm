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

## D-023 — Add `fable` (Claude Fable 5) model tier support; keep `opus` framework default; targeted fable overrides in this repo

- **Date:** 2026-06-09
- **Classification:** Strategic (model-tier policy affects all generated projects and cost profile)
- **Source:** human request ("take advantage of fable 5 while it's out") + orchestrator
- **Decision:** (1) Add `fable` to `VALID_MODELS` in `utils/validator.js` — it maps to Claude Fable 5 (`claude-fable-5`), the new tier above opus: 1M context, $10/$50 per MTok (2× opus), same API surface as Opus 4.8. Claude Code's agent-spawn model enum already accepts `fable`. (2) The framework-wide default stays `opus` — fable is 2× opus cost and most teammate roles (developer, reviewer) are token-heavy; making fable the silent default would double cost for all downstream users. (3) This repo opts in via per-agent overrides in `swarm.yaml` (`agents.architect.model: fable`, `agents.strategist.model: fable`, `agents.security.model: fable`) — deep-reasoning, low-token-volume roles where the intelligence ceiling matters most. (4) Orchestrator identity gains explicit model-selection heuristics (when to promote a teammate to fable). (5) Agent identity templates gain Fable-5-class prompt tuning per Anthropic's migration guidance (delegation triggers, micro-decision autonomy, report-everything review posture).
- **Rationale:** Backward compatible (existing projects unchanged), opt-in cost escalation, and centralizing the duplicated default-model literal (`cli/init.js:279`, `utils/config.js:104`) removes a known DRY hazard while we touch the surface.
- **Referenced by:** (pending implementation) `utils/validator.js`, `utils/config.js`, `utils/cost-estimator.js`, `generators/commands-generator.js`, `agents/orchestrator.md`, `swarm.yaml`, `README.md`, `CHANGELOG.md`
- **Status:** accepted (auto mode; human-initiated)

## D-024 — `DEFAULT_MODEL` constant lives in `utils/validator.js`

- 2026-06-09 — Tactical (developer, D-023 implementation) — Exported alongside `DOMAIN_SLUG_RE`, matching the repo's single-source-of-truth export convention (D-019); imported by `utils/config.js`, `cli/init.js`, `utils/cost-estimator.js`, `generators/commands-generator.js`.

## D-025 — Cost estimator prices per-agent resolved model; only fable pricing added

- 2026-06-09 — Tactical (developer, D-023 implementation) — `utils/cost-estimator.js` resolves each agent's model (`agents.{name}.model` → `defaults.model` → `DEFAULT_MODEL`) and prices per agent. Fable is $10/$50 per MTok per spec; all non-fable tiers keep the file's pre-existing flat opus baseline ($15/$75) — correcting that baseline or adding haiku/sonnet tiers was out of scope.

## D-026 — `teamcreate-gate` Pass 3 reads the whole assembly log, slices the last 4096 chars, and accepts the LAST fenced block in that tail

- 2026-06-09 — Tactical (developer, HARN-2 fix) — Whole-read+slice is simpler than fd/offset reads inside the generated CJS template and the log is small in practice; the log is append-only so the last block is the one written for the imminent TeamCreate. Any error in Pass 3 falls through to the transcript-based deny (the pass only widens acceptance). Hook tests now default to an isolated cwd so the real repo's `team-assembly-log.md` cannot leak into cwd-relative reads.

## D-027 — 2026-06-09 — This repo sets `defaults.model: fable` (all roles) — human directive: on Max subscription, quota not dollars; go all-in on Fable 5 while available. Supersedes D-023's tiered per-agent overrides for this repo only (framework default remains opus). F-006 fix declined for now (stays logged); no release cut.

## D-028 — v3 coordination epic approved by human; greenlit for autonomous completion

- **Date:** 2026-06-09
- **Classification:** Strategic (changes the gate enforcement channel and teammate identity mechanism; supersedes parts of ADR-003-era spawn ceremony and the GATE-1 transcript mechanism)
- **Source:** human ("i trust that you will complete this by the time i have returned") after reviewing the orchestrator's first-principles critique + Quinn deployment evidence
- **Decision:** Implement three coordination-layer changes: (0) single wake-channel task protocol — orchestrator-assigned ownership is authoritative; teammates never self-claim; kills the "task already done" double-trigger seen in both this repo and the Quinn deployment; (1) generated `.claude/agents/*.md` become valid Claude Code custom agent definitions (frontmatter first, `name`+`description` added) and teammates are spawned natively via `subagent_type: <role>`, retiring the "FIRST: Invoke /identity-{role}" ceremony for teammates (/identity-orchestrator stays — the main session cannot be a custom agent type); (2) teamcreate-gate drops transcript scanning entirely; the `artifacts/context/team-assembly-log.md` handshake (HARN-2) becomes the sole Pass-1 channel, fixing F-009 by anchoring on the last fence rather than a byte window. ADR-013 (gate channel) and ADR-014 (native agent identity) to be authored by the developer. Preserve what Quinn proves works: peer-to-peer teammate messaging, domain-named dynamic spawns, worktree isolation.
- **Referenced by:** generators/agent-generator.js, generators/hooks-generator.js, generators/commands-generator.js, utils/fs-helpers.js, agents/orchestrator.md, .claude/agents/*.md, ADR-013, ADR-014
- **Status:** verified (2026-06-09, reviewer — v3-coordination review APPROVED with minor issues, `artifacts/reviews/review-v3-coordination-1.md`: all three items implemented and independently verified — item 0 protocol injected into exactly the 8 teammates with no self-claim residue; item 1 all 9 agents valid native definitions (js-yaml probe) with live mid-session spawn confirmation; item 2 gate fully transcript-free with F-009 resolved and Pass 2 fed by the handshake block; 415/415 tests in an independent run; advisories F-011–F-014 logged in the findings register)

## D-029 — Item-0/item-1 identity material injected by `agent-generator.js`, not the 13 source templates

- 2026-06-09 — Tactical (developer, D-028 implementation) — Both the registration frontmatter (`name`, `description` via `applyIdentityFrontmatter`) and the "Team task protocol" override (every teammate, never the orchestrator) are appended/prepended by the generator at generation time. One edit site, templates stay registry-agnostic, and override forks cannot silently miss future registry requirements. Spec offered either site; generator chosen. (Inherited from the pre-restart session; verified and kept.)

## D-030 — `bmad-generated` marker placement: after the frontmatter fence when present; detection searches the first 10 lines

- 2026-06-09 — Tactical (developer, D-028 implementation) — `writeGeneratedFile` inserts the marker immediately after the closing `---` fence when content starts with frontmatter (frontmatter must be first bytes, ADR-014), else line 1 as before. `findHtmlMarker`/`stripGeneratedMarker`/`isFileManuallyModified` accept both placements within the first 10 lines; anything deeper is body content. Backward compatible with pre-v3 line-1 markers — verified read-only against the Quinn deployment (29/29 old-format files detected as generated). (Inherited from the pre-restart session; verified and kept.)

## D-031 — `teamcreate-gate` deny posture: missing/stale/incomplete handshake = deny; fail-open only for environmental errors

- 2026-06-09 — Tactical (developer, D-028 item 2 / ADR-013) — The pre-v3 gate failed open when the transcript was missing because the transcript was harness-owned; the handshake file is orchestrator-owned, so its absence is exactly the state the gate exists to catch and is denied with an actionable message (file name + "append a fenced bmad-assembly block (keys: …), then retry TeamCreate"). Fail-open survives only for unparseable stdin and the D-012 Pass-2 paths (missing js-yaml, unreadable/malformed swarm.yaml). Net test delta: obsolete transcript tests removed, handshake contract tests added (424 → 415 total, all green).

## D-032 — Teammate `identity-{role}` commands kept as inspection/debugging aids

- 2026-06-09 — Tactical (developer, D-028 item 1 / ADR-014) — `commands-generator.js` still emits all 9 identity commands; teammate variants' descriptions now state they are inspection aids (identity arrives natively from `.claude/agents/{role}.md`). Deleting them would break muscle memory and the README's documented file layout for zero space savings; `/identity-orchestrator` remains load-bearing. (Inherited from the pre-restart session; verified and kept.)

## D-033 — Overnight-autonomous mode for the reinvention session (dogfooding /sleep)

- **Date:** 2026-08-11
- **Classification:** Tactical (session-execution decision).
- **Decision:** Human left mid-session ("food and the gym") and authorized running the rest as an overnight-autonomous session applying the just-designed /sleep decision ladder: proceed on reasoned defaults for reversible work, spike-both on forks where cheap, park only truly one-way + high-stakes + un-spikeable decisions for their return, never take destructive/irreversible external actions.
- **Applied ruling — IMPLEMENTATION IS PARKED:** starting the actual code rewrite of the coordination core is one-way, high-stakes, and depends on four unratified human forks (A security posture, B model tier / supersede D-027, C gate posture, D orchestrator-as-native-agent) which are architecture-class and REQUIRE human approval per CLAUDE.md. So route around it: produce the vision, roadmap, ADR proposals, and doc drafts (all non-destructive, all reversible) and queue the forks + approvals for the morning. No source rewrite tonight.
- **Referenced by:** morning report (artifacts/context/), strategist synthesis.

## D-034 — Overnight guardrail model collapses to one axis: destructive vs non-destructive

- **Date:** 2026-08-11
- **Classification:** Strategic (defines the /sleep safety model, a core product feature).
- **Decision:** Per human directive, drop the budget-usage cap and the review-debt cap as overnight constraints ("weekly limits shouldn't matter"; "review debt is fine — if I throw away 30 of 40 branches, we still got 10 branches of NEW output; ideas are never bad, as long as they aren't destructive"). The sole hard constitutional fence is DESTRUCTIVE vs NON-DESTRUCTIVE: no irreversible/world-facing external actions (push, publish, deploy, real-data migrations, rm outside worktree, destructive external APIs) and never auto-merge; everything reversible runs free and unrestrained. Retain only (a) a no-progress tripwire that REDIRECTS a degenerate loop to new work (maximizes output, not a cap) and (b) best-first ranking of the morning report as review convenience (not a cap). Precondition: Fork A shell-narrowing is what makes "worst case = throw away the branch" actually true today (security F-016/F-018).
- **Supersedes:** the three-guardrail model in my earlier brief to ideator-overnight.
- **Referenced by:** artifacts/exploration/diverge-2026-08-11-overnight.md, the reinvention vision.

## D-035 — README + CHANGELOG rewrite is in scope, deferred to match the reinvented tool

- **Date:** 2026-08-11
- **Classification:** Tactical.
- **Decision:** Human flagged README drift (confirmed by audit: stale 13-agent roster, wrong command counts, missing CLI commands, dead URL). Fold into the truth-sweep (WS-5) but do NOT patch it to the current-being-replaced state — rewrite it to describe the reinvented tool so it is written once. Overnight I produce a PROPOSED README + CHANGELOG as review artifacts (non-destructive, not overwriting the live files); the in-place update lands with the approved build.
- **Referenced by:** truth-sweep workstream, morning report.

## D-036 — One record envelope: D/R/L/C/F unified schema + shared promotion state machine + context file budget

- 2026-08-11 — Strategic (strategist, reinvention synthesis; minted under D-033 overnight authority, queued for morning ratification) — One record shape (id, type, status, fingerprint, provenance/occurrences, evidence, links) for D/R/L/C/F; verification failure-class schema merges into L-records; F-records gain `fingerprint:` for mechanical F→L rollup; `checked/cited/attested/assumed` is the single evidence-status vocabulary; brain eviction mints fingerprinted lessons entering at `observed`; `artifacts/context/` capped at five standing files (project-brain, decision-log, ledger, task-ledger, team-assembly-log pending Fork C). Full record: `artifacts/planning/reinvention-vision-2026-08-11.md` §2.5/§9.

## D-037 — Machine-state home: brain frontmatter + task-ledger; project.yaml deleted

- 2026-08-11 — Strategic (strategist, reinvention synthesis; overnight per D-033, queued for ratification) — Phase/gates state lives in project-brain frontmatter (guaranteed reader: warm boot); lifecycle events in task-ledger; static init facts in swarm.yaml; project.yaml deleted (generated-view-only if tooling demands). Supersedes WS-2 item 5 of `artifacts/design/audit-2026-08-11-upgrade-design.md`. Full record: reinvention-vision §2.6/§9.

## D-038 — One priced decision router: interruption tax ≡ Night Ladder ≡ regime routing; Governor mode-parameterized

- 2026-08-11 — Strategic (strategist, reinvention synthesis; overnight per D-033, queued for ratification) — One stakes × human-availability × complexity routing function with a mode column, never parallel tables; the Budget Governor is one mode-parameterized subsystem (treasurer by day, scheduler by night) with the day/night subscription-quota coupling stated honestly (trade-off ratified in D-034); constitutional floors (security, contradiction escalator, destructive axis) invariant and unpriced. Confirms D-034 rank-don't-restrict; amends the novel doc's stale pre-D-034 Unlock 5 budget-cap line; night exploration is a supported mode. Full record: reinvention-vision §2.2/§2.6/§9.

## D-039 — Product architecture is 2+2; thesis is outcome-linked decision memory

- 2026-08-11 — Strategic (strategist, reinvention synthesis; overnight per D-033, queued for ratification) — Two mechanisms (record-promotion ledger, priced decision router) on the deterministic replay gate substrate with the project-brain cache; kept/deleted/replaced-with-native table adopted; standing rule: only deterministic replay and PreToolUse denies may be called enforcement, all file-shape checks ship labeled advisory. Full record: reinvention-vision §1–§3/§9.

## D-040 — Must-spike-first rule for unverified primitives

- 2026-08-11 — Strategic (strategist, reinvention synthesis; overnight per D-033, queued for ratification) — No roadmap phase depends on an unspiked primitive (TaskCompleted exit-2 hook payload, PreCompact summarizer steering, Workflow contract, --agent main session); Tier-0 ships with a deterministic pre-review-script degradation path either way; D-002 superseded only explicitly after payload re-verification. Full record: reinvention-vision §7/§9.

## D-041 — Integrated roadmap adopted with hard gates

- 2026-08-11 — Strategic (strategist, reinvention synthesis; overnight per D-033, queued for ratification) — Six phases (repair+spike → truth+envelope → enforcement+resilience → ship+heal-field → moat → beast+router); npm publish gated on WS-1+WS-5+WS-6; /sleep gated on Fork A + field-tested WS-2 + live replay gate; every phase reviewed against the protect-the-brain guardrails; Mission Control v1 read-only. Full record: reinvention-vision §5/§9.

## D-042 — Fork ratification (orchestrator, under human "do whatever is best" delegation)

- **Date:** 2026-08-11
- **Classification:** Strategic (ratifies the 4 architecture forks; architecture-class).
- **Decision:** Human delegated ("do whatever is best, idc") on return. Ratifying along the fork-sheet recommendations: **Fork A** = A1+A3 shell-narrowing (yes); **Fork C** = C2 advisory reframe + enforcement into the replay gate (yes); **Fork D** = D1 native `--agent` orchestrator ADOPTED PENDING spike 4 (conditional, not assumed). **Fork B** = tier mix (ADR-023) PROPOSED as new default but NOT silently applied — it supersedes the human's explicit standing directive D-027, so per the advisory contradiction-escalator it is surfaced for one-word veto; D-027 stays in force until the human confirms. Secondary calls: git-track swarm.yaml/CLAUDE.md/artifacts (yes); facade kill-list (yes).
- **Execution ruling:** Do NOT begin the architectural rewrite. Start with the 4 feasibility spikes (D-040) — zero-risk investigations that gate the repair design — on branch `reinvention/honest-foundation`. Repair epic designed after spike results land. No merge, no push, no npm publish without explicit human sign-off.
- **Referenced by:** artifacts/planning/forks-decision-sheet-2026-08-11.md, reinvention-vision, ADR-015..023.

## D-043 — Feasibility spikes all green

- 2026-08-12 — Tactical (developer spike, branch reinvention/honest-foundation) — All 4 unverified primitives verified live: blocking TaskCompleted exit-2 hook WORKS (replay gate feasible; D-002 supersession justified), PreCompact steering WORKS both halves (schema-driven compaction real), --agent main session WORKS (Fork D substrate confirmed). Workflow tool works-with-caveats: no `escalate: agentic` primitive → regime-router tier escalation must be script logic. No fallback forced. Full record: artifacts/exploration/spikes-2026-08-11.md.

## D-044 — Honest Foundation P0 epic delivered + reviewed APPROVED

- 2026-08-12 — Tactical (2 devs + devops + reviewer, branch reinvention/honest-foundation) — Delivered: dead gate re-anchored onto native Agent spawn + reframed advisory (ADR-015, teamcreate-gate→team-assembly-lint), F-022 future-mtime fixed, 3 blocking CLI bugs (eject+update, non-TTY init, --github workflow), npm test + engines>=22, cost-estimator prices corrected, phantom deleted-role sweep, AP-1 TeamCreate-vocabulary sweep, AP-2/AP-3 prompt fixes, fixture-provenance reviewer lens (L-001), CI + LICENSE + user-CI generator fixes. Reviewed APPROVED-with-minor (sonnet), 443/443 tests. Full record: artifacts/reviews/review-honest-foundation-2026-08-12.md.

## D-045 — Live .claude/ regeneration deferred to pre-merge

- 2026-08-12 — Tactical — Did NOT regenerate this repo's live .claude/ during the session: those hooks govern the running orchestrator, and regenerating them mid-session risks self-disruption. Verified regeneration correctness via temp-dir dogfood instead (lint present/fires/passes, stale hook removed, zero TeamCreate). Live regen via `bmad-swarm update` is a pre-merge step.

## D-046 — F-023 (unpublished-version CI pin) deferred to the publish workstream

- 2026-08-12 — Tactical — Reviewer F-023 (medium): generated --github CI pins bmad-swarm@2.0.0, which isn't on npm (only 1.2.0), so generated CI would fail step 1. Impact only materializes once a project is generated from a PUBLISHED build; fix is coupled to WS-10 (publish: register a resolvable version / npx-latest / repo install). Logged as known-issue tied to the publish gate; not fixed now to conserve usage.

## D-047 — Fork B (tier mix) adopted in practice after usage-limit hit

- 2026-08-12 — Strategic (supersedes D-027 by experience, pending explicit human confirmation) — Mid-session the human hit their usage limit and a fable reviewer died on it — live confirmation of the economics finding that fable-everywhere (D-027) ~2× burns limits on token-heavy roles. Switched remaining work to the tier mix (sonnet for token-heavy review; fable reserved for deep-reasoning roles). Surfaced to the human, not silent; D-027 formally superseded once they confirm.


## D-048 — Fork B confirmed: tier mix active, D-027 retired

- 2026-08-12 — Strategic (human confirmed "go for it... maybe dont use fable for all models" after usage-limit reset) — D-027 (fable-everywhere) formally SUPERSEDED. swarm.yaml now implements ADR-023 tier mix: default opus; fable for architect/strategist/security + complexity >=12; sonnet for researcher/devops. Per-task overrides via the Agent spawn model field. Closes the Fork B decision (D-042 had it pending veto). ADR-023 status: ratified.

## D-049 — Phase 2 SE-1 kickoff: ADR ratifications + tactical calls

- 2026-08-13 — Tactical/Strategic (orchestrator, under human "drive it" delegation; fork-level authority from D-042) — Ratifying ADR-017/018/021/022 along their fork decisions (D-042) to unblock Phase 2 SE-1, plus accepting the architect's Phase 2 design calls: (a) ADR-017 pinned-script amendment — allow `node .claude/bmad/bin/record.cjs:*` while .claude/** stays write-denied, reconciling Fork A shell-narrowing with the orchestrator's need for deterministic ledger helpers; (b) coordination state written by PostToolUse hooks not prompted agents (the property that made decision-log survive, project.yaml die); (c) serialized-write channel = pinned record.cjs CLI + PreToolUse deny on direct ledger/task-ledger/decision-log edits for ALL agents (closes RES-6, seen live this session); (d) team-assembly-log kept as the lint file (5th context file); (e) replay-gate v1 gated classes = story/bug-fix/review; (f) swarm.yaml replay-allowlist teammate-writability accepted as a v1 residual. D-002 supersession D-ID minted at SE-1 close with spike evidence in hand. Orchestrator shell-narrowing changes scaffolded-project behavior on next update — release note required at publish (Fork A, already ratified).

## D-050 — Sleep mode this session (manual /sleep, feature not yet built)

- 2026-08-13 — Tactical (human went to sleep: "see things through, sleep mode bc i havent updated this session yet") — Applying the designed /sleep philosophy by hand. Constitutional axis: NON-DESTRUCTIVE only. See SE-1 through to review-approved (T2 ledger → T3 replay gate → fable security-lens review → fixes), ALL committed to branch reinvention/phase2-enforcement-resilience (reversible, local, not pushed). PARK the irreversible/public step: do NOT merge to main or push while the human sleeps — present SE-1 for a one-word merge in a morning report. Night Ladder for any decision: reversible → proceed on reasoned default + log; one-way high-stakes → park + route around. Never wake the human. If SE-1 completes with runway, continue toward SE-2 (project brain + task-ledger) on the branch. No npm publish, no force ops, nothing destructive.

## D-051 — SE-1 complete (enforcement layer clear) + D-002 formally superseded

- 2026-08-13 — Strategic (SE-1 close; sleep mode D-050) — SE-1 (Fork A read-only permission boundary + unified record ledger + replay gate) is review-approved: fable security re-verification CLEAR (all 20 reproduced bypasses re-tested closed — artifacts/reviews/security-se1-reverify-2026-08-13.md), correctness CHANGES-REQUIRED items all fixed, 649 tests green. Committed d913a25 on branch reinvention/phase2-enforcement-resilience; NOT merged (parked for human per D-050). **D-002 formally SUPERSEDED by ADR-022**: the blocking TaskCompleted exit-2 hook is resurrected as the replay gate (spike-verified; what returns is the deterministic replay trigger, not D-002's deleted advisory npm-test hook — D-002's L-2 security rationale preserved via the read-only allow-list). Residual low finding (non-blocking, for follow-up): write-gate tripwire doesn't treat wrapper binaries (`timeout node -e`) as transparent — the read-only allow-list (primary control) already refuses them, so belt-and-suspenders only.

## D-052 — SE-2 complete (project brain + task-ledger, review-approved)

- 2026-08-13 — Strategic (SE-2 close; sleep mode D-050) — SE-2 review-APPROVED (reviewer verified all hooks live): project brain (bounded, PreCompact schema-driven flush, SessionStart warm-boot + read-back handshake — the human's compaction-continuity fix) + task-ledger writers (event-driven PostToolUse capture via serialized record.cjs, spike-verified payloads). M-1 (brain budget unwired) + M-2 (token-estimate drift) fixed. 695 tests, no SE-1 regression. Committed on branch reinvention/phase2-enforcement-resilience through 4d8c0cf+fix; NOT merged (parked per D-050). SE-3 (reconcile/liveness + project.yaml cutover + gates frontmatter) is the next slice; reconcile.js stubbed, forward items logged by the reviewer.

## D-53 — Phase 5 night-boundary re-verify — Surface 1/2 dispositions + node<file> escalation

- **Date:** 2026-08-13
- **Classification:** Strategic
- **Decision:** Phase 5 night-boundary re-verify @98f5e82 (artifacts/reviews/security-phase5-reverify-2026-08-13.md). Surface 2 workflow-integrity CLEAR / ship-ready (WF-1 sha256 content-pinning confirmed). Surface 1 night-floor CLEAR on the round-1 fail-closed fixes (60/61 vectors deny, no false positives). RESIDUAL, ESCALATED TO HUMAN POSTURE: `node <in-tree-file>` (and every allow-listed interpreter/build tool) runs arbitrary in-tree JS in child processes the PreToolUse:Bash hook never sees — it can forge the wake marker via an fs-write, fs-write out of tree, exfil over the network, or execSync('git push') to the live remote the night worktree carries. So worktree-isolation + never-merge is a strong GUARDRAIL, not a containment BOUNDARY. Options: A accept as guardrail (correct the overstated comments); B (recommended if teammates not fully trusted) OS/credential layer — strip push creds / remove origin from night worktrees + OS fs/network deny; C partial (move wake_nonce out of the world-readable charter + remove remote). RESOLVED NOW (reversible, this commit): corrected two provably-false shipped comments in night-floor.cjs.src (the wake marker is NOT 'un-forgeable by construction'; 'worst case = throw away the branch' is FALSE for a determined teammate) and closed S1-NF7 (backslash-newline continuation glued to -e now denies via a line-continuation collapse). The node<file> containment posture (Option A/B/C) is PARKED for the human — do not auto-strip remotes.

## D-54 — Night self-audit nudge (anti-premature-stop): orchestrator coordination behavior, not a hook

- **Date:** 2026-08-14
- **Classification:** Strategic
- **Decision:** Add a Phase-5 follow-on to /sleep: when a night teammate goes idle or declares done during an active charter, the orchestrator issues ONE self-audit nudge prompting it to reconsider parked/reversible work vs a genuine stopping point — automating the human's repeated 'why did you stop?' intervention, operationalizing L-5 (scope is a floor). Coordination/prompt-level (orchestrator identity + Governor night mode), NOT a new enforcement hook (D-039: floor=enforcement, nudge=advisory). Anti-thrash: nudge at most ONCE per work episode, anchored to the teammate's latest in_progress ledger timestamp, checked against a durable task-ledger 'nudged' row so it survives 3am compaction; 'genuinely done' is always an accepted answer (no make-work coercion). Logging reuses the record.cjs task-event envelope (events: nudged / nudge-continued / nudge-done under task pointer night-nudge) — no new store, no record.cjs logic change. Morning report surfaces outcomes in utils/mission-control.js section 7 (Night ledger). Design note: artifacts/design/night-self-audit-nudge-2026-08-14.md.

## D-55 — Planning-time parallel-decomposition reflex (extends L-5/D-050 from task-graph-default to a planning + human-facing-presentation reflex)

- **Date:** 2026-08-14
- **Classification:** Strategic
- **Decision:** L-5/D-050 inverted the TASK-GRAPH default to parallel-by-default, but the over-serialization failure kept recurring at PLANNING/DECISION time and — critically — in HUMAN-FACING option presentation (offering 'want me to do X?' when X, Y, Z are independent). Root cause: a parallel-by-default TASK-GRAPH setting does not fire at the moment the orchestrator DECOMPOSES a request or OFFERS the human a next step. Fix (this decision): add a 'decompose-for-parallelism' reflex to the orchestrator identity, positioned in Coordination discipline right after the L-5 parallel-by-default bullet, that fires BEFORE creating a task graph, committing to a plan, or offering the human a next step — enumerate work items, ask pairwise 'does B require A's output?', default PARALLEL, serialize only on a named Depends-On edge, and explicitly fan out human-facing choices instead of offering one option when several are independent. Framed as the planning-time complement to the D-54 night self-audit nudge (idle/stopping-point sibling): together they stop the swarm being under-used by stopping early OR by serializing independent work. Also adds a one-line cross-ref in methodology/decision-classification.md near the regime routing table (at complexity >= 7, decompose into a parallel task graph by default; serialize only on named deps). Prose/identity-level, no new hook. Recorded as L-7 (fingerprint serial-planning-default-recurs-at-decomposition, linked to L-5).

## D-56 — Correct D-54: the anti-premature-stop self-audit belongs on the orchestrator (scope-holder), not context-free workers

- **Date:** 2026-08-14
- **Classification:** Strategic
- **Decision:** D-54 shipped the night self-audit nudge as a message the orchestrator sends to idle WORKERS ('is there more work / are you done?'). Design error caught by the human: workers are context-free — they hold only their assigned task, not the human's stated scope — so nudging a worker to 'do more' invites the exact scope-creep the audit was meant to prevent. CORRECTION (this decision): the stopping-time self-audit moves to the ORCHESTRATOR, the only agent holding the human's intent + full scope. Before concluding a thread or letting the swarm go idle (esp. at night), the orchestrator audits ITS OWN queue against the human's scope on the Night Ladder — reversible+in-scope value -> dispatch now (fresh TaskCreate + one start message); irreversible/world-facing -> park for the human; value-not-activity, 'genuinely done' fully valid. Workers become REPORT-UP ONLY: on completion they report what they did + anything they NOTICED adjacent/out-of-scope (advisory, never action); the orchestrator decides whether a noticed item becomes newly-dispatched work. UNIFIED with the D-55 planning-time decomposition reflex into ONE 'Orchestrator self-audit' discipline in agents/orchestrator.md (planning = fan out independent work; stopping = don't quit early). Ledger events move from the night-nudge pointer (nudged/nudge-continued/nudge-done, per-teammate dispositions) to a self-audit pointer (re-dispatched / deliberately-parked by the orchestrator; noticed by teammates); morning report §7 reworked to surface re-dispatched vs deliberately-parked counts + worker-reported noticed items (utils/mission-control.js). Reuses the record.cjs task-event envelope — no record.cjs logic change. Supersedes and drops the fix/nudge-barenudged-count branch (which fixed the OLD worker-nudge fold). Keeps D-55/L-7. Recorded as L-8 (fingerprint reflex-belongs-on-scope-holder-not-workers, links L-5/L-7).

## D-57 — The Command Doctrine — envisioned-system operating doctrine: command Claude agents, not a human dev team (capability reframe, defense-in-depth)

- **Date:** 2026-08-14
- **Classification:** Strategic
- **Decision:** Adopt the Command Doctrine as the CENTERPIECE of the bmad-swarm reinvention: a defense-in-depth, compaction-surviving mechanism that breaks the orchestrator human-dev-team habit (over-decompose into phases/stories, serialize independent work, under-estimate one-shot reach, offer the human one option at a time — recurred 4x this session WITH L-5 already shipped, proving one identity line cannot fix it). CAPABILITY MODEL (canonical, methodology/operating-doctrine.md NEW): the orchestrator commands N parallel Claude agents; each one-shots large coherent work; cost ~ TOKENS not conceptual difficulty; no fatigue / working-memory limit / learning time; difficulty MOVES to constraint density + verifiability, both fixed by VERIFICATION never by fragmenting production. CREED (4 rules): produce in one shot; split only on real seams (independence -> parallel, named dependency -> sequence, never size/difficulty/phases); scale verification to constraint-density x blast-radius; human one-shot/easy signals override the estimate. CONSISTENCY = four properties: one canonical text (creed duplicated, model never paraphrased); every layer rides an event that already mandatorily fires (SessionStart hook both matchers, pre-spawn assembly append, review-tier selection, spawn envelope, idle/completion); an OUTPUT obligation (the one-line doctrine read-back) makes a skipped reckoning visible; and the ambient vocabulary is rewritten (router + quality-standards + identity openings speak the capability model natively). SIX LAYERS: (1) warm-boot creed injection + handshake command line (survives compaction); (2) planning-time forcing function — 3 questions + read-back line, optional doctrine: key in bmad-assembly (lint untouched); (3) router re-architecture — decision-classification.md splits production shape (seams only, never score) from verification depth (5-factor risk score: constraint density / blast radius / reversibility / verifiability / ambiguity, same 5-15 range; WS-12 re-keyed to risky-not-big plans); (4) proportional review — quality-standards tier ladder T0 self-verify / T1 light / T2 full adversarial / T3 heavy, with constitutional floors (security never below T2, irreversible always human-gated, replay classes always gated, tests always required) replacing the no-exceptions mandate its own economics audit contradicts; (5) lean identities — core/annex split (CORE <=5K chars, annexes lazy-loaded from methodology/), creed never lazy-loaded, 2-line worker one-shot creed in TEAM_TASK_PROTOCOL, context-curation enforcement, byte-stable files for cache; (6) the D-55/D-56 unified self-audit confirmed as the residual-catch layer (re-anchored to the canonical file + wired to the read-back; no logic changes). ADAPTIVITY (the one new thing) ties the moat together via existing machinery: human capability-signals log as L-7/L-9 fingerprint occurrences and harden through the promotion/born-immune loop; doctrine-crossing proposals travel the advisory layer under the untouched contradiction escalator; night mode inherits via the Night Ladder; one-shot production is safe BECAUSE the verification core is real. No new enforcement hooks; ledger/brain/wake-channel/replay/allowlists untouched. Design note with normative text + implementation seam map (5 parallel one-shot seams + 1 dependent integration): artifacts/design/operating-doctrine-2026-08-14.md. Wraps and completes D-55/D-56/L-7/L-8/L-9; implements eval-synthesis actions 1/2/5 and economics recs 2/3/5/6.

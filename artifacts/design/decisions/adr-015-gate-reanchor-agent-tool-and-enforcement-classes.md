# ADR-015: Re-anchor the assembly gate to the Agent tool; enforcement-class honesty statement

**D-ID:** implements D-039 (enforcement-class rule), D-041 (Phase 0/2); disposition per Fork C
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Supersedes:** ADR-013 (the `TeamCreate` anchor and the "enforcement" framing; the handshake-file channel itself carries forward)
**Vision mapping:** ADR-A of `artifacts/planning/reinvention-vision-2026-08-11.md` §8

## Context

`TeamCreate`/`TeamDelete` were removed from Claude Code in v2.1.178; teams now form implicitly on the first Agent-tool spawn. The flagship `teamcreate-gate` PreToolUse hook — ADR-013's sole-channel handshake design — is matched against a verb that no longer exists, so **the gate never fires on the live spawn path**. Every workflow command body, both CLAUDE.md invariants, and orchestrator Invariants 1/3 describe the dead spawn mechanism (upgrade design WS-1, ECO-P0, AP-1). Separately, the field record shows the assembly-log gate was gamed the week it shipped (invented entry points, rationale stuffing — field audit #12): a repo-file shape check cannot bind the actor who writes the file.

## Decision

1. **Re-anchor.** The gate's PreToolUse matcher becomes `Agent`, no-op when `subagent_type` is absent or the spawn is not a team spawn; `TaskCreated` is evaluated as a secondary anchor during the WS-1 build. `TeamCreate` is dropped from the permissions allow-list; the settings generator emits `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
2. **One vocabulary.** Every "call TeamCreate" in `generators/commands-generator.js`, `agents/orchestrator.md`, `agents/ideator.md`, `templates/CLAUDE.md.template`, and hook message strings is rewritten to "spawn via the Agent tool (`subagent_type`)"; `team_name` references are dropped. Pinned with generator content-assertion tests (the F-012 pattern).
3. **Honest classification (per Fork C recommendation C2).** The assembly gate is reclassified as **declared-intent lint** in everything that ships (changelog, identity docs, README). The standing rule from D-039 applies product-wide: only (a) deterministic replay/re-execution and (b) PreToolUse denies may be called enforcement; every file-shape check ships labeled advisory. The enforcement budget moves to the replay gate (ADR-022).
4. **Cheap correctness fixes ship under any Fork C answer:** bidirectional freshness (H-1/F-022), `$CLAUDE_PROJECT_DIR` command anchoring (M-2), normalized segment-anchored path regexes (SEC-F-017).
5. **Handshake mechanics carry forward unchanged** from ADR-013 on the new anchor: whole-file read, last-fence wins, 5 required keys, 15-minute freshness, deny on missing/stale/incomplete, fail-open only for environmental errors. ADR-018 adds a `session:` key (RES-6).

## Alternatives considered

- **C1 — invest to make the gate a real boundary** (tool_input↔log binding, vocabulary validation). Rejected per the security audit: the orchestrator writes the log file, so the binding can never constrain a misbehaving orchestrator; it adds drift-prone coupling to buy a boundary that structurally cannot exist.
- **Keep the TeamCreate matcher as a dormant secondary.** Rejected: dead matchers mislead readers of `settings.json` (same rationale as D-002's deletion of the dormant hook).
- **Delete the assembly gate outright.** Rejected: as lint it still catches the honest-mistake class (spawning without a plan) at zero token cost, and the log doubles as the human-auditable assembly history. Fork C decides `team-assembly-log.md`'s disposition in the D-036 five-file budget (retire or rename).

## Consequences

- The gate fires again on the live spawn path — the product works on current Claude Code (WS-1's whole point).
- The product's enforcement story becomes honest: no more "not an authorization boundary" in code while the README says enforcement. RES-10's requested enforcement-class statement is point 3.
- Existing projects need `bmad-swarm update` to regenerate hook + settings (reaches the field via WS-11).
- ADR-013's channel lesson (file handshake over harness internals) survives; only its anchor and framing are replaced.

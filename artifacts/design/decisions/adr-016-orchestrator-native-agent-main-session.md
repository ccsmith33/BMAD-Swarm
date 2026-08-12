# ADR-016: Orchestrator runs as a native `--agent` main session

**D-ID:** implements D-039, D-040 (spike 4 gate), D-041 (Phase 0); disposition per Fork D
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033) · additionally gated on spike 4 (§7 of the vision)
**Date:** 2026-08-11
**Supersedes:** ADR-014 point 4 only — the claim "the main session cannot be a custom agent type" and the resulting `/identity-orchestrator` load-bearing status. ADR-014's teammate-side design (native agent definitions, marker placement, native `subagent_type` spawning) stands unchanged.
**Vision mapping:** ADR-B of `artifacts/planning/reinvention-vision-2026-08-11.md` §8

## Context

ADR-014 (2026-06-09) made teammates native custom agents but kept the orchestrator on the slash-command ceremony because, at the time, the main session could not be a custom agent type. Current Claude Code (v2.1.222-era per the ecosystem audit) supports launching the main session as a named agent (`claude --agent <name>` with `initialPrompt` in the agent file). Three audits independently converge on adopting it (ecosystem opp #2, economics boot-overhead, prompts AP-13/AP-14.3). The ceremony costs ~3 hooks + a skill + reminder machinery per session, depends on prose obedience, and leaves the orchestrator spawnable as its own teammate (AP-13/F-013).

## Decision

Per Fork D recommendation D1:

1. `bmad-swarm start` launches `claude --agent orchestrator`; the orchestrator agent file carries `initialPrompt` with the boot sequence (identity → brain warm boot per vision §2.4 → ADR-018 reconciliation → read-back handshake).
2. Retired: the `/identity-orchestrator` ceremony as a load-bearing step, the UserPromptSubmit reminder hook, and most post-compact re-injection machinery. `/identity-orchestrator` is demoted to an inspection/debugging aid, joining the teammate identity commands (D-032).
3. Orchestrator-spawnable-as-teammate is fixed structurally: the orchestrator agent definition's description already defends against auto-delegation; the spawn allowlist work in WS-12.3 completes it.
4. WS-2's reconciliation step and the project brain's warm boot get their guaranteed home in `initialPrompt` — the "guaranteed reader" that D-037 requires.

**Spike gate (D-040):** spike 4 must verify the `--agent` main-session primitive (agent resolution, `initialPrompt` execution, behavior across compaction) before any build. **Degradation path:** if the spike disappoints, Fork D falls back to D2 — keep the ceremony, take only ADR-015's vocabulary/anchor fixes; the brain warm boot is designed to work under either outcome (vision §2.4).

## Alternatives considered

- **D2 — keep the slash-command ceremony, fix vocabulary only.** Lower risk, no new harness dependency; rejected as the default because it keeps paying the token/complexity tax every session for machinery whose only purpose is simulating what D1 provides natively, and it leaves AP-13 fixable only by prose.
- **Belt-and-braces (ceremony + native agent).** Rejected for the same reason ADR-014 rejected it for teammates: two identity channels with different content is a drift generator.

## Consequences

- One identity channel; boot overhead drops; post-compact recovery becomes structural (`initialPrompt` re-fires context via the brain, not via re-injection hooks).
- New dependency on a current-version harness feature — acceptable only because spike 4 gates the build and D2 remains a working fallback.
- ADR-014 must be marked "superseded in part by ADR-016" on approval; the D-002 lesson applies — a logged claim is being reversed, so the reversal is explicit, never silent.
- `bmad-swarm start` becomes the documented entry point; README/CHANGELOG updates ride the D-035 rewrite.

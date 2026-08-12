# ADR-017: Generated permission-model posture — the orchestrator loses its interpreter shell

**D-ID:** implements D-039, D-041 (Phase 2); named precondition for /sleep per D-034; disposition per Fork A
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Supersedes:** the implicit permissive posture of ADR-001 (allow-list scope) and ADR-003 (which hardened the write-gate's identity check while leaving the shell bypass open). Neither ADR's core decision is reversed: `acceptEdits` default (ADR-001) and the two-layer write-gate (ADR-003) both stand.
**Vision mapping:** ADR-C of `artifacts/planning/reinvention-vision-2026-08-11.md` §8

## Context

The generated allow-list grants the orchestrator an interpreter-capable shell (`Bash(node:*)`, `npx:*`, `npm:*`, `echo:*`, `cat:*`) while the write-gate intercepts only `Edit|Write|MultiEdit`. A blocked orchestrator can write code via `echo >`/`node -e`/heredoc; `npx` is arbitrary remote code; the destructive-pattern deny-list is decorative once an interpreter is allowed (SEC-F-016, SEC-F-018, SEC-F-019). `settings.local.json` being orchestrator-writable is a self-ungate (SEC-F-020). This is also the /sleep honesty condition: D-034's "worst case = delete the branch" is false while the orchestrator holds an interpreter (security F-016/F-018) — the night's one constitutional wall is prose until this lands.

## Decision

Per Fork A recommendation A1 now, A3 as follow-on:

1. **Orchestrator allow-list narrowed** in `templates/settings.json.template` + generators: interpreter/redirect-capable Bash entries removed; the orchestrator keeps read/inspection commands only. It can no longer run `npm test` or ad-hoc node itself — **by design**; delegate-everything says it never should have, and the delegate rule becomes structural instead of prose.
2. **Write-gate widened as defense-in-depth:** the `orchestrator-write-gate` matcher gains `Bash` and `NotebookEdit` (blocking write-shaped shell from the orchestrator identity), per WS-3.
3. **`settings.local.json` removed from the orchestrator-writable allow-list** (closes SEC-F-020; the ADR-003 recovery path becomes human-only).
4. **The deny-list is re-documented as a typo tripwire, not a security control** — consistent with the D-039 enforcement-class rule (PreToolUse denies are the control; pattern denies are lint).
5. **Follow-on (A3):** teammate allow-lists become stack-aware, derived from the detected stack at init (WS-11's scan feeds this), answering the field's escalate-to-`bypassPermissions` pressure without widening the orchestrator.

## Alternatives considered

- **A2 — keep the permissive posture, document the trust assumption loudly.** Rejected: the orchestrator is the actor the entire product promises to constrain; a documented hole is still a hole, and /sleep would stay permanently blocked on honesty grounds.
- **Narrow teammates equally.** Rejected: teammates legitimately need interpreters (tests, builds); the threat model is specifically the coordinator that pledged not to write.
- **Per-edit LLM classification of shell commands.** Rejected in ADR-003 already; deterministic allow-list encodes the classification at zero runtime cost.

## Consequences

- Delegate-everything becomes structurally enforced for the first time; the write-gate + narrowed shell close both known bypass families.
- /sleep's precondition is satisfied — the destructive/non-destructive axis becomes a real fence, unblocking Phase 5 (D-041).
- Behavior change for **every scaffolded project** (hence the human fork): orchestrators in the field lose self-run test ability on their next `bmad-swarm update`. Mitigation: the change ships with WS-11's update path and release notes.
- Slight friction increase for legitimate orchestrator inspection; the read/inspection allow-list is tuned during WS-3 to keep prompts rare.

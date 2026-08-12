# ADR-022: Resurrect the blocking `TaskCompleted` exit-2 hook as the replay-gate trigger — formal supersession of D-002

**D-ID:** supersedes D-002 (and ADR-002's deletion rationale) — effective only after spike 1; implements D-040, D-039
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033) · additionally gated on spike 1 (payload re-verification)
**Date:** 2026-08-11
**Vision mapping:** vision §2.3 (substrate), §7 item 1, §8 item 12

## Context

D-002 (2026-04-16) deleted the `TaskCompleted` hook: the event did not exist in Claude Code, payloads lacked task fields, and the hook was advisory-only — its deletion also closed security L-2 (the advisory `npm test` code-execution chain). The 2026-08 ecosystem audit reports the platform has since grown `TaskCompleted`/`TaskCreated`/`TeammateIdle` hooks with exit-2 blocking. Three reinvention designs (verification Tier-0, knowledge structural tier, overnight review gate) anchor on this primitive. Both D-002 and the audit can be true across time — but a logged decision must be superseded explicitly, never silently contradicted (D-040; critique §1.7).

## Decision

1. **D-002 is formally superseded** — but only upon spike 1 confirming: (a) the `TaskCompleted` (and/or `TaskCreated`) event fires; (b) exit-2 actually blocks completion; (c) the payload carries task identity plus enough context to locate the gated artifact and its evidence block. Until the spike returns, D-002 stands and nothing may build on the hook (D-040).
2. **What returns is not what was deleted.** The old hook was an advisory `npm test` runner — trigger-on-trust, the exact shape D-002 was right to kill (and an L-2 code-execution surface). The new hook is the **deterministic replay gate's trigger**: on a "done" claim it re-executes the attached evidence — Tier-0 existence pre-pass (every cited path stat'd — retroactively catches the entire Vantage 22-fabricated-paths class for zero tokens), test commands re-run with matching exit codes, citations resolved, fixture provenance declared (`captured_from:` or `synthetic: true`). The LLM's honesty is never load-bearing (vision §2.3).
3. **Designed degradation (buildable today under either spike outcome):** if the payload disappoints, Tier-0 ships as a deterministic pre-review script run by the orchestrator or the reviewer spawn — same checks, same replay, weaker trigger. The gate's value does not hinge on the hook.
4. **Enforcement-class compliance (D-039):** this hook is deterministic replay — one of the only two classes permitted to be called enforcement. Evidence-block *presence* checks remain advisory lint (ADR-015 point 3).

## Alternatives considered

- **Silently rebuild the hook** (the ecosystem audit says it works now). Rejected: silent contradiction of a logged decision is a defect class, not a shortcut — the whole product thesis is decision memory.
- **Skip the hook, ship only the pre-review script.** Kept as the degradation path, not the goal: a blocking trigger at the completion boundary is structurally stronger than an orchestrator-remembered step.
- **Rewire to `Stop`/`SubagentStop`** (rejected by D-002, re-rejected): still requires inventing a trigger correlation; the task-scoped events are the correct anchor if they exist.

## Consequences

- The trust anchor of the entire reinvention (vision §2.3) gets its trigger; the knowledge ladder's structural tier and the night review gate inherit it.
- D-002's security rationale is preserved: the new hook executes only declared evidence commands under the narrowed permission model (ADR-017), not an ambient `npm test` on trust.
- The decision-log entry for D-002 gains a supersession pointer to this ADR when (and only when) the spike confirms; if the spike fails, this ADR flips to `superseded-rejected` and the script path proceeds alone.

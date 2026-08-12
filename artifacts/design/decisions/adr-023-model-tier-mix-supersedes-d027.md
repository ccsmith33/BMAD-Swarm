# ADR-023: Model-tier policy — retire fable-everywhere (D-027) in favor of the tier mix with a visible override

**D-ID:** supersedes D-027 (a standing human directive — only the human who issued it can retire it; hence this is strictly a proposal); refines D-023; disposition per Fork B
**Status:** PROPOSED — AWAITING HUMAN APPROVAL (D-033)
**Date:** 2026-08-11
**Vision mapping:** vision §6 Fork B; WS-9's policy half

## Context

D-027 (2026-06-09) set `defaults.model: fable` for all roles in this repo on the rationale that Max-subscription billing makes the 2× price irrelevant. But subscription usage limits are tier-weighted: fable-everywhere roughly doubles limit burn on the token-heavy majority (developer + reviewer ≈ 60–70% of volume) and drives mid-epic cap stalls — the most expensive failure mode, and the same daytime stall the Budget Governor exists to prevent (vision §2.2's honestly-stated day/night quota coupling). Both the economics and field-usage audits independently recommend the mix, and the orchestrator identity's own shipped heuristic (fable at complexity ≥ 12) was right.

## Decision

Per Fork B recommendation B2 + B3:

1. **Default `opus`** for teammates framework-wide and in this repo.
2. **`fable`** for architect, strategist, and security roles, and for any task at complexity ≥ 12 — the deep-reasoning, low-token-volume surfaces where the intelligence ceiling pays (restoring D-023's targeted-override shape).
3. **`sonnet`** for researcher and devops.
4. **Visible per-project override knob:** the tier mix is expressed in generated `swarm.yaml` (per-agent `model:` entries with a one-line comment), not buried in defaults — the field shows users make deliberate tier decisions when the knob is visible (field #5). A project that wants fable-everywhere sets `defaults.model: fable` in one line, exactly as D-027 did.
5. **Fork-independent WS-9 items are not gated on this ADR** (estimator price corrections, missing tiers, `estimated_tokens` wiring, context-curation enforcement) and proceed in Phase 0 regardless.

## Alternatives considered

- **B1 — keep D-027 fable-everywhere.** Maximum capability per turn, simplest config; rejected as recommendation because it buys capability on the roles where field evidence shows opus suffices, at the price of the run-killing failure mode (cap stall mid-epic) and roughly double limit burn (~40–50% reduction available on implementation-heavy runs).
- **Sonnet for developers too.** Rejected: developer + reviewer are the adversarial-review core — the flagship feature by field evidence; degrading them trades the product's proven value for marginal savings beyond the mix.
- **Dynamic tier selection by the router.** Deferred: Mechanism 2 (the priced decision router) may later take model tier as an output dimension, but that waits for router calibration data (vision §4.6); policy ships static first.

## Consequences

- ~40–50% limit-burn reduction on implementation-heavy runs; fewer mid-epic cap stalls; night runs drain the shared weekly quota more slowly (softening the D-034 accepted trade-off).
- D-027's decision-log entry gains a supersession pointer on approval; the framework default (`opus`, per D-023) is unchanged — this ADR realigns this repo with it and adds the visible knob to generated scaffolds.
- Cost-estimator output becomes meaningful once WS-9's price fixes land alongside.

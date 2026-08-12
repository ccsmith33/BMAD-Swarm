# ADR-005: Two-mode team shape — `dynamic` vs. `fixed`

**D-ID:** D-004 (parent strategic decision)
**Status:** Accepted
**Date:** 2026-04-28
**Context:** Architecture design for wide-team specialization (Surface 4 of `artifacts/planning/brainstorm-wide-team-2026-04-28.md`)

## Context

The current orchestrator sizes each TeamCreate based on a complexity score (5–15) and an entry-point table that maps coarse intents (`bug-fix`, `small-feature`, `full-lifecycle`, etc.) to default team shapes (see `agents/orchestrator.md` §Complexity scoring, §Entry points). This is the **dynamic** model: for every story, the orchestrator picks the right team.

D-004 introduces a second model: **wide team / fixed roster**, where the team is pre-declared in `swarm.yaml` and the orchestrator routes incoming work to specialists rather than spawning fresh teams. The brainstorm decided both should coexist — but it left open exactly how they coexist:

- Does fixed mode override the entry-point tables entirely?
- Does it override autonomy promotion?
- Does it override phase-skipping behavior (e.g., `bug-fix` skipping Definition/Design)?

Without explicit answers, the orchestrator would be left to interpret, which is exactly the kind of ambiguity that produces silent drift.

## Decision

Adopt a clear separation of concerns:

1. `team.mode: dynamic` (default) — current behavior is byte-for-byte preserved. Complexity scoring + entry-point tables drive both team-sizing and autonomy/phase-skipping.

2. `team.mode: fixed` — the static roster from `team.specializations` (plus optional fallback) is the team. Complexity scoring + entry-point tables are NOT used for sizing; they ARE still used for:
   - **Autonomy promotion** (e.g., complexity ≥ 12 → auto becomes guided). The same override rules apply.
   - **Phase-skipping** (e.g., `bug-fix` entry skips Definition and Design). Same as today.
   - **Rationale text in the `bmad-assembly` block** — the orchestrator still classifies the work, it just doesn't use the classification to pick agents.

3. Mode selection is **per-project**, not per-task. The `swarm.yaml:team.mode` setting governs the entire session. Switching modes mid-project is a strategic decision and gets a full ADR record (architecture.md §11.2).

4. Both modes share the same `bmad-assembly` envelope. The difference is whether `team[]` entries carry a `domain:` sub-field (fixed mode) or are bare role entries (dynamic mode). This keeps the existing `teamcreate-gate` shape check unchanged for dynamic mode and adds an additive Pass 2 only for fixed mode (see ADR-008).

## Alternatives considered

- **A. Replace dynamic mode entirely with fixed.** Rejected: breaks every existing project; D-004 explicitly mandates strict backward compatibility. The dynamic model is correct for many projects (small ones, exploratory work, single-domain projects) and there's no reason to delete it.

- **B. Per-task mode selection (e.g., `swarm.yaml:methodology.phases.implementation.team.mode`).** Rejected: thrashing between modes mid-project would defeat the bounded-context property fixed mode exists to provide. The roster is supposed to be static across the session — that is the point.

- **C. Auto-detect mode (e.g., infer fixed when `team.specializations` is non-empty).** Rejected: implicit behavior derived from list-population is exactly the kind of magic that makes config hard to reason about. An explicit `mode:` field is one more line of YAML in exchange for clarity. Errors fail loudly (e.g., specifying specializations without setting mode would either be ignored or auto-applied — neither is good).

- **D. Three modes (`solo`, `dynamic`, `fixed`).** Rejected: solo is already an entry point in dynamic mode; making it a top-level mode duplicates the concept. Two modes is the minimum that cleanly expresses the new capability.

- **E. Fixed-mode disables phase-skipping too** (e.g., always run all enabled phases). Rejected: phase-skipping is orthogonal to team-shape. A `bug-fix` in a wide-team project should still skip Definition/Design. Coupling them would force users to choose between two valuable axes of customization.

## Consequences

**Positive**

- Backwards compatibility is trivially provable: existing projects default to dynamic, behavior is unchanged.
- The tables in `agents/orchestrator.md` (Complexity, Entry points, Signal→lens) keep their current meaning — only their *scope of effect* changes when fixed mode is on. No tables need to be deleted.
- The `bmad-assembly` schema accommodates both modes without versioning. The `domain:` sub-field is presence-optional.
- Mode is observable from `swarm.yaml` alone — auditors and reviewers see it without inspecting orchestrator state.

**Negative**

- The orchestrator doc (§6 of architecture.md) gains a new "Team mode" section. Three new behavioral rules (fixed-mode override of sizing, mid-epic injection tree, decision-log convention). Modest but real cognitive load.
- Two coexisting mental models is one more axis for users to track. Mitigated by making `dynamic` the default — users who don't opt in never see the second model.

**Forward-compatibility**

- A future third mode (e.g., `dynamic-with-pinning`, where some specialists are static but others are spawned dynamically) is a natural extension. The enum is permissive.
- Rotation (D-004 deferred backup plan) can layer onto fixed mode without modifying ADR-005 — rotation would be triggered inside the static roster, not a separate mode.

## Verification

1. With `team.mode: dynamic` (or absent), the orchestrator's behavior matches the pre-feature behavior on a representative epic (manual verification during the rollout dry-run).
2. With `team.mode: fixed`, the orchestrator's `bmad-assembly` blocks include `domain:` on every developer/reviewer entry, and team size matches the declared roster + optional fallback.
3. The autonomy override rules from `agents/orchestrator.md` continue to apply in both modes (e.g., complexity ≥12 still promotes auto→guided in fixed mode).

## Referenced by

- `artifacts/design/architecture.md` §6
- `agents/orchestrator.md` (post-implementation: new §Team mode)
- `artifacts/context/decision-log.md` D-004

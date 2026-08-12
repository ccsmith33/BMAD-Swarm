# ADR-007: Generic-dev fallback enabled by default in fixed mode

**D-ID:** D-004 (parent strategic decision)
**Status:** Accepted
**Date:** 2026-04-28
**Context:** Architecture design for wide-team specialization (Surface 1.5 / brainstorm direction §6 — "one-off cross-cutting work: route to generic-dev fallback")

## Context

Wide-team specialization pre-spawns a fixed roster of domain-specialized devs. But real projects have stories that don't fit any one domain:

- One-off cross-cutting work ("update README", "bump dependencies", "add logging everywhere").
- Pre-feature stories created before the architect produced a domain map.
- Stories whose natural domain is not architecturally significant enough to warrant its own specialist.
- Stories that span domains evenly (no obvious owner).

Forcing every such story to either declare a domain or be rejected is hostile. The brainstorm direction (§6) explicitly says one-off work should route to a generic-dev fallback. This ADR makes that fallback first-class, and decides whether it's on or off by default.

## Decision

The generic-dev fallback is **enabled by default** when `team.mode: fixed`.

```yaml
team:
  fallback:
    enabled: true        # default
    role: developer      # default; only `developer` supported in v1
    model: <inherits from defaults.model>
```

When enabled, the orchestrator pre-spawns one unspecialized developer alongside the declared specialists. Stories without a `domain:` field (or whose domain doesn't match any specialist) route to this fallback. The fallback teammate uses the same `developer.md` role doc as a specialist — only the spawn brief differs (no domain attached).

A user can disable the fallback (`team.fallback.enabled: false`) to enforce strict domain routing. When disabled in fixed mode, the validator emits a startup warning, and the `teamcreate-gate` hook denies any TeamCreate that would route via fallback (see ADR-008). The validator's warning explicitly tells the user what they've opted into.

## Alternatives considered

- **A. Fallback disabled by default; users opt in.** Rejected: the brainstorm's mid-epic decision tree (§7) sends one-off cross-cutting work to fallback. Disabling that path by default would make fixed mode hostile to common workflows the brainstorm documented as in-scope. Users would hit a deny on the first cross-cutting story and have to flip the switch — an annoying step that adds nothing.

- **B. No fallback concept; force every story to declare a domain.** Rejected: brittle. Backward-compat alone forbids it (existing stories don't have `domain:`). Even forward, it'd require fictional per-story domains for cross-cutting work — declaring a `domain: housekeeping` specialist that does whatever no-one else does is the fallback under another name, just less efficient.

- **C. Multiple fallback developers (`team.fallback.count: N`).** Rejected: a count carries no semantics (same critique as ADR-004 alternative A). If the project needs more parallelism for fallback-class work, that's a signal that some of that work has a real domain — declare it as a specialist.

- **D. Auto-promote a high-traffic fallback into a specialist.** Rejected: implicit roster mutation is exactly the kind of behavior fixed mode is supposed to avoid. Mid-epic injection (architecture.md §6.3) handles this case explicitly, with a decision-log entry.

- **E. Fallback uses a *different* role doc (e.g., `agents/generalist.md`).** Rejected: there is nothing meaningfully different about a domain-less developer's *role*. The behaviors (TDD, story-as-authority, halt-on-blocker) are identical. The only difference is the spawn brief, which is task-instance information. Adding a third role doc would force generator updates and create a "what's the difference" question with no good answer (see ADR-009 for the same logic applied to specialists).

## Consequences

**Positive**

- Default-on fallback means fixed mode is usable from day one with no awkward edge-case configuration.
- Backward-compat is automatic for stories without `domain:` — they route to fallback transparently.
- Disabling is supported but loud — users who want strict mode get a warning that matches their intent.
- The fallback uses the same `developer.md` template, so generator complexity stays at zero (see ADR-009).

**Negative**

- A project with `team.mode: fixed` always pays for one extra teammate at spawn time (the fallback) unless explicitly disabled. Cost: one more teammate alive across the session — measurable but small relative to specialist cost.
- The "fallback handles cross-cutting work" property concentrates context-load in the fallback dev. Over a long session this dev accumulates the same context-bloat fixed mode is supposed to avoid for specialists. Acceptable tradeoff: the brainstorm explicitly decided this, and the volume of true cross-cutting work tends to be small relative to per-domain work. If it becomes a problem, rotation (D-004 deferred backup plan) could target the fallback dev specifically without changing the core design.

**Forward-compatibility**

- The schema reserves `team.fallback.role` for future expansion (e.g., a generalist reviewer). v1 fixes it to `developer` and validates accordingly.
- A future "fallback rotation" (rotate the fallback dev at story boundaries to keep its context fresh) is a natural extension that doesn't change ADR-007.

## Verification

1. With `team.mode: fixed` and no `team.fallback` block specified, the loaded config has `fallback.enabled: true`, `fallback.role: 'developer'`.
2. With `team.fallback.enabled: false` and `team.mode: fixed`, the validator runs cleanly but emits the documented warning.
3. With fixed mode + fallback enabled, a story without `domain:` routes to the fallback teammate (orchestrator behavior verification).
4. With fixed mode + fallback disabled, the same story is rejected by the `teamcreate-gate` hook with a clear deny reason (see ADR-008).

## Referenced by

- `artifacts/design/architecture.md` §3.5, §8
- `artifacts/design/decisions/adr-008-teamcreate-gate-fixed-mode-enforcement.md`
- `utils/config.js` (post-implementation: defaults)
- `artifacts/context/decision-log.md` D-004

# ADR-004: `swarm.yaml` `team` block schema for wide-team specialization

**D-ID:** D-004 (parent strategic decision)
**Status:** Accepted (pending human approval of architecture.md)
**Date:** 2026-04-28
**Context:** Architecture design for wide-team specialization (Surface 1 of `artifacts/planning/brainstorm-wide-team-2026-04-28.md`)

## Context

D-004 adopted wide-team specialization as bmad-swarm's primary mechanism for bounding teammate context across long-running multi-story sessions. The architecture needs a way for users to declare the specialist roster: which domain-specialized devs should be pre-spawned, and whether a generic-dev fallback should run alongside them. This declaration must:

1. Be opt-in — no existing project should change behavior unless it migrates explicitly.
2. Be additive to `swarm.yaml` — no removed fields, no shape changes to existing fields.
3. Carry enough information for the orchestrator to spawn each specialist with a meaningful brief.
4. Compose with the existing per-agent `model:` and `enabled:` overrides without contradicting them.
5. Be machine-validated at load time (not deferred to runtime) — config errors should fail loudly at `bmad-swarm update` rather than at the moment a TeamCreate fires.

## Decision

Add a single optional top-level `team` block to `swarm.yaml`:

```yaml
team:
  mode: dynamic | fixed        # default: dynamic
  specializations:             # only meaningful when mode: fixed
    - role: developer | reviewer
      domain: <kebab-case-slug>
      description: <free-text>
      model: haiku|sonnet|opus|inherit  # optional; falls back to defaults.model
  fallback:
    enabled: true              # default true
    role: developer            # default
    model: <as above>          # optional
```

Validation (added to `utils/validator.js`):

1. `team.mode`, when present, must be `dynamic` or `fixed`.
2. When `team.mode === "fixed"`:
   - `team.specializations` must be non-empty.
   - Each `role` is `developer` or `reviewer` (v1 scope).
   - Each `domain` matches `^[a-z0-9][a-z0-9-]*[a-z0-9]$` and is unique across the array.
3. `team.fallback.enabled: false` in fixed mode is allowed but emits a startup warning.
4. The whole `team` block is optional. Absent → `mode = dynamic`, `specializations = []`, `fallback.enabled = true`. This is byte-for-byte the current behavior.

Defaults are applied in `utils/config.js:applyDefaults()`.

## Alternatives considered

- **A. Per-role replicas (`team.developers: 3`).** Express specialization as a count. Rejected: a count carries no domain semantics, so the orchestrator has nothing to route on. A bare count is functionally equivalent to "spawn 3 generic devs", which does not solve the bounded-context problem.

- **B. Specialists as full per-agent entries inside the existing `agents:` block** (e.g., `agents.developer-backend-auth: {...}`). Rejected: the existing `agents` block is keyed on role names that match `agents/*.md` files. Polluting it with synthetic role names that have no template file would break `getAgentNames()` validation (`utils/validator.js:54-57`) and confuse the agent-generator. Keeping specializations in a dedicated `team` block keeps the role-template surface clean.

- **C. Inline specializations under `methodology.phases.implementation`** (e.g., `parallel_devs.specializations: [...]`). Rejected: the team-shape concept transcends a single phase. A reviewer specialist has nothing to do with implementation phase; placing the schema there constrains future extensibility (e.g., specialist security reviewers, specialist devops).

- **D. Free-form `team.devs: ['backend-auth', 'frontend-dashboard']` array of bare slugs.** Rejected: too lossy. No place to hang `description`, `model` overrides, or future fields without a schema break. Structured objects from day one cost almost nothing.

- **E. External file (`team.yaml`) referenced from `swarm.yaml`.** Rejected: a third config file fragments the source of truth. The existing `swarm.yaml` already carries methodology, agents, and stack — team-shape belongs alongside.

## Consequences

**Positive**

- Existing projects experience zero behavior change. The block is absent → defaults apply → dynamic mode runs as before.
- The schema is rich enough for the routing logic in §6 of architecture.md without further extension.
- Validation runs at config load (`utils/config.js`), so misconfigurations surface at the next `bmad-swarm update` or session start, not at TeamCreate time.
- Per-specialist `model:` overrides ride on the existing per-agent model semantics — no new precedence rules.

**Negative**

- A small surface-area increase in `swarm.yaml`. Mitigated: the entire block is optional; the existing schema is unaffected.
- The `(role, domain)` uniqueness rule (instead of global domain uniqueness) is slightly more permissive than necessary for v1 but reserves room for specialist reviewers without a future schema break.

**Forward-compatibility**

- New roles can join the `role:` enum without breaking existing configs (e.g., adding `security` later is purely additive).
- New top-level fields under `team.` (e.g., `team.rotation` if D-004 deferred behavior is later activated) compose without disturbing `mode` and `specializations`.

## Verification

1. Validator unit tests cover every reject case in architecture.md §3.3.
2. An existing `swarm.yaml` (this repo's own) loads under the new validator without error.
3. A `swarm.yaml` with `team.mode: fixed` and empty `specializations` is rejected with the documented message.
4. Round-trip: write a `team` block, read it via `loadSwarmConfig`, verify the parsed structure matches input + applied defaults.

## Referenced by

- `artifacts/design/architecture.md` §3
- `utils/config.js` (post-implementation: `applyDefaults` patch)
- `utils/validator.js` (post-implementation: validation rules)
- `artifacts/context/decision-log.md` D-004

# Brainstorm: Wide-Team Specialization for bmad-swarm

**Date:** 2026-04-28
**Status:** Direction approved by user; ready for architecture phase
**Source:** Conversation between user and orchestrator on 2026-04-28

## Problem statement

Long-running TeamCreate teammates accumulate intra-session execution detail across many stories. A backend dev that built the login endpoint carries the full transcript of building it when it later works on upload. A reviewer that ran 400 tests carries all 400 test outputs when it later reviews unrelated code. The load-bearing summary ("login endpoint exists at X with surface Y") is much smaller than what the teammate retains, but there is no mechanism today to drop the rest while keeping the summary.

The user's stated usage pattern is **4-hour autonomous sessions where a single TeamCreate team handles multiple stories and projects in parallel**. Mechanisms that conflict with that pattern are out of scope.

## Approach decided: Wide-team specialization

Instead of one long-lived generic dev that handles many domains sequentially, **pre-spawn multiple domain-specialized devs** (e.g., `backend-login`, `backend-upload`, `backend-search`). Each is alive the whole session but only handles stories in its domain. Domain decomposition is grounded in the architecture document.

Bounded context per dev = bounded context per session. No reliance on `/clear`, `/compact`, sub-agent firewalls, or rotation.

## Direction set in brainstorm

These are the user's stated requirements and chosen direction. The architect formalizes the design and logs implementation-level ADRs.

1. **Opt-in via `swarm.yaml`.** Existing projects continue to work unchanged. New field declares specializations; absent = single generic dev (current behavior).
2. **Two team modes.**
    - `dynamic` (current): orchestrator sizes team per task using complexity scoring + entry points.
    - `fixed` (wide team): team is pre-spawned per `swarm.yaml`; orchestrator routes stories to specialists. Complexity scoring + entry-point tables continue to govern *autonomy*, but **not team sizing**, in fixed mode.
3. **Architect produces a domain map.** The architecture document grows by one section: a domain map naming the specialists the orchestrator should spawn. Decomposition is grounded in architecture, not orchestrator guesswork.
4. **Continuous reviewer is the consistency anchor.** Wide team relocates the long-context problem from N devs into one reviewer. Reviewer stays continuous across all specialists; their context is mostly referential. Reviewer's own context discipline is **out of scope** for this feature.
5. **Story routing via `domain:` field.** Stories gain an optional `domain:` field. Orchestrator routes by it. Stories without `domain:` route to a generic-dev fallback (preserves backward compat).
6. **Mid-epic injection logic.**
    - Best-fit routing to existing specialist: silent in `auto` mode.
    - Spawning a NEW specialist mid-epic: announce-then-proceed in `auto`, pause-and-ask in `guided`/`collaborative`.
    - Genuinely ambiguous fit (no clear specialist + unclear if new domain): pause regardless of mode.
    - One-off cross-cutting work: route to generic-dev fallback, do not grow the roster.
    - Heuristic for spawning a new specialist: domain has ≥2 expected stories, or is architecturally significant.
7. **Decision tree for incoming stories.**
    ```
    story arrives
    ├─ obvious specialist owner?       → route silently
    ├─ overlap between specialists?    → pick closest, flag reviewer
    ├─ no fit, looks one-off?          → generic dev fallback
    └─ no fit, looks like new domain?  → pause, propose specialist
    ```
8. **Team-shape decisions are auditable.** Every mid-epic specialist spawn writes a one-line entry to `decision-log.md` with a D-ID.

## Surfaces the architecture must address

1. **`swarm.yaml` schema additions.** Exact field name(s) and shape; how specializations are expressed (named list? per-role replicas?); validation rules; how the generic-dev fallback is configured.
2. **Story schema additions.** `domain:` field; validation; default behavior for stories without it; how the story engineer assigns it.
3. **Architect agent doc updates.** New "Domain map" deliverable spec; format; relationship to `architecture.md`.
4. **Orchestrator agent doc updates.** Team mode section; routing rules per autonomy mode; mid-epic injection decision tree; specialist-spawn discipline (≥2 story heuristic); explicit override of complexity-scoring/entry-point tables in `fixed` mode for sizing.
5. **`teamcreate-gate` hook extension.** In `fixed` mode, validate that the chosen role/specialist matches the story's domain — turns the routing rule into an enforced constraint. In-scope: hook design. Out-of-scope: implementation (developer's job).
6. **Backwards compatibility.** Explicit additive-only rule. Specifics for: existing projects mid-flight, story files without `domain:`, projects without specializations declared. No silent migrations.
7. **Init flow.** Does `bmad-swarm init` prompt about wide team? Default? Can the user retrofit later?
8. **Generators.** Implications for `agent-generator.js`, `settings-generator.js`, `claude-md-generator.js`, etc. Proposed default: per-specialist identity docs are NOT needed — specialization lives in the spawn brief, not the role doc; one `developer.md` role serves all specialists. Architect should confirm or override this with rationale.
9. **Decision-log conventions.** Schema for team-shape decision entries (when orchestrator spawns mid-epic).

## Out of scope (explicitly)

- Sub-agent delegation per story (rejected: loses long-running benefit).
- Rotation (deferred: kept in back pocket; not part of this feature).
- `/clear` or `/compact` mechanisms (rejected: non-deterministic about what survives).
- Reviewer's own context discipline (separate feature thread).
- Story memo files (separate feature thread).
- Linux-specific optimizations (separate feature thread).

## Constraints

- Strictly backward compatible. Existing projects must not change behavior unless they opt in.
- Opt-in only. No silent migration.
- Additive to `swarm.yaml` schema. No removed fields.
- The `orchestrator-write-gate` hook continues to enforce the delegate-everything rule.
- Human approval required before downstream phases (per project rules: prd, architecture).

## Acceptance criteria for the architecture phase

- `artifacts/design/architecture.md` written, addressing all 9 surfaces above.
- ADRs in `artifacts/design/decisions/` for at least:
    - `swarm.yaml` schema decision
    - Two-mode design (`dynamic` vs `fixed`)
    - Story `domain:` routing decision
    - Generic-dev fallback decision
    - `teamcreate-gate` enforcement decision
- Implementation roadmap section listing the order in which the developer should tackle stories.
- Backward compatibility section explicitly addressing existing-project scenarios.
- Reference D-004 (the strategic direction decision) as the parent decision this design implements.

## Reference

- D-004 (decision-log): adopt wide-team specialization for bmad-swarm.

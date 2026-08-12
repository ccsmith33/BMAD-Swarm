# ADR-008: `teamcreate-gate` hook enforcement in fixed mode

**D-ID:** D-004 (parent strategic decision)
**Status:** Accepted
**Date:** 2026-04-28
**Context:** Architecture design for wide-team specialization (Surface 5 of `artifacts/planning/brainstorm-wide-team-2026-04-28.md`)

## Context

In fixed mode, every TeamCreate must route to a specialist whose `(role, domain)` pair is declared in `swarm.yaml:team.specializations` — or to the generic-dev fallback when enabled. The brainstorm explicitly asked: should this routing rule be advisory (orchestrator-only convention) or enforced (hook-level deny)?

ADR-003 (the orchestrator-write-gate analog) established the precedent: invariants that are load-bearing for correctness, where prose-only enforcement has failed before, justify hook-level enforcement. The wide-team feature's whole value rests on bounded context per teammate. Routing a `backend-auth` story to a `frontend-dashboard` specialist silently corrupts that property — and "silent" is the operative word. Without a hook, the misroute would be invisible until a reviewer happened to notice the wrong specialist signed the work.

## Decision

Extend the existing `.claude/hooks/teamcreate-gate.cjs` with a second pass that activates only when `swarm.yaml:team.mode === "fixed"`. The pass:

1. Reads `swarm.yaml` from CWD at hook invocation. If unreadable or unparseable: pass through (fail-open).
2. If `team.mode !== "fixed"`: pass through.
3. Otherwise, parses the `team:` array from the matched `bmad-assembly` block (Pass 1 already extracted it). For each entry:
   - **Specialized roles (`developer`, `reviewer`)** with a `domain:` sub-field: must match a `(role, domain)` pair in `team.specializations`. If matched: accept.
   - **Specialized roles without a `domain:` sub-field**: accept ONLY if `team.fallback.enabled === true` AND `team.fallback.role === role`. Otherwise: deny.
   - **Unspecialized roles** (`orchestrator`, `architect`, `strategist`, `ideator`, `researcher`, `security`, `devops`): pass through.
4. On deny, emits the existing deny envelope shape with a specific reason: `Blocked: team mode is "fixed" but the team[] entry "<role> domain=<domain>" does not match any declared specialist in swarm.yaml:team.specializations and fallback is disabled. Either declare the specialist or set team.fallback.enabled: true.`

The hook is **fail-open** — any error reading `swarm.yaml` (missing, malformed YAML, IO error) skips the new check entirely. Consistent with the existing hook's framing in its header comment ("This is a shape check, not an authorization boundary.").

## Why fail-open here

Two hooks coexist in this repo with different postures:

- **`orchestrator-write-gate.cjs` is fail-closed** (effectively): it's the structural enforcement of an invariant that the security/quality model depends on (decision traceability, adversarial review). ADR-003 reasoned through that posture.
- **`teamcreate-gate.cjs` is fail-open**: its job is shape-checking and routing-checking. A misconfigured project shouldn't be hard-blocked from running. Worst case if the hook misbehaves: a routing mismatch slips past, the reviewer catches it, the orchestrator self-corrects.

ADR-008 inherits the existing hook's posture rather than promoting routing to a security-critical concern. Routing failures are correctness issues, not security issues; the reviewer is a sufficient backstop.

## Alternatives considered

- **A. Advisory only — orchestrator self-policing in prose.** Rejected: the brainstorm explicitly asked for enforcement, and the precedent from ADR-003 (HARN-1: "prose-only enforcement has failed before") applies. The cost of the hook (one YAML read per TeamCreate, well under 50ms) is trivial compared to the cost of a silent misroute.

- **B. Fail-closed when `swarm.yaml` is unreadable.** Rejected: a transient IO error or a user mid-edit on `swarm.yaml` would brick the entire session. The user's last-edit-not-yet-saved state is too common to fail on. Fail-open with a soft warning (not implemented in v1, candidate for follow-up) is the right balance.

- **C. Validate at orchestrator-side only via pre-spawn check (no hook).** Rejected: the orchestrator runs as an LLM session and can be wrong about its own state. Hook validation is a separate observer that can't be argued out of by clever prompting. Same logic as ADR-003.

- **D. Validate the entire `team[]` shape including unspecialized roles.** Rejected: scope creep. Unspecialized roles route normally — the new check is specifically for the wide-team semantics. Existing Pass 1 (required-keys check) already validates the envelope shape.

- **E. Validate `domain:` field in stories at hook time.** Rejected: the hook fires on TeamCreate, not on story file changes. Story-domain validation is a reviewer concern (architecture.md §4.5). The hook validates the routing decision, not the routing input.

- **F. Add a new dedicated hook (`fixed-mode-routing-gate.cjs`) instead of extending `teamcreate-gate.cjs`.** Rejected: both checks fire on the same event (PreToolUse on TeamCreate) and read the same payload. Splitting them would mean two hook invocations per TeamCreate, doubled IO, and split error reporting. Extending the existing hook keeps the surface coherent.

## Consequences

**Positive**

- Misroutes are caught at the moment they would happen, with an actionable error message that the orchestrator reads from the deny envelope.
- The existing fail-open posture is preserved — projects with malformed config don't get hard-blocked.
- Dynamic-mode projects see zero behavior change (Pass 2 is gated on `mode === "fixed"`).
- Performance impact is bounded: one YAML read per TeamCreate, no new dependencies if a small inline parser is used.

**Negative**

- The hook now needs to read `swarm.yaml` (was transcript-only before). Adds an IO call per TeamCreate. Mitigated: file is small (<5KB typical), can be cached per process if perf becomes a concern.
- A new dependency on `js-yaml` is possible if the developer chooses (existing utils already use it). Tactical decision left to the implementer.
- Two-pass logic in one hook is more complex than one-pass. The header comment must be extended to document Pass 2's purpose, and tests must cover both passes' interactions.

**Forward-compatibility**

- A future role addition (e.g., `security` becoming specializable) is a one-line enum extension in the validator + hook.
- If routing semantics later need to consider story metadata (e.g., enforcing that the bmad-assembly's team[].domain matches the story's `## Domain:`), the hook can be extended without breaking ADR-008's structure. v1 does not do this — the orchestrator owns the story-to-team correlation, and the hook validates the team-to-config correlation.

## Verification

Hook test cases (added to `test/hooks.test.js` per architecture.md §13 Story 5):

1. `team.mode: dynamic` (or absent) — Pass 2 is skipped; Pass 1 behavior unchanged.
2. `team.mode: fixed`, valid bmad-assembly with matching `(role, domain)` entries — pass.
3. `team.mode: fixed`, bmad-assembly with developer entry whose `domain` is not declared, fallback disabled — deny with the documented reason.
4. `team.mode: fixed`, bmad-assembly with developer entry without `domain:`, fallback enabled — pass.
5. `team.mode: fixed`, bmad-assembly with developer entry without `domain:`, fallback disabled — deny.
6. Malformed `swarm.yaml` (parse error) — pass through (fail-open).
7. Missing `swarm.yaml` — pass through (fail-open).
8. Mixed team with specialist + non-specialist roles (architect, security) — non-specialist roles pass through unconditionally.

## Referenced by

- `artifacts/design/architecture.md` §7
- `artifacts/design/decisions/adr-007-generic-dev-fallback-default-on.md`
- `generators/hooks-generator.js:generateTeamCreateGateHook` (post-implementation: extension)
- `.claude/hooks/teamcreate-gate.cjs` (post-implementation: regenerated)
- `test/hooks.test.js` (post-implementation: new cases)
- `artifacts/context/decision-log.md` D-004

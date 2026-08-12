# Architecture: Wide-Team Specialization for bmad-swarm

**Status:** Approved (human, 2026-04-29)
**Scope:** delta
**Date:** 2026-04-28
**Parent decision:** D-004 (adopt wide-team specialization architecture)
**Source brainstorm:** `artifacts/planning/brainstorm-wide-team-2026-04-28.md`

---

## 1. Overview

This document specifies the technical design for **wide-team specialization** — a new team-shape mode that lets bmad-swarm pre-spawn multiple domain-specialized teammates (e.g., `developer-backend-login`, `developer-backend-upload`) instead of recycling one generic developer across many domains. Each specialist is alive for the entire session but only handles stories within its domain. The result is bounded context per teammate, which translates into bounded context per session — addressing the long-context pain D-004 was created to solve, without abandoning the long-running multi-story workflow that the user explicitly values.

### 1.1 Goals (in scope)

1. Two coexisting team modes: `dynamic` (current behavior) and `fixed` (wide team).
2. Opt-in via `swarm.yaml`. Existing projects unchanged unless they migrate.
3. Architect produces a **domain map** as a section in `architecture.md` that grounds the orchestrator's specialist roster.
4. Story files gain an optional `domain:` field for routing.
5. Orchestrator's routing rules + mid-epic injection decision tree are explicit.
6. `teamcreate-gate` hook enforces domain-routing when fixed mode is active.
7. Strictly backward-compatible. Additive schema only. No silent migrations.

### 1.2 Non-goals (explicitly out of scope)

- Sub-agent delegation per story.
- Rotation at epic boundaries (deferred — kept as escape hatch).
- `/clear` or `/compact` mechanisms.
- Reviewer's own context discipline (separate feature thread).
- Story memo files.
- Linux-specific optimizations.

### 1.3 Context boundary (what changes vs. what stays)

| Surface | Stays the same | Changes |
| --- | --- | --- |
| Orchestrator never edits code | Yes | — |
| `bmad-assembly` block before every TeamCreate | Yes | — |
| Default model is opus | Yes | — |
| Complexity scoring + entry-point team-sizing | In dynamic mode only | Disabled for sizing in fixed mode (still drives autonomy) |
| `orchestrator-write-gate` hook semantics | Yes | — |
| `teamcreate-gate` hook | — | Extended with domain-match validation in fixed mode |
| `swarm.yaml` | — | New optional `team` block with `mode` + `specializations` |
| Story schema | — | New optional `domain:` field |
| Architect's `architecture.md` | — | New §"Domain Map" deliverable |
| Generators | — | One `developer.md` template still serves all specialists; specialization injected via spawn-prompt only |

---

## 2. Domain map (concept)

A **domain** is a coherent slice of the codebase or product that warrants its own bounded execution context. Examples in a typical web app: `backend-auth`, `backend-upload`, `backend-search`, `frontend-dashboard`, `data-migration`. The architect identifies domains by reading the PRD and partitioning the architecture's components into clusters where:

- Stories within the cluster share a substantial code surface (same modules, same data model nodes, same library set).
- Stories across clusters do not — work in cluster A rarely touches cluster B's files in a meaningful way.
- The cluster has ≥2 anticipated stories OR is architecturally significant (e.g., cross-cutting framework).

A **specialist** is a teammate (developer or, optionally, reviewer) that is pre-spawned with a domain assignment. The orchestrator routes stories to specialists by matching the story's `domain:` field to a specialist's declared domain. There is exactly one role-template (`developer.md`) per role; specialization lives in the spawn brief, not in a per-specialist role file (see §9 for rationale).

The **generic-dev fallback** is a teammate spawned without a domain assignment. It handles stories with no `domain:` field, one-off cross-cutting work, and any story whose domain is not represented in the current roster. It is the safety valve that preserves backward compatibility — projects without `team.specializations` declared run with a single generic dev (current behavior).

---

## 3. Surface 1 — `swarm.yaml` schema additions

### 3.1 New top-level `team` block

```yaml
team:
  mode: dynamic | fixed        # default: dynamic
  specializations:             # only meaningful when mode: fixed
    - role: developer          # the role template to spawn (developer | reviewer)
      domain: backend-login    # required when role is specialized
      description: >           # optional, free-text — passed into spawn brief
        Authentication endpoints, session management, OAuth integrations.
      model: opus              # optional override; falls back to defaults.model
  fallback:
    enabled: true              # default: true — generic dev for unrouted stories
    role: developer            # fallback always uses the unspecialized role doc
    model: opus                # optional override
```

### 3.2 Field semantics

| Field | Type | Default | Required when | Notes |
| --- | --- | --- | --- | --- |
| `team.mode` | `"dynamic"` \| `"fixed"` | `"dynamic"` | always (defaulted) | controls orchestrator team-sizing behavior |
| `team.specializations` | array | `[]` | `mode: fixed` (must be non-empty) | declares the pre-spawn roster |
| `specializations[].role` | string | — | yes when item present | must be `developer` or `reviewer` (v1 scope; extensible) |
| `specializations[].domain` | string (slug) | — | yes when item present | unique across the array; matches the story `domain:` field |
| `specializations[].description` | string | `""` | no | free-text; included verbatim in spawn brief |
| `specializations[].model` | enum | `defaults.model` | no | inherits per-agent override semantics |
| `team.fallback.enabled` | boolean | `true` | no | whether to spawn a generic-dev as safety valve |
| `team.fallback.role` | string | `"developer"` | no | currently fixed to `developer`, schema reserves room |
| `team.fallback.model` | enum | `defaults.model` | no | — |

### 3.3 Validation rules (added to `utils/validator.js`)

1. `team.mode`, when present, must be one of `dynamic` | `fixed`. Other values reject with: `team.mode "<v>" is invalid. Valid options: dynamic, fixed`.
2. If `team.mode === "fixed"`:
   - `team.specializations` must be a non-empty array, otherwise: `team.mode is "fixed" but team.specializations is empty — declare at least one specialist or set mode: dynamic`.
   - Each `specializations[i].role` must be one of `developer` | `reviewer`. (v1 limit; extending to security/devops is a follow-up.)
   - Each `specializations[i].domain` must be a non-empty slug matching `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (kebab-case, no leading/trailing hyphen). Domain slugs are also story-routable identifiers, so they must be filesystem-safe.
   - Domain values must be unique across the `specializations` array.
3. `team.fallback.enabled`, when `false` and `team.mode === "fixed"`, is allowed but emits a startup warning (not an error): "fallback disabled in fixed mode — stories without a matching specialist will fail validation at spawn time".
4. Models inherit per-agent override semantics; values must be one of `haiku | sonnet | opus | inherit` (consistent with existing per-agent `model:` validation).
5. The entire `team` block is optional. Absent `team` block → `team.mode = dynamic`, `team.specializations = []`, `team.fallback.enabled = true`. This is the backward-compatible path: no existing project sees behavior change.

### 3.4 Defaults and inheritance

Defaults live in `applyDefaults()` in `utils/config.js`:

```javascript
config.team = config.team || {};
config.team.mode = config.team.mode || 'dynamic';
config.team.specializations = config.team.specializations || [];
config.team.fallback = config.team.fallback || {};
if (config.team.fallback.enabled === undefined) config.team.fallback.enabled = true;
config.team.fallback.role = config.team.fallback.role || 'developer';
```

### 3.5 Generic-dev fallback configuration (explicit)

The generic-dev fallback is **on by default** even in `mode: fixed`. Rationale: cross-cutting one-off work is common and should not require declaring a specialist for it. Disabling fallback (`team.fallback.enabled: false`) is supported for projects that want strict domain enforcement, but emits the warning above. See ADR-007.

### 3.6 Worked example

```yaml
team:
  mode: fixed
  specializations:
    - role: developer
      domain: backend-auth
      description: OAuth2/PKCE flow, session storage, password reset endpoints.
    - role: developer
      domain: backend-upload
      description: File ingestion pipeline, S3 adapters, virus-scan integration.
    - role: developer
      domain: frontend-dashboard
      description: React dashboard pages, charts, real-time websocket UI.
    - role: reviewer
      domain: backend-auth
      description: Reviewer dedicated to auth/security stories. (Optional — reviewer continuity is the consistency anchor by default.)
  fallback:
    enabled: true
```

---

## 4. Surface 2 — Story schema additions

### 4.1 New optional `domain:` field

The story schema (`methodology/artifact-schemas/story.md`) gains an optional frontmatter field, declared near the top of the story file:

```markdown
# Story X.Y: [Story Title]

## Status: [draft | ready | in-progress | review | complete]
## Domain: backend-auth     <-- NEW, optional, free-text slug

## User Story
...
```

### 4.2 Field semantics

| Property | Value |
| --- | --- |
| Type | string (kebab-case slug, same regex as `team.specializations[].domain`) |
| Required | no — story is valid with or without it |
| Default | `""` (treated as "no domain — route to fallback") |
| Set by | story-engineer at story creation; architect during domain map review; orchestrator during routing if missing |

### 4.3 Default behavior (no `domain:` field)

A story without `## Domain:` is **not invalid**. It routes to the generic-dev fallback in fixed mode and is unaffected in dynamic mode. This is the explicit backward-compat path: every existing story file continues to work as-is.

### 4.4 How the story-engineer assigns it

Upstream of this design, the story-engineer (when present) reads the architecture's domain map and assigns each story's `domain:` to match one of the declared specialists. If no specialist exists for the story's natural domain, the story-engineer leaves the field unset (router treats this as "fallback or new specialist" — see §6 decision tree).

### 4.5 Validation

- The `domain:` slug, when present, must match `^[a-z0-9][a-z0-9-]*[a-z0-9]$`.
- It does **not** have to match a declared specialist — the routing layer handles mismatches at TeamCreate time (see §7 hook).
- The reviewer audits the field for consistency during review (advisory finding only, not blocking).

### 4.6 Schema doc updates (deliverable)

`methodology/artifact-schemas/story.md` gains a new section "Domain (optional)" between "Status" and "User Story" sections, mirroring §4.1–§4.5 above. This is a documentation-only edit; no code changes required.

---

## 5. Surface 3 — Architect agent doc updates

### 5.1 New deliverable: Domain Map

The architect's Outputs (in `agents/architect.md`) gains a new bullet under "Architecture document":

> **Domain map section** (`§Domain Map` in `architecture.md`): a list of named domains, each describing the cluster of components/stories it covers. Used by the orchestrator to seed `swarm.yaml:team.specializations`. Mandatory only when the project intends to use `team.mode: fixed`; recommended for any project larger than ~10 stories regardless of mode (it makes story-routing explicit even in dynamic mode).

### 5.2 Domain map format (architect produces)

A single section in `architecture.md`:

```markdown
## Domain Map

| Domain | Description | Components | Anticipated stories |
| --- | --- | --- | --- |
| backend-auth | OAuth2/PKCE, sessions, password flows | `src/auth/*`, `src/middleware/auth-*` | ~5 (login, signup, password reset, token refresh, logout) |
| backend-upload | File ingestion, S3, virus scan | `src/upload/*`, `src/services/storage.js` | ~3 |
| frontend-dashboard | React dashboard pages | `web/src/pages/dashboard/*` | ~4 |
```

Heuristics the architect applies (documented in `agents/architect.md`):

1. **≥2-story rule**: a domain merits its own specialist when ≥2 stories are anticipated within it. Single-story slices are absorbed into a broader domain or routed via fallback.
2. **Architecturally-significant exception**: a single-story slice may justify its own domain if it touches a critical surface (e.g., security boundary, data-model migration, public API contract). Architect notes the rationale in the domain row.
3. **Cross-cutting dependencies**: when stories span domains (e.g., "add audit log everywhere"), prefer routing them to fallback rather than picking one specialist. Architect calls this out explicitly in the map.
4. **Orthogonality test**: two domains should ideally not need to coordinate inside a single story. If they do, the boundary is wrong — re-cut.

### 5.3 Architect's behavioral rule update

Add to `agents/architect.md` Behavioral Rules:

> **Produce a domain map when the project uses fixed-mode wide team.** Read `swarm.yaml:team.mode`. If `fixed`, the domain map section is mandatory and feeds `swarm.yaml:team.specializations`. If `dynamic`, the section is optional but recommended for projects with >10 anticipated stories. Domain decomposition follows the ≥2-story heuristic (see §Domain Map heuristics in this doc).

### 5.4 Quality criteria addition

Architect's quality checklist gains: "If `team.mode: fixed`, every domain in the map has at least one specialist declared in the proposed `swarm.yaml:team.specializations`, and every `specializations[].domain` corresponds to a row in the map."

---

## 6. Surface 4 — Orchestrator agent doc updates

### 6.1 New section: Team Mode

Add to `agents/orchestrator.md` a new section after "Entry points":

> **## Team mode**
>
> The team-shape mode is governed by `swarm.yaml:team.mode`.
>
> - `dynamic` (default): use the complexity-scoring + entry-point tables to size the team per task. Current behavior.
> - `fixed`: the roster is pre-spawned per `swarm.yaml:team.specializations`. Complexity scoring and entry-point tables continue to govern **autonomy** (e.g., score ≥12 promotes auto→guided), but **not team sizing** — sizing is the static specialist roster plus optional generic-dev fallback. Entry-point tables continue to inform what KIND of work happens (e.g., `bug-fix` skips Definition/Design); they no longer pick which agents run.

### 6.2 Routing rules per autonomy mode

In fixed mode, the orchestrator routes incoming stories using this decision tree (mirrors brainstorm §7):

```
story arrives, team.mode = fixed
├─ story.domain is set AND matches a specialist  → route silently to that specialist
├─ story.domain is set AND no matching specialist → see §6.3 (mid-epic injection)
├─ story.domain unset, looks like one-off       → route to generic-dev fallback
├─ story.domain unset, looks domain-aligned     → see §6.3 (mid-epic injection)
└─ story.domain matches multiple specialists    → pick closest by description, flag reviewer
```

### 6.3 Mid-epic injection decision tree

When a story arrives that does not have an obvious specialist owner, the orchestrator decides whether to spawn a NEW specialist mid-epic or use the fallback. The decision tree (full version of brainstorm §6):

```
no clear specialist exists, decide spawn-vs-fallback:
├─ ≥2 anticipated stories in this new domain visible in the backlog
│   AND domain is architecturally significant
│   → SPAWN new specialist
│       ├─ autonomy=auto         → announce-then-proceed (single-line announcement)
│       ├─ autonomy=guided       → pause-and-ask, present options
│       └─ autonomy=collaborative → pause-and-ask, present options
├─ 1 story only, no follow-on visible
│   → ROUTE TO FALLBACK (do not grow roster)
└─ ambiguous fit (no clear specialist + unclear if new domain)
    → PAUSE regardless of autonomy mode
```

### 6.4 Specialist-spawn discipline (≥2 story heuristic)

Add to orchestrator behavioral rules:

> **Do not grow the specialist roster for one-off work.** A new specialist is spawned only when ≥2 stories are anticipated in its domain OR the domain is architecturally significant (e.g., crosses a security boundary, owns a public API). One-off cross-cutting work routes to the generic-dev fallback. This prevents the roster from sprawling into ad-hoc fragments.
>
> **Every mid-epic spawn writes a one-line decision-log entry.** When you spawn a new specialist mid-epic, log to `artifacts/context/decision-log.md` as a tactical decision: `D-NNN — <date> — Spawned <specialist-domain> mid-epic — <one-line reason>`. See §11 for full convention.

### 6.5 Fixed-mode override of complexity-scoring/entry-point tables

Add to orchestrator behavioral rules:

> **In fixed mode, do not let the complexity table or entry-point table change team size.** Both tables still inform autonomy override (e.g., complexity ≥12 promotes auto→guided) and phase-skipping (e.g., `bug-fix` entry skips Definition/Design). They do NOT pick the agents to spawn. The agents are the static roster declared in `swarm.yaml:team.specializations` plus the optional fallback. Use the tables for orchestration decisions other than sizing.

### 6.6 Bmad-assembly block in fixed mode

The `bmad-assembly` block schema is unchanged, but the `team:` field's contents shift in fixed mode:

```bmad-assembly
entry_point: small-feature
complexity: 8
autonomy: auto
team:
  - role: developer
    domain: backend-auth          # NEW: domain present in fixed mode
    model: opus
  - role: reviewer
    lenses: [code-quality, security]
    model: opus
rationale: routing story 1.3 to backend-auth specialist (matches story.domain)
```

The `domain:` sub-field on a `team[]` entry is the wire-format expression of the routing decision. The `teamcreate-gate` hook reads it (see §7).

---

## 7. Surface 5 — `teamcreate-gate` hook extension

### 7.1 Goal

In `team.mode: fixed`, validate that every `team[]` entry in the `bmad-assembly` block whose role is specialized (developer/reviewer with a `domain:` field) corresponds to a declared specialist in `swarm.yaml:team.specializations`, OR is the fallback role. Refuse the TeamCreate call otherwise.

### 7.2 Why turn this into an enforced constraint

The routing rule is correctness-critical: routing a backend-auth story to a frontend-dashboard specialist would silently corrupt the bounded-context property the whole feature exists to provide. Prose-only enforcement has failed for similar invariants (see ADR-003 for the orchestrator-write-gate analog). Hook-level enforcement keeps the design honest.

### 7.3 Hook design

The existing `teamcreate-gate.cjs` already parses the transcript and validates the `bmad-assembly` block's required keys. We extend it with a second pass that activates only when `swarm.yaml:team.mode === "fixed"`:

1. **Read `swarm.yaml`** at hook start (cwd-relative path; cache parse result per process). Fail open if absent or unparseable (consistent with existing fail-open posture).
2. **Skip the new check** when `team.mode !== "fixed"` — pure pass-through for dynamic-mode and pre-feature projects.
3. **Parse the `team:` array** from the matched `bmad-assembly` block (already extracted by Pass 1). For each entry:
   - If `role` is `developer` or `reviewer` and the entry has a `domain:` sub-field, look it up in `team.specializations`. Match requires `(role, domain)` pair to exist.
   - If `role` is `developer` and no `domain:` sub-field, accept ONLY if `team.fallback.enabled === true` AND `team.fallback.role === role`. Otherwise deny.
   - If `role` is one of the unspecialized roles (`orchestrator`, `architect`, `strategist`, `ideator`, `researcher`, `security`, `devops`), pass through.
4. **Deny shape**: when the check fails, emit the existing deny envelope with a specific reason: `Blocked: team mode is "fixed" but the team[] entry "<role> domain=<domain>" does not match any declared specialist in swarm.yaml:team.specializations and fallback is disabled. Either declare the specialist or set team.fallback.enabled: true.`
5. **Fail-open posture preserved**: any error reading `swarm.yaml` (missing, malformed YAML, IO error) → skip the new check entirely, pass through. Consistent with the existing hook's "shape check, not authorization boundary" framing in its header comment.

### 7.4 Why fail-open

This hook is a guardrail, not a security boundary. The orchestrator-write-gate is the security-critical hook (D-003). The teamcreate-gate's job is to catch obvious wiring mistakes — same as the existing required-keys check. A misconfigured project should not be hard-blocked from running by this hook; the worst case is a wider routing surface, which the reviewer catches. See ADR-008.

### 7.5 Error path observability

The existing hook prints `permissionDecisionReason` to the deny envelope, which surfaces in the orchestrator's tool-result feedback. The new deny path uses the same channel — so a misrouted TeamCreate gets a clear, actionable error message that the orchestrator can read and self-correct.

### 7.6 Out of scope for this design surface

- Implementation of the hook (developer task — see §13 roadmap).
- Caching strategy for `swarm.yaml` parse across hook invocations within one session (developer's call).
- Test plan (covered by quality-standards.md test requirements).

---

## 8. Surface 6 — Backwards compatibility

### 8.1 Compatibility guarantees

This feature is **strictly additive**. Every existing project continues to work without changes:

| Scenario | Behavior |
| --- | --- |
| Project has no `team` block in `swarm.yaml` | `team.mode = dynamic`, `specializations = []`, `fallback.enabled = true`. Identical to current behavior. |
| Project has stories without `domain:` field | Stories validate; orchestrator behavior unchanged in dynamic; routes to fallback in fixed. |
| Project upgrades the bmad-swarm package without opting in | No prompts, no migrations, no surprises. |
| Project opts in via `team.mode: fixed` but has no domain map yet | `swarm.yaml` validation **rejects** at parse time with: "team.mode is fixed but team.specializations is empty". Loud failure; user must declare specialists first. |
| Project has stories with `domain:` and switches back to dynamic | `domain:` field is silently ignored by the dynamic-mode router. No story-file edits required. |

### 8.2 Mid-flight project scenarios

A "mid-flight" project is one with in-progress stories, an open epic, or active teammates. These are handled as follows:

1. **Schema additions are additive**: new fields default to absent/false; existing config and story files load unchanged.
2. **No automatic migration of existing stories**: stories created before this feature lack `domain:`; they continue to route to fallback in fixed mode. Backfilling `domain:` is a manual story-engineer task.
3. **No automatic migration of existing `swarm.yaml`**: even when the bmad-swarm package is updated, no `team` block is injected. The user must add it explicitly to opt in.
4. **`bmad-swarm update` regeneration**: the generators do not synthesize a `team` block. They only regenerate `.claude/`-tree files. Existing project's behavior is preserved.

### 8.3 Init-flow contract

`bmad-swarm init` does NOT prompt for wide-team specifics. The wide-team setup is a deliberate, post-init action — see §9 init-flow design.

### 8.4 No silent migrations — explicit principle

The `_bmadGenerated` hash mechanism (D-001-adjacent, file-modification detection in `utils/fs-helpers.js`) already protects user-edited generated files from clobber. This feature respects that boundary: the generators do not edit user-owned files (`swarm.yaml`, story files) under any circumstance. Migration is opt-in and manual.

---

## 9. Surface 7 — Init flow

### 9.1 Decision: don't prompt during init

`bmad-swarm init` does **not** ask "do you want a wide team?". Rationale:

- Wide-team specialization needs a domain map to be useful, and the domain map needs an architecture, which needs a PRD. None of those exist at `init` time.
- Prompting at init forces a decision when the user has the least information.
- Adding a third decision to init (after project type, autonomy) bloats the flow.

Instead, the wide-team opt-in is a **post-architecture** action: once the architect has produced a domain map, the user (or orchestrator in auto mode) edits `swarm.yaml` to add the `team` block.

### 9.2 Retrofit path for existing projects

Documented in the README and CLAUDE.md template addendum:

> To opt in to wide-team specialization for an existing project:
>
> 1. Ensure `artifacts/design/architecture.md` includes a Domain Map section. Run `/feature` or `/plan` and ask the architect to add it if missing.
> 2. Edit `swarm.yaml` to add a `team` block (`mode: fixed`, list specializations matching the domain map).
> 3. Optionally update existing story files to include a `## Domain:` field, matching one of the declared specialists.
> 4. On the next session, the orchestrator will use fixed-mode routing.

No CLI command is added for this retrofit; it is a documented manual edit. (A `bmad-swarm migrate-to-fixed` command is a candidate follow-up but is out of scope for this feature.)

### 9.3 Init-flow code change scope

`cli/init.js`: no change required. The new `team` block is optional and applies defaults via `applyDefaults()`. Init writes a `swarm.yaml` without it; everything keeps working.

---

## 10. Surface 8 — Generator implications

### 10.1 Confirmation: ONE `developer.md` per role; specialization in spawn brief only

The brainstorm proposed and this architecture **confirms**: there is exactly one `developer.md` template (and one `reviewer.md` template). Specialization is expressed via the spawn-prompt brief and the `bmad-assembly` `team[].domain` field — not via per-specialist `.md` files. Rationale (full ADR-009):

1. **No template multiplication**: N specialists do not require N role files. The role doc describes *role behavior* (TDD, halt-on-blocker, story-as-authority); the *domain* is task-instance information.
2. **Generator simplicity preserved**: `agent-generator.js` continues to walk `agents/*.md` and emit `.claude/agents/*.md`. No per-domain enumeration. No new "specialist" template type.
3. **Eject mechanism unaffected**: ejecting `developer.md` (full replacement override) continues to work; it just affects every specialist that spawns from that role.
4. **The spawn brief carries domain context**: the orchestrator's TeamCreate prompt embeds the domain name, the description from `swarm.yaml:team.specializations[i].description`, and the relevant slice of the architecture's domain map. This is sufficient context — much like how lenses are passed via spawn args today, not via per-lens role files.

### 10.2 Generator changes required

| Generator | Change | Reason |
| --- | --- | --- |
| `agent-generator.js` | None | role files unchanged |
| `claude-md-generator.js` | Optional one-line addition documenting `team.mode` if set, else nothing | informational only |
| `settings-generator.js` | None | hook configuration unchanged |
| `hooks-generator.js` | Patch `generateTeamCreateGateHook()` to add the §7 logic | the hook script change |
| `commands-generator.js` | None | slash commands unchanged |
| `rules-generator.js` | None | rules unchanged |
| `github-actions-generator.js` | None | unchanged |

### 10.3 `utils/config.js` changes

- `applyDefaults()`: add the `team` block defaults from §3.4.
- `getAgentNames()`: unchanged (no new role files).
- A new helper `getTeamConfig(config)` that returns a normalized view of `team` — exported for use by the hook code.

### 10.4 `utils/validator.js` changes

Add the validations from §3.3.

### 10.5 No new dependencies

The hook reads YAML using a small inline parser (or, if the cost of a parse-on-every-hook-call is acceptable, requires `js-yaml` like `utils/config.js` does). Implementation choice is a tactical decision deferred to the developer (logged at story time).

### 10.6 CLI implications

`cli/update.js` regenerates the hook scripts from templates; the regenerated `teamcreate-gate.cjs` will pick up the new logic on the next `bmad-swarm update`. No new CLI surface required.

`cli/init.js`: no change.

A future `bmad-swarm doctor` command (out of scope) could surface mismatches between domain map and `team.specializations`. Not part of this feature.

---

## 11. Surface 9 — Decision-log conventions

### 11.1 Schema for team-shape decisions

Mid-epic specialist spawns produce a one-line tactical entry in `artifacts/context/decision-log.md`:

```markdown
## D-NNN — Spawned <role>-<domain> mid-epic
- Date: YYYY-MM-DD
- Source: orchestrator (auto) | orchestrator (after human approval)
- Reason: <one sentence — what triggered the spawn>
```

For decisions where `autonomy ≠ auto` and the spawn was paused-and-asked, the `Source` field carries the human ack, e.g., `human via orchestrator (guided)`.

### 11.2 Schema for `team.mode` toggles

Switching a project from `dynamic` to `fixed` (or vice versa) is a strategic decision (changes the team-shape model, cross-cuts orchestrator behavior). Full record:

```markdown
## D-NNN — Switched team.mode to fixed
- Date: YYYY-MM-DD
- Classification: Strategic
- Source: human
- Rationale: <one paragraph>
- Affects: ARCH:domain-map, swarm.yaml, Stories:*-*
- Status: accepted
- ADR: artifacts/design/decisions/adr-NNN-...
- Referenced by: <files>
```

### 11.3 Reviewer audit hook

The reviewer's existing decision-log audit (see `agents/reviewer.md` "Audit the decision log") extends naturally to team-shape entries. No reviewer-doc edit is required for v1; if mid-epic-spawn cadence becomes an issue, future iterations can add a specific check (advisory — flag if >5 mid-epic spawns in one epic).

---

## 12. Component diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ swarm.yaml                                                       │
│   team:                                                          │
│     mode: fixed                                                  │
│     specializations: [{role, domain, ...}, ...]                  │
│     fallback: { enabled, role, ... }                             │
└─────┬────────────────────────────────────────────────────────────┘
      │ loaded via utils/config.js (applyDefaults + validator)
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ Orchestrator (agents/orchestrator.md)                            │
│   - reads team.mode at session start                             │
│   - in fixed: pre-spawn roster from team.specializations         │
│   - routes incoming story by story.domain → specialist           │
│   - mid-epic injection per §6.3 decision tree                    │
│   - emits bmad-assembly with team[].domain entries               │
└─────┬────────────────────────────────────────────────────────────┘
      │ TeamCreate(role, domain, ...)
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ teamcreate-gate.cjs (.claude/hooks/)                             │
│   Pass 1 (existing): bmad-assembly key shape check               │
│   Pass 2 (NEW):     fixed-mode domain-routing check              │
│     - reads swarm.yaml, validates each team[].domain matches     │
│       a declared specialist OR fallback                          │
└─────┬────────────────────────────────────────────────────────────┘
      │ pass → TeamCreate proceeds
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ Specialist teammate session                                      │
│   - identity loaded from /identity-developer (unchanged)         │
│   - spawn brief includes:                                        │
│       * domain name + description (from swarm.yaml)              │
│       * relevant architecture slice (orchestrator-curated)       │
│       * the story file (story.domain matches)                    │
│   - context bounded to the domain across the whole session       │
└──────────────────────────────────────────────────────────────────┘
```

Story files are the routing key:

```
artifacts/implementation/stories/story-A-LOGIN-1.md
   ## Domain: backend-auth
        │
        └──► orchestrator routes to specialist with (role=developer, domain=backend-auth)
```

---

## 13. Implementation roadmap

The implementation is naturally divisible into seven story-sized chunks. They should be tackled in this order; later stories depend on earlier ones. Each is a candidate story for the story-engineer to draft post-approval.

### Story sequence

1. **Story 1: `swarm.yaml` schema + validator additions.**
   - Touch: `utils/config.js` (defaults for `team` block), `utils/validator.js` (validation rules from §3.3), `swarm.yaml` schema doc/template.
   - Tests: validator unit tests for every reject case in §3.3.
   - Acceptance: existing projects load unchanged; new `team` block validates per §3.3.

2. **Story 2: Story schema `domain:` field documentation.**
   - Touch: `methodology/artifact-schemas/story.md`.
   - Tests: none (doc-only).
   - Acceptance: schema doc has Domain section per §4.

3. **Story 3: Architect agent doc — domain-map deliverable.**
   - Touch: `agents/architect.md`.
   - Tests: none (prose update; verified by reviewer).
   - Acceptance: architect doc contains §5 additions verbatim or equivalent.

4. **Story 4: Orchestrator agent doc — team mode + routing rules.**
   - Touch: `agents/orchestrator.md`.
   - Tests: none (prose update).
   - Acceptance: orchestrator doc contains §6.1–§6.6 additions.

5. **Story 5: `teamcreate-gate` hook extension — Pass 2.**
   - Touch: `generators/hooks-generator.js` (`generateTeamCreateGateHook`), regenerate `.claude/hooks/teamcreate-gate.cjs`.
   - Tests: hook tests in `test/hooks.test.js`. Cases: dynamic mode pass-through, fixed mode + matching specialist, fixed mode + unmatched specialist + fallback enabled (pass), fixed mode + unmatched + fallback disabled (deny), malformed swarm.yaml (fail-open).
   - Acceptance: all cases in §7.3 covered.
   - Depends on: Story 1 (schema must exist for the hook to read).

6. **Story 6: Decision-log convention documentation.**
   - Touch: `methodology/decision-traceability.md` (one section per §11), prose update only.
   - Tests: none.
   - Acceptance: documented mid-epic spawn entry shape.

7. **Story 7: Retrofit path documentation.**
   - Touch: README addendum, `templates/CLAUDE.md.template` (optional one-liner).
   - Tests: none.
   - Acceptance: documented per §9.2.

### Suggested groupings

- **Sprint 1 (groundwork)**: Story 1 + Story 2 + Story 6 (all schema/doc, no behavior change).
- **Sprint 2 (behavior)**: Story 5 (hook), gated on Story 1.
- **Sprint 3 (agent docs)**: Story 3 + Story 4 + Story 7. Mostly prose, parallelizable.

### Story boundaries — what NOT to bundle

- Do NOT combine Story 1 and Story 5: schema-validator and hook are two distinct review surfaces (validator covers config-load correctness; hook covers session-time enforcement). Keeping them separate makes review focused.
- Do NOT bundle the architect doc update into the hook PR: agent-doc edits should not gate the enforcement landing.
- Do NOT introduce a `bmad-swarm migrate-to-fixed` CLI command in this feature — defer to a follow-up.

---

## 14. ADRs (this design produces)

The following ADRs are written alongside this architecture document, all referencing parent decision **D-004**. Files in `artifacts/design/decisions/`:

| ADR | Title | Surface |
| --- | --- | --- |
| ADR-004 | `swarm.yaml` `team` block schema | §3 |
| ADR-005 | Two-mode design: `dynamic` vs. `fixed` | §6 |
| ADR-006 | Story `domain:` field for routing | §4 |
| ADR-007 | Generic-dev fallback enabled by default in fixed mode | §3.5 |
| ADR-008 | `teamcreate-gate` extension as enforcement (with fail-open posture) | §7 |
| ADR-009 | One role doc serves all specialists (specialization in spawn brief) | §10.1 |

ADR-002 and ADR-003 are referenced in `decision-log.md` but the files have not yet been written by their original authors; the new ADRs continue at 004 to avoid renumbering and keep traceability stable.

---

## 15. Open questions / trade-offs flagged for human review

1. **Specialist reviewer scope for v1.** The schema permits `role: reviewer` in `team.specializations` (§3.1), but the brainstorm explicitly defers reviewer's own context discipline to a separate feature thread. Recommendation: keep the schema permissive (so `swarm.yaml` is forward-compatible) but document that v1 makes specialist reviewers OPTIONAL — the default reviewer continuity model (one continuous reviewer) is preserved unless the user explicitly declares per-domain reviewers. **Human decision needed**: confirm specialist-reviewers are allowed-but-optional in v1.

2. **Strict mode (fallback disabled).** §3.3 rule 3 allows `team.fallback.enabled: false` with a startup warning. Some teams may want strict enforcement (every story must match a declared domain). The current design honors that but does not promote it. **Human decision needed**: should strict mode be a first-class user-facing concept, or an advanced/discouraged setting?

3. **Domain slug uniqueness across roles.** Currently the (role, domain) pair must be unique, allowing a separate `developer-backend-auth` and `reviewer-backend-auth` to coexist (§3.3 rule 2). An alternative is to require domains to be globally unique (one specialist per domain regardless of role). The current choice supports the optional specialist-reviewer pattern. **No human decision required** unless §1 is resolved differently.

4. **Mid-epic injection in collaborative mode.** §6.3 says collaborative-mode pause-and-ask. In a long autonomous session, the human may not be present to answer. The fallback path (§6.3 ambiguous → pause regardless) ensures correctness over availability. **Trade-off acknowledgement**: an autonomous session can stall waiting for collaborative-mode mid-epic approval. This is correct behavior per the project's existing collaborative semantics; no architectural change recommended.

5. **Domain rename / supersession.** A renamed domain in `swarm.yaml` orphans existing stories pointing at the old slug. The decision tree §6.3 routes them to fallback (no specialist match). This is fine but worth surfacing — there is no built-in renaming-tool. **Recommended follow-up** (not v1): a `bmad-swarm doctor` audit that flags story domains not matching any declared specialist.

---

## 16. Verification checklist

Before marking this architecture complete:

- [ ] All 9 surfaces from the brainstorm are addressed in §3–§11.
- [ ] D-004 referenced as parent decision in this doc and every ADR.
- [ ] Backwards-compatibility rules (§8) explicitly cover three named scenarios: (a) projects without `team` block, (b) stories without `domain:`, (c) projects mid-flight.
- [ ] No silent migration — confirmed in §8.4.
- [ ] Implementation roadmap (§13) has natural story boundaries with clear dependencies.
- [ ] At least 5 ADRs written: schema, two-mode, story field, fallback, hook enforcement (plus ADR-009 on role-doc strategy).
- [ ] Quality criteria from `agents/architect.md`: every functional requirement traced to a component (here: each of the 9 brainstorm surfaces traced to an architecture section).
- [ ] Open questions surfaced for human approval (§15).

---

## 17. Companion: retrofit tooling architecture

§9 of this document deferred the retrofit path for existing projects to documentation only — explicitly rejecting a `bmad-swarm migrate-to-fixed` umbrella command in §10.6. The retrofit-tooling design that supplements that decision (without contradicting it) lives in a sibling architecture document:

- **`artifacts/design/architecture-retrofit.md`** — designs two opt-in user-invoked tools that remove the manual-edit friction of opt-in adoption: a `/retrofit-team` slash command (proposes a Domain Map; spawns one architect to insert it into `architecture.md` after human approval) and a `bmad-swarm scaffold-team` CLI command (reads the Domain Map; emits or writes the corresponding `swarm.yaml:team` block). Parent decision: D-014. ADRs: 010 (overlay vs. spawn), 011 (write safety), 012 (parser contract).

The retrofit tooling preserves §8.4's no-silent-migration principle: neither tool runs on `bmad-swarm init` or `bmad-swarm update`. Both are deliberate user actions. Wide-team itself (§3–§13) is unchanged; the retrofit is purely additive surface area.

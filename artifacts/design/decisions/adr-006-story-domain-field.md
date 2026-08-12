# ADR-006: Story `domain:` field for routing

**D-ID:** D-004 (parent strategic decision)
**Status:** Accepted
**Date:** 2026-04-28
**Context:** Architecture design for wide-team specialization (Surface 2 of `artifacts/planning/brainstorm-wide-team-2026-04-28.md`)

## Context

In fixed mode, the orchestrator routes each incoming story to the right specialist. The routing key needs to be:

1. **Story-local** — the orchestrator should not have to read other artifacts (PRD, architecture) at routing time.
2. **Stable** — re-routing the same story should produce the same decision; the key should not depend on volatile context.
3. **Optional** — stories created before this feature must continue to work without modification (D-004 backward-compat constraint).
4. **Authored** — a human or upstream agent (story-engineer) decides the value, not a string-matcher heuristic that might get the call wrong.

The brainstorm proposed an explicit `domain:` field on the story. This ADR formalizes the choice over alternatives.

## Decision

Add an optional `## Domain: <kebab-case-slug>` heading to the story file schema, placed between `## Status:` and `## User Story` (architecture.md §4.1).

- **Type**: string, must match `^[a-z0-9][a-z0-9-]*[a-z0-9]$` when present.
- **Required**: no.
- **Default when absent**: empty string. Routes to generic-dev fallback in fixed mode; ignored in dynamic mode.
- **Author**: story-engineer at story-creation time (or human, manually). The architect's domain map is the source of valid slugs.
- **Validation by reviewer**: advisory only. The reviewer flags inconsistent or missing domains as a low-severity finding when fixed mode is on; never as blocking.

The orchestrator reads the field as the primary routing key. The `teamcreate-gate` hook validates that the (role, domain) pair appears in `swarm.yaml:team.specializations` or that the fallback is enabled (see ADR-008).

## Alternatives considered

- **A. Infer domain from the story file path** (e.g., `stories/backend-auth/story-1.md`). Rejected: the existing layout is flat (`stories/story-X-Y-title.md`), and reorganizing the directory tree is a breaking change for every existing project. The flat layout has its own merits (one glance for "all stories"), and the routing concern shouldn't dictate filesystem layout.

- **B. Infer domain from the story title** (e.g., `Story A-LOGIN-1: ...` parsed to extract `LOGIN`). Rejected: title parsing is fragile (what about "Add login state to dashboard"? two domains?), authoring discipline is hard to enforce, and the title is already used for other purposes (review report naming, file slugs). Overloading it would create coupling that's hard to undo.

- **C. Infer domain from file content via embedding/keyword classifier.** Rejected: introduces a runtime ML/NLP dependency, non-deterministic routing, and a class of failure modes (misclassification) that the explicit field eliminates by construction. The explicit field reduces this from a probabilistic problem to a lookup.

- **D. Add a separate sidecar file** (`story-X-Y.meta.yaml` carrying domain). Rejected: doubles the file count for stories, fragments the source of truth, and makes story files non-self-describing. The brainstorm explicitly decided against story memo files (separate feature thread), and the same logic applies here.

- **E. Domain implicit in the epic** (e.g., "Epic A is backend-auth"). Rejected: epics don't currently carry routing semantics, and binding them to domains would force a 1:1 epic-to-domain mapping that real projects often violate (one epic spans multiple domains; one domain spans multiple epics).

- **F. Frontmatter YAML `domain: ...`** instead of `## Domain:` heading. Considered seriously. Rejected because the existing story schema (`methodology/artifact-schemas/story.md`) does not use frontmatter — every existing field is a markdown heading. Introducing frontmatter for a single field would be inconsistent. If the schema as a whole later moves to frontmatter, `domain:` rides along; nothing in this ADR precludes that future migration.

## Consequences

**Positive**

- Routing is a constant-time string lookup against the declared roster. No indirection, no inference.
- The field is human-readable and human-editable. A story file remains self-describing.
- Backward-compat is automatic: absent field → fallback (or ignored in dynamic mode). No migration script required.
- The reviewer audit hook is straightforward: "if fixed mode and field is missing or doesn't match a declared specialist, flag low-severity".

**Negative**

- Story-engineer (or human) gains one more field to author per story. Mitigated: it's optional. Fallback handles the unmarked case correctly.
- A renamed domain in `swarm.yaml` orphans existing stories with the old slug. The decision-tree fallback handles this (architecture.md §6.3) but a `bmad-swarm doctor` audit (deferred to follow-up) would surface the mismatch faster.
- No automatic backfill for existing stories. This is intentional (no silent migrations), but means a project switching to fixed mode mid-flight may have many fallback-routed stories until they're manually annotated.

**Forward-compatibility**

- The slug format reserves room for namespacing (`fe.dashboard`, `be.auth`) without shape change. v1 sticks with flat slugs; namespacing is a future extension if domain count grows large.
- A future migration to YAML frontmatter at the story-schema level can carry `domain:` along; nothing here is hostile to that direction.

## Verification

1. Story files without `## Domain:` continue to load and validate (no schema change for the absent case).
2. A story with `## Domain: backend-auth` parses cleanly; the orchestrator's routing logic reads the slug.
3. Reviewer's audit, in fixed mode, surfaces missing-or-mismatched domains as low-severity findings without blocking merge.

## Referenced by

- `artifacts/design/architecture.md` §4
- `methodology/artifact-schemas/story.md` (post-implementation: new Domain section)
- `artifacts/context/decision-log.md` D-004

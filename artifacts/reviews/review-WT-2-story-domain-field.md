# Review: Story WT-2 — Story schema doc · Domain field

**Story:** `artifacts/implementation/stories/story-WT-2-story-domain-field.md`
**Reviewer:** reviewer (lenses: `code-quality`, `docs`)
**Date:** 2026-04-28
**Verdict:** **approved**

---

## Summary

WT-2 is a faithful documentation transcription that adds the optional `## Domain:` field to `methodology/artifact-schemas/story.md`. All 5 acceptance criteria are met. The new section is positioned correctly (between Status and User Story), the Expected Structure block is updated with an inline-comment-flagged example, the Quality Checklist gains the documented bullet, the reviewer's advisory-only audit posture is stated unambiguously, and cross-references to architecture.md §4, §6, and ADR-006 are present.

The prose mirrors ADR-006's semantics without inventing new content. The optional, additive, backward-compatible posture from ADR-006 is preserved verbatim. No code changes; no tests required (per story Dev Notes).

No findings. Approved as-is.

---

## Acceptance criteria verification

| AC | Description | Status | Evidence |
| --- | --- | --- | --- |
| AC1 | Schema doc gains a `### Domain (optional)` section between Status and User Story | PASS | `methodology/artifact-schemas/story.md:84-100` defines `### Domain (optional)` immediately after Status (lines 76-82) and immediately before User Story (line 102). Section covers: optional (line 86, 91 "Required: no"), kebab-case (line 91 "string (kebab-case slug)"), regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (line 91), default-when-absent for fixed mode = fallback (line 96), default-when-absent for dynamic mode = ignored (line 96). |
| AC2 | Expected Structure shows `## Domain:` heading with optional flag | PASS | Line 12: `## Domain: [kebab-case-slug]   <!-- optional; omit for cross-cutting / unrouted work -->`. Placed between `## Status:` (line 10) and `## User Story` (line 14). Inline HTML comment clarifies the field is optional. |
| AC3 | Quality Checklist gains the Domain bullet | PASS | Line 200: `Domain field is set when project uses team.mode: fixed (or omitted intentionally for cross-cutting work)` — wording matches story AC3 spec exactly. |
| AC4 | Reviewer audit posture documented (advisory-only, low-severity, never blocking, references ADR-006) | PASS | Line 98: "The reviewer's audit of this field is **advisory only** — missing or mismatched domains in fixed mode surface as low-severity findings, never as blocking. See ADR-006 for the rationale. Do not gate merges on this field." All four required attributes present. |
| AC5 | Cross-references to architecture §4 and ADR-006 | PASS | Line 100: cites `artifacts/design/architecture.md` §4 (Story schema additions) **and** §6 (Orchestrator routing) **and** `artifacts/design/decisions/adr-006-story-domain-field.md` by full path. Exceeds the AC's minimum (which only required §4 + ADR-006). |

All 5 ACs met.

---

## Architecture compliance

- ADR-006 §Decision: every bullet is faithfully transcribed.
  - "Type: string, must match `^[a-z0-9][a-z0-9-]*[a-z0-9]$` when present" → schema doc line 91.
  - "Required: no" → schema doc line 91.
  - "Default when absent: empty string. Routes to generic-dev fallback in fixed mode; ignored in dynamic mode" → schema doc line 93 and line 96.
  - "Author: story-engineer at story-creation time (or human, manually)" → schema doc line 94.
  - "Validation by reviewer: advisory only" → schema doc line 98.
- Architecture.md §4.1-§4.5 semantics: covered. §4.3 backward-compat language ("not invalid", "every existing story file continues to work as-is") is mirrored at schema doc line 96.
- ADR-006 §Alternatives F (frontmatter rejected): the implementation correctly uses a markdown heading (`## Domain:`), not frontmatter, matching the rest of the story schema. Story Dev Notes anti-pattern guidance is honoured.

No deviation from the design. No ADR required.

---

## Lens: docs

**Strengths**

- Section placement matches both ADR-006 §Decision (line 21: "between `## Status:` and `## User Story`") and architecture.md §4.1.
- The example in Expected Structure uses `[kebab-case-slug]` (the same placeholder convention as the existing `[X.Y]` and `[Story Title]` placeholders nearby), keeping the schema doc visually consistent.
- The inline HTML comment in the Expected Structure example (`<!-- optional; omit for cross-cutting / unrouted work -->`) is a clean way to flag optionality without bloating the example body. Survives rendering as a comment in markdown viewers.
- Cross-references are concrete — full §4, §6, and full ADR file path. A reader hunting for routing semantics has unambiguous breadcrumbs.
- The body section explicitly says "Do not gate merges on this field." That's a strong, unambiguous instruction for future reviewers (including me, when later auditing fixed-mode stories) — exactly the kind of prose the schema doc should contain.

**Findings (none)**

No high, medium, or low findings. The change is scoped to docs, follows the existing schema-doc conventions, and does not contradict any other artifact.

**Anti-patterns honoured (verified)**

- No backfill to existing story files (✓ — none touched).
- No frontmatter (✓ — heading-based, matching the rest of the schema).
- Field is optional (✓ — every reference says "optional" or "no" for required).
- No code/validation logic added (✓ — file diff is doc-only).

---

## Lens: code-quality

Documentation-only change. No code, no tests, no logic. Markdown structure is well-formed (the table at lines 88-94 renders correctly; section headings are consistent with the rest of the file). Nothing to assess on a code-quality axis beyond markdown hygiene, which is clean.

---

## Decision Traceability

- **D-004** (parent strategic): Verified — schema documentation supports the wide-team specialization adoption.
- **D-007** (Story `domain:` field for routing): **Verified — documented**. Schema additions in the doc match the decision verbatim. Status should advance from `implemented` → `verified` in `decision-log.md`.
- **ADR-006**: Verified — every alternative rejection (path inference, title parsing, ML classifier, sidecar file, epic-implicit, frontmatter) is honoured by the heading-based, optional-field implementation.
- **No new D-IDs created** during implementation — correct posture for a faithful schema-doc transcription (story Dev Notes line 60 explicitly states "no decisions are deferred to the implementer").

---

## Findings register dedupe

`artifacts/context/findings-register.md` does not yet exist (attempted to initialize during WT-1 review but the write was blocked by guard). No duplicate IDs to reconcile. No new findings produced by WT-2 review.

---

## Verdict

**approved**

All 5 acceptance criteria met. No findings of any severity. WT-2 is a clean schema-doc transcription that respects ADR-006 verbatim.

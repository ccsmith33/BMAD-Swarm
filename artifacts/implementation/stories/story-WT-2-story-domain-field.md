# Story WT-2: Story schema doc — `Domain` field

## Status: complete

## User Story

As a story-engineer (or any human authoring stories) on a wide-team-enabled project,
I want the story-schema documentation to describe how to declare a story's `domain:`,
So that I can author routable stories without inventing a convention or hunting through architecture docs.

## Acceptance Criteria

### AC1: Schema doc gains a Domain section

**Given** the schema doc at `methodology/artifact-schemas/story.md`
**When** I read it after this story lands
**Then** there is a new `### Domain (optional)` section between the `### Status` section and the `### User Story` section
**And** the section explains the field is optional, kebab-case, and matches `^[a-z0-9][a-z0-9-]*[a-z0-9]$`
**And** the section states the default behavior when absent: routes to fallback in fixed mode, ignored in dynamic mode

### AC2: Expected Structure block includes `## Domain:` heading

**Given** the "Expected Structure" code block at the top of the schema doc
**When** I read it
**Then** the example shows `## Domain: <kebab-case-slug>` between `## Status:` and `## User Story`
**And** a comment in the example clarifies the field is optional

### AC3: Quality Checklist gains a Domain item

**Given** the "Quality Checklist" section at the bottom of the schema doc
**When** I read it
**Then** there is a new bullet: `Domain field is set when project uses team.mode: fixed (or omitted intentionally for cross-cutting work)`

### AC4: Reviewer audit posture is documented

**Given** the new Domain section
**When** I read it
**Then** it states the reviewer's audit of this field is advisory-only (low-severity findings, not blocking) — references ADR-006

### AC5: Cross-reference to architecture is present

**Given** the new Domain section
**When** I read it
**Then** it references `artifacts/design/architecture.md` §4 and ADR-006 for the routing semantics

## Tasks

- [ ] Task 1: Insert the `### Domain (optional)` section in `methodology/artifact-schemas/story.md`
  - [ ] Subtask 1.1: Place between the existing `### Status` and `### User Story` sections
  - [ ] Subtask 1.2: Cover: type (string slug), required (no), regex, default behavior, who sets it (story-engineer / human), reviewer audit posture
- [ ] Task 2: Update the "Expected Structure" code block at the top of the doc to show `## Domain:` example
  - [ ] Subtask 2.1: Add a one-line comment in the example flagging the field as optional
- [ ] Task 3: Add a Quality Checklist bullet
- [ ] Task 4: Add D-ID/ADR cross-references to the new section

## Dev Notes

### Architecture Context

This story implements `architecture.md` §4 (Story schema additions). All semantics are spelled out in **ADR-006** (`artifacts/design/decisions/adr-006-story-domain-field.md`) — no decisions are deferred to the implementer; this is a faithful schema-doc transcription.

### Technical Implementation

This is a **documentation-only** story. No code changes. No tests required.

The only file touched is `methodology/artifact-schemas/story.md`. Edit by inserting headings and prose that mirror the architecture document's §4.1–§4.5 — do not invent new content beyond what's specified there.

### File Locations

- Modify: `methodology/artifact-schemas/story.md`

### Dependencies

None. Story WT-2 can be written in parallel with WT-1, WT-3, WT-4, WT-6, WT-7. Story WT-5 has no dependency on WT-2.

### Testing Approach

**No tests required.** This is a documentation-only change. Reviewer verifies the prose matches the architecture spec.

### Anti-Patterns

- Do NOT add the field to existing story files. Backfilling is out of scope (and the brainstorm + ADR-006 explicitly say no silent migration). This story documents the schema; existing stories continue to validate without the field.
- Do NOT introduce frontmatter for the Domain field. The existing schema uses markdown headings throughout — match the convention. ADR-006 §Alternatives F documents this choice.
- Do NOT make the field required. ADR-006 makes it explicitly optional.
- Do NOT add validation logic to any code in this story. Validation lives in the `teamcreate-gate` hook (Story WT-5) and reviewer audit (advisory) — not at story-file parse time.

### D-IDs Referenced

- **D-004** — parent strategic decision
- **D-007** — Story `domain:` field for routing (this story documents)
- **ADR-006** — full design rationale

## File List

- `methodology/artifact-schemas/story.md` — modified (new `### Domain (optional)` section between Status and User Story; `## Domain:` line added to Expected Structure block with inline-comment optional flag; Quality Checklist bullet added; cross-refs to architecture.md §4, §6 and ADR-006)

## Dev Agent Record

- All 5 ACs implemented as a faithful schema-doc transcription of ADR-006.
- No code changes; no tests required (doc-only story).
- Heading-based field (not frontmatter) — matches the rest of the story schema and honours ADR-006 §Alternatives F.
- Inline HTML comment in the Expected Structure example flags the field as optional without bloating the example body.

### Reviewer notes (carried forward)

- Cross-reference to architecture.md §6 was added in addition to the AC5-required §4 — this is a positive over-delivery (gives readers a direct breadcrumb to the orchestrator routing semantics).
- "Do not gate merges on this field" appears verbatim in the doc — strong, unambiguous instruction that downstream reviewers (including future fixed-mode audits) should respect.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-28 | Story implemented; schema doc updated with Domain section | dev-2 |
| 2026-04-28 | Review approved; status → complete; no findings | reviewer |

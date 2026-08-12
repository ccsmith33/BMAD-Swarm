# Story WT-3: Architect agent doc — Domain Map deliverable

## Status: complete

## User Story

As an architect spinning up a project that uses wide-team specialization,
I want my role doc to describe how to produce a Domain Map section in `architecture.md`,
So that I deliver the right artifact (with the right format and heuristics) to ground the orchestrator's specialist roster.

## Acceptance Criteria

### AC1: Outputs section names the Domain Map deliverable

**Given** the file `agents/architect.md`
**When** I read its Outputs section
**Then** the "Architecture document" bullet has a sub-bullet `Domain map section` describing it as a list of named domains used to seed `swarm.yaml:team.specializations`
**And** the description notes it is mandatory when the project uses `team.mode: fixed` and recommended for any project >10 anticipated stories

### AC2: A new "Domain map format" subsection is added

**Given** the architect doc
**When** I read it after this story lands
**Then** there is a section showing the table format from `architecture.md` §5.2 (columns: Domain, Description, Components, Anticipated stories)
**And** the section lists the four heuristics (≥2-story rule, architecturally-significant exception, cross-cutting dependencies, orthogonality test)

### AC3: Behavioral Rules gain a Domain-Map rule

**Given** the architect doc's Behavioral Rules section
**When** I read it
**Then** there is a new rule: "Produce a domain map when the project uses fixed-mode wide team. Read `swarm.yaml:team.mode`. If `fixed`, the domain map section is mandatory and feeds `swarm.yaml:team.specializations`. If `dynamic`, the section is optional but recommended for projects with >10 anticipated stories. Domain decomposition follows the ≥2-story heuristic."

### AC4: Quality Criteria gains a Domain-Map check

**Given** the architect doc's Quality Criteria section
**When** I read it
**Then** there is a new bullet: "If `team.mode: fixed`, every domain in the map has at least one specialist declared in the proposed `swarm.yaml:team.specializations`, and every `specializations[].domain` corresponds to a row in the map."

### AC5: D-004 and ADR references are present

**Given** the new Domain Map section in the architect doc
**When** I read it
**Then** it references the parent strategic decision **D-004** and points to `artifacts/design/architecture.md` §5 for the full rationale and to ADR-004 / ADR-006 / ADR-009 for the schema constraints the architect must respect

## Tasks

- [ ] Task 1: Add a Domain Map sub-bullet under "Architecture document" in the Outputs section of `agents/architect.md`
- [ ] Task 2: Add a new section after Outputs (or as a sub-section of Outputs) describing the Domain Map table format, mirroring `architecture.md` §5.2
- [ ] Task 3: Append a new Behavioral Rule per AC3
- [ ] Task 4: Append a new Quality Criteria item per AC4
- [ ] Task 5: Add D-ID and ADR cross-references in the new sections

## Dev Notes

### Architecture Context

This story implements `architecture.md` §5 (Architect agent doc updates). The exact wording of the new sections is spelled out in §5.1 through §5.4 — implement faithfully.

### Technical Implementation

This is a **documentation-only** story. No code changes. No tests required.

The architect role doc gains:

1. A new Outputs sub-bullet (one line) under "Architecture document".
2. A new "Domain map format" subsection (table + heuristics list).
3. A new Behavioral Rule (one paragraph).
4. A new Quality Criteria bullet (one line).
5. Cross-references to D-004 and the relevant ADRs.

Match the existing prose style of `agents/architect.md` — the doc uses Markdown headings, paragraph-form behavioral rules with bold leads, and bullet lists for criteria.

### File Locations

- Modify: `agents/architect.md`

After this lands, regenerating the project's agents (`bmad-swarm update`) will propagate the new role-doc into `.claude/agents/architect.md`. **Do NOT manually edit `.claude/agents/architect.md`** — it's a generated artifact; the source of truth is `agents/architect.md`.

### Dependencies

None. WT-3 is parallel-safe with WT-1, WT-2, WT-4, WT-6, WT-7.

### Testing Approach

**No tests required.** Documentation-only change. Reviewer verifies that:
- The new sections are present.
- The wording is consistent with `architecture.md` §5.
- The D-ID/ADR references are correct.

### Anti-Patterns

- Do NOT change the existing architect role description, expertise, inputs, or behavioral rules unrelated to the Domain Map. Story discipline: implement only what's specified.
- Do NOT add the Domain Map to the architect's Inputs (it's an output, not an input — the input is the PRD plus `swarm.yaml`).
- Do NOT bake in a specific number of domains as a "good" target. The ≥2-story heuristic is the rule; the architect determines count per-project.
- Do NOT modify `.claude/agents/architect.md` directly — that's a generated file. Edit the source at `agents/architect.md`.

### D-IDs Referenced

- **D-004** — parent strategic decision
- **ADR-004** — `swarm.yaml` schema (architect's domain map seeds this)
- **ADR-006** — story `domain:` field (architect's domain map informs slug choices)
- **ADR-009** — one role doc per role (context: per-specialist files do NOT exist; the domain map drives `team.specializations` only)

## File List

- `agents/architect.md` — modified (5 additive hunks: Outputs sub-bullet for Domain map section; new `## Domain Map (when using fixed-mode wide team)` section between Outputs and Quality Criteria with `### Format` and `### Heuristics` subsections; Quality Criteria bullet for fixed-mode coverage check; Behavioral Rule for activation; cross-refs to D-004 + ADR-004/006/009 + architecture.md §5; verified via `git diff HEAD` — zero existing lines modified)
- `.claude/agents/architect.md` — intentionally NOT modified (generated artifact; will sync on next `bmad-swarm update` batch regen at end-of-feature; per story anti-pattern guidance)

## Dev Agent Record

- All 5 ACs implemented as a faithful additive transcription of `architecture.md` §5.1-§5.4.
- Diff is pure-additive: 5 hunks, all additions; zero existing lines modified or removed.
- Example table in `### Format` reproduces architecture §5.2 byte-for-byte (column headers, separators, all three example rows: `backend-auth`, `backend-upload`, `frontend-dashboard`).
- All four heuristics (≥2-story, architecturally-significant exception, cross-cutting dependencies, orthogonality test) reproduced in correct order with matching wording.
- Cross-references go beyond AC5 minimum: D-004 + ADR-004 + ADR-006 + ADR-009 + architecture.md §5 anchor — gives readers concrete breadcrumbs to all upstream constraints.
- One piece of original connective tissue added (line 49): a paragraph defining what a "domain" is in concrete terms before the format table. Not a deviation; reads as natural framing for first-time readers.
- No new D-IDs. No code changes. No tests required.

### Reviewer notes (carried forward)

- The new Domain Map section explicitly states "specialization lives in the spawn brief, NOT in per-specialist `.md` files" — reinforces ADR-009 wherever a reader might wonder whether to emit per-specialist role files.
- The new Behavioral Rule activates the architect's domain-map deliverable when `swarm.yaml:team.mode: fixed`. Future orchestrator behavior (Story WT-4) and runtime spawn briefs should treat this map as the authoritative source for domain slugs.
- `.claude/agents/architect.md` regen handshake confirmed via observed `<!-- bmad-generated:fdedb03b -->` hash drift in identity-architect skill — the generator will pick this up on next `bmad-swarm update`.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story implemented; agents/architect.md updated with Domain Map deliverable | dev-2 |
| 2026-04-29 | Review approved; status → complete; no findings | reviewer |

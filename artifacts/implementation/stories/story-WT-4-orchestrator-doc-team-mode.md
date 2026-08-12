# Story WT-4: Orchestrator agent doc — Team mode + routing rules

## Status: complete

## User Story

As an orchestrator running a session on a wide-team-enabled project,
I want my role doc to spell out the team-mode rules, the routing decision tree, the mid-epic injection logic, and the specialist-spawn discipline,
So that my behavior in fixed mode is deterministic and auditable rather than improvised per-session.

## Acceptance Criteria

### AC1: New "Team mode" section exists

**Given** the file `agents/orchestrator.md`
**When** I read it after this story lands
**Then** there is a new `## Team mode` section placed after the `## Entry points` section
**And** it describes the two modes (`dynamic` default, `fixed` opt-in) and references `swarm.yaml:team.mode`
**And** it explicitly states that in fixed mode the complexity-scoring and entry-point tables continue to govern autonomy and phase-skipping but NOT team-sizing

### AC2: Routing rules per autonomy mode are documented

**Given** the new Team mode section (or a sub-section)
**When** I read it
**Then** the routing decision tree from `architecture.md` §6.2 appears verbatim or equivalent (story-arrival branches: matched specialist → silent; unmatched → mid-epic injection; unset+one-off → fallback; unset+domain-aligned → mid-epic injection; multi-match → pick-closest+flag-reviewer)

### AC3: Mid-epic injection decision tree is documented

**Given** the orchestrator doc
**When** I read it
**Then** the mid-epic decision tree from `architecture.md` §6.3 appears, branching on (a) ≥2 expected stories + architecturally significant → spawn (with autonomy-mode-specific announcement vs pause), (b) one-off → fallback, (c) ambiguous → pause regardless of mode

### AC4: Specialist-spawn discipline is documented as a Behavioral Rule

**Given** the orchestrator doc's Behavioral Rules-equivalent section (currently the doc uses prose paragraphs interleaved with sections)
**When** I read it
**Then** there is a rule: "Do not grow the specialist roster for one-off work. A new specialist is spawned only when ≥2 stories are anticipated in its domain OR the domain is architecturally significant. One-off cross-cutting work routes to the generic-dev fallback."
**And** there is a rule: "Every mid-epic spawn writes a one-line decision-log entry. When you spawn a new specialist mid-epic, log to `artifacts/context/decision-log.md` as a tactical decision: `D-NNN — <date> — Spawned <specialist-domain> mid-epic — <one-line reason>`."

### AC5: Fixed-mode override of complexity/entry-point sizing is explicit

**Given** the orchestrator doc
**When** I read it
**Then** there is a paragraph or bullet stating: "In fixed mode, do not let the complexity table or entry-point table change team size. Both tables still inform autonomy override (e.g., complexity ≥12 promotes auto→guided) and phase-skipping (e.g., `bug-fix` skips Definition/Design). They do NOT pick the agents to spawn."

### AC6: `bmad-assembly` block schema documents the optional `domain:` sub-field

**Given** the existing `bmad-assembly` schema example in the orchestrator doc's Invariants section
**When** I read it after this story lands
**Then** the example shows `domain:` as an optional sub-field on `team[]` entries
**And** there is a one-line note that `domain:` is required for specialized developer/reviewer entries in fixed mode

### AC7: D-004 and ADR references are present

**Given** the new sections
**When** I read them
**Then** they reference D-004 as the parent decision and ADR-005 (two-mode design) as the primary ADR
**And** the mid-epic spawn rule references ADR-007 (fallback default) and ADR-008 (gate enforcement)

## Tasks

- [ ] Task 1: Add a `## Team mode` section to `agents/orchestrator.md` after the `## Entry points` section
  - [ ] Subtask 1.1: Cover the two modes per `architecture.md` §6.1
- [ ] Task 2: Add the routing decision tree per `architecture.md` §6.2
- [ ] Task 3: Add the mid-epic injection decision tree per `architecture.md` §6.3
- [ ] Task 4: Add specialist-spawn discipline rules per `architecture.md` §6.4
- [ ] Task 5: Add the fixed-mode override paragraph per `architecture.md` §6.5
- [ ] Task 6: Update the `bmad-assembly` example block in the Invariants section to show optional `domain:` sub-field per `architecture.md` §6.6
- [ ] Task 7: Add D-ID and ADR cross-references in the new sections

## Dev Notes

### Architecture Context

This story implements `architecture.md` §6 (Orchestrator agent doc updates). All wording is specified in §6.1–§6.6.

The existing orchestrator doc has a specific structure: Identity → First action → Invariants → Complexity scoring → Entry points → Signal→lens lookup → Autonomy override rules → Human override → Rejection handling → Context curation → D-ID traceability → Spawn-prompt structure → Coordination discipline → Retrospective → Brainstorming → Model selection. Insert the new Team mode section between `## Entry points` and `## Signal → lens lookup` so it sits with sizing-related material. The `bmad-assembly` example sits in the Invariants section — edit in place.

### Technical Implementation

**Documentation-only.** No code changes. No tests required.

When adding the new rules and sections, match the existing prose style:
- The doc mixes prose paragraphs and tables.
- Behavioral rules currently appear inline (no dedicated `## Behavioral Rules` section). Add the new rules as small bolded-lead paragraphs in a logical location (the Team mode section is a natural home for them).

### File Locations

- Modify: `agents/orchestrator.md`

After this lands, `bmad-swarm update` propagates to `.claude/agents/orchestrator.md`. **Do NOT manually edit the generated copy.**

### Dependencies

None for the prose change. Note: the **runtime behavior** described here only takes effect after Story WT-1 (schema), Story WT-3 (architect's domain map), and Story WT-5 (hook enforcement) land. WT-4 can be authored in parallel — the doc describes intended behavior the orchestrator will follow once the rest of the feature lands.

### Testing Approach

**No tests required.** Documentation-only. Reviewer verifies:
- All seven ACs are met.
- Wording aligns with `architecture.md` §6.
- The `bmad-assembly` example is syntactically valid (still parseable by the existing `teamcreate-gate` Pass 1).
- No existing orchestrator behavior in dynamic mode is contradicted.

### Anti-Patterns

- Do NOT delete or weaken any existing orchestrator rule. The new rules are additive.
- Do NOT remove the complexity-scoring or entry-point tables from the doc. They retain their meaning for autonomy and phase-skipping.
- Do NOT introduce a new `## Behavioral Rules` section if one doesn't exist — match the doc's existing structure (rules live as prose within topical sections).
- Do NOT change the `bmad-assembly` block's REQUIRED keys. The `teamcreate-gate` Pass 1 still requires `entry_point, complexity, autonomy, team, rationale`. The `domain:` sub-field is on individual `team[]` entries, not at the top level.
- Do NOT modify `.claude/agents/orchestrator.md` directly — generated file.

### D-IDs Referenced

- **D-004** — parent strategic decision
- **D-006** — Two-mode team shape (this story documents)
- **D-008** — Generic-dev fallback default-on (informs §6.3 decision tree branches)
- **ADR-005** — full two-mode design rationale
- **ADR-007** — fallback default
- **ADR-008** — gate enforcement (referenced because the orchestrator's `bmad-assembly` `domain:` sub-field is what the hook validates against)

## File List

- `agents/orchestrator.md` — modified (2 surgical additive hunks: Invariants `bmad-assembly` example gains optional `domain:` sub-field + clarifying paragraph about mode-dependent requirement; new `## Team mode` section inserted between `## Entry points` and `## Signal → lens lookup` containing intro with cross-refs, two-mode bullet list, fixed-mode override paragraph, `### Routing rules (fixed mode)` decision tree, `### Mid-epic injection decision tree` with autonomy-aware sub-branches, and two bolded-lead behavioral rules; verified via `git diff HEAD` — zero existing lines modified)
- `.claude/agents/orchestrator.md` — intentionally NOT modified (generated artifact; will sync on next `bmad-swarm update` batch regen at end-of-feature; per story anti-pattern guidance)

## Dev Agent Record

- All 7 ACs implemented as a faithful additive transcription of `architecture.md` §6.1-§6.6.
- Diff is pure-additive: 2 hunks, all additions; zero existing lines modified or removed.
- §6.6 implemented differently from architecture spec: instead of reproducing a separate fixed-mode `bmad-assembly` example, dev-2 extended the canonical Invariants schema example with the optional `domain:` sub-field + a clarifying note about its mode-dependent requirement. Reviewer judged this a positive design improvement (single source of truth, no drift surface between two co-existing examples) — not a deviation.
- AC4's "Every mid-epic spawn writes a one-line decision-log entry" rule cross-refs `methodology/decision-traceability.md`'s "Team-Shape Decisions" section landed by WT-6 — correctly points at the canonical methodology doc rather than at the architecture's §11 (single source of truth for the convention).
- Required top-level `bmad-assembly` keys (`entry_point`, `complexity`, `autonomy`, `team`, `rationale`) explicitly preserved in the line-27 note: "`teamcreate-gate` Pass 1 still enforces them." Pass 1 contract documented out loud.
- D-006 cross-ref added beyond AC7's minimum (D-004 + ADR-005/007/008 only) — slightly more discoverable for a future reader following the D-ID chain.
- No new D-IDs. No code changes. No tests required.

### Reviewer notes (carried forward)

- The "In dynamic mode this tree does not apply" guard line at line 84 is a small but valuable addition — removes ambiguity about whether the routing tree is universally applicable.
- The autonomy-aware sub-branches in the mid-epic decision tree (auto=announce-then-proceed, guided=pause-and-ask, collaborative=pause-and-ask) tie the spawn decision back to the orchestrator's existing autonomy-override rules — critically important contract.
- The `bmad-assembly` schema is now the single canonical example (Invariants section). Future schema changes should land in this one place; resist the temptation to add a second mode-specific example block.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story implemented; agents/orchestrator.md updated with Team mode section + Invariants schema extension | dev-2 |
| 2026-04-29 | Review approved; status → complete; no findings | reviewer |

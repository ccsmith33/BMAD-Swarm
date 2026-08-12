# Story WT-6: Decision-log conventions for team-shape decisions

## Status: complete

## User Story

As a contributor (orchestrator agent OR human auditor) reading the project's decision log,
I want a documented convention for how mid-epic specialist spawns and team-mode toggles are recorded,
So that team-shape decisions are auditable in the same uniform way as every other tracked decision.

## Acceptance Criteria

### AC1: Decision-traceability doc gains a Team-Shape Decisions section

**Given** the file `methodology/decision-traceability.md`
**When** I read it after this story lands
**Then** there is a new section (e.g., `## Team-Shape Decisions`) describing two distinct entry shapes:
1. Mid-epic specialist spawn — tactical one-line entry
2. `team.mode` toggle (dynamic ↔ fixed) — strategic full record

### AC2: Mid-epic spawn entry shape is specified

**Given** the new section
**When** I read it
**Then** it gives the exact template per `architecture.md` §11.1:

```markdown
## D-NNN — Spawned <role>-<domain> mid-epic
- Date: YYYY-MM-DD
- Source: orchestrator (auto) | orchestrator (after human approval)
- Reason: <one sentence — what triggered the spawn>
```

### AC3: `team.mode` toggle entry shape is specified

**Given** the new section
**When** I read it
**Then** it gives the strategic full record template per `architecture.md` §11.2 (Date, Classification: Strategic, Source, Rationale, Affects, Status, ADR, Referenced by)

### AC4: Reviewer audit hook is documented (informational)

**Given** the new section
**When** I read it
**Then** it notes that the reviewer's existing decision-log audit (per `agents/reviewer.md`) extends naturally to team-shape entries — no separate audit configuration is required for v1
**And** it flags as a future iteration the option of adding a "more than 5 mid-epic spawns per epic" advisory check (not v1 scope)

### AC5: Cross-references to D-004 and ADR-005 are present

**Given** the new section
**When** I read it
**Then** it references D-004 as the parent strategic decision and ADR-005 (two-mode design) as the source of the convention

## Tasks

- [ ] Task 1: Add a new section `## Team-Shape Decisions` to `methodology/decision-traceability.md`
  - [ ] Subtask 1.1: Place near the end, after "Decision Supersession" and before "Quality Criteria" (or wherever flows naturally given the doc's structure)
- [ ] Task 2: Specify the mid-epic spawn entry template per AC2
- [ ] Task 3: Specify the `team.mode` toggle full-record template per AC3
- [ ] Task 4: Note the reviewer audit posture per AC4
- [ ] Task 5: Add D-ID and ADR cross-references per AC5

## Dev Notes

### Architecture Context

This story implements `architecture.md` §11 (Decision-log conventions). The two entry shapes are spelled out in §11.1 and §11.2 — implement faithfully.

The existing decision-traceability doc (`methodology/decision-traceability.md`) already establishes the D-ID format, full-record vs. lightweight-record distinction, status lifecycle, and reviewer enforcement model. This story adds a small section that tells the orchestrator (and human auditors) how team-shape entries fit into that existing system — it doesn't introduce a new system.

### Technical Implementation

**Documentation-only.** No code changes. No tests required.

The new section sits at the end of `methodology/decision-traceability.md` as a topical addition. It does NOT need to modify the existing sections (D-ID format, status lifecycle, reviewer enforcement) — those rules apply to team-shape decisions automatically.

### File Locations

- Modify: `methodology/decision-traceability.md`

### Dependencies

None. Parallel-safe with WT-1 through WT-7 except WT-5.

### Testing Approach

**No tests required.** Documentation-only. Reviewer verifies:
- The new section is present.
- The two templates match `architecture.md` §11.1 and §11.2 exactly.
- The reviewer audit posture statement is accurate.

### Anti-Patterns

- Do NOT introduce a new D-ID format or supersession rule for team-shape decisions. The existing format applies.
- Do NOT add code-level enforcement of mid-epic spawn logging. The orchestrator's prose rule (from Story WT-4) is the enforcement mechanism; this story documents the entry shape only.
- Do NOT modify any existing section of `decision-traceability.md` beyond adding the new Team-Shape Decisions section and (if needed) a one-line cross-reference from the existing "Strategic Decisions" or "Tactical Decisions" examples list.
- Do NOT bake the cap of "5 mid-epic spawns per epic" into v1 — it's flagged as a future-iteration option in AC4, not as a current rule.

### D-IDs Referenced

- **D-004** — parent strategic decision
- **ADR-005** — two-mode design (the toggle entry shape applies when switching modes)

## File List

- `methodology/decision-traceability.md` — modified (new `## Team-Shape Decisions` section inserted between "Decision Supersession" and "Quality Criteria"; 41 lines added; no other section touched — verified via `git diff HEAD`)

## Dev Agent Record

- All 5 ACs implemented as a faithful transcription of `architecture.md` §11.1, §11.2, §11.3.
- Diff is pure-additive: zero existing lines modified or removed.
- Both code templates wrapped in identical fenced ` ```markdown ` blocks matching the architecture spec — preserves verbatim copy-paste fidelity.
- Reviewer audit posture subsection adds one useful nuance not in the architecture spec: explicitly listing what gets checked on a mid-epic spawn entry ("D-ID present, status valid, summary self-explanatory"). Fair extrapolation from §11.3 "extends naturally" language; gives future reviewers concrete checks.
- No new D-IDs created. No code changes. No tests required.

### Reviewer notes (carried forward)

- The `## Team-Shape Decisions` section provides the canonical recording shape for two distinct decision types: tactical mid-epic spawns (one-liner) and strategic `team.mode` toggles (full record). Future orchestrator implementations (Story WT-4) and runtime spawn logic should reference this section directly.
- The future-iteration ">5 spawns per epic" advisory is documented but **not** v1 scope — do not implement until that follow-up is explicitly scheduled.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-04-29 | Story implemented; decision-traceability.md updated with Team-Shape Decisions section | dev-2 |
| 2026-04-29 | Review approved; status → complete; no findings | reviewer |

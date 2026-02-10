# Artifact Schema: Decision Log

The decision log is the authoritative record of all decisions made during a project. It lives at `artifacts/context/decision-log.md` and serves as the single source of truth for why the project is built the way it is. Every agent that makes or implements a decision writes to this file. Every agent that creates downstream artifacts reads from it. The reviewer uses it to verify that implementations match intentions.

## Expected Structure

```markdown
# Decision Log

## Quick Reference

| ID | Date | Summary | Source | Status |
|----|------|---------|--------|--------|
| D-001 | 2026-02-09 | Mobile-first responsive design | human | accepted |
| D-002 | 2026-02-09 | Use date-fns for date formatting | agent | implemented |
| D-003 | 2026-02-09 | OAuth2 with PKCE for authentication | brainstorming-session | verified |

---

## Decision Records

### D-001: Mobile-first responsive design
- **Date**: 2026-02-09
- **Source**: human (brainstorming session)
- **Decision**: All interfaces must be functional on mobile viewport (375px+)
- **Rationale**: 60% of target users access via mobile. Analytics from comparable products show mobile-first approach reduces bounce rate by 35%.
- **Affects**: PRD:NFR-3, ARCH:frontend-strategy, Stories:1-*, Stories:2-*
- **Status**: accepted

### D-002: Use date-fns for date formatting
- **Date**: 2026-02-09
- **Source**: agent (developer, tactical auto-resolve)
- **Decision**: Use date-fns over dayjs for date formatting and manipulation
- **Status**: implemented

### D-003: OAuth2 with PKCE for authentication
- **Date**: 2026-02-09
- **Source**: brainstorming-session
- **Decision**: All client authentication uses OAuth2 with PKCE flow, supporting Google and GitHub providers
- **Rationale**: PKCE eliminates the need for client secrets in the SPA, improving security posture. Google and GitHub cover 90%+ of target developer audience.
- **Affects**: PRD:FR-12, ARCH:auth-strategy, Stories:3-1, Stories:3-2, Stories:3-3
- **Status**: verified
```

## Section Guidelines

### Quick Reference Table

- Contains one row per decision, ordered by D-ID (chronological)
- Provides at-a-glance view of all decisions and their current status
- Must be kept in sync with the detailed records below
- Source values: `human`, `agent`, `brainstorming-session`, `quality-gate`
- Status values: `proposed`, `accepted`, `implemented`, `verified`, `superseded`

### Decision Records

Each record is a level-3 heading (`###`) with the format `D-NNN: Summary`.

**Strategic decisions** (full record) include all fields:
- **Date**: When the decision was made (YYYY-MM-DD)
- **Source**: Who or what originated the decision, with context in parentheses
- **Decision**: What was decided, stated clearly and unambiguously
- **Rationale**: Why this option was chosen. Include alternatives considered and why they were rejected when relevant.
- **Affects**: Which downstream artifacts this decision impacts, using artifact-type:identifier notation (see `methodology/decision-traceability.md` for format details)
- **Status**: Current lifecycle status

**Tactical decisions** (lightweight record) include minimal fields:
- **Date**: When the decision was made
- **Source**: Who made it
- **Decision**: What was decided (one line, self-explanatory)
- **Status**: Current lifecycle status

Tactical decisions omit Rationale and Affects because they are implementation-level choices with low blast radius. The summary line should be clear enough to stand alone.

### Superseded Decisions

When a decision is superseded, its record is updated in place:
- Status changes to `superseded`
- A new field is added: `Superseded by: D-XXX`
- The original rationale is never modified or deleted
- A new decision record is created for the replacement

Example:
```markdown
### D-005: Server-side sessions with Redis
- **Date**: 2026-02-10
- **Source**: agent (architect)
- **Decision**: Use Redis-backed server-side sessions for authentication state
- **Rationale**: Provides centralized session management for horizontal scaling.
- **Affects**: ARCH:auth-strategy, Stories:3-*
- **Status**: superseded
- **Superseded by**: D-018
```

## Maintenance Rules

- **Append only for new decisions.** New decisions are added at the end of both the quick-reference table and the records section. Never insert in the middle.
- **Update in place for status changes.** When a decision's status changes (e.g., `accepted` to `implemented`), update both the table row and the record.
- **Never delete records.** Even superseded decisions remain in the log. The history of why a decision was made and later reversed is valuable context.
- **Sequential IDs only.** The next D-ID is always one higher than the current maximum. Never skip numbers. Never reuse numbers.
- **Keep table and records in sync.** Every row in the quick-reference table must have a corresponding record below. Every record must have a corresponding table row. If they diverge, the record is authoritative.

## Quality Checklist

- [ ] Every decision has a unique, sequential D-ID
- [ ] Quick-reference table matches the detailed records (no orphaned rows or missing entries)
- [ ] Strategic decisions include Date, Source, Decision, Rationale, Affects, and Status
- [ ] Tactical decisions include Date, Source, Decision, and Status at minimum
- [ ] Source values are one of: human, agent, brainstorming-session, quality-gate
- [ ] Status values are one of: proposed, accepted, implemented, verified, superseded
- [ ] Affects field uses artifact-type:identifier notation
- [ ] Superseded decisions retain their original rationale and link to the replacement
- [ ] No gaps in D-ID sequence
- [ ] Records are ordered chronologically (by D-ID)

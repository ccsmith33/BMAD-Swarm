# Artifact Schema: Story File

The story file is the authoritative implementation guide for a developer. It is the ONLY document a developer should need to implement a feature. The story must contain all relevant context, technical guidance, and acceptance criteria so the developer can work autonomously without consulting the PRD or architecture document directly.

> Optional: track the story's load-bearing, non-obvious assertions in a **claims table** (C-IDs) — see [`claims-table.md`](claims-table.md). The claims lint is advisory.

## Expected Structure

```markdown
# Story [X.Y]: [Story Title]

## Status: [draft | ready | in-progress | review | complete]

## Domain: [kebab-case-slug]   <!-- optional; omit for cross-cutting / unrouted work -->

## User Story
As a [specific user type],
I want [specific capability],
So that [specific benefit].

## Acceptance Criteria

### AC1: [Criterion Title]
**Given** [specific precondition]
**When** [specific action]
**Then** [specific expected outcome]
**And** [additional outcome if needed]

### AC2: [Criterion Title]
**Given** [specific precondition]
**When** [specific action]
**Then** [specific expected outcome]

## Tasks

- [ ] Task 1: [Concrete implementation step]
  - [ ] Subtask 1.1: [Specific action]
  - [ ] Subtask 1.2: [Specific action]
- [ ] Task 2: [Concrete implementation step]
- [ ] Task 3: Write tests for [specific functionality]
- [ ] Task 4: [Additional implementation step]

## Dev Notes

### Architecture Context
[Specific patterns, conventions, and decisions from the architecture doc that apply to this story]

### Technical Implementation
[Exact libraries, methods, and approaches to use]

### File Locations
[Where to create new files, which existing files to modify]

### Dependencies
[Other stories that must be complete before this one; components this depends on]

### Testing Approach
[Which test framework, what patterns, what to test]

### Anti-Patterns
[Common mistakes to avoid for this specific implementation]

## File List
[Updated by developer during implementation]
- [path/to/file] - [created | modified | deleted]

## Dev Agent Record
[Updated by developer with implementation notes, decisions, and learnings]

## Change Log
| Date | Change | Author |
|------|--------|--------|
| [date] | Story created | strategist |
```

## Section Guidelines

### Status
Valid statuses and their meanings:
- **draft**: Story is being written, not ready for development
- **ready**: Story has passed quality gate and is ready for a developer
- **in-progress**: A developer is actively implementing this story
- **review**: Implementation is complete, awaiting code review
- **complete**: Code review approved, story is done

### Domain (optional)

The `## Domain:` heading declares the routing key used by the orchestrator in **fixed** team mode (wide-team specialization). It is optional and additive — every existing story file remains valid without it.

| Property | Value |
| --- | --- |
| Type | string (kebab-case slug) |
| Regex | `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (no leading/trailing hyphen, filesystem-safe) |
| Required | no |
| Default when absent | empty — routes to generic-dev fallback in **fixed** mode; ignored in **dynamic** mode |
| Set by | strategist at story-creation time, or the human authoring the story; the architect's domain map (in `architecture.md`) is the source of valid slugs |

**Default behavior (no `## Domain:` field).** A story without a domain is **not invalid**. In `team.mode: fixed` it routes to the generic-dev fallback (when enabled). In `team.mode: dynamic` the field is ignored entirely. This is the explicit backward-compat path: every story authored before this schema addition continues to load and validate unchanged.

**Reviewer audit posture.** The reviewer's audit of this field is **advisory only** — missing or mismatched domains in fixed mode surface as low-severity findings, never as blocking. See ADR-006 for the rationale. Do not gate merges on this field.

**Cross-references.** Routing semantics, the architect's domain-map deliverable, and the orchestrator's decision tree are specified in `artifacts/design/architecture.md` §4 (Story schema additions) and §6 (Orchestrator routing). Full design rationale and rejected alternatives live in ADR-006 (`artifacts/design/decisions/adr-006-story-domain-field.md`).

### User Story
- Must use a specific user type, not generic "user"
- Must describe a single coherent capability
- The benefit must articulate actual user or business value

**Adequate**: "As a content creator, I want to search tracks by mood and tempo, so that I can quickly find music that matches my video's emotional tone."

**Inadequate**: "As a user, I want search, so that I can find things."

### Acceptance Criteria
- Must include at least one happy-path criterion and at least one error-path criterion
- Each criterion must be independently testable
- Criteria must use concrete values (specific HTTP status codes, exact error messages, precise behaviors)

#### Acceptance-criteria formats

Both formats are valid; both require an `## Acceptance Criteria` section. The story's register determines which one to use:

1. **BDD (Given/When/Then)** — the default, and **required for feature stories** (full-lifecycle and small-feature decomposition). Each criterion frames a behavioral scenario: a precondition, an action, and an observable outcome, laid out under an `### AC<n>:` heading (as shown in Expected Structure above). The **When** clause is optional for state-assertion criteria that fold the action into the precondition (a `Given … Then` pair). Use this whenever the criterion describes *behavior or state the system exhibits*.

2. **Verifiable checklist ACs (`- [ ] AC<n>: <testable assertion>`)** — acceptable for **bug-fix, debug, and maintain stories**, where each acceptance criterion is a concrete, verifiable claim about the code or system rather than a behavioral scenario (e.g. `- [ ] AC1: validate --phase bogus exits 1 with a "valid phases" message instead of throwing`). Each checklist AC must still be a single, objectively-checkable assertion — not a vague task.

Do not mix the two registers within a single story; pick the one that fits the work. A story that carries either an `## Acceptance Criteria` section with Given/When/Then scenarios **or** a list of `- [ ] AC<n>:` checklist items satisfies this schema.

**Adequate**:
```
### AC1: Successful search returns results
Given a database with 50 published tracks
When the user searches with mood "energetic" and tempo range 120-140 BPM
Then the response contains only tracks matching both criteria
And results include track title, artist name, price, and preview URL
And results are sorted by relevance score descending

### AC2: Empty search returns helpful message
Given a database with tracks, none matching "classical" mood with tempo > 200 BPM
When the user searches with those criteria
Then the response returns an empty results array
And includes a suggestion to broaden search criteria
```

**Inadequate**: "Search works correctly." (Not testable, no specifics, no BDD format)

### Tasks
- Must be ordered by dependency (data models before API routes before UI)
- Each task should be a single, concrete action
- Must include test-writing tasks (not just implementation)
- Tasks should be granular enough that each takes under 30 minutes of implementation

**Adequate**:
```
- [ ] Task 1: Create search query builder
  - [ ] Subtask 1.1: Add mood filter to Track query
  - [ ] Subtask 1.2: Add tempo range filter to Track query
  - [ ] Subtask 1.3: Add relevance scoring based on filter match quality
- [ ] Task 2: Create GET /api/tracks/search endpoint
  - [ ] Subtask 2.1: Parse and validate query parameters (mood, tempoMin, tempoMax)
  - [ ] Subtask 2.2: Call query builder and return formatted results
  - [ ] Subtask 2.3: Return empty results with suggestion when no matches
- [ ] Task 3: Write tests
  - [ ] Subtask 3.1: Unit test query builder with various filter combinations
  - [ ] Subtask 3.2: Integration test search endpoint with seeded data
  - [ ] Subtask 3.3: Test empty result case
```

**Inadequate**: "- [ ] Implement search" (Not granular, no subtasks, no test tasks)

### Dev Notes
This is the most critical section. It must provide enough context that the developer never needs to reference the architecture document or PRD directly.

Must include:
- **Architecture context**: Which design patterns apply, relevant ADRs, relevant architecture constraints
- **Technical implementation**: Exact library names, function signatures, data structures to use
- **File locations**: Explicit paths for new files and existing files to modify
- **Dependencies**: What must be implemented before this story can start
- **Testing approach**: Framework, patterns, fixtures, mocking strategy
- **Anti-patterns**: Specific mistakes to avoid (not generic advice)

**Adequate**:
```
### Architecture Context
This story implements the search feature defined in Architecture section 5 (API Design).
Follow the repository pattern established in Story 1.2 (TrackRepository class).
Use the query builder pattern from the architecture ADR-003.

### Technical Implementation
- Use the existing Prisma client for database queries
- Build filters using Prisma's `where` clause with AND composition
- Relevance scoring: exact mood match = 1.0, partial = 0.5. Sort by score desc, then by created_at desc.
- Pagination: use cursor-based pagination with `take` and `cursor` params (max 50 per page)

### File Locations
- Create: src/services/track-search.service.js (search query builder)
- Modify: src/routes/tracks.js (add search endpoint)
- Create: tests/services/track-search.test.js
- Create: tests/routes/track-search.integration.test.js

### Testing Approach
- Unit tests: use Node.js test runner with mock Prisma client
- Integration tests: use test database with seed data (see tests/fixtures/tracks.js)
- Seed 50 tracks with varied mood/tempo combinations for meaningful search testing
```

**Inadequate**: "Follow the architecture document." (No specific guidance, developer must hunt for context)

## Quality Checklist

- [ ] Status is set appropriately
- [ ] Domain field is set when project uses team.mode: fixed (or omitted intentionally for cross-cutting work)
- [ ] User story has specific user type and clear benefit (not generic "user")
- [ ] At least 2 acceptance criteria in one register — BDD (Given/When/Then) for feature stories, or verifiable `- [ ] AC<n>:` checklist items for bug-fix/debug/maintain stories
- [ ] At least one error-path acceptance criterion
- [ ] Acceptance criteria are specific and testable (concrete values, not "succeeds")
- [ ] Tasks are ordered by dependency (models before APIs before UI)
- [ ] Tasks include test-writing (not just implementation)
- [ ] Story is right-sized — a single development session, not an epic disguised as a story (more than ~10 tasks/subtasks is a signal)
- [ ] Dev notes include architecture context with specific references
- [ ] Dev notes include exact file locations for new and modified files
- [ ] Dev notes include testing approach with framework and patterns
- [ ] Dev notes include anti-patterns specific to this implementation
- [ ] Dependencies on other stories are documented
- [ ] Story traces to at least one PRD functional requirement

## Common Failures to Check For

(Folded from the former `quality-gates/story-quality.md`, which is retired — this schema is the single source.)

- **Epic disguised as story**: scope too large for one session (indicator: more than ~10 tasks/subtasks)
- **Missing error handling**: only happy-path acceptance criteria, no error or edge cases
- **Vague dev notes**: "follow the architecture" without naming the patterns, files, or conventions
- **Orphan story**: does not trace to any PRD requirement
- **Missing test tasks**: implementation tasks but no test-writing tasks
- **Incorrect sequencing**: tasks ordered wrong (API routes before data models)
- **Copy-paste criteria**: acceptance criteria lifted from another story without adapting to this one

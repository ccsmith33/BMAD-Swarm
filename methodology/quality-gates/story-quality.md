# Story Quality Gate

Validation criteria for Story files. Stories are the authoritative implementation guide for developers. A story that lacks detail, has ambiguous acceptance criteria, or misses architectural context will produce incorrect or incomplete implementations.

## Required Sections

Each story file must contain all of the following:

- [ ] **Story Title** - Descriptive title in format "Story X.Y: Title"
- [ ] **User Story** - Standard format: "As a [user type], I want [capability], So that [benefit]"
- [ ] **Status** - Current status indicator (draft, ready, in-progress, review, complete)
- [ ] **Acceptance Criteria** - BDD format (Given/When/Then) with at least 2 criteria
- [ ] **Tasks/Subtasks** - Ordered checklist of implementation steps
- [ ] **Dev Notes** - Technical implementation guidance specific to this story
- [ ] **File List** - Files that will be created or modified (can be empty for draft status)

## Quality Standards

### User Story Quality

- [ ] **Specific user type**: Names a concrete user persona, not "user" (e.g., "authenticated user", "admin", "API consumer")
- [ ] **Single capability**: Describes one coherent capability, not a compound feature
- [ ] **Clear benefit**: The "so that" clause explains actual user or business value
- [ ] **Right size**: Story is implementable in a single development session (not an epic disguised as a story)

### Acceptance Criteria Quality

Each acceptance criterion must:

- [ ] **Follow BDD format**: Given [precondition], When [action], Then [expected outcome]
- [ ] **Be testable**: Can be translated directly into an automated test
- [ ] **Be specific**: Uses concrete values, not vague descriptions (e.g., "returns 200" not "succeeds")
- [ ] **Cover happy path**: At least one criterion covers the primary success scenario
- [ ] **Cover error paths**: At least one criterion covers an error or edge case scenario
- [ ] **Be independent**: Each criterion tests a distinct behavior (no duplicates)

### Task Breakdown Quality

- [ ] **Ordered correctly**: Tasks respect dependencies (infrastructure before features, models before APIs)
- [ ] **Granular enough**: Each task is a single concrete action, not a multi-step operation
- [ ] **Test-inclusive**: Tasks include writing tests, not just implementation code
- [ ] **Complete**: Tasks cover everything needed to satisfy all acceptance criteria
- [ ] **No ambiguity**: Each task clearly specifies what to create, modify, or configure

### Dev Notes Quality

Dev notes must provide sufficient context for a developer working only from this file:

- [ ] **Architecture references**: Points to specific architecture patterns, conventions, or decisions relevant to this story
- [ ] **Technology specifics**: Names exact libraries, frameworks, and patterns to use (not just "use the standard approach")
- [ ] **File locations**: Specifies where new files should go and which existing files to modify
- [ ] **Code patterns**: Shows or describes the coding patterns to follow (naming, structure, error handling)
- [ ] **Dependencies**: Lists which other stories or components this depends on
- [ ] **Testing approach**: Specifies which testing frameworks and patterns to use
- [ ] **Anti-patterns**: Warns against common mistakes specific to this implementation

### Requirements Coverage

- [ ] **Traces to PRD**: Story can be traced to one or more PRD functional requirements
- [ ] **Architecture-compliant**: Implementation approach follows the architecture document
- [ ] **No scope creep**: Story does not introduce functionality beyond PRD requirements
- [ ] **Dependency-aware**: Story lists its dependencies (blockedBy) and dependents correctly

## Common Failures to Check For

- **Epic disguised as story**: Story scope is too large, covering what should be multiple stories (indicator: more than 10 tasks/subtasks)
- **Missing error handling**: Only happy-path acceptance criteria with no error or edge case coverage
- **Vague dev notes**: Notes say "follow the architecture" without specifying which patterns, files, or conventions apply
- **Orphan story**: Story does not trace to any PRD requirement
- **Missing test tasks**: Task breakdown includes implementation but no test-writing tasks
- **Assumption-laden**: Story assumes knowledge that only exists in the architecture or PRD but is not repeated in the dev notes
- **Incorrect sequencing**: Tasks are ordered incorrectly (e.g., writing API routes before data models)
- **No error acceptance criteria**: All acceptance criteria cover success scenarios; none cover validation errors, auth failures, or invalid input
- **Copy-paste criteria**: Acceptance criteria from another story copied without adapting to this story's specific requirements

## Pass/Fail Criteria

**PASS** when:
- All required sections present with substantive content
- User story follows standard format with specific user type and clear benefit
- At least 2 acceptance criteria in BDD format covering both happy and error paths
- Task breakdown is ordered correctly and includes test tasks
- Dev notes provide sufficient architecture and technology context
- Story traces to PRD requirements
- No critical common failures detected

**FAIL** when:
- Any required section is missing or placeholder-only
- User story uses generic "user" or has no benefit clause
- Fewer than 2 acceptance criteria, or no error-path criteria
- Task breakdown is unordered, incomplete, or lacks test tasks
- Dev notes are vague or missing architecture context
- Story does not trace to any PRD requirement
- Story scope is too large (epic disguised as story)

## Validation Process

1. Check section completeness
2. Validate user story format and quality
3. Validate each acceptance criterion for BDD format, testability, and coverage
4. Validate task breakdown for ordering, granularity, and test inclusion
5. Validate dev notes for architecture references and technology specifics
6. Cross-reference story against PRD requirements
7. Check for common failures
8. Produce validation report with pass/fail and findings

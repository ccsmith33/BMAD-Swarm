# Artifact Schema: Epic Breakdown

The epic breakdown document decomposes the PRD and architecture into implementable epics and stories. It serves as the master plan for implementation, mapping every functional requirement to stories and organizing them into logical groups (epics) that can be developed in sequence.

## Expected Structure

```markdown
# [Product Name] - Epic Breakdown

## Overview
[Brief description of the implementation plan and how it maps to the PRD]

## Requirements Inventory

### Functional Requirements
[List of all PRD functional requirements with IDs]

### Non-Functional Requirements
[List of all PRD non-functional requirements with IDs]

### FR Coverage Map
| FR ID | FR Description | Epic | Story |
|-------|---------------|------|-------|
| FR-001 | [Description] | Epic 1 | Story 1.1 |
| FR-002 | [Description] | Epic 1 | Story 1.2, 1.3 |

## Epic List
| Epic | Title | Stories | Description |
|------|-------|---------|-------------|
| 1 | [Title] | [Count] | [Brief description] |
| 2 | [Title] | [Count] | [Brief description] |

## Epic 1: [Epic Title]

[Epic goal and what it achieves for the product]

### Story 1.1: [Story Title]

As a [user type],
I want [capability],
So that [benefit].

**Acceptance Criteria:**

**Given** [precondition]
**When** [action]
**Then** [expected outcome]

### Story 1.2: [Story Title]
...

## Epic 2: [Epic Title]
...
```

## Section Guidelines

### Requirements Inventory
- Must list every FR and NFR from the PRD by ID
- The coverage map must account for every FR, showing which epic and story implements it
- Any FR not covered must be explicitly noted with justification (deferred to future phase, covered by NFR, etc.)

**Adequate**:

| FR ID | FR Description | Epic | Story |
|-------|---------------|------|-------|
| FR-001 | User registration with email | Epic 1 | Story 1.1 |
| FR-002 | User authentication (login/logout) | Epic 1 | Story 1.2 |
| FR-003 | Password reset via email | Epic 1 | Story 1.3 |
| FR-004 | Track upload with metadata | Epic 2 | Story 2.1 |

**Inadequate**: No coverage map at all, leaving it unclear whether all requirements are addressed.

### Epic Organization
- Epics should be organized by functional domain (e.g., "User Management", "Content Management", "Payment Processing")
- Epics should be sequenced so foundational work comes first (project setup, data models, auth before business features)
- Each epic should have a clear goal statement explaining what it achieves
- Epic scope should be cohesive (all stories in an epic relate to the same domain)

**Adequate**: "Epic 1: Foundation & Authentication - Establishes the project structure, database schema, and authentication system that all subsequent epics depend on."

**Inadequate**: "Epic 1: Stuff to build first" (No clear goal, not descriptive)

### Story Format
Each story must include:
- **User story**: As a / I want / So that format with a specific user type
- **Acceptance criteria**: At least 2 criteria in BDD format (Given/When/Then)
- **Story scope**: Small enough to implement in a single development session

**Adequate**:
```
### Story 1.2: User Login

As an authenticated user,
I want to log in with my email and password,
So that I can access my account and its features.

Acceptance Criteria:

Given a registered user with valid credentials
When they submit the login form with correct email and password
Then they receive an access token and are redirected to their dashboard

Given a user with invalid credentials
When they submit the login form with incorrect password
Then they see an error message "Invalid email or password" and no token is issued
```

**Inadequate**: "Story 1.2: Login - Users can log in." (No user story format, no acceptance criteria)

### Story Sequencing
- Stories within an epic must be ordered by dependency (foundational first)
- Cross-epic dependencies must be noted
- The first epic/story should typically be project scaffolding and setup
- Story numbering convention: `[Epic].[Story]` (e.g., 1.1, 1.2, 2.1)

### Coverage Validation
- Every PRD functional requirement must map to at least one story
- Stories should not introduce requirements not in the PRD (no scope creep)
- Non-functional requirements should be addressed by architecture and applied across stories, not as separate stories (unless they require dedicated implementation work like setting up monitoring)

## Quality Checklist

- [ ] Requirements inventory lists all PRD FRs and NFRs
- [ ] Coverage map shows which story implements each FR
- [ ] No PRD FR is unaccounted for (all mapped or explicitly deferred with justification)
- [ ] Epics are organized by functional domain with clear goal statements
- [ ] Epics are sequenced with foundational work first
- [ ] Every story uses As a / I want / So that format with specific user type
- [ ] Every story has at least 2 BDD acceptance criteria
- [ ] Stories cover both happy and error paths
- [ ] Story numbering follows Epic.Story convention
- [ ] No scope creep (stories don't introduce requirements beyond the PRD)
- [ ] Cross-epic dependencies are documented
